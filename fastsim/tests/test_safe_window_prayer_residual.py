"""FastSim parity for the learned safe-window defence-group lift."""

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

from test_safe_window_prayer_residual import safe_checkpoint  # noqa: E402
from train_selfplay_rl import model_from_checkpoint  # noqa: E402


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


def _set_prayer_activation_version(checkpoint: dict, version: int) -> None:
    conditioner = checkpoint["schema"][
        "frozen_unreachable_prayer_conditioner"]
    for key in _V2_CONDITIONER_FIELDS:
        conditioner.pop(key, None)
    conditioner["version"] = int(version)
    residual = checkpoint["schema"]["safe_window_prayer_residual"]
    residual.pop("activation_source", None)
    residual["version"] = int(version)
    if version == 2:
        conditioner.update(_V2_CONDITIONER_FIELDS)
        residual["activation_source"] = (
            "frozen_unreachable_prayer_conditioner.v2")


def _inputs(rows: int = 5):
    raw = np.zeros((rows, schema.INPUT_SIZE), dtype=np.float32)
    raw[:, schema.INPUT_TARGET_PRESENT] = 1.0
    raw[:, schema.INPUT_OPP_FROZEN] = 1.0
    raw[:, schema.INPUT_OPP_FREEZE_TICKS] = 3.0 / 80.0
    if rows > 1:
        raw[1, schema.INPUT_OPP_FREEZE_TICKS] = 1.0 / 80.0
    if rows > 2:
        raw[2, schema.INPUT_OPP_MELEE_REACH] = 1.0
    if rows > 3:
        raw[3, schema.INPUT_TARGET_PRESENT] = 0.0
    history_codes = np.zeros(
        (rows, schema.DEFENCE_PRAYER_HISTORY_CODE_COUNT),
        dtype=np.int64,
    )
    prior = np.zeros(
        (
            rows,
            schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
            schema.INPUT_SIZE,
        ),
        dtype=np.float32,
    )
    valid = np.zeros(
        (rows, schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS),
        dtype=np.bool_,
    )
    history_context = torch.zeros(
        (rows, schema.DEFENCE_PRAYER_V3_HISTORY_CONTEXT_SIZE),
        dtype=torch.float32,
    )
    if rows > 4:
        raw[4, schema.INPUT_OPP_FROZEN] = 0.0
        raw[4, schema.INPUT_OPP_FREEZE_TICKS] = 0.0
        raw[4, schema.INPUT_OPP_MELEE_REACH] = 1.0
        valid[4, :] = True
        prior[4, :, schema.INPUT_OPP_MELEE_REACH] = 1.0
        prior[4, 15, schema.INPUT_OPP_FROZEN] = 1.0
        prior[4, 15, schema.INPUT_OPP_MELEE_REACH] = 0.0
    offset = schema.DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE
    for row in range(rows):
        for lag in range(schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS):
            base = offset + lag * schema.DEFENCE_PRAYER_PRIOR_STATE_STRIDE
            if valid[row, lag]:
                history_context[
                    row, base:base + schema.INPUT_SIZE
                ] = torch.from_numpy(prior[row, lag])
                history_context[row, base + schema.INPUT_SIZE] = 1.0
    return raw, history_codes, prior, valid, history_context


