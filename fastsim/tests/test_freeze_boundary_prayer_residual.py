"""FastSim parity for the learned freeze-boundary prayer residual."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import policy, schema  # noqa: E402
from fastsim.paths import trainer_dir  # noqa: E402

sys.path.insert(0, str(trainer_dir()))

from test_freeze_boundary_prayer_residual import (  # noqa: E402
    boundary_checkpoint,
)
from train_selfplay_rl import model_from_checkpoint  # noqa: E402


def _inputs() -> tuple[
        np.ndarray,
        np.ndarray,
        np.ndarray,
        np.ndarray,
        torch.Tensor,
]:
    rows = 6
    raw = np.zeros((rows, schema.INPUT_SIZE), dtype=np.float32)
    raw[:, schema.INPUT_TARGET_PRESENT] = 1.0
    raw[0, schema.INPUT_OPP_FROZEN] = 1.0
    raw[0, schema.INPUT_OPP_FREEZE_TICKS] = 1.0 / 80.0
    raw[0, schema.INPUT_OPP_MELEE_REACH] = 0.0
    raw[1, schema.INPUT_OPP_FROZEN] = 1.0
    raw[1, schema.INPUT_OPP_FREEZE_TICKS] = 1.0 / 80.0
    raw[1, schema.INPUT_OPP_MELEE_REACH] = 1.0
    raw[2:5, schema.INPUT_OPP_MELEE_REACH] = 1.0
    raw[5, schema.INPUT_OPP_MELEE_REACH] = 0.0

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
    prior[2, 0, schema.INPUT_OPP_FROZEN] = 1.0
    prior[2, 0, schema.INPUT_OPP_MELEE_REACH] = 0.0
    valid[2, 0] = True
    prior[3, 2, schema.INPUT_OPP_FROZEN] = 1.0
    prior[3, 2, schema.INPUT_OPP_MELEE_REACH] = 0.0
    valid[3, :3] = True
    prior[4, 3, schema.INPUT_OPP_FROZEN] = 1.0
    prior[4, 3, schema.INPUT_OPP_MELEE_REACH] = 0.0
    valid[4, :4] = True
    prior[5, 0, schema.INPUT_OPP_FROZEN] = 1.0
    prior[5, 0, schema.INPUT_OPP_MELEE_REACH] = 0.0
    valid[5, 0] = True

    history_context = torch.zeros(
        (rows, schema.DEFENCE_PRAYER_V3_HISTORY_CONTEXT_SIZE),
        dtype=torch.float32,
    )
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


def test_fastsim_matches_trainer_and_gate_contract() -> None:
    checkpoint = boundary_checkpoint()
    reference_checkpoint = {
        **checkpoint,
        "model_state": {
            key: value.clone()
            for key, value in checkpoint["model_state"].items()
        },
    }
    checkpoint["model_state"][
        "freeze_boundary_prayer_residual.weight"
    ].normal_(mean=0.0, std=0.15)
    checkpoint["model_state"][
        "freeze_boundary_prayer_residual.bias"
    ] = torch.tensor([0.5, -0.25, 0.1], dtype=torch.float32)
    raw, history_codes, prior, valid, history_context = _inputs()

    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "boundary.pt"
        reference_path = Path(directory) / "boundary-zero.pt"
        torch.save(checkpoint, path)
        torch.save(reference_checkpoint, reference_path)
        fast = policy.Policy.load(path, device="cpu")
        fast_reference = policy.Policy.load(reference_path, device="cpu")
        reference = model_from_checkpoint(
            checkpoint,
            dropout_override=0.0,
            device=torch.device("cpu"),
        )
        reference.eval()
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
        fast_base, _ = fast_reference.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior,
            prior_state_history_valid=valid,
        )
    np.testing.assert_allclose(actual, expected, rtol=2.0e-5, atol=2.0e-5)

    # Lag 3, unreachable current, and no boundary are exact inactive rows.
    for row in (4, 5):
        np.testing.assert_array_equal(
            actual[row:row + 1],
            fast_base[row:row + 1],
        )


def test_cuda_graph_replays_rem1_and_post_thaw_gates() -> None:
    if not torch.cuda.is_available():
        return
    checkpoint = boundary_checkpoint()
    checkpoint["model_state"][
        "freeze_boundary_prayer_residual.bias"
    ] = torch.tensor([0.9, -0.5, 0.2], dtype=torch.float32)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "boundary.pt"
        torch.save(checkpoint, path)
        cuda_policy = policy.Policy.load(path, device="cuda")
        cpu_policy = policy.Policy.load(path, device="cpu")

        raw = np.zeros((2, schema.INPUT_SIZE), dtype=np.float32)
        raw[:, schema.INPUT_TARGET_PRESENT] = 1.0
        history_codes = np.zeros(
            (2, schema.DEFENCE_PRAYER_HISTORY_CODE_COUNT),
            dtype=np.int64,
        )
        prior = np.zeros(
            (
                2,
                schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
                schema.INPUT_SIZE,
            ),
            dtype=np.float32,
        )
        valid = np.zeros(
            (2, schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS),
            dtype=np.bool_,
        )

        # Capture with both gates inactive.
        cuda_policy.score(
            raw,
            prayer_history_codes=history_codes,
            prior_state_history=prior,
            prior_state_history_valid=valid,
        )

        raw[0, schema.INPUT_OPP_FROZEN] = 1.0
        raw[0, schema.INPUT_OPP_FREEZE_TICKS] = 1.0 / 80.0
        raw[1, schema.INPUT_OPP_MELEE_REACH] = 1.0
        prior[1, 0, schema.INPUT_OPP_FROZEN] = 1.0
        prior[1, 0, schema.INPUT_OPP_MELEE_REACH] = 0.0
        valid[1, 0] = True
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


if __name__ == "__main__":
    test_fastsim_matches_trainer_and_gate_contract()
    test_cuda_graph_replays_rem1_and_post_thaw_gates()
    print("freeze-boundary prayer residual: OK")
