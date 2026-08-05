"""FastSim parity for the frozen-unreachable defence-prayer conditioner."""

from __future__ import annotations

import copy
import sys
import tempfile
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import policy, schema  # noqa: E402
from fastsim.paths import trainer_dir  # noqa: E402

sys.path.insert(0, str(trainer_dir()))

from test_frozen_unreachable_prayer_conditioner import (  # noqa: E402
    conditioned_checkpoint,
)
from train_selfplay_rl import (  # noqa: E402
    add_zero_frozen_unreachable_prayer_conditioner,
    model_from_checkpoint,
)


_V2_CONDITIONER_FIELDS = {
    "activation_contract":
        "frozenOpponentMeleeImpossibleThroughNextEffectiveRoll",
    "self_freeze_ticks_input_index": schema.INPUT_SELF_FREEZE_TICKS,
    "target_rel_dx_input_index": schema.INPUT_TARGET_REL_DX,
    "target_rel_dy_input_index": schema.INPUT_TARGET_REL_DY,
    "relative_position_normalizer": 16.0,
    "max_switchable_melee_standing_range": 2,
    "max_defender_movement_decisions_before_protected_roll": 2,
    "movement_substeps_per_decision": 2,
}


def _set_conditioner_version(checkpoint: dict, version: int) -> None:
    config = checkpoint["schema"]["frozen_unreachable_prayer_conditioner"]
    for key in _V2_CONDITIONER_FIELDS:
        config.pop(key, None)
    config["version"] = int(version)
    if version == 2:
        config.update(_V2_CONDITIONER_FIELDS)


def _score_context(rows: int):
    history_codes = np.zeros(
        (rows, schema.DEFENCE_PRAYER_HISTORY_CODE_COUNT),
        dtype=np.int64,
    )
    prior_history = np.zeros(
        (
            rows,
            schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
            schema.INPUT_SIZE,
        ),
        dtype=np.float32,
    )
    prior_valid = np.zeros(
        (rows, schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS),
        dtype=np.bool_,
    )
    return history_codes, prior_history, prior_valid


def test_fastsim_matches_trainer_and_obeys_every_gate() -> None:
    checkpoint = conditioned_checkpoint()
    base_checkpoint = copy.deepcopy(checkpoint)
    add_zero_frozen_unreachable_prayer_conditioner(checkpoint)
    _set_conditioner_version(checkpoint, 1)
    checkpoint["model_state"][
        "frozen_unreachable_prayer_conditioner.strength"
    ][0] = 2.0

    with tempfile.TemporaryDirectory() as directory:
        checkpoint_path = Path(directory) / "conditioned.pt"
        torch.save(checkpoint, checkpoint_path)
        fast = policy.Policy.load(checkpoint_path, device="cpu")

        reference = model_from_checkpoint(
            checkpoint,
            dropout_override=0.0,
            device=torch.device("cpu"),
        )
        reference.eval()

        raw = np.zeros((6, schema.INPUT_SIZE), dtype=np.float32)
        raw[:, schema.INPUT_OPP_FROZEN] = 1.0
        raw[:, schema.INPUT_OPP_FREEZE_TICKS] = 2.0 / 80.0
        raw[:, schema.INPUT_TARGET_PRESENT] = 1.0
        raw[:, schema.INPUT_OPP_MELEE_REACH] = 0.0
        raw[1, schema.INPUT_OPP_FROZEN] = 0.0
        raw[2, schema.INPUT_OPP_FREEZE_TICKS] = 1.0 / 80.0
        raw[3, schema.INPUT_TARGET_PRESENT] = 0.0
        raw[4, schema.INPUT_OPP_MELEE_REACH] = 1.0

        history_codes = np.zeros(
            (raw.shape[0], schema.DEFENCE_PRAYER_HISTORY_CODE_COUNT),
            dtype=np.int64,
        )
        prior_history = np.zeros(
            (
                raw.shape[0],
                schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
                schema.INPUT_SIZE,
            ),
            dtype=np.float32,
        )
        prior_valid = np.zeros(
            (
                raw.shape[0],
                schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
            ),
            dtype=np.bool_,
        )
        history_context = torch.zeros(
            (
                raw.shape[0],
                schema.DEFENCE_PRAYER_V3_HISTORY_CONTEXT_SIZE,
            ),
            dtype=torch.float32,
        )
        normalized = torch.as_tensor(raw, dtype=torch.float32)
        with torch.no_grad():
            expected = reference.policy_logits(
                normalized,
                defence_prayer_history_context=history_context,
            ).cpu().numpy()
        actual, _value = fast.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior_history,
            prior_state_history_valid=prior_valid,
        )
        np.testing.assert_allclose(actual, expected, rtol=2.0e-5, atol=2.0e-5)

        base_model = model_from_checkpoint(
            base_checkpoint,
            dropout_override=0.0,
            device=torch.device("cpu"),
        )
        base_model.eval()
        with torch.no_grad():
            base = base_model.policy_logits(
                normalized,
                defence_prayer_history_context=history_context,
            )
        prayer_rows = torch.tensor([18, 19, 20])
        inactive = torch.tensor([1, 2, 3, 4])
        assert torch.equal(
            torch.as_tensor(expected).index_select(0, inactive),
            base.index_select(0, inactive),
        )
        active_output = torch.as_tensor(expected).index_select(
            0, torch.tensor([0, 5])
        )
        active_base = base.index_select(0, torch.tensor([0, 5]))
        assert torch.allclose(
            torch.logsumexp(active_output[:, prayer_rows], dim=1),
            torch.logsumexp(active_base[:, prayer_rows], dim=1),
            rtol=0.0,
            atol=1.0e-6,
        )
        assert torch.allclose(
            active_output[:, 18] - active_output[:, 19],
            active_base[:, 18] - active_base[:, 19],
            rtol=0.0,
            atol=1.0e-6,
        )
        assert torch.all(active_output[:, 20] < active_base[:, 20])


