"""FastSim must execute every detachable head in the current checkpoint."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import policy  # noqa: E402
from fastsim.paths import trainer_dir  # noqa: E402


CHECKPOINT = (
    trainer_dir()
    / "checkpoints"
    / "solana2-dmm-v25-teacher90-adversarial-prayer-normalfocus-tickparity-"
      "randomstart-alpha20-from79-fresh-2w-20260726-g1.pt"
)


def test_teacher90_logits_match_trainer_model() -> None:
    sys.path.insert(0, str(trainer_dir()))
    from train_selfplay_rl import model_from_checkpoint

    checkpoint = torch.load(CHECKPOINT, map_location="cpu", weights_only=False)
    reference = model_from_checkpoint(
        checkpoint, dropout_override=0.0, device=torch.device("cpu"))
    reference.eval()
    fast = policy.Policy.load(CHECKPOINT, device="cpu")

    mean = np.asarray(checkpoint["input_mean"], dtype=np.float32)
    std = np.asarray(checkpoint["input_std"], dtype=np.float32)
    rng = np.random.default_rng(9817)
    raw = mean + std * rng.standard_normal((32, mean.size)).astype(np.float32)

    # Force examples through every conditional branch rather than relying on
    # arbitrary random inputs to happen to hit exact sequence gates.
    raw[0, 106] = 0.75
    raw[1, 111] = 0.125
    raw[1, 106] = 0.50
    raw[1, 112] = 0.0
    raw[1, 33] = 1.0
    raw[1, 12] = 0.0
    raw[1, 31] = 0.125
    raw[1, 32] = 0.0
    raw[1, 71] = 1.0
    raw[2, 111] = 0.0
    raw[2, 106] = 0.50
    raw[2, 112] = 1.0
    raw[2, 113] = 1.0
    raw[2, 55] = np.sin(22613 * 0.013)
    raw[2, 56] = np.cos(22613 * 0.013)

    normalized = torch.as_tensor((raw - mean) / np.where(std > 1e-8, std, 1.0))
    with torch.no_grad():
        expected = reference.policy_logits(normalized).cpu().numpy()
    actual, _value = fast.score(raw)

    np.testing.assert_allclose(actual, expected, rtol=2e-5, atol=2e-5)


def test_score_execution_path_is_bit_exact() -> None:
    checkpoint = torch.load(CHECKPOINT, map_location="cpu", weights_only=False)
    mean = np.asarray(checkpoint["input_mean"], dtype=np.float32)
    std = np.asarray(checkpoint["input_std"], dtype=np.float32)
    rng = np.random.default_rng(7159)
    raw = mean + std * rng.standard_normal((32, mean.size)).astype(np.float32)

    # Include exact gates used by the VLS adapters as well as random rows.
    raw[0, 106] = 0.75
    raw[1, 111] = 0.125
    raw[1, 106] = 0.50
    raw[1, 112] = 0.0
    raw[1, 33] = 1.0
    raw[2, 111] = 0.0
    raw[2, 106] = 0.50
    raw[2, 112] = 1.0
    raw[2, 113] = 1.0
    raw[2, 55] = np.sin(22613 * 0.013)
    raw[2, 56] = np.cos(22613 * 0.013)

    devices = ["cpu"]
    if torch.cuda.is_available():
        devices.append("cuda")
    for device in devices:
        fast = policy.Policy.load(CHECKPOINT, device=device)
        tensor = torch.as_tensor(raw, device=fast.device, dtype=fast.dtype)
        with torch.no_grad():
            expected_scores, expected_value = fast._score_tensors(tensor)
        expected_scores = expected_scores.float().cpu()
        expected_value = expected_value.float().cpu()

        # The second CUDA call is a graph replay; both capture and replay must
        # remain exactly equal to the ordinary operation-by-operation path.
        for _ in range(2):
            actual_scores, actual_value = fast.score(raw)
            assert torch.equal(
                torch.from_numpy(actual_scores), expected_scores)
            assert torch.equal(
                torch.from_numpy(actual_value), expected_value)


if __name__ == "__main__":
    test_teacher90_logits_match_trainer_model()
    test_score_execution_path_is_bit_exact()
    print("policy checkpoint heads: OK")
