"""The bot's thinking, run for every fighter in the batch in a single call.

This is the one piece that belongs on the GPU. It has no decisions in it: the
same fixed chain of multiply-and-add turns 114 numbers into 86 scores, so all
few-thousand fighters can go through it together as one matrix multiply instead
of one at a time.

For scale: the Java server does this per bot, per tick, at roughly 438
microseconds a decision. Here the whole batch costs about one of those.

The network is loaded straight from the trainer's own .pt checkpoints, so this
runs the real policy, not a copy of it:
    encoder: 114 -> 384 -> 384 -> 384, SiLU after every layer
    policy:  384 -> 86
    value:   384 -> 1
SiLU-on-every-layer is what NhNeuralPolicyModel.java does at line 1467, and the
widths come out of the checkpoint itself rather than being assumed.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

try:
    import torch
except ImportError:  # pragma: no cover - torch is required for GPU inference
    torch = None

from . import schema


class Policy:
    """A loaded checkpoint, ready to score a whole batch at once."""

    def __init__(self, state_dict, input_mean, input_std, device, dtype,
                 action_ids, checkpoint_schema):
        self.device = device
        self.dtype = dtype
        self._layers = []

        index = 0
        while f"encoder.{index}.weight" in state_dict:
            weight = state_dict[f"encoder.{index}.weight"].to(device=device, dtype=dtype)
            bias = state_dict[f"encoder.{index}.bias"].to(device=device, dtype=dtype)
            self._layers.append((weight, bias))
            index += 2  # activations sit at the odd indices

        self.policy_w = state_dict["policy.weight"].to(device=device, dtype=dtype)
        self.policy_b = state_dict["policy.bias"].to(device=device, dtype=dtype)
        self.value_w = state_dict["value.weight"].to(device=device, dtype=dtype)
        self.value_b = state_dict["value.bias"].to(device=device, dtype=dtype)

        self.mean = torch.as_tensor(input_mean, device=device, dtype=dtype)
        # A zero standard deviation would divide by zero; the trainer guards the
        # same way when it normalises.
        std = torch.as_tensor(input_std, device=device, dtype=dtype)
        self.std = torch.where(std > 1e-8, std, torch.ones_like(std))

        self.input_size = int(self._layers[0][0].shape[1])
        self.action_count = int(self.policy_w.shape[0])
        self.encoded_size = int(self._layers[-1][0].shape[0])
        self.action_ids = tuple(int(value) for value in action_ids)
        self.checkpoint_schema = checkpoint_schema
        # CUDA's per-operation launch overhead dominates this small network.
        # A graph records the exact existing operations once for each batch
        # shape, then replays them as one launch on subsequent ticks.
        self._cuda_graphs = {}

        def linear(prefix):
            try:
                return (
                    state_dict[f"{prefix}.weight"].to(device=device, dtype=dtype),
                    state_dict[f"{prefix}.bias"].to(device=device, dtype=dtype),
                )
            except KeyError as exc:
                raise ValueError(
                    f"checkpoint schema declares {prefix}, but its tensor is missing"
                ) from exc

        # These detachable heads are part of the deployed checkpoint's forward
        # pass. Ignoring them makes the same .pt behave like an older teacher,
        # especially for the three protection prayers.
        self.defence_prayer_config = checkpoint_schema.get("defence_prayer_head")
        self.defence_prayer_hidden = None
        self.defence_prayer_output = None
        self.defence_prayer_rows = None
        self.defence_prayer_head_version = 1
        self.defence_prayer_history_required = False
        self.defence_prayer_prior_state_history_required = False
        if self.defence_prayer_config is not None:
            self.defence_prayer_hidden = linear("defence_prayer_head.hidden")
            self.defence_prayer_output = linear("defence_prayer_head.output")
            self.defence_prayer_rows = torch.as_tensor(
                self.defence_prayer_config["action_rows"],
                device=self.device, dtype=torch.long)
            self.defence_prayer_head_version = int(
                self.defence_prayer_config.get("version", 1))
            head_width = int(self.defence_prayer_hidden[0].shape[1])
            if self.defence_prayer_head_version == 1:
                declared_width = int(
                    self.defence_prayer_config.get("input_size", self.input_size))
                if declared_width != self.input_size or head_width != self.input_size:
                    raise ValueError(
                        "defence-prayer head v1 must consume the normalized "
                        f"base input width {self.input_size}, schema declares "
                        f"{declared_width} and tensor has {head_width}")
            elif self.defence_prayer_head_version in (2, 3):
                base_width = int(self.defence_prayer_config.get(
                    "base_input_size", -1))
                context_width = int(self.defence_prayer_config.get(
                    "history_context_size", -1))
                head_input_width = int(self.defence_prayer_config.get(
                    "head_input_size",
                    self.defence_prayer_config.get("input_size", -1)))
                compatibility_width = int(
                    self.defence_prayer_config.get("input_size", -1))
                feature_order = tuple(self.defence_prayer_config.get(
                    "history_feature_order", ()))
                if self.defence_prayer_head_version == 2:
                    expected_context_width = (
                        schema.DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE)
                    expected_head_width = (
                        self.input_size + expected_context_width)
                    metadata_matches = (
                        context_width == expected_context_width)
                else:
                    expected_context_width = (
                        schema.DEFENCE_PRAYER_V3_HISTORY_CONTEXT_SIZE)
                    expected_head_width = (
                        schema.DEFENCE_PRAYER_V3_HEAD_INPUT_SIZE)
                    metadata_matches = (
                        context_width == expected_context_width
                        and int(self.defence_prayer_config.get(
                            "ordered_history_context_size", -1))
                        == schema.DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE
                        and int(self.defence_prayer_config.get(
                            "prior_state_history_lags", -1))
                        == schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS
                        and int(self.defence_prayer_config.get(
                            "prior_state_input_size", -1))
                        == schema.DEFENCE_PRAYER_PRIOR_STATE_INPUT_SIZE
                        and int(self.defence_prayer_config.get(
                            "prior_state_stride", -1))
                        == schema.DEFENCE_PRAYER_PRIOR_STATE_STRIDE
                        and int(self.defence_prayer_config.get(
                            "prior_state_history_context_size", -1))
                        == schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_CONTEXT_SIZE
                        and self.defence_prayer_config.get(
                            "prior_state_lag_order") == "newest_first"
                        and self.defence_prayer_config.get(
                            "prior_state_feature_order")
                        == "normalized_state_then_valid"
                        and self.defence_prayer_config.get(
                            "current_row_excluded") is True
                        and self.defence_prayer_config.get(
                            "input_source")
                        == (
                            "normalized_input_plus_ordered_prayer_history"
                            "_plus_prior_state_history"))
                if (
                        base_width != self.input_size
                        or not metadata_matches
                        or head_input_width != expected_head_width
                        or compatibility_width != expected_head_width
                        or head_width != expected_head_width
                        or feature_order
                        != schema.DEFENCE_PRAYER_HISTORY_FEATURE_ORDER):
                    raise ValueError(
                        "defence-prayer head v"
                        f"{self.defence_prayer_head_version} history schema "
                        "does not match FastSim's declared state-history contract")
                self.defence_prayer_history_required = True
                self.defence_prayer_prior_state_history_required = (
                    self.defence_prayer_head_version == 3)
            else:
                raise ValueError(
                    "unsupported defence-prayer head version: "
                    f"{self.defence_prayer_head_version}")

        self.frozen_unreachable_prayer_config = checkpoint_schema.get(
            "frozen_unreachable_prayer_conditioner")
        self.frozen_unreachable_prayer_strength = None
        self.frozen_unreachable_prayer_identity = False
        self.frozen_unreachable_prayer_input_indices = None
        self.frozen_unreachable_prayer_input_mean = None
        self.frozen_unreachable_prayer_input_std = None
        self.frozen_unreachable_prayer_rows = None
        if self.frozen_unreachable_prayer_config is not None:
            config = self.frozen_unreachable_prayer_config
            conditioner_version = int(config.get("version", -1))
            expected_action_ids = [420467, 420468, 420469]
            expected_action_rows = (
                list(self.defence_prayer_config["action_rows"])
                if self.defence_prayer_config is not None
                else None)
            expected = {
                "kind": "dmm-frozen-unreachable-defence-prayer-residual",
                "version": conditioner_version,
                "input_source": "normalized_input_reconstructed_raw",
                "opponent_frozen_input_index": schema.INPUT_OPP_FROZEN,
                "opponent_freeze_ticks_input_index":
                    schema.INPUT_OPP_FREEZE_TICKS,
                "target_present_input_index": schema.INPUT_TARGET_PRESENT,
                "opponent_melee_reach_input_index":
                    schema.INPUT_OPP_MELEE_REACH,
                "freeze_ticks_normalizer": schema.FREEZE_TICKS_NORMALIZER,
                "min_remaining_freeze_ticks_exclusive": 1.0,
                "action_ids": expected_action_ids,
                "action_rows": expected_action_rows,
                "penalized_action_id": expected_action_ids[2],
                "penalized_action_row": (
                    expected_action_rows[2]
                    if expected_action_rows is not None else None),
                "preserve_group_logmass": True,
                "projection": "nonnegative_clamp",
                "apply_after": "defence_prayer_head",
            }
            if conditioner_version == 2:
                expected.update({
                    "activation_contract":
                        "frozenOpponentMeleeImpossibleThroughNextEffectiveRoll",
                    "self_freeze_ticks_input_index":
                        schema.INPUT_SELF_FREEZE_TICKS,
                    "target_rel_dx_input_index":
                        schema.INPUT_TARGET_REL_DX,
                    "target_rel_dy_input_index":
                        schema.INPUT_TARGET_REL_DY,
                    "relative_position_normalizer": 16.0,
                    "max_switchable_melee_standing_range": 2,
                    "max_defender_movement_decisions_before_protected_roll": 2,
                    "movement_substeps_per_decision": 2,
                })
            if (
                    self.defence_prayer_config is None
                    or self.defence_prayer_config.get("kind")
                    != "dmm-defence-prayer-group-replacement"
                    or conditioner_version not in (1, 2)
                    or set(config) != set(expected)
                    or any(config.get(key) != value
                           for key, value in expected.items())):
                raise ValueError(
                    "frozen-unreachable prayer conditioner schema does not "
                    "match FastSim's strict version-1 or version-2 contract")
            if [
                    int(self.action_ids[row])
                    for row in expected_action_rows
            ] != expected_action_ids:
                raise ValueError(
                    "frozen-unreachable prayer action rows do not map to the "
                    "required protection-prayer action ids")
            try:
                strength = state_dict[
                    "frozen_unreachable_prayer_conditioner.strength"
                ].to(device=device, dtype=dtype)
            except KeyError as exc:
                raise ValueError(
                    "checkpoint schema declares "
                    "frozen_unreachable_prayer_conditioner, but its tensor is "
                    "missing") from exc
            if (
                    tuple(strength.shape) != (1,)
                    or not bool(torch.isfinite(strength).all())
                    or bool((strength < 0).any())):
                raise ValueError(
                    "frozen-unreachable prayer strength must be a finite "
                    "non-negative tensor with shape [1]")
            if conditioner_version == 1:
                input_indices = (
                    int(config["opponent_frozen_input_index"]),
                    int(config["opponent_freeze_ticks_input_index"]),
                    int(config["target_present_input_index"]),
                    int(config["opponent_melee_reach_input_index"]),
                )
            else:
                input_indices = (
                    int(config["opponent_frozen_input_index"]),
                    int(config["opponent_freeze_ticks_input_index"]),
                    int(config["target_present_input_index"]),
                    int(config["self_freeze_ticks_input_index"]),
                    int(config["target_rel_dx_input_index"]),
                    int(config["target_rel_dy_input_index"]),
                )
            if max(input_indices) >= self.input_size:
                raise ValueError(
                    "frozen-unreachable prayer input index is unavailable")
            self.frozen_unreachable_prayer_strength = strength
            self.frozen_unreachable_prayer_identity = bool(
                torch.count_nonzero(strength).detach().cpu() == 0)
            if conditioner_version == 1:
                self.frozen_unreachable_prayer_input_indices = torch.as_tensor(
                    input_indices, device=self.device, dtype=torch.long)
                self.frozen_unreachable_prayer_input_mean = self.mean.index_select(
                    0, self.frozen_unreachable_prayer_input_indices)
                self.frozen_unreachable_prayer_input_std = self.std.index_select(
                    0, self.frozen_unreachable_prayer_input_indices)
            self.frozen_unreachable_prayer_rows = torch.as_tensor(
                expected_action_rows, device=self.device, dtype=torch.long)

        self.freeze_boundary_prayer_config = checkpoint_schema.get(
            "freeze_boundary_prayer_residual")
        self.freeze_boundary_prayer_linear = None
        self.freeze_boundary_prayer_identity = False
        self.freeze_boundary_prayer_rows = None
        if self.freeze_boundary_prayer_config is not None:
            config = self.freeze_boundary_prayer_config
            boundary_version = int(config.get("version", -1))
            boundary_lags = {
                1: 3,
                2: schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
            }.get(boundary_version)
            expected_action_ids = [420467, 420468, 420469]
            expected_action_rows = (
                list(self.defence_prayer_config["action_rows"])
                if self.defence_prayer_config is not None
                else None)
            expected = {
                "kind": "dmm-freeze-boundary-defence-prayer-residual",
                "version": boundary_version,
                "input_source": "defence_prayer_head_hidden",
                "hidden_size": (
                    int(self.defence_prayer_hidden[0].shape[0])
                    if self.defence_prayer_hidden is not None
                    else -1),
                "residual_activation": "linear",
                "context_source":
                    "mechanical_current_plus_prior_state_history",
                "opponent_frozen_input_index": schema.INPUT_OPP_FROZEN,
                "opponent_freeze_ticks_input_index":
                    schema.INPUT_OPP_FREEZE_TICKS,
                "target_present_input_index": schema.INPUT_TARGET_PRESENT,
                "opponent_melee_reach_input_index":
                    schema.INPUT_OPP_MELEE_REACH,
                "freeze_ticks_normalizer": schema.FREEZE_TICKS_NORMALIZER,
                "last_pre_thaw_remaining_ticks": 1,
                "prior_state_history_lags": boundary_lags,
                "prior_state_lag_order": "newest_first",
                "prior_state_feature_order": "normalized_state_then_valid",
                "action_ids": expected_action_ids,
                "action_rows": expected_action_rows,
                "preserve_group_logmass": True,
                "apply_after": "frozen_unreachable_prayer_conditioner",
            }
            if (
                    self.defence_prayer_config is None
                    or self.defence_prayer_head_version != 3
                    or self.defence_prayer_config.get("kind")
                    != "dmm-defence-prayer-group-replacement"
                    or self.frozen_unreachable_prayer_config is None
                    or boundary_lags is None
                    or set(config) != set(expected)
                    or any(config.get(key) != value
                           for key, value in expected.items())):
                raise ValueError(
                    "freeze-boundary prayer residual schema does not match "
                    "FastSim's strict version-1 or version-2 contract")
            if [
                    int(self.action_ids[row])
                    for row in expected_action_rows
            ] != expected_action_ids:
                raise ValueError(
                    "freeze-boundary prayer action rows do not map to the "
                    "required protection-prayer action ids")
            boundary = linear("freeze_boundary_prayer_residual")
            if (
                    tuple(boundary[0].shape)
                    != (3, int(expected["hidden_size"]))
                    or tuple(boundary[1].shape) != (3,)
                    or not bool(torch.isfinite(boundary[0]).all())
                    or not bool(torch.isfinite(boundary[1]).all())):
                raise ValueError(
                    "freeze-boundary prayer residual tensors must be finite "
                    f"[3,{expected['hidden_size']}] weight and [3] bias")
            self.freeze_boundary_prayer_linear = boundary
            self.freeze_boundary_prayer_identity = bool(
                torch.count_nonzero(boundary[0]).detach().cpu() == 0
                and torch.count_nonzero(boundary[1]).detach().cpu() == 0)
            self.freeze_boundary_prayer_rows = torch.as_tensor(
                expected_action_rows,
                device=self.device,
                dtype=torch.long)

        self.safe_window_prayer_config = checkpoint_schema.get(
            "safe_window_prayer_residual")
        self.safe_window_prayer_linear = None
        self.safe_window_prayer_identity = False
        self.safe_window_prayer_rows = None
        self.safe_window_prayer_input_indices = None
        self.safe_window_prayer_input_mean = None
        self.safe_window_prayer_input_std = None
        if self.safe_window_prayer_config is not None:
            config = self.safe_window_prayer_config
            safe_version = int(config.get("version", -1))
            expected_action_ids = [420467, 420468, 420469, 420470, 420471]
            action_index = {
                int(action_id): row
                for row, action_id in enumerate(self.action_ids)
            }
            expected_action_rows = [
                action_index.get(action_id) for action_id in expected_action_ids
            ]
            expected = {
                "kind": "dmm-safe-window-defence-channel-residual",
                "version": safe_version,
                "input_source": "defence_prayer_head_hidden",
                "hidden_size": (
                    int(self.defence_prayer_hidden[0].shape[0])
                    if self.defence_prayer_hidden is not None else -1),
                "residual_activation": "linear",
                "context_source": "mechanical_current",
                "opponent_frozen_input_index": schema.INPUT_OPP_FROZEN,
                "opponent_freeze_ticks_input_index":
                    schema.INPUT_OPP_FREEZE_TICKS,
                "target_present_input_index": schema.INPUT_TARGET_PRESENT,
                "opponent_melee_reach_input_index":
                    schema.INPUT_OPP_MELEE_REACH,
                "freeze_ticks_normalizer": schema.FREEZE_TICKS_NORMALIZER,
                "min_remaining_freeze_ticks_exclusive": 1.0,
                "action_ids": expected_action_ids,
                "action_rows": expected_action_rows,
                "shifted_action_ids": expected_action_ids[:2],
                "shifted_action_rows": expected_action_rows[:2],
                "preserve_shifted_action_logit_difference": True,
                "preserve_group_logmass": True,
                "apply_after": "freeze_boundary_prayer_residual",
            }
            if safe_version == 2:
                expected["activation_source"] = (
                    "frozen_unreachable_prayer_conditioner.v2")
            if (
                    self.defence_prayer_config is None
                    or self.defence_prayer_head_version != 3
                    or self.freeze_boundary_prayer_config is None
                    or int(self.freeze_boundary_prayer_config.get(
                        "version", -1)) != 2
                    or safe_version not in (1, 2)
                    or self.frozen_unreachable_prayer_config is None
                    or int(self.frozen_unreachable_prayer_config.get(
                        "version", -1)) != safe_version
                    or any(row is None for row in expected_action_rows)
                    or set(config) != set(expected)
                    or any(config.get(key) != value
                           for key, value in expected.items())):
                raise ValueError(
                    "safe-window prayer residual schema does not match "
                    "FastSim's strict version-1 or version-2 contract")
            safe = linear("safe_window_prayer_residual")
            if (
                    tuple(safe[0].shape)
                    != (1, int(expected["hidden_size"]))
                    or tuple(safe[1].shape) != (1,)
                    or not bool(torch.isfinite(safe[0]).all())
                    or not bool(torch.isfinite(safe[1]).all())):
                raise ValueError(
                    "safe-window prayer residual tensors must be finite "
                    f"[1,{expected['hidden_size']}] weight and [1] bias")
            self.safe_window_prayer_linear = safe
            self.safe_window_prayer_identity = bool(
                torch.count_nonzero(safe[0]).detach().cpu() == 0
                and torch.count_nonzero(safe[1]).detach().cpu() == 0)
            self.safe_window_prayer_rows = torch.as_tensor(
                expected_action_rows,
                device=self.device,
                dtype=torch.long)
            if safe_version == 1:
                indices = (
                    schema.INPUT_OPP_FROZEN,
                    schema.INPUT_OPP_FREEZE_TICKS,
                    schema.INPUT_TARGET_PRESENT,
                    schema.INPUT_OPP_MELEE_REACH,
                )
                self.safe_window_prayer_input_indices = torch.as_tensor(
                    indices, device=self.device, dtype=torch.long)
                self.safe_window_prayer_input_mean = self.mean.index_select(
                    0, self.safe_window_prayer_input_indices)
                self.safe_window_prayer_input_std = self.std.index_select(
                    0, self.safe_window_prayer_input_indices)

        self.vls_voidwaker_config = checkpoint_schema.get("vls_voidwaker_head")
        self.vls_voidwaker_linear = None
        self.vls_voidwaker_rows = None
        self.vls_voidwaker_matches_policy = False
        self.vls_voidwaker_energy_index = None
        self.vls_voidwaker_energy_threshold = None
        if self.vls_voidwaker_config is not None:
            if self.vls_voidwaker_config["kind"] != (
                    "dmm-vls-voidwaker-group-replacement"):
                raise ValueError(
                    "unsupported VLS/Voidwaker head kind: "
                    f"{self.vls_voidwaker_config['kind']}")
            self.vls_voidwaker_linear = linear("vls_voidwaker_head")
            self.vls_voidwaker_rows = torch.as_tensor(
                self.vls_voidwaker_config["action_rows"],
                device=self.device, dtype=torch.long)
            self.vls_voidwaker_matches_policy = (
                torch.equal(
                    self.vls_voidwaker_linear[0],
                    self.policy_w.index_select(
                        0, self.vls_voidwaker_rows))
                and torch.equal(
                    self.vls_voidwaker_linear[1],
                    self.policy_b.index_select(
                        0, self.vls_voidwaker_rows)))
            self.vls_voidwaker_energy_index = int(
                self.vls_voidwaker_config["spec_energy_input_index"])
            self.vls_voidwaker_energy_threshold = self._normalized_target(
                float(self.vls_voidwaker_config["both_legal_min_spec_energy"]),
                self.vls_voidwaker_energy_index)

        self.vls_setup_config = checkpoint_schema.get("vls_setup_adapter")
        self.vls_setup_linear = None
        self.vls_setup_version = 0
        self.vls_setup_action_row = None
        self.vls_setup_delay_index = None
        self.vls_setup_delay_target = None
        self.vls_setup_delay_tolerance = None
        self.vls_setup_energy_index = None
        self.vls_setup_energy_target = None
        self.vls_setup_energy_tolerance = None
        self.vls_setup_control_index = None
        self.vls_setup_control_target = None
        self.vls_setup_control_tolerance = None
        self.vls_setup_context_indexes = None
        self.vls_setup_context_mean = None
        self.vls_setup_context_std = None
        self.vls_setup_context_one = None
        self.vls_setup_context_tolerance = None
        if self.vls_setup_config is not None:
            if self.vls_setup_config["kind"] != "dmm-vls-setup-residual":
                raise ValueError(
                    "unsupported VLS setup adapter kind: "
                    f"{self.vls_setup_config['kind']}")
            self.vls_setup_linear = linear("vls_setup_adapter")
            self.vls_setup_version = int(self.vls_setup_config["version"])
            self.vls_setup_action_row = int(
                self.vls_setup_config["action_row"])
            tolerance = float(self.vls_setup_config["raw_tolerance"])
            self.vls_setup_delay_index = int(
                self.vls_setup_config["attack_delay_input_index"])
            self.vls_setup_delay_target = self._normalized_target(
                float(self.vls_setup_config["required_raw_attack_delay"]),
                self.vls_setup_delay_index)
            self.vls_setup_delay_tolerance = (
                tolerance / abs(float(self.std[self.vls_setup_delay_index])))
            if self.vls_setup_version >= 2:
                self.vls_setup_energy_index = int(
                    self.vls_setup_config["spec_energy_input_index"])
                self.vls_setup_energy_target = self._normalized_target(
                    float(self.vls_setup_config["min_raw_spec_energy"]),
                    self.vls_setup_energy_index)
                self.vls_setup_energy_tolerance = (
                    tolerance
                    / abs(float(self.std[self.vls_setup_energy_index])))
                self.vls_setup_control_index = int(
                    self.vls_setup_config["spec_control_input_index"])
                self.vls_setup_control_target = self._normalized_target(
                    float(self.vls_setup_config["required_raw_spec_control"]),
                    self.vls_setup_control_index)
                self.vls_setup_control_tolerance = (
                    tolerance
                    / abs(float(self.std[self.vls_setup_control_index])))
            if self.vls_setup_version >= 3:
                indexes = (
                    int(self.vls_setup_config["target_present_input_index"]),
                    int(self.vls_setup_config["self_frozen_input_index"]),
                    int(self.vls_setup_config["target_rel_dx_input_index"]),
                    int(self.vls_setup_config["target_rel_dy_input_index"]),
                    int(self.vls_setup_config["melee_reach_input_index"]),
                )
                self.vls_setup_context_indexes = torch.as_tensor(
                    indexes, device=self.device, dtype=torch.long)
                self.vls_setup_context_mean = self.mean.index_select(
                    0, self.vls_setup_context_indexes)
                self.vls_setup_context_std = self.std.index_select(
                    0, self.vls_setup_context_indexes)
                self.vls_setup_context_one = torch.as_tensor(
                    1.0, device=self.device, dtype=self.dtype)
                self.vls_setup_context_tolerance = tolerance

        self.vls_followthrough_config = checkpoint_schema.get(
            "vls_followthrough_adapter")
        self.vls_followthrough_linear = None
        self.vls_followthrough_rows = None
        self.vls_followthrough_energy_index = None
        self.vls_followthrough_energy_target = None
        self.vls_followthrough_energy_tolerance = None
        self.vls_followthrough_equal_requirements = ()
        if self.vls_followthrough_config is not None:
            if self.vls_followthrough_config["kind"] != (
                    "dmm-vls-followthrough-residual"):
                raise ValueError(
                    "unsupported VLS followthrough adapter kind: "
                    f"{self.vls_followthrough_config['kind']}")
            self.vls_followthrough_linear = linear("vls_followthrough_adapter")
            self.vls_followthrough_rows = torch.as_tensor(
                self.vls_followthrough_config["action_rows"],
                device=self.device, dtype=torch.long)
            tolerance = float(
                self.vls_followthrough_config["raw_tolerance"])
            self.vls_followthrough_energy_index = int(
                self.vls_followthrough_config["spec_energy_input_index"])
            self.vls_followthrough_energy_target = self._normalized_target(
                float(self.vls_followthrough_config["min_raw_spec_energy"]),
                self.vls_followthrough_energy_index)
            self.vls_followthrough_energy_tolerance = (
                tolerance
                / abs(float(
                    self.std[self.vls_followthrough_energy_index])))
            weapon_phase = (
                int(self.vls_followthrough_config["required_weapon_id"])
                * float(self.vls_followthrough_config["weapon_frequency"]))
            equal_requirements = (
                (
                    int(self.vls_followthrough_config[
                        "attack_delay_input_index"]),
                    float(self.vls_followthrough_config[
                        "required_raw_attack_delay"]),
                ),
                (
                    int(self.vls_followthrough_config[
                        "spec_control_input_index"]),
                    float(self.vls_followthrough_config[
                        "required_raw_spec_control"]),
                ),
                (
                    int(self.vls_followthrough_config["pending_input_index"]),
                    float(self.vls_followthrough_config[
                        "required_raw_pending"]),
                ),
                (
                    int(self.vls_followthrough_config[
                        "self_weapon_sin_input_index"]),
                    float(np.sin(weapon_phase)),
                ),
                (
                    int(self.vls_followthrough_config[
                        "self_weapon_cos_input_index"]),
                    float(np.cos(weapon_phase)),
                ),
            )
            self.vls_followthrough_equal_requirements = tuple(
                (
                    input_index,
                    self._normalized_target(raw_value, input_index),
                    tolerance / abs(float(self.std[input_index])),
                )
                for input_index, raw_value in equal_requirements
            )

        self.vls_protected_melee_config = checkpoint_schema.get(
            "vls_protected_melee_conditioner")
        self.vls_protected_melee_strength = None
        self.vls_protected_melee_identity = False
        self.vls_protected_melee_input_indices = None
        self.vls_protected_melee_input_mean = None
        self.vls_protected_melee_input_std = None
        self.vls_protected_melee_head_rows = None
        self.vls_protected_melee_follow_rows = None
        self.vls_protected_melee_head_penalized_local = None
        self.vls_protected_melee_follow_penalized_local = None
        if self.vls_protected_melee_config is not None:
            config = self.vls_protected_melee_config
            version = int(config.get("version", -1))
            thresholds = {
                1: (0.40, 0.55),
                2: (0.0, 0.01),
            }.get(version)
            if thresholds is None:
                raise ValueError(
                    "VLS protected-melee conditioner version is unsupported")
            expected = {
                "kind": "dmm-vls-protected-melee-context-residual",
                "version": version,
                "input_source": "normalized_input_reconstructed_raw",
                "opponent_hp_input_index": 2,
                "opponent_protect_melee_input_index": 54,
                "spec_energy_input_index": 106,
                "ko_hp_max": thresholds[0],
                "full_strength_hp_min": thresholds[1],
                "head_eligibility_source": "vls_voidwaker_head",
                "follow_eligibility_source": "vls_followthrough_adapter",
                "follow_max_spec_energy_exclusive": 0.50,
                "head_action_rows": [14, 16],
                "head_penalized_action_row": 16,
                "follow_action_rows": [7, 16, 17],
                "follow_penalized_action_rows": [16, 17],
                "preserve_group_logmass": True,
                "apply_after": "vls_followthrough_adapter",
            }
            if set(config) != set(expected) or any(
                    config.get(key) != value
                    for key, value in expected.items()):
                raise ValueError(
                    "VLS protected-melee conditioner schema does not match "
                    f"FastSim's version-{version} contract")
            if (
                    self.vls_voidwaker_config is None
                    or self.vls_followthrough_config is None
                    or tuple(self.vls_voidwaker_config["action_rows"])
                    != tuple(expected["head_action_rows"])
                    or tuple(self.vls_followthrough_config["action_rows"])
                    != (16, 17)):
                raise ValueError(
                    "VLS protected-melee conditioner requires the current "
                    "VLS head and followthrough adapter")
            try:
                strength = state_dict[
                    "vls_protected_melee_conditioner.strength"
                ].to(device=device, dtype=dtype)
            except KeyError as exc:
                raise ValueError(
                    "checkpoint schema declares vls_protected_melee_conditioner, "
                    "but its tensor is missing") from exc
            if (
                    tuple(strength.shape) != (2,)
                    or not bool(torch.isfinite(strength).all())
                    or bool((strength < 0).any())):
                raise ValueError(
                    "VLS protected-melee conditioner strengths must be finite "
                    "non-negative values with shape [2]")
            input_indices = (
                int(config["opponent_hp_input_index"]),
                int(config["opponent_protect_melee_input_index"]),
                int(config["spec_energy_input_index"]),
            )
            if max(input_indices) >= self.input_size:
                raise ValueError(
                    "VLS protected-melee conditioner input index is unavailable")
            self.vls_protected_melee_strength = strength
            self.vls_protected_melee_identity = bool(
                torch.count_nonzero(strength).detach().cpu() == 0)
            self.vls_protected_melee_input_indices = torch.as_tensor(
                input_indices, device=self.device, dtype=torch.long)
            self.vls_protected_melee_input_mean = self.mean.index_select(
                0, self.vls_protected_melee_input_indices)
            self.vls_protected_melee_input_std = self.std.index_select(
                0, self.vls_protected_melee_input_indices)
            self.vls_protected_melee_head_rows = torch.as_tensor(
                config["head_action_rows"],
                device=self.device, dtype=torch.long)
            self.vls_protected_melee_follow_rows = torch.as_tensor(
                config["follow_action_rows"],
                device=self.device, dtype=torch.long)
            self.vls_protected_melee_head_penalized_local = torch.as_tensor(
                [1], device=self.device, dtype=torch.long)
            self.vls_protected_melee_follow_penalized_local = torch.as_tensor(
                [1, 2], device=self.device, dtype=torch.long)

        self.offensive_prayer_config = checkpoint_schema.get(
            "offensive_prayer_conditioner")
        self.offensive_prayer_linear = None
        self.offensive_prayer_input_indices = None
        self.offensive_prayer_action_groups = ()
        if self.offensive_prayer_config is not None:
            config = self.offensive_prayer_config
            expected_inputs = (
                schema.INPUT_OPP_PROTECT_MAGIC,
                schema.INPUT_OPP_PROTECT_RANGED,
                schema.INPUT_OPP_PROTECT_MELEE,
            )
            expected_attack_rows = (
                schema.COMBAT_ATTACK_BASE,
                schema.COMBAT_ATTACK_BASE + 2,
                schema.COMBAT_ATTACK_BASE + 4,
            )
            expected_off_tick_rows = tuple(
                row + 1 for row in expected_attack_rows)
            try:
                kind = config["kind"]
                version = config["version"]
                input_indices = tuple(config["input_indices"])
                attack_rows = tuple(config["attack_action_rows"])
                off_tick_rows = tuple(config["off_tick_action_rows"])
                preserves_mass = config["preserve_group_logmass"]
            except (KeyError, TypeError) as exc:
                raise ValueError(
                    "invalid offensive prayer conditioner schema") from exc
            integer_values = (
                version, *input_indices, *attack_rows, *off_tick_rows)
            exact_integers = all(
                isinstance(value, (int, np.integer))
                and not isinstance(value, (bool, np.bool_))
                for value in integer_values)
            if (
                    kind != "dmm-offensive-prayer-style-residual"
                    or not exact_integers
                    or version != 1
                    or input_indices != expected_inputs
                    or attack_rows != expected_attack_rows
                    or off_tick_rows != expected_off_tick_rows
                    or preserves_mass is not True):
                raise ValueError(
                    "offensive prayer conditioner schema does not match "
                    "FastSim's version-1 combat-style contract")
            self.offensive_prayer_linear = linear(
                "offensive_prayer_conditioner")
            weight, bias = self.offensive_prayer_linear
            if tuple(weight.shape) != (3, 3) or tuple(bias.shape) != (3,):
                raise ValueError(
                    "offensive prayer conditioner tensors must have shapes "
                    "weight [3, 3] and bias [3]")
            self.offensive_prayer_input_indices = torch.as_tensor(
                input_indices, device=self.device, dtype=torch.long)
            self.offensive_prayer_action_groups = tuple(
                torch.as_tensor(
                    rows, device=self.device, dtype=torch.long)
                for rows in (attack_rows, off_tick_rows)
            )

        self.direct_gear_config = checkpoint_schema.get(
            "direct_gear_conditioning")
        self.direct_gear_weight = None
        self.direct_gear_weight_cpu = None
        self.direct_gear_rows = None
        if self.direct_gear_config is not None:
            try:
                self.direct_gear_weight = state_dict[
                    "direct_gear_conditioner.weight"
                ].to(device=device, dtype=dtype)
            except KeyError as exc:
                raise ValueError(
                    "checkpoint schema declares direct_gear_conditioning, but "
                    "its tensor is missing") from exc
            if self.direct_gear_config.get("kind") != (
                    "dmm-body-legs-combat-age-residual"):
                raise ValueError(
                    "unsupported direct gear conditioning kind: "
                    f"{self.direct_gear_config.get('kind')}")
            self.direct_gear_weight_cpu = (
                self.direct_gear_weight.detach().float().cpu().numpy())
            self.direct_gear_rows = np.asarray(
                self.direct_gear_config["action_rows"], dtype=np.int64)

        self.safe_magic_legs_config = checkpoint_schema.get(
            "safe_magic_legs_conditioner")
        self.safe_magic_legs_strength = None
        if self.safe_magic_legs_config is not None:
            config = self.safe_magic_legs_config
            expected_action_row = 63
            expected_action_id = int(self.action_ids[expected_action_row])
            try:
                kind = config["kind"]
                version = config["version"]
                combat_source = config["combat_source"]
                required_style = config["required_combat_style"]
                combat_style_index = config["combat_style_index"]
                age_input_index = config["age_input_index"]
                max_age_exclusive = config["max_age_exclusive"]
                action_id = config["action_id"]
                action_row = config["action_row"]
                preserves_mass = config["preserve_group_logmass"]
                projection = config["projection"]
            except (KeyError, TypeError) as exc:
                raise ValueError(
                    "invalid safe-magic legs conditioner schema") from exc
            integer_values = (
                version,
                combat_style_index,
                age_input_index,
                action_id,
                action_row,
            )
            exact_integers = all(
                isinstance(value, (int, np.integer))
                and not isinstance(value, (bool, np.bool_))
                for value in integer_values)
            if (
                    kind != "dmm-safe-magic-legs-residual"
                    or not exact_integers
                    or version != 1
                    or combat_source != "greedy_combat"
                    or required_style != "magic"
                    or combat_style_index != 1
                    or age_input_index != (
                        schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK)
                    or float(max_age_exclusive) != 0.5
                    or action_id != expected_action_id
                    or action_row != expected_action_row
                    or preserves_mass is not False
                    or projection != "nonnegative_clamp"):
                raise ValueError(
                    "safe-magic legs conditioner schema does not match "
                    "FastSim's version-1 contract")
            if (
                    self.direct_gear_config is None
                    or expected_action_row not in set(
                        int(value)
                        for value in self.direct_gear_config["action_rows"])):
                raise ValueError(
                    "safe-magic legs conditioner requires existing direct-gear "
                    "conditioning for Virtus bottom")
            try:
                strength = state_dict[
                    "safe_magic_legs_conditioner.strength"
                ].to(device=device, dtype=dtype)
            except KeyError as exc:
                raise ValueError(
                    "checkpoint schema declares safe_magic_legs_conditioner, "
                    "but its tensor is missing") from exc
            if (
                    tuple(strength.shape) != (1,)
                    or not bool(torch.isfinite(strength).all())
                    or bool((strength < 0).any())):
                raise ValueError(
                    "safe-magic legs conditioner strength must be a finite "
                    "non-negative tensor with shape [1]")
            self.safe_magic_legs_strength = float(
                strength.detach().float().cpu().item())

        self.magic_full_offence_config = checkpoint_schema.get(
            "magic_full_offence_conditioner")
        self.magic_full_offence_strength = None
        self.magic_full_offence_version = 0
        self.magic_full_offence_action_signs = None
        if self.magic_full_offence_config is not None:
            config = self.magic_full_offence_config
            expected_v1 = {
                "kind": "dmm-magic-full-offence-residual",
                "version": 1,
                "combat_source": "greedy_combat",
                "required_combat_style": "magic",
                "combat_style_index": 1,
                "age_input_index":
                    schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK,
                "max_safe_age_exclusive": 0.5,
                "action_ids": [420426, 420440],
                "action_rows": [63, 77],
                "context_order": ["safe", "unsafe"],
                "action_order": ["virtus_bottom", "unequip_head"],
                "preserve_group_logmass": False,
                "projection": "bounded_clamp",
                "max_strength": [[1.2, 3.0], [0.05, 0.05]],
                "apply_after": "safe_magic_legs_conditioner",
            }
            expected_v2 = {
                "kind": "dmm-magic-full-offence-residual",
                "version": 2,
                "combat_source": "greedy_combat",
                "required_combat_style": "magic",
                "combat_style_index": 1,
                "safety_source":
                    "observed_opponent_ordinary_attack_cooldown",
                "action_ids": [420426, 420440, 420420],
                "action_rows": [63, 77, 57],
                "action_signs": [1, 1, -1],
                "context_order": ["safe", "unsafe"],
                "action_order": [
                    "virtus_bottom",
                    "unequip_head",
                    "equip_torva_helm",
                ],
                "preserve_group_logmass": False,
                "projection": "bounded_clamp",
                "max_strength": [
                    [8.0, 8.0, 8.0],
                    [0.05, 0.05, 0.05],
                ],
                "apply_after": "safe_magic_legs_conditioner",
            }
            expected_v3 = {
                "kind": "dmm-magic-full-offence-residual",
                "version": 3,
                "combat_source": "greedy_combat",
                "required_combat_style": "magic",
                "combat_style_index": 1,
                "safety_source":
                    "observed_opponent_ordinary_attack_cooldown",
                "action_ids": [
                    420426,
                    420440,
                    420420,
                    420425,
                    420434,
                ],
                "action_rows": [63, 77, 57, 62, 71],
                "action_signs": [1, 1, -1, 1, -1],
                "context_order": ["safe", "unsafe"],
                "action_order": [
                    "virtus_bottom",
                    "unequip_head",
                    "equip_torva_helm",
                    "equip_elidinis_ward",
                    "equip_dragonfire_shield",
                ],
                "preserve_group_logmass": False,
                "projection": "bounded_clamp",
                "max_strength": [
                    [8.0, 8.0, 8.0, 12.0, 12.0],
                    [0.05, 0.05, 0.05, 0.0, 0.0],
                ],
                "apply_after": "safe_magic_legs_conditioner",
            }
            version = (
                int(config.get("version", -1))
                if isinstance(config, dict)
                else -1
            )
            expected = (
                expected_v1
                if version == 1
                else expected_v2
                if version == 2
                else expected_v3 if version == 3 else None
            )
            if (
                    expected is None
                    or not isinstance(config, dict)
                    or set(config) != set(expected)
                    or any(config.get(key) != value
                           for key, value in expected.items())):
                contract = (
                    f"version-{version}"
                    if version in (1, 2, 3)
                    else "version-1, version-2, or version-3"
                )
                raise ValueError(
                    "magic full-offence conditioner schema does not match "
                    f"FastSim's {contract} contract")
            if self.safe_magic_legs_config is None:
                raise ValueError(
                    "magic full-offence conditioner requires the existing "
                    "safe-magic legs conditioner")
            if [
                    int(self.action_ids[row])
                    for row in expected["action_rows"]
            ] != expected["action_ids"]:
                raise ValueError(
                    "magic full-offence conditioner action rows do not map to "
                    "the required direct-gear action ids")
            try:
                strength = state_dict[
                    "magic_full_offence_conditioner.strength"
                ].to(device=device, dtype=dtype)
            except KeyError as exc:
                raise ValueError(
                    "checkpoint schema declares magic_full_offence_conditioner, "
                    "but its tensor is missing") from exc
            maximum = torch.as_tensor(
                expected["max_strength"], device=device, dtype=dtype)
            if (
                    tuple(strength.shape) != tuple(maximum.shape)
                    or not bool(torch.isfinite(strength).all())
                    or bool((strength < 0).any())
                    or bool((strength > maximum).any())):
                raise ValueError(
                    "magic full-offence conditioner strengths must be finite "
                    f"values within the declared {list(maximum.shape)} bounds")
            self.magic_full_offence_version = version
            self.magic_full_offence_strength = (
                strength.detach().float().cpu().numpy())
            self.magic_full_offence_action_signs = np.asarray(
                expected.get(
                    "action_signs",
                    [1] * len(expected["action_rows"])),
                dtype=np.float32)

        declared_prefixes = {
            "defence_prayer_head.": self.defence_prayer_config,
            "frozen_unreachable_prayer_conditioner.": (
                self.frozen_unreachable_prayer_config),
            "freeze_boundary_prayer_residual.": (
                self.freeze_boundary_prayer_config),
            "safe_window_prayer_residual.": (
                self.safe_window_prayer_config),
            "vls_voidwaker_head.": self.vls_voidwaker_config,
            "vls_setup_adapter.": self.vls_setup_config,
            "vls_followthrough_adapter.": self.vls_followthrough_config,
            "vls_protected_melee_conditioner.": (
                self.vls_protected_melee_config),
            "offensive_prayer_conditioner.": self.offensive_prayer_config,
            "direct_gear_conditioner.": self.direct_gear_config,
            "safe_magic_legs_conditioner.": self.safe_magic_legs_config,
            "magic_full_offence_conditioner.": (
                self.magic_full_offence_config),
        }
        for prefix, config in declared_prefixes.items():
            if config is None and any(key.startswith(prefix) for key in state_dict):
                raise ValueError(
                    f"checkpoint contains {prefix[:-1]} tensors without matching "
                    "schema metadata; refusing to silently ignore them")

    @classmethod
    def load(
            cls,
            path: str | Path,
            device: str = "auto",
            dtype: str = "float32",
            compatible_input_sizes: tuple[int, ...] = ()) -> "Policy":
        if torch is None:
            raise RuntimeError("PyTorch is required to run the policy")
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        torch_dtype = {"float32": torch.float32, "float16": torch.float16,
                       "bfloat16": torch.bfloat16}[dtype]

        blob = torch.load(Path(path), map_location="cpu", weights_only=False)
        state = blob["model_state"]
        declared = blob.get("schema", {})
        action_ids = declared.get("action_ids") if declared else None
        if action_ids is None:
            raise ValueError(
                "checkpoint has no schema.action_ids; refusing to generate a "
                "rollout with an unverifiable Java action mapping")
        policy = cls(state, blob["input_mean"], blob["input_std"],
                     torch.device(device), torch_dtype, action_ids, declared)

        if declared:
            if int(declared["input_size"]) != policy.input_size:
                raise ValueError(
                    f"checkpoint schema says {declared['input_size']} inputs but the "
                    f"encoder takes {policy.input_size}")
            if int(declared["action_count"]) != policy.action_count:
                raise ValueError("checkpoint schema action_count disagrees with policy head")
        compatible = tuple(int(value) for value in compatible_input_sizes)
        if (
                policy.input_size != schema.INPUT_SIZE
                and policy.input_size not in compatible):
            raise ValueError(
                f"this checkpoint wants {policy.input_size} inputs but fastsim builds "
                f"{schema.INPUT_SIZE}. Update fastsim/schema.py and the observation "
                f"builder before generating data with it, or explicitly allow "
                f"this Java-compatible prefix width for evaluation.")
        if policy.action_count != schema.ACTION_COUNT:
            raise ValueError(
                f"checkpoint has {policy.action_count} actions, fastsim expects "
                f"{schema.ACTION_COUNT}")
        if policy.action_ids != schema.CURRENT_ACTION_IDS:
            raise ValueError(
                "checkpoint action_ids do not match the current Java direct-action "
                "bridge; use a deliberate schema migration instead of generating "
                "mislabelled rollout data")
        return policy

    @staticmethod
    def _linear(value, params):
        weight, bias = params
        return torch.nn.functional.linear(value, weight, bias)

    def _normalized_target(self, raw_value: float, input_index: int):
        return (
            (float(raw_value) - self.mean[input_index])
            / self.std[input_index]
        )

    @staticmethod
    def _frozen_unreachable_prayer_active_v2(raw, config):
        opponent_remaining = torch.floor(
            raw[:, int(config["opponent_freeze_ticks_input_index"])]
            * float(config["freeze_ticks_normalizer"]) + 0.5)
        self_remaining = torch.floor(
            raw[:, int(config["self_freeze_ticks_input_index"])]
            * float(config["freeze_ticks_normalizer"]) + 0.5)
        dx = torch.floor(
            torch.abs(raw[:, int(config["target_rel_dx_input_index"])])
            * float(config["relative_position_normalizer"]) + 0.5)
        dy = torch.floor(
            torch.abs(raw[:, int(config["target_rel_dy_input_index"])])
            * float(config["relative_position_normalizer"]) + 0.5)
        max_movement_decisions = float(
            config[
                "max_defender_movement_decisions_before_protected_roll"])
        movable_decisions = torch.clamp(
            max_movement_decisions - self_remaining,
            min=0.0,
            max=max_movement_decisions)
        threshold = (
            float(config["max_switchable_melee_standing_range"])
            + (
                float(config["movement_substeps_per_decision"])
                * movable_decisions))
        safe = (
            (
                (dx == 0)
                & (dy == 0)
                & (self_remaining >= max_movement_decisions))
            | (dx > threshold)
            | (dy > threshold))
        return (
            (
                raw[:, int(config["opponent_frozen_input_index"])]
                > 0.5)
            & (
                opponent_remaining
                > float(config["min_remaining_freeze_ticks_exclusive"]))
            & (
                raw[:, int(config["target_present_input_index"])]
                > 0.5)
            & safe)

    def _apply_defence_prayer_head(
            self,
            scores,
            normalized,
            prayer_history_codes=None,
            prior_state_history=None,
            prior_state_history_valid=None):
        config = self.defence_prayer_config
        if config is None:
            return scores, None
        rows = self.defence_prayer_rows
        head_inputs = normalized
        if self.defence_prayer_history_required:
            if prayer_history_codes is None:
                raise ValueError(
                    "defence-prayer head v2 requires five explicit history codes")
            history = torch.nn.functional.one_hot(
                prayer_history_codes.to(dtype=torch.long),
                num_classes=4,
            )[..., 1:]
            history = history.reshape(
                history.shape[0],
                schema.DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE,
            ).to(dtype=normalized.dtype)
            head_inputs = torch.cat((normalized, history), dim=1)
        if self.defence_prayer_prior_state_history_required:
            if prior_state_history is None or prior_state_history_valid is None:
                raise ValueError(
                    "defence-prayer head v3 requires explicit prior-state "
                    "history and validity")
            expected_history_shape = (
                normalized.shape[0],
                schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
                self.input_size,
            )
            expected_valid_shape = expected_history_shape[:2]
            if tuple(prior_state_history.shape) != expected_history_shape:
                raise ValueError(
                    "defence-prayer prior-state history must have shape "
                    f"{expected_history_shape}")
            if tuple(prior_state_history_valid.shape) != expected_valid_shape:
                raise ValueError(
                    "defence-prayer prior-state validity must have shape "
                    f"{expected_valid_shape}")
            prior_normalized = (
                prior_state_history
                - self.mean.reshape(1, 1, self.input_size)
            ) / self.std.reshape(1, 1, self.input_size)
            valid = prior_state_history_valid.to(dtype=torch.bool)
            prior_normalized = torch.where(
                valid.unsqueeze(2),
                prior_normalized,
                torch.zeros_like(prior_normalized))
            prior_context = torch.cat((
                prior_normalized,
                valid.to(dtype=normalized.dtype).unsqueeze(2),
            ), dim=2).reshape(
                normalized.shape[0],
                schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_CONTEXT_SIZE)
            head_inputs = torch.cat(
                (head_inputs, prior_context.to(dtype=normalized.dtype)),
                dim=1)
        hidden = torch.nn.functional.silu(
            self._linear(head_inputs, self.defence_prayer_hidden))
        replacement = self._linear(hidden, self.defence_prayer_output)
        kind = config["kind"]
        if kind == "dmm-defence-prayer-group-replacement":
            group_mass = torch.logsumexp(
                scores.index_select(1, rows), dim=1, keepdim=True)
            replacement = (
                torch.nn.functional.log_softmax(replacement, dim=1)
                + group_mass)
        elif kind != "dmm-defence-prayer-mlp-replacement":
            raise ValueError(f"unsupported defence prayer head kind: {kind}")
        output = scores.clone()
        output.index_copy_(1, rows, replacement.to(dtype=output.dtype))
        return output, hidden

    def _apply_frozen_unreachable_prayer_conditioner(
            self, scores, normalized, raw):
        config = self.frozen_unreachable_prayer_config
        if config is None or self.frozen_unreachable_prayer_identity:
            return scores
        if int(config["version"]) == 2:
            active = self._frozen_unreachable_prayer_active_v2(raw, config)
        else:
            reconstructed_raw = (
                normalized.index_select(
                    1, self.frozen_unreachable_prayer_input_indices)
                * self.frozen_unreachable_prayer_input_std.unsqueeze(0)
                + self.frozen_unreachable_prayer_input_mean.unsqueeze(0))
            remaining_ticks = torch.floor(
                reconstructed_raw[:, 1]
                * float(config["freeze_ticks_normalizer"]) + 0.5)
            active = (
                (reconstructed_raw[:, 0] > 0.5)
                & (
                    remaining_ticks
                    > float(config["min_remaining_freeze_ticks_exclusive"]))
                & (reconstructed_raw[:, 2] > 0.5)
                & (reconstructed_raw[:, 3] < 0.5))
        rows = self.frozen_unreachable_prayer_rows
        base = scores.index_select(1, rows)
        adjusted = base.clone()
        adjusted[:, 2] = (
            adjusted[:, 2]
            - self.frozen_unreachable_prayer_strength[0])
        group_logmass = torch.logsumexp(base, dim=1, keepdim=True)
        replacement = (
            torch.nn.functional.log_softmax(adjusted, dim=1)
            + group_logmass)
        replacement = torch.where(active.unsqueeze(1), replacement, base)
        output = scores.clone()
        output.index_copy_(1, rows, replacement.to(dtype=output.dtype))
        return output

    def _apply_freeze_boundary_prayer_residual(
            self,
            scores,
            raw,
            prior_state_history,
            prior_state_history_valid,
            prayer_hidden):
        config = self.freeze_boundary_prayer_config
        if config is None or self.freeze_boundary_prayer_identity:
            return scores
        if (
                prayer_hidden is None
                or prior_state_history is None
                or prior_state_history_valid is None):
            raise ValueError(
                "freeze-boundary prayer residual requires v3 hidden features "
                "and prior-state history")
        remaining_ticks = torch.floor(
            raw[:, schema.INPUT_OPP_FREEZE_TICKS]
            * float(config["freeze_ticks_normalizer"]) + 0.5)
        last_pre_thaw = (
            (raw[:, schema.INPUT_OPP_FROZEN] > 0.5)
            & (
                remaining_ticks
                == float(config["last_pre_thaw_remaining_ticks"])))
        recent_lags = int(config["prior_state_history_lags"])
        recent_frozen_unreachable = (
            prior_state_history_valid[:, :recent_lags].to(dtype=torch.bool)
            & (
                prior_state_history[
                    :, :recent_lags, schema.INPUT_OPP_FROZEN] > 0.5)
            & (
                prior_state_history[
                    :, :recent_lags, schema.INPUT_OPP_MELEE_REACH] < 0.5)
        ).any(dim=1)
        post_thaw_reachable = (
            (raw[:, schema.INPUT_OPP_MELEE_REACH] > 0.5)
            & recent_frozen_unreachable)
        active = (
            (raw[:, schema.INPUT_TARGET_PRESENT] > 0.5)
            & (last_pre_thaw | post_thaw_reachable))
        rows = self.freeze_boundary_prayer_rows
        base = scores.index_select(1, rows)
        residual = self._linear(
            prayer_hidden, self.freeze_boundary_prayer_linear)
        group_logmass = torch.logsumexp(base, dim=1, keepdim=True)
        replacement = (
            torch.nn.functional.log_softmax(base + residual, dim=1)
            + group_logmass)
        replacement = torch.where(active.unsqueeze(1), replacement, base)
        output = scores.clone()
        output.index_copy_(1, rows, replacement.to(dtype=output.dtype))
        return output

    def _apply_safe_window_prayer_residual(
            self,
            scores,
            normalized,
            raw,
            prayer_hidden):
        config = self.safe_window_prayer_config
        if config is None or self.safe_window_prayer_identity:
            return scores
        if prayer_hidden is None:
            raise ValueError(
                "safe-window prayer residual requires defence-head hidden "
                "features")
        if int(config["version"]) == 2:
            active = self._frozen_unreachable_prayer_active_v2(
                raw, self.frozen_unreachable_prayer_config)
        else:
            reconstructed_raw = (
                normalized.index_select(
                    1, self.safe_window_prayer_input_indices)
                * self.safe_window_prayer_input_std.unsqueeze(0)
                + self.safe_window_prayer_input_mean.unsqueeze(0))
            remaining_ticks = torch.floor(
                reconstructed_raw[:, 1]
                * float(config["freeze_ticks_normalizer"]) + 0.5)
            active = (
                (reconstructed_raw[:, 0] > 0.5)
                & (
                    remaining_ticks
                    > float(config["min_remaining_freeze_ticks_exclusive"]))
                & (reconstructed_raw[:, 2] > 0.5)
                & (reconstructed_raw[:, 3] < 0.5))
        rows = self.safe_window_prayer_rows
        base = scores.index_select(1, rows)
        group_lift = self._linear(
            prayer_hidden, self.safe_window_prayer_linear)
        adjusted = base.clone()
        adjusted[:, :2] = adjusted[:, :2] + group_lift
        group_logmass = torch.logsumexp(base, dim=1, keepdim=True)
        replacement = (
            torch.nn.functional.log_softmax(adjusted, dim=1)
            + group_logmass)
        replacement = torch.where(active.unsqueeze(1), replacement, base)
        output = scores.clone()
        output.index_copy_(1, rows, replacement.to(dtype=output.dtype))
        return output

    def _apply_vls_voidwaker_head(self, scores, normalized, encoded):
        config = self.vls_voidwaker_config
        if config is None:
            return scores
        rows = self.vls_voidwaker_rows
        base_pair = scores.index_select(1, rows)
        head_pair = self._linear(encoded, self.vls_voidwaker_linear)
        if self.vls_voidwaker_matches_policy:
            replacement = base_pair
        else:
            pair_mass = torch.logsumexp(base_pair, dim=1, keepdim=True)
            replacement = (
                torch.nn.functional.log_softmax(head_pair, dim=1)
                + pair_mass)
        active = self._vls_voidwaker_active(normalized)
        replacement = torch.where(active.unsqueeze(1), replacement, base_pair)
        output = scores.clone()
        output.index_copy_(1, rows, replacement.to(dtype=output.dtype))
        return output

    def _vls_voidwaker_active(self, normalized):
        if self.vls_voidwaker_config is None:
            return torch.zeros(
                normalized.shape[0],
                device=normalized.device,
                dtype=torch.bool)
        return (
            normalized[:, self.vls_voidwaker_energy_index]
            >= self.vls_voidwaker_energy_threshold)

    def _apply_vls_setup_adapter(self, scores, normalized, encoded):
        config = self.vls_setup_config
        if config is None:
            return scores
        active = torch.isclose(
            normalized[:, self.vls_setup_delay_index],
            self.vls_setup_delay_target,
            rtol=0.0,
            atol=self.vls_setup_delay_tolerance,
        )
        if self.vls_setup_version >= 2:
            active &= (
                normalized[:, self.vls_setup_energy_index]
                + self.vls_setup_energy_tolerance
                >= self.vls_setup_energy_target)
            active &= torch.isclose(
                normalized[:, self.vls_setup_control_index],
                self.vls_setup_control_target,
                rtol=0.0,
                atol=self.vls_setup_control_tolerance,
            )
        if self.vls_setup_version >= 3:
            raw = (
                normalized.index_select(1, self.vls_setup_context_indexes)
                * self.vls_setup_context_std
                + self.vls_setup_context_mean)
            target = raw[:, 0]
            frozen = raw[:, 1]
            rel_dx = raw[:, 2]
            rel_dy = raw[:, 3]
            melee = raw[:, 4]
            target_present = torch.isclose(
                target, self.vls_setup_context_one, rtol=0.0,
                atol=self.vls_setup_context_tolerance)
            self_frozen = torch.isclose(
                frozen, self.vls_setup_context_one, rtol=0.0,
                atol=self.vls_setup_context_tolerance)
            melee_reach = torch.isclose(
                melee, self.vls_setup_context_one, rtol=0.0,
                atol=self.vls_setup_context_tolerance)
            dx = torch.floor(torch.abs(rel_dx) * 16.0 + 0.5).to(torch.long)
            dy = torch.floor(torch.abs(rel_dy) * 16.0 + 0.5).to(torch.long)
            same_tile = (dx == 0) & (dy == 0) & ~self_frozen
            cardinal = ((dx == 1) & (dy == 0)) | ((dx == 0) & (dy == 1))
            diagonal = (dx == 1) & (dy == 1) & ~self_frozen
            one_step = (
                ~self_frozen & (dx <= 3) & (dy <= 3)
                & ~((dx == 3) & (dy == 3)))
            active &= (
                target_present
                & (melee_reach | same_tile | cardinal | diagonal | one_step))
        residual = self._linear(encoded, self.vls_setup_linear).squeeze(1)
        output = scores.clone()
        output[:, self.vls_setup_action_row] += torch.where(
            active, residual, torch.zeros_like(residual))
        return output

    def _apply_vls_followthrough_adapter(self, scores, normalized, encoded):
        config = self.vls_followthrough_config
        if config is None:
            return scores
        active = self._vls_followthrough_active(normalized)
        residual = self._linear(
            encoded, self.vls_followthrough_linear).squeeze(1)
        residual = torch.where(
            active, residual, torch.zeros_like(residual))
        output = scores.clone()
        rows = self.vls_followthrough_rows
        output[:, rows] += residual.unsqueeze(1)
        return output

    def _vls_followthrough_active(self, normalized):
        if self.vls_followthrough_config is None:
            return torch.zeros(
                normalized.shape[0],
                device=normalized.device,
                dtype=torch.bool)
        active = (
            normalized[:, self.vls_followthrough_energy_index]
            + self.vls_followthrough_energy_tolerance
            >= self.vls_followthrough_energy_target)
        for input_index, target, tolerance in (
                self.vls_followthrough_equal_requirements):
            active &= torch.isclose(
                normalized[:, input_index],
                target,
                rtol=0.0,
                atol=tolerance,
            )
        return active

    @staticmethod
    def _replace_vls_protected_group(
            scores,
            rows,
            penalized_local,
            penalty,
            active):
        base = scores.index_select(1, rows)
        local_penalty = torch.zeros_like(base)
        local_penalty.index_copy_(
            1,
            penalized_local,
            penalty.unsqueeze(1).expand(-1, penalized_local.numel()))
        group_logmass = torch.logsumexp(base, dim=1, keepdim=True)
        replacement = (
            torch.nn.functional.log_softmax(
                base - local_penalty, dim=1)
            + group_logmass)
        replacement = torch.where(active.unsqueeze(1), replacement, base)
        output = scores.clone()
        output.index_copy_(1, rows, replacement.to(dtype=output.dtype))
        return output

    def _apply_vls_protected_melee_conditioner(
            self, scores, normalized):
        config = self.vls_protected_melee_config
        if config is None:
            return scores
        raw = (
            normalized.index_select(
                1, self.vls_protected_melee_input_indices)
            * self.vls_protected_melee_input_std.unsqueeze(0)
            + self.vls_protected_melee_input_mean.unsqueeze(0))
        opponent_hp = raw[:, 0]
        opponent_protect_melee = raw[:, 1]
        spec_energy = raw[:, 2]
        common = (
            (opponent_protect_melee > 0.5)
            & (opponent_hp > float(config["ko_hp_max"])))
        gate = (
            (opponent_hp - float(config["ko_hp_max"]))
            / (
                float(config["full_strength_hp_min"])
                - float(config["ko_hp_max"]))
        ).clamp(0.0, 1.0)
        head_active = common & self._vls_voidwaker_active(normalized)
        follow_active = (
            common
            & self._vls_followthrough_active(normalized)
            & (
                spec_energy
                < float(config["follow_max_spec_energy_exclusive"])))
        # A zero-strength child must be an exact identity, not merely close
        # after a log-softmax/logsumexp round trip.
        if self.vls_protected_melee_identity:
            return scores
        output = self._replace_vls_protected_group(
            scores,
            self.vls_protected_melee_head_rows,
            self.vls_protected_melee_head_penalized_local,
            gate * self.vls_protected_melee_strength[0],
            head_active)
        output = self._replace_vls_protected_group(
            output,
            self.vls_protected_melee_follow_rows,
            self.vls_protected_melee_follow_penalized_local,
            gate * self.vls_protected_melee_strength[1],
            follow_active)
        return output

    def _apply_offensive_prayer_conditioner(self, scores, normalized, raw):
        if self.offensive_prayer_config is None:
            return scores
        prayer_inputs = normalized.index_select(
            1, self.offensive_prayer_input_indices)
        raw_prayer_inputs = raw.index_select(
            1, self.offensive_prayer_input_indices)
        no_prayer = (raw_prayer_inputs == 0).all(dim=1, keepdim=True)
        residual = self._linear(
            prayer_inputs, self.offensive_prayer_linear)
        output = scores.clone()
        for rows in self.offensive_prayer_action_groups:
            base = scores.index_select(1, rows)
            adjusted = base + residual
            mass_shift = (
                torch.logsumexp(base, dim=1, keepdim=True)
                - torch.logsumexp(adjusted, dim=1, keepdim=True)
            )
            conditioned = adjusted + mass_shift
            # The exported affine tensors reconstruct A @ raw_prayer from
            # normalized inputs. For an exact all-zero raw prayer state, bypass
            # that reconstruction so cancellation cannot perturb any style.
            conditioned = torch.where(no_prayer, base, conditioned)
            output.index_copy_(
                1, rows, conditioned.to(dtype=output.dtype))
        return output

    def _score_tensors(
            self,
            raw,
            prayer_history_codes=None,
            prior_state_history=None,
            prior_state_history_valid=None):
        normalized = (raw - self.mean) / self.std
        x = normalized
        for weight, bias in self._layers:
            x = torch.nn.functional.silu(
                torch.nn.functional.linear(x, weight, bias))
        encoded = x
        scores = torch.nn.functional.linear(
            encoded, self.policy_w, self.policy_b)
        scores = self._apply_offensive_prayer_conditioner(
            scores, normalized, raw)
        scores, prayer_hidden = self._apply_defence_prayer_head(
            scores,
            normalized,
            prayer_history_codes,
            prior_state_history,
            prior_state_history_valid)
        scores = self._apply_frozen_unreachable_prayer_conditioner(
            scores, normalized, raw)
        scores = self._apply_freeze_boundary_prayer_residual(
            scores,
            raw,
            prior_state_history,
            prior_state_history_valid,
            prayer_hidden)
        scores = self._apply_safe_window_prayer_residual(
            scores,
            normalized,
            raw,
            prayer_hidden)
        scores = self._apply_vls_voidwaker_head(
            scores, normalized, encoded)
        scores = self._apply_vls_setup_adapter(
            scores, normalized, encoded)
        scores = self._apply_vls_followthrough_adapter(
            scores, normalized, encoded)
        scores = self._apply_vls_protected_melee_conditioner(
            scores, normalized)
        value = torch.nn.functional.linear(
            x, self.value_w, self.value_b).squeeze(-1)
        return scores, value

    def _score_cuda_graph(
            self,
            inputs,
            prayer_history_codes=None,
            prior_state_history=None,
            prior_state_history_valid=None,
            return_device_packed=False):
        shape = tuple(inputs.shape)
        source = torch.as_tensor(inputs, device="cpu", dtype=self.dtype)
        history_shape = (
            None
            if prayer_history_codes is None
            else tuple(prayer_history_codes.shape))
        prior_shape = (
            None
            if prior_state_history is None
            else tuple(prior_state_history.shape))
        prior_valid_shape = (
            None
            if prior_state_history_valid is None
            else tuple(prior_state_history_valid.shape))
        graph_key = (
            shape, history_shape, prior_shape, prior_valid_shape)
        entry = self._cuda_graphs.get(graph_key)
        if entry is None:
            static_raw = torch.empty(
                shape, device=self.device, dtype=self.dtype)
            static_raw.copy_(source)
            static_history = None
            if prayer_history_codes is not None:
                static_history = torch.empty(
                    history_shape, device=self.device, dtype=torch.long)
                static_history.copy_(torch.as_tensor(
                    prayer_history_codes, device="cpu", dtype=torch.long))
            static_prior = None
            if prior_state_history is not None:
                static_prior = torch.empty(
                    prior_shape, device=self.device, dtype=self.dtype)
                static_prior.copy_(torch.as_tensor(
                    prior_state_history, device="cpu", dtype=self.dtype))
            static_prior_valid = None
            if prior_state_history_valid is not None:
                static_prior_valid = torch.empty(
                    prior_valid_shape, device=self.device, dtype=torch.bool)
                static_prior_valid.copy_(torch.as_tensor(
                    prior_state_history_valid,
                    device="cpu",
                    dtype=torch.bool))

            # CUDA graph capture requires a short warmup on another stream.
            warmup_stream = torch.cuda.Stream(device=self.device)
            warmup_stream.wait_stream(torch.cuda.current_stream(self.device))
            with torch.cuda.stream(warmup_stream):
                for _ in range(3):
                    self._score_tensors(
                        static_raw,
                        static_history,
                        static_prior,
                        static_prior_valid)
            torch.cuda.current_stream(self.device).wait_stream(warmup_stream)

            graph = torch.cuda.CUDAGraph()
            with torch.cuda.graph(graph):
                scores, value = self._score_tensors(
                    static_raw,
                    static_history,
                    static_prior,
                    static_prior_valid)
                packed = torch.cat((scores, value.unsqueeze(1)), dim=1)
            entry = (
                graph,
                static_raw,
                static_history,
                static_prior,
                static_prior_valid,
                packed)
            self._cuda_graphs[graph_key] = entry

        (
            graph,
            static_raw,
            static_history,
            static_prior,
            static_prior_valid,
            packed,
        ) = entry
        static_raw.copy_(source)
        if static_history is not None:
            static_history.copy_(torch.as_tensor(
                prayer_history_codes, device="cpu", dtype=torch.long))
        if static_prior is not None:
            static_prior.copy_(torch.as_tensor(
                prior_state_history, device="cpu", dtype=self.dtype))
        if static_prior_valid is not None:
            static_prior_valid.copy_(torch.as_tensor(
                prior_state_history_valid, device="cpu", dtype=torch.bool))
        graph.replay()
        if return_device_packed:
            return packed
        result = packed.float().cpu().numpy()
        return result[:, :-1], result[:, -1]

    def score_cuda_graph_packed(
            self,
            inputs: np.ndarray,
            prayer_history_codes: np.ndarray | None = None,
            prior_state_history: np.ndarray | None = None,
            prior_state_history_valid: np.ndarray | None = None):
        """Queue one CUDA graph and leave its packed result on the device.

        Routed multi-checkpoint evaluation uses this to enqueue every distinct
        model before performing any CPU readback.  Ordinary callers continue
        through ``score`` and retain the existing synchronous NumPy contract.
        """
        if self.device.type != "cuda":
            raise ValueError("packed CUDA scoring requires a CUDA policy")
        if inputs.ndim != 2 or inputs.shape[1] < self.input_size:
            raise ValueError(
                f"policy needs at least {self.input_size} inputs, got "
                f"{tuple(inputs.shape)}")
        model_inputs = inputs[:, :self.input_size]
        history_codes = None
        if self.defence_prayer_history_required:
            history_codes = np.asarray(prayer_history_codes)
            expected_shape = (
                model_inputs.shape[0],
                schema.DEFENCE_PRAYER_HISTORY_CODE_COUNT,
            )
            if history_codes.shape != expected_shape:
                raise ValueError(
                    "defence-prayer history codes must have shape "
                    f"{expected_shape}, got {history_codes.shape}")
            history_codes = history_codes.astype(np.int64, copy=False)
        prior_history = None
        prior_valid = None
        if self.defence_prayer_prior_state_history_required:
            prior_history = np.asarray(prior_state_history)
            prior_valid = np.asarray(prior_state_history_valid)
            expected_prior_shape = (
                model_inputs.shape[0],
                schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
                self.input_size,
            )
            expected_valid_shape = expected_prior_shape[:2]
            if prior_history.shape != expected_prior_shape:
                raise ValueError(
                    "defence-prayer prior-state history must have shape "
                    f"{expected_prior_shape}, got {prior_history.shape}")
            if prior_valid.shape != expected_valid_shape:
                raise ValueError(
                    "defence-prayer prior-state validity must have shape "
                    f"{expected_valid_shape}, got {prior_valid.shape}")
            prior_history = prior_history.astype(
                np.float32 if self.dtype == torch.float32 else np.float16,
                copy=False)
            prior_valid = prior_valid.astype(bool, copy=False)
        return self._score_cuda_graph(
            model_inputs,
            history_codes,
            prior_history,
            prior_valid,
            return_device_packed=True)

    def score(
            self, inputs: np.ndarray,
            prayer_history_codes: np.ndarray | None = None,
            prior_state_history: np.ndarray | None = None,
            prior_state_history_valid: np.ndarray | None = None):
        """[n, 114] raw inputs -> ([n, 86] action scores, [n] value).

        The arrays cross to the GPU once, everything happens there, and only the
        scores come back. Nothing in here branches per fight.
        """
        if inputs.ndim != 2 or inputs.shape[1] < self.input_size:
            raise ValueError(
                f"policy needs at least {self.input_size} inputs, got "
                f"{tuple(inputs.shape)}")
        # Java's current DMM loader deliberately accepts state110/111/112
        # checkpoints and feeds each model the prefix it was trained on. Keep
        # rollout generation fail-closed by default; the paired evaluator opts
        # into those exact legacy widths when loading immutable anchors.
        model_inputs = inputs[:, :self.input_size]
        history_codes = None
        if self.defence_prayer_history_required:
            if prayer_history_codes is None:
                version = self.defence_prayer_head_version
                raise ValueError(
                    "defence-prayer head v"
                    f"{version} requires five explicit history codes")
            history_codes = np.asarray(prayer_history_codes)
            expected_shape = (
                model_inputs.shape[0],
                schema.DEFENCE_PRAYER_HISTORY_CODE_COUNT,
            )
            if history_codes.shape != expected_shape:
                raise ValueError(
                    "defence-prayer history codes must have shape "
                    f"{expected_shape}, got {history_codes.shape}")
            if not np.issubdtype(history_codes.dtype, np.integer):
                raise ValueError("defence-prayer history codes must be integers")
            if np.any(history_codes < 0) or np.any(history_codes > 3):
                raise ValueError(
                    "defence-prayer history codes must be in the range 0..3")
            history_codes = history_codes.astype(np.int64, copy=False)
        prior_history = None
        prior_valid = None
        if self.defence_prayer_prior_state_history_required:
            if prior_state_history is None or prior_state_history_valid is None:
                raise ValueError(
                    "defence-prayer head v3 requires explicit prior-state "
                    "history and validity")
            prior_history = np.asarray(prior_state_history)
            prior_valid = np.asarray(prior_state_history_valid)
            expected_prior_shape = (
                model_inputs.shape[0],
                schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
                self.input_size,
            )
            expected_valid_shape = expected_prior_shape[:2]
            if prior_history.shape != expected_prior_shape:
                raise ValueError(
                    "defence-prayer prior-state history must have shape "
                    f"{expected_prior_shape}, got {prior_history.shape}")
            if prior_valid.shape != expected_valid_shape:
                raise ValueError(
                    "defence-prayer prior-state validity must have shape "
                    f"{expected_valid_shape}, got {prior_valid.shape}")
            if np.any((prior_valid != 0) & (prior_valid != 1)):
                raise ValueError(
                    "defence-prayer prior-state validity must be binary")
            prior_valid = prior_valid.astype(bool, copy=False)
            if (
                    prior_valid.any()
                    and not np.isfinite(prior_history[prior_valid]).all()):
                raise ValueError(
                    "valid defence-prayer prior-state rows must be finite")
            prior_history = prior_history.astype(
                np.float32 if self.dtype == torch.float32 else np.float16,
                copy=False)
        with torch.no_grad():
            if self.device.type == "cuda":
                return self._score_cuda_graph(
                    model_inputs,
                    history_codes,
                    prior_history,
                    prior_valid)
            raw = torch.as_tensor(
                model_inputs, device=self.device, dtype=self.dtype)
            history = (
                None
                if history_codes is None
                else torch.as_tensor(
                    history_codes, device=self.device, dtype=torch.long))
            prior = (
                None
                if prior_history is None
                else torch.as_tensor(
                    prior_history, device=self.device, dtype=self.dtype))
            valid = (
                None
                if prior_valid is None
                else torch.as_tensor(
                    prior_valid, device=self.device, dtype=torch.bool))
            scores, value = self._score_tensors(
                raw, history, prior, valid)
            return scores.float().cpu().numpy(), value.float().cpu().numpy()

    def condition_direct_gear(
        self,
        scores: np.ndarray,
        inputs: np.ndarray,
        legal_mask: np.ndarray,
        opponent_ordinary_attack_cooldown_remaining: np.ndarray | None = None,
    ) -> np.ndarray:
        """Apply NhNeuralPolicyModel.directGearConditionedActionScores.

        Java conditions the six body/legs rows only after resolving the greedy
        attack/spec pair because the residual depends on that combat choice.
        The base forward pass above intentionally leaves these rows untouched.
        """
        config = self.direct_gear_config
        if config is None:
            return scores
        blocked = np.where(legal_mask, scores, -np.inf)
        greedy_attack = np.argmax(
            blocked[:, schema.COMBAT_BASE:schema.COMBAT_SPEC_NONE], axis=1)
        greedy_spec = (
            np.argmax(
                blocked[:, schema.COMBAT_SPEC_NONE:
                        schema.COMBAT_BASE + schema.COMBAT_COUNT],
                axis=1)
            + schema.COMBAT_SPEC_NONE
        )
        combat = np.where(
            greedy_spec == schema.COMBAT_SPEC_NONE,
            greedy_attack,
            greedy_spec)

        # directGearConditioningCombatIndex: HOLD=0, ordinary style=1..3,
        # and every explicit special is a melee decision (3).
        style = np.zeros(combat.shape, dtype=np.int64)
        ordinary = (
            (combat >= schema.COMBAT_ATTACK_BASE)
            & (combat < schema.COMBAT_SPEC_NONE)
        )
        style[ordinary] = (
            (combat[ordinary] - schema.COMBAT_ATTACK_BASE) // 2
        ) + 1
        style[combat >= schema.COMBAT_SPEC_BASE] = 3

        age_index = int(config["age_input_index"])
        age = np.clip(inputs[:, age_index], 0.0, 1.0)
        weight = self.direct_gear_weight_cpu
        rows = self.direct_gear_rows
        conditioned = scores.copy()
        # Advanced indexing is clearer here than the equivalent gather:
        # each row uses its own one of four style columns and matching age term.
        for output_row, action_row in enumerate(rows):
            conditioned[:, action_row] += (
                weight[output_row, style]
                + weight[output_row, style + 4] * age
            )
        safe_magic_legs = self.safe_magic_legs_config
        if safe_magic_legs is not None:
            active = (
                (style == int(safe_magic_legs["combat_style_index"]))
                & (
                    inputs[:, int(safe_magic_legs["age_input_index"])]
                    < float(safe_magic_legs["max_age_exclusive"])
                )
            )
            strength = float(self.safe_magic_legs_strength)
            if strength != 0.0 and np.any(active):
                conditioned[
                    active,
                    int(safe_magic_legs["action_row"]),
                ] += strength
        full_offence = self.magic_full_offence_config
        if full_offence is not None:
            active = style == int(full_offence["combat_style_index"])
            if np.any(active):
                if self.magic_full_offence_version == 1:
                    safe = (
                        inputs[:, int(full_offence["age_input_index"])]
                        < float(full_offence["max_safe_age_exclusive"])
                    )
                else:
                    if opponent_ordinary_attack_cooldown_remaining is None:
                        raise ValueError(
                            "magic full-offence conditioner v2/v3 requires the "
                            "observed opponent ordinary attack cooldown")
                    cooldown = np.asarray(
                        opponent_ordinary_attack_cooldown_remaining)
                    if (
                            cooldown.shape != style.shape
                            or not bool(np.isfinite(cooldown).all())):
                        raise ValueError(
                            "observed opponent ordinary attack cooldown must "
                            "be a finite one-dimensional array matching the "
                            "score rows")
                    safe = cooldown > 0
                context = np.where(safe, 0, 1)
                strength = self.magic_full_offence_strength
                signs = self.magic_full_offence_action_signs
                for action_index, action_row in enumerate(
                        full_offence["action_rows"]):
                    conditioned[active, int(action_row)] += (
                        strength[context[active], action_index]
                        * signs[action_index]
                    )
        return conditioned


class RandomPolicy:
    """Stand-in used by tests and by the speed benchmark.

    Useful for measuring the simulator on its own: it isolates how fast the
    fight rules run without a checkpoint in the way.
    """

    def __init__(self, seed: int = 0, action_count: int = schema.ACTION_COUNT):
        self.rng = np.random.default_rng(seed)
        self.action_count = action_count
        self.input_size = schema.INPUT_SIZE
        self.action_ids = schema.CURRENT_ACTION_IDS

    def score(self, inputs: np.ndarray):
        n = inputs.shape[0]
        return (self.rng.standard_normal((n, self.action_count)).astype(np.float32),
                np.zeros(n, dtype=np.float32))

    @staticmethod
    def condition_direct_gear(
            scores,
            inputs,
            legal_mask,
            opponent_ordinary_attack_cooldown_remaining=None):
        return scores