def test_cuda_graph_captures_inactive_gate_and_replays_active_gate() -> None:
    if not torch.cuda.is_available():
        return
    checkpoint = conditioned_checkpoint()
    add_zero_frozen_unreachable_prayer_conditioner(checkpoint)
    _set_conditioner_version(checkpoint, 1)
    checkpoint["model_state"][
        "frozen_unreachable_prayer_conditioner.strength"
    ][0] = 2.0

    with tempfile.TemporaryDirectory() as directory:
        checkpoint_path = Path(directory) / "conditioned.pt"
        torch.save(checkpoint, checkpoint_path)
        fast_cuda = policy.Policy.load(checkpoint_path, device="cuda")
        fast_cpu = policy.Policy.load(checkpoint_path, device="cpu")

        raw = np.zeros((2, schema.INPUT_SIZE), dtype=np.float32)
        raw[:, schema.INPUT_TARGET_PRESENT] = 1.0
        history_codes = np.zeros(
            (raw.shape[0], schema.DEFENCE_PRAYER_HISTORY_CODE_COUNT),
            dtype=np.int64,
        )
        prior_history = np.zeros(
            (
                raw.shape[0],
                schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
                schema.INPUT_SIZE,
            ),
            dtype=np.float32,
        )
        prior_valid = np.zeros(
            (
                raw.shape[0],
                schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
            ),
            dtype=np.bool_,
        )

        # The first call captures a graph while every row is inactive. It must
        # not synchronize a device boolean back to the host during capture.
        inactive_cuda, _ = fast_cuda.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior_history,
            prior_state_history_valid=prior_valid,
        )
        inactive_cpu, _ = fast_cpu.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior_history,
            prior_state_history_valid=prior_valid,
        )
        np.testing.assert_allclose(
            inactive_cuda,
            inactive_cpu,
            rtol=2.0e-5,
            atol=2.0e-5,
        )

        # Replay the same captured shape with an active gate. The mask must
        # remain data-dependent inside the graph rather than freezing false.
        raw[:, schema.INPUT_OPP_FROZEN] = 1.0
        raw[:, schema.INPUT_OPP_FREEZE_TICKS] = 2.0 / 80.0
        active_cuda, _ = fast_cuda.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior_history,
            prior_state_history_valid=prior_valid,
        )
        active_cpu, _ = fast_cpu.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior_history,
            prior_state_history_valid=prior_valid,
        )
        np.testing.assert_allclose(
            active_cuda,
            active_cpu,
            rtol=2.0e-5,
            atol=2.0e-5,
        )
        assert np.all(active_cuda[:, 20] < inactive_cuda[:, 20])