def test_fastsim_matches_trainer_and_preserves_ratio() -> None:
    checkpoint = safe_checkpoint()
    _set_prayer_activation_version(checkpoint, 1)
    baseline_checkpoint = {
        **checkpoint,
        "model_state": {
            key: value.clone()
            for key, value in checkpoint["model_state"].items()
        },
    }
    checkpoint["model_state"][
        "safe_window_prayer_residual.weight"
    ].normal_(mean=0.0, std=0.15)
    checkpoint["model_state"][
        "safe_window_prayer_residual.bias"
    ][0] = 1.25
    checkpoint["model_state"][
        "freeze_boundary_prayer_residual.bias"
    ] = torch.tensor([0.4, -0.2, 0.1], dtype=torch.float32)
    raw, history_codes, prior, valid, history_context = _inputs()
    with tempfile.TemporaryDirectory() as directory:
        candidate_path = Path(directory) / "safe.pt"
        baseline_path = Path(directory) / "safe-zero.pt"
        torch.save(checkpoint, candidate_path)
        torch.save(baseline_checkpoint, baseline_path)
        fast = policy.Policy.load(candidate_path, device="cpu")
        fast_baseline = policy.Policy.load(baseline_path, device="cpu")
        reference = model_from_checkpoint(
            checkpoint,
            dropout_override=0.0,
            device=torch.device("cpu"),
        )
        with torch.no_grad():
            expected = reference.policy_logits(
                torch.from_numpy(raw),
                defence_prayer_history_context=history_context,
            ).numpy()
        actual, _ = fast.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior,
            prior_state_history_valid=valid,
        )
        baseline, _ = fast_baseline.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior,
            prior_state_history_valid=valid,
        )
    np.testing.assert_allclose(actual, expected, rtol=2.0e-5, atol=2.0e-5)
    np.testing.assert_array_equal(actual[2:4], baseline[2:4])
    assert not np.array_equal(actual[1], baseline[1])
    assert not np.array_equal(actual[4], baseline[4])
    defence_rows = np.asarray([18, 19, 20, 21, 22], dtype=np.int64)
    np.testing.assert_allclose(
        actual[:1, 18] - actual[:1, 19],
        baseline[:1, 18] - baseline[:1, 19],
        rtol=0.0,
        atol=2.0e-5,
    )
    np.testing.assert_allclose(
        torch.logsumexp(torch.from_numpy(actual[:1, defence_rows]), dim=1),
        torch.logsumexp(torch.from_numpy(baseline[:1, defence_rows]), dim=1),
        rtol=0.0,
        atol=2.0e-5,
    )


def test_cuda_graph_replays_safe_gate() -> None:
    if not torch.cuda.is_available():
        return
    checkpoint = safe_checkpoint()
    _set_prayer_activation_version(checkpoint, 1)
    checkpoint["model_state"][
        "safe_window_prayer_residual.bias"
    ][0] = 1.5
    raw, history_codes, prior, valid, _ = _inputs(rows=2)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "safe.pt"
        torch.save(checkpoint, path)
        cuda_policy = policy.Policy.load(path, device="cuda")
        cpu_policy = policy.Policy.load(path, device="cpu")
        inactive = raw.copy()
        inactive[:, schema.INPUT_OPP_FREEZE_TICKS] = 1.0 / 80.0
        cuda_policy.score(
            inactive,
            prayer_history_codes=history_codes,
            prior_state_history=prior,
            prior_state_history_valid=valid,
        )
        cuda_scores, _ = cuda_policy.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior,
            prior_state_history_valid=valid,
        )
        cpu_scores, _ = cpu_policy.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior,
            prior_state_history_valid=valid,
        )
    np.testing.assert_allclose(
        cuda_scores,
        cpu_scores,
        rtol=2.0e-5,
        atol=2.0e-5,
    )


