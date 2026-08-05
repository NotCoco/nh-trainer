"""FastSim parity for the bounded safe/unsafe Magic full-offence residual."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import engine, policy, schema  # noqa: E402


DIRECT_GEAR_CONFIG = {
    "kind": "dmm-body-legs-combat-age-residual",
    "version": 1,
    "combat_source": "greedy_combat",
    "age_input_index": 110,
    "age_normalizer_ticks": 8,
    "styles": ["hold", "magic", "ranged", "melee"],
    "feature_order": [
        "hold",
        "magic",
        "ranged",
        "melee",
        "hold_x_age",
        "magic_x_age",
        "ranged_x_age",
        "melee_x_age",
    ],
    "action_ids": [
        int(schema.CURRENT_ACTION_IDS[row])
        for row in (61, 68, 80, 63, 70, 82)
    ],
    "action_rows": [61, 68, 80, 63, 70, 82],
}

SAFE_LEGS_CONFIG = {
    "kind": "dmm-safe-magic-legs-residual",
    "version": 1,
    "combat_source": "greedy_combat",
    "required_combat_style": "magic",
    "combat_style_index": 1,
    "age_input_index": 110,
    "max_age_exclusive": 0.5,
    "action_id": 420426,
    "action_row": 63,
    "preserve_group_logmass": False,
    "projection": "nonnegative_clamp",
}

FULL_OFFENCE_CONFIG = {
    "kind": "dmm-magic-full-offence-residual",
    "version": 1,
    "combat_source": "greedy_combat",
    "required_combat_style": "magic",
    "combat_style_index": 1,
    "age_input_index": 110,
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

FULL_OFFENCE_V2_CONFIG = {
    "kind": "dmm-magic-full-offence-residual",
    "version": 2,
    "combat_source": "greedy_combat",
    "required_combat_style": "magic",
    "combat_style_index": 1,
    "safety_source": "observed_opponent_ordinary_attack_cooldown",
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
    "max_strength": [[8.0, 8.0, 8.0], [0.05, 0.05, 0.05]],
    "apply_after": "safe_magic_legs_conditioner",
}

FULL_OFFENCE_V3_CONFIG = {
    "kind": "dmm-magic-full-offence-residual",
    "version": 3,
    "combat_source": "greedy_combat",
    "required_combat_style": "magic",
    "combat_style_index": 1,
    "safety_source": "observed_opponent_ordinary_attack_cooldown",
    "action_ids": [420426, 420440, 420420, 420425, 420434],
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


def _state(
        strength: torch.Tensor | None,
        *,
        include_safe_legs: bool = True,
) -> dict[str, torch.Tensor]:
    encoded = 4
    state = {
        "encoder.0.weight": torch.zeros(
            encoded, schema.INPUT_SIZE, dtype=torch.float32),
        "encoder.0.bias": torch.zeros(encoded, dtype=torch.float32),
        "policy.weight": torch.zeros(
            schema.ACTION_COUNT, encoded, dtype=torch.float32),
        "policy.bias": torch.zeros(schema.ACTION_COUNT, dtype=torch.float32),
        "value.weight": torch.zeros(1, encoded, dtype=torch.float32),
        "value.bias": torch.zeros(1, dtype=torch.float32),
        "direct_gear_conditioner.weight": torch.zeros(
            (6, 8), dtype=torch.float32),
    }
    if include_safe_legs:
        state["safe_magic_legs_conditioner.strength"] = torch.tensor(
            [0.25], dtype=torch.float32)
    if strength is not None:
        state["magic_full_offence_conditioner.strength"] = strength.clone()
    return state


def _policy(
        strength: torch.Tensor | None,
        *,
        config: dict | None = FULL_OFFENCE_CONFIG,
        include_safe_legs: bool = True,
) -> policy.Policy:
    checkpoint_schema = {
        "direct_gear_conditioning": copy.deepcopy(DIRECT_GEAR_CONFIG),
    }
    if include_safe_legs:
        checkpoint_schema["safe_magic_legs_conditioner"] = copy.deepcopy(
            SAFE_LEGS_CONFIG)
    if config is not None:
        checkpoint_schema["magic_full_offence_conditioner"] = copy.deepcopy(
            config)
    return policy.Policy(
        _state(strength, include_safe_legs=include_safe_legs),
        np.zeros(schema.INPUT_SIZE, dtype=np.float32),
        np.ones(schema.INPUT_SIZE, dtype=np.float32),
        torch.device("cpu"),
        torch.float32,
        schema.CURRENT_ACTION_IDS,
        checkpoint_schema,
    )


def _scores_inputs_legal():
    scores = np.full((4, schema.ACTION_COUNT), -5.0, dtype=np.float32)
    scores[:, schema.COMBAT_SPEC_NONE] = 10.0
    # Safe regular Magic, unsafe off-tick Magic, safe Ranged, safe explicit spec.
    scores[0, schema.COMBAT_ATTACK_BASE] = 9.0
    scores[1, schema.COMBAT_ATTACK_BASE + 1] = 9.0
    scores[2, schema.COMBAT_ATTACK_BASE + 2] = 9.0
    scores[3, schema.COMBAT_SPEC_BASE] = 11.0
    scores[:, 63] = 0.1
    scores[:, 77] = 0.2
    scores[:, 57] = 0.3
    scores[:, 62] = 0.4
    scores[:, 71] = 0.5
    inputs = np.zeros((4, schema.INPUT_SIZE), dtype=np.float32)
    inputs[:, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK] = np.asarray(
        [0.375, 0.5, 0.375, 0.125], dtype=np.float32)
    legal = np.ones_like(scores, dtype=np.bool_)
    return scores, inputs, legal


def _assert_value_error(call, text: str) -> None:
    try:
        call()
    except ValueError as exc:
        assert text in str(exc), str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_safe_and_unsafe_strengths_apply_after_safe_legs_to_ordinary_magic():
    strength = torch.tensor(
        [[1.0, 0.8], [0.04, 0.03]], dtype=torch.float32)
    conditioned = _policy(strength)
    parent = _policy(None, config=None)
    scores, inputs, legal = _scores_inputs_legal()

    parent_scores = parent.condition_direct_gear(scores, inputs, legal)
    actual = conditioned.condition_direct_gear(scores, inputs, legal)
    expected = parent_scores.copy()
    expected[0, 63] += np.float32(1.0)
    expected[0, 77] += np.float32(0.8)
    expected[1, 63] += np.float32(0.04)
    expected[1, 77] += np.float32(0.03)

    np.testing.assert_array_equal(actual, expected)
    # Ranged and explicit gmaul choices are not ordinary Magic.
    np.testing.assert_array_equal(actual[2:], parent_scores[2:])
    # Existing safe-legs +0.25 is present before the new +1.0 residual.
    assert np.isclose(
        actual[0, 63] - scores[0, 63],
        1.25,
    )


def test_zero_strength_is_bit_exact_and_schema_failures_are_closed():
    scores, inputs, legal = _scores_inputs_legal()
    parent = _policy(None, config=None)
    zero = _policy(torch.zeros((2, 2), dtype=torch.float32))
    np.testing.assert_array_equal(
        zero.condition_direct_gear(scores, inputs, legal),
        parent.condition_direct_gear(scores, inputs, legal),
    )

    wrong = copy.deepcopy(FULL_OFFENCE_CONFIG)
    wrong["max_safe_age_exclusive"] = 0.5001
    _assert_value_error(
        lambda: _policy(torch.zeros((2, 2)), config=wrong),
        "does not match FastSim's version-1 contract",
    )
    _assert_value_error(
        lambda: _policy(None),
        "tensor is missing",
    )
    _assert_value_error(
        lambda: _policy(torch.tensor([[1.21, 0.0], [0.0, 0.0]])),
        "within the declared [2, 2] bounds",
    )
    _assert_value_error(
        lambda: _policy(
            torch.zeros((2, 2)),
            include_safe_legs=False,
        ),
        "requires the existing safe-magic legs conditioner",
    )
    _assert_value_error(
        lambda: _policy(
            torch.zeros((2, 2)),
            config=None,
        ),
        "tensors without matching schema metadata",
    )


def test_v2_uses_exact_cooldown_for_old_safe_ages_and_ready_gate():
    strength = torch.tensor(
        [[8.0, 8.0, 8.0], [0.05, 0.05, 0.05]],
        dtype=torch.float32,
    )
    conditioned = _policy(strength, config=FULL_OFFENCE_V2_CONFIG)
    parent = _policy(None, config=None)
    scores = np.full((3, schema.ACTION_COUNT), -5.0, dtype=np.float32)
    scores[:, schema.COMBAT_SPEC_NONE] = 10.0
    scores[:, schema.COMBAT_ATTACK_BASE] = 9.0
    scores[:, 63] = 0.1
    scores[:, 77] = 0.2
    scores[:, 57] = 0.3
    inputs = np.zeros((3, schema.INPUT_SIZE), dtype=np.float32)
    # Ages four and seven were outside v1's narrow proxy, but are safe while
    # the observed ordinary cooldown is still running. Conversely, a recent
    # age is unsafe once that cooldown has reached zero.
    inputs[:, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK] = np.asarray(
        [4.0 / 8.0, 7.0 / 8.0, 1.0 / 8.0],
        dtype=np.float32,
    )
    cooldown = np.asarray([3, 1, 0], dtype=np.int32)
    legal = np.ones_like(scores, dtype=np.bool_)

    parent_scores = parent.condition_direct_gear(scores, inputs, legal)
    actual = conditioned.condition_direct_gear(
        scores, inputs, legal, cooldown)
    expected = parent_scores.copy()
    expected[:2, 63] += np.float32(8.0)
    expected[:2, 77] += np.float32(8.0)
    expected[:2, 57] -= np.float32(8.0)
    expected[2, 63] += np.float32(0.05)
    expected[2, 77] += np.float32(0.05)
    expected[2, 57] -= np.float32(0.05)

    np.testing.assert_array_equal(actual, expected)
    _assert_value_error(
        lambda: conditioned.condition_direct_gear(scores, inputs, legal),
        "requires the observed opponent ordinary attack cooldown",
    )


def test_v3_changes_shields_only_in_exact_safe_magic_context():
    strength = torch.tensor(
        [
            [7.0, 6.0, 5.0, 12.0, 11.0],
            [0.04, 0.03, 0.02, 0.0, 0.0],
        ],
        dtype=torch.float32,
    )
    conditioned = _policy(strength, config=FULL_OFFENCE_V3_CONFIG)
    parent = _policy(None, config=None)
    scores = np.full((3, schema.ACTION_COUNT), -5.0, dtype=np.float32)
    scores[:, schema.COMBAT_SPEC_NONE] = 10.0
    scores[:, schema.COMBAT_ATTACK_BASE] = 9.0
    scores[:, 63] = 0.1
    scores[:, 77] = 0.2
    scores[:, 57] = 0.3
    scores[:, 62] = 0.4
    scores[:, 71] = 0.5
    inputs = np.zeros((3, schema.INPUT_SIZE), dtype=np.float32)
    cooldown = np.asarray([4, 0, 2], dtype=np.int32)
    legal = np.ones_like(scores, dtype=np.bool_)

    parent_scores = parent.condition_direct_gear(scores, inputs, legal)
    actual = conditioned.condition_direct_gear(
        scores, inputs, legal, cooldown)
    expected = parent_scores.copy()
    expected[[0, 2], 63] += np.float32(7.0)
    expected[[0, 2], 77] += np.float32(6.0)
    expected[[0, 2], 57] -= np.float32(5.0)
    expected[[0, 2], 62] += np.float32(12.0)
    expected[[0, 2], 71] -= np.float32(11.0)
    expected[1, 63] += np.float32(0.04)
    expected[1, 77] += np.float32(0.03)
    expected[1, 57] -= np.float32(0.02)

    np.testing.assert_array_equal(actual, expected)
    np.testing.assert_array_equal(actual[1, [62, 71]], parent_scores[1, [62, 71]])

    invalid = strength.clone()
    invalid[1, 3] = 0.001
    _assert_value_error(
        lambda: _policy(invalid, config=FULL_OFFENCE_V3_CONFIG),
        "within the declared [2, 5] bounds",
    )


class _CaptureAttackPolicy:
    input_size = schema.INPUT_SIZE

    def __init__(self):
        self.cooldowns = []

    @staticmethod
    def score(inputs):
        rows = inputs.shape[0]
        scores = np.zeros((rows, schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_ATTACK_BASE] = 10.0
        scores[:, schema.COMBAT_SPEC_NONE] = 10.0
        scores[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MELEE] = 10.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 10.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 10.0
        return scores, np.zeros(rows, dtype=np.float32)

    def condition_direct_gear(
            self,
            scores,
            inputs,
            legal_mask,
            opponent_ordinary_attack_cooldown_remaining=None):
        self.cooldowns.append(
            np.asarray(
                opponent_ordinary_attack_cooldown_remaining).copy())
        return scores


def test_engine_passes_same_causal_pre_action_cooldown_to_both_policies():
    first = _CaptureAttackPolicy()
    second = _CaptureAttackPolicy()
    runner = engine.Engine(
        2,
        first,
        opponent_policy=second,
        seed=91,
        epsilon=0.0,
        start_distance_min=1,
        start_distance_max=1,
    )
    runner.state.attack_delay[:] = np.asarray([[7, 5], [1, 1]])

    runner.step()

    expected = np.asarray([4, 6, 0, 0], dtype=np.int32)
    np.testing.assert_array_equal(first.cooldowns[0], expected)
    np.testing.assert_array_equal(second.cooldowns[0], expected)
    # The ready second pair attacked after both policies scored. Its newly
    # started timers therefore cannot appear in either captured decision.
    assert bool((runner.state.attack_delay[1] > 0).all())


if __name__ == "__main__":
    test_safe_and_unsafe_strengths_apply_after_safe_legs_to_ordinary_magic()
    test_zero_strength_is_bit_exact_and_schema_failures_are_closed()
    test_v2_uses_exact_cooldown_for_old_safe_ages_and_ready_gate()
    test_v3_changes_shields_only_in_exact_safe_magic_context()
    test_engine_passes_same_causal_pre_action_cooldown_to_both_policies()
    print("magic full-offence conditioner: OK")