def test_v2_uses_freeze_geometry_and_ignores_legacy_melee_reach() -> None:
    checkpoint = conditioned_checkpoint()
    add_zero_frozen_unreachable_prayer_conditioner(checkpoint)
    _set_conditioner_version(checkpoint, 2)
    baseline_checkpoint = copy.deepcopy(checkpoint)
    checkpoint["model_state"][
        "frozen_unreachable_prayer_conditioner.strength"
    ][0] = 2.0

    raw = np.zeros((15, schema.INPUT_SIZE), dtype=np.float32)
    raw[:, schema.INPUT_OPP_FROZEN] = 1.0
    raw[:, schema.INPUT_OPP_FREEZE_TICKS] = 2.0 / 80.0
    raw[:, schema.INPUT_TARGET_PRESENT] = 1.0
    raw[:, schema.INPUT_OPP_MELEE_REACH] = 1.0

    # Same-tile safety requires at least two self-freeze ticks.
    raw[0, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[1, schema.INPUT_SELF_FREEZE_TICKS] = 1.0 / 80.0
    # With two ticks left, the distance threshold is two.
    raw[2:4, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[2, schema.INPUT_TARGET_REL_DX] = 3.0 / 16.0
    raw[3, schema.INPUT_TARGET_REL_DX] = 2.0 / 16.0
    # With one tick left, one movement decision raises the threshold to four.
    raw[4:6, schema.INPUT_SELF_FREEZE_TICKS] = 1.0 / 80.0
    raw[4, schema.INPUT_TARGET_REL_DX] = 5.0 / 16.0
    raw[5, schema.INPUT_TARGET_REL_DX] = 4.0 / 16.0
    # Unfrozen defenders receive two movement decisions: threshold six.
    raw[6, schema.INPUT_TARGET_REL_DY] = 7.0 / 16.0
    raw[7, schema.INPUT_TARGET_REL_DY] = 6.0 / 16.0
    # The movement-decision clamp keeps larger self-freeze values at threshold two.
    raw[8, schema.INPUT_SELF_FREEZE_TICKS] = 3.0 / 80.0
    raw[9, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[9, schema.INPUT_OPP_FROZEN] = 0.0
    raw[10, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[10, schema.INPUT_OPP_FREEZE_TICKS] = 1.0 / 80.0
    raw[11, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[11, schema.INPUT_TARGET_PRESENT] = 0.0
    # Signed relative positions use their absolute rounded tile distance.
    raw[12, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[12, schema.INPUT_TARGET_REL_DX] = -3.0 / 16.0
    # A nonzero coordinate is not the special same-tile case.
    raw[13, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[13, schema.INPUT_TARGET_REL_DY] = 1.0 / 16.0
    # Raw values are rounded before the same-tile freeze check.
    raw[14, schema.INPUT_SELF_FREEZE_TICKS] = 1.6 / 80.0

    history_codes, prior_history, prior_valid = _score_context(raw.shape[0])
    with tempfile.TemporaryDirectory() as directory:
        candidate_path = Path(directory) / "conditioned-v2.pt"
        baseline_path = Path(directory) / "conditioned-v2-zero.pt"
        torch.save(checkpoint, candidate_path)
        torch.save(baseline_checkpoint, baseline_path)
        candidate = policy.Policy.load(candidate_path, device="cpu")
        baseline = policy.Policy.load(baseline_path, device="cpu")
        actual, _ = candidate.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior_history,
            prior_state_history_valid=prior_valid,
        )
        unconditioned, _ = baseline.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior_history,
            prior_state_history_valid=prior_valid,
        )
        reference = model_from_checkpoint(
            checkpoint,
            dropout_override=0.0,
            device=torch.device("cpu"),
        )
        reference.eval()
        history_context = torch.zeros(
            (
                raw.shape[0],
                schema.DEFENCE_PRAYER_V3_HISTORY_CONTEXT_SIZE,
            ),
            dtype=torch.float32,
        )
        with torch.no_grad():
            expected = reference.policy_logits(
                torch.from_numpy(raw),
                defence_prayer_history_context=history_context,
            ).numpy()

    active = np.asarray([0, 2, 4, 6, 8, 12, 14], dtype=np.int64)
    inactive = np.asarray([1, 3, 5, 7, 9, 10, 11, 13], dtype=np.int64)
    np.testing.assert_allclose(actual, expected, rtol=2.0e-5, atol=2.0e-5)
    assert np.all(actual[active, 20] < unconditioned[active, 20])
    np.testing.assert_array_equal(actual[inactive], unconditioned[inactive])


def test_v2_schema_requires_the_exact_activation_contract() -> None:
    checkpoint = conditioned_checkpoint()
    add_zero_frozen_unreachable_prayer_conditioner(checkpoint)
    _set_conditioner_version(checkpoint, 2)
    checkpoint["schema"]["frozen_unreachable_prayer_conditioner"].pop(
        "activation_contract")
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "invalid-v2.pt"
        torch.save(checkpoint, path)
        try:
            policy.Policy.load(path, device="cpu")
        except ValueError as exc:
            assert "version-1 or version-2 contract" in str(exc)
        else:
            raise AssertionError("incomplete v2 conditioner schema was accepted")


if __name__ == "__main__":
    test_fastsim_matches_trainer_and_obeys_every_gate()
    test_cuda_graph_captures_inactive_gate_and_replays_active_gate()
    test_v2_uses_freeze_geometry_and_ignores_legacy_melee_reach()
    test_v2_schema_requires_the_exact_activation_contract()
    print("frozen-unreachable prayer conditioner: OK")