def test_v2_uses_the_conditioner_geometry_predicate() -> None:
    checkpoint = safe_checkpoint()
    _set_prayer_activation_version(checkpoint, 2)
    baseline_checkpoint = copy.deepcopy(checkpoint)
    checkpoint["model_state"][
        "safe_window_prayer_residual.bias"
    ][0] = 1.5

    raw = np.zeros((14, schema.INPUT_SIZE), dtype=np.float32)
    raw[:, schema.INPUT_OPP_FROZEN] = 1.0
    raw[:, schema.INPUT_OPP_FREEZE_TICKS] = 2.0 / 80.0
    raw[:, schema.INPUT_TARGET_PRESENT] = 1.0
    # The legacy reach bit deliberately disagrees with every active v2 row.
    raw[:, schema.INPUT_OPP_MELEE_REACH] = 1.0
    raw[0, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[1, schema.INPUT_SELF_FREEZE_TICKS] = 1.0 / 80.0
    raw[2:4, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[2, schema.INPUT_TARGET_REL_DX] = 3.0 / 16.0
    raw[3, schema.INPUT_TARGET_REL_DX] = 2.0 / 16.0
    raw[4:6, schema.INPUT_SELF_FREEZE_TICKS] = 1.0 / 80.0
    raw[4, schema.INPUT_TARGET_REL_DX] = 5.0 / 16.0
    raw[5, schema.INPUT_TARGET_REL_DX] = 4.0 / 16.0
    raw[6, schema.INPUT_TARGET_REL_DY] = 7.0 / 16.0
    raw[7, schema.INPUT_TARGET_REL_DY] = 6.0 / 16.0
    raw[8, schema.INPUT_SELF_FREEZE_TICKS] = 3.0 / 80.0
    raw[9, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[9, schema.INPUT_OPP_FROZEN] = 0.0
    raw[10, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[10, schema.INPUT_OPP_FREEZE_TICKS] = 1.0 / 80.0
    raw[11, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[11, schema.INPUT_TARGET_PRESENT] = 0.0
    raw[12, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[12, schema.INPUT_TARGET_REL_DX] = -3.0 / 16.0
    raw[13, schema.INPUT_SELF_FREEZE_TICKS] = 2.0 / 80.0
    raw[13, schema.INPUT_TARGET_REL_DY] = 1.0 / 16.0

    history_codes = np.zeros(
        (raw.shape[0], schema.DEFENCE_PRAYER_HISTORY_CODE_COUNT),
        dtype=np.int64,
    )
    prior = np.zeros(
        (
            raw.shape[0],
            schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
            schema.INPUT_SIZE,
        ),
        dtype=np.float32,
    )
    valid = np.zeros(
        (raw.shape[0], schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS),
        dtype=np.bool_,
    )
    with tempfile.TemporaryDirectory() as directory:
        candidate_path = Path(directory) / "safe-v2.pt"
        baseline_path = Path(directory) / "safe-v2-zero.pt"
        torch.save(checkpoint, candidate_path)
        torch.save(baseline_checkpoint, baseline_path)
        candidate = policy.Policy.load(candidate_path, device="cpu")
        baseline = policy.Policy.load(baseline_path, device="cpu")
        actual, _ = candidate.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior,
            prior_state_history_valid=valid,
        )
        unshifted, _ = baseline.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior,
            prior_state_history_valid=valid,
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

    active = np.asarray([0, 2, 4, 6, 8, 12], dtype=np.int64)
    inactive = np.asarray([1, 3, 5, 7, 9, 10, 11, 13], dtype=np.int64)
    np.testing.assert_allclose(actual, expected, rtol=2.0e-5, atol=2.0e-5)
    assert np.all(actual[active, 18] > unshifted[active, 18])
    np.testing.assert_array_equal(actual[inactive], unshifted[inactive])
    np.testing.assert_allclose(
        actual[active, 18] - actual[active, 19],
        unshifted[active, 18] - unshifted[active, 19],
        rtol=0.0,
        atol=2.0e-5,
    )


def test_v2_requires_exact_activation_source_and_matching_version() -> None:
    checkpoint = safe_checkpoint()
    _set_prayer_activation_version(checkpoint, 2)
    checkpoint["schema"]["safe_window_prayer_residual"][
        "activation_source"
    ] = "legacy"
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "invalid-safe-v2.pt"
        torch.save(checkpoint, path)
        try:
            policy.Policy.load(path, device="cpu")
        except ValueError as exc:
            assert "version-1 or version-2 contract" in str(exc)
        else:
            raise AssertionError("invalid v2 activation source was accepted")
    checkpoint = safe_checkpoint()
    _set_prayer_activation_version(checkpoint, 2)
    conditioner = checkpoint["schema"][
        "frozen_unreachable_prayer_conditioner"]
    for key in _V2_CONDITIONER_FIELDS:
        conditioner.pop(key)
    conditioner["version"] = 1
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "mixed-version-safe-v2.pt"
        torch.save(checkpoint, path)
        try:
            policy.Policy.load(path, device="cpu")
        except ValueError as exc:
            assert "version-1 or version-2 contract" in str(exc)
        else:
            raise AssertionError("mixed prayer activation versions were accepted")


if __name__ == "__main__":
    test_fastsim_matches_trainer_and_preserves_ratio()
    test_cuda_graph_replays_safe_gate()
    test_v2_uses_the_conditioner_geometry_predicate()
    test_v2_requires_exact_activation_source_and_matching_version()
    print("safe-window prayer residual: OK")
