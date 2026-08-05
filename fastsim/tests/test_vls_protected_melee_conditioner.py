"""FastSim parity for the isolated VLS-through-Protect-Melee conditioner."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim.policy import Policy  # noqa: E402
from fastsim.paths import trainer_dir  # noqa: E402


SOURCE = (
    trainer_dir()
    / "runs"
    / "solana2-dmm-v26-teacher106-offprayer-safelegs-vls-from105-20260728"
    / "teacher106c-vls-protected-melee-conditioner-from105.pt"
)


def _without_prayer_head(checkpoint: dict) -> dict:
    result = copy.deepcopy(checkpoint)
    result["schema"].pop("defence_prayer_head", None)
    for key in tuple(result["model_state"]):
        if key.startswith("defence_prayer_head."):
            del result["model_state"][key]
    return result


def _without_conditioner(checkpoint: dict) -> dict:
    result = copy.deepcopy(checkpoint)
    result["schema"].pop("vls_protected_melee_conditioner", None)
    result["model_state"].pop(
        "vls_protected_melee_conditioner.strength", None)
    return result


def _with_version_two_conditioner(checkpoint: dict) -> dict:
    result = copy.deepcopy(checkpoint)
    conditioner = result["schema"]["vls_protected_melee_conditioner"]
    conditioner["version"] = 2
    conditioner["ko_hp_max"] = 0.0
    conditioner["full_strength_hp_min"] = 0.01
    return result


def _policy(checkpoint: dict) -> Policy:
    return Policy(
        checkpoint["model_state"],
        checkpoint["input_mean"],
        checkpoint["input_std"],
        torch.device("cpu"),
        torch.float32,
        checkpoint["schema"]["action_ids"],
        checkpoint["schema"],
    )


def _inputs(checkpoint: dict) -> np.ndarray:
    mean = np.asarray(checkpoint["input_mean"], dtype=np.float32)
    std = np.asarray(checkpoint["input_std"], dtype=np.float32)
    rng = np.random.default_rng(16429)
    raw = mean + std * rng.standard_normal((6, mean.size)).astype(np.float32)

    # Inactive because Protect from Melee is down.
    raw[0, 2] = 0.80
    raw[0, 54] = 0.0
    raw[0, 106] = 0.75
    # Inactive because the opponent is already in the explicit KO range.
    raw[1, 2] = 0.39
    raw[1, 54] = 1.0
    raw[1, 106] = 0.75
    # Head context: both specs legal and the opponent is safely above KO HP.
    raw[2, 2] = 0.70
    raw[2, 54] = 1.0
    raw[2, 106] = 0.75
    # Followthrough context after the setup VLS equip.
    raw[3, 2] = 0.70
    raw[3, 54] = 1.0
    raw[3, 111] = 0.0
    raw[3, 106] = 0.25
    raw[3, 112] = 1.0
    raw[3, 113] = 1.0
    raw[3, 55] = np.sin(22613 * 0.013)
    raw[3, 56] = np.cos(22613 * 0.013)
    # Partial-strength head context.
    raw[4, 2] = 0.475
    raw[4, 54] = 1.0
    raw[4, 106] = 0.75
    # Common context true, but neither VLS eligibility mask is active.
    raw[5, 2] = 0.70
    raw[5, 54] = 1.0
    raw[5, 106] = 0.10
    raw[5, 111] = 0.25
    raw[5, 112] = 0.0
    raw[5, 113] = 0.0
    return raw


def test_fast_matches_trainer_and_inactive_rows_are_bit_exact() -> None:
    sys.path.insert(0, str(trainer_dir()))
    from train_selfplay_rl import model_from_checkpoint

    conditioned = _without_prayer_head(
        torch.load(SOURCE, map_location="cpu", weights_only=False))
    baseline = _without_conditioner(conditioned)
    raw = _inputs(conditioned)

    fast = _policy(conditioned)
    fast_base = _policy(baseline)
    actual, _value = fast.score(raw)
    base, _base_value = fast_base.score(raw)

    # Every conditioner-inactive row is an exact bypass, not an approximation.
    assert torch.equal(torch.from_numpy(actual[[0, 1, 5]]),
                       torch.from_numpy(base[[0, 1, 5]]))

    reference = model_from_checkpoint(
        conditioned, dropout_override=0.0, device=torch.device("cpu"))
    reference.eval()
    raw_t = torch.as_tensor(raw, dtype=torch.float32)
    mean_t = torch.as_tensor(
        conditioned["input_mean"], dtype=torch.float32)
    std_t = torch.as_tensor(
        conditioned["input_std"], dtype=torch.float32).clamp_min(1.0e-4)
    with torch.no_grad():
        expected = reference.policy_logits((raw_t - mean_t) / std_t)
    assert torch.equal(torch.from_numpy(actual), expected)

    # The conditioner changes preference inside each VLS group while retaining
    # that group's original total log-mass.
    head_rows = torch.tensor([14, 16])
    follow_rows = torch.tensor([7, 16, 17])
    actual_t = torch.from_numpy(actual)
    base_t = torch.from_numpy(base)
    torch.testing.assert_close(
        torch.logsumexp(actual_t[2, head_rows], dim=0),
        torch.logsumexp(base_t[2, head_rows], dim=0),
        rtol=1.0e-6,
        atol=1.0e-6,
    )
    torch.testing.assert_close(
        torch.logsumexp(actual_t[3, follow_rows], dim=0),
        torch.logsumexp(base_t[3, follow_rows], dim=0),
        rtol=1.0e-6,
        atol=1.0e-6,
    )
    assert actual[2, 16] < base[2, 16]
    assert actual[3, 16] < base[3, 16]
    assert actual[3, 17] < base[3, 17]


def test_zero_strength_is_exact_identity_and_schema_is_fail_closed() -> None:
    conditioned = _without_prayer_head(
        torch.load(SOURCE, map_location="cpu", weights_only=False))
    baseline = _without_conditioner(conditioned)
    zero = copy.deepcopy(conditioned)
    zero["model_state"]["vls_protected_melee_conditioner.strength"] = (
        torch.zeros(2, dtype=torch.float32))
    raw = _inputs(conditioned)
    zero_scores, _ = _policy(zero).score(raw)
    base_scores, _ = _policy(baseline).score(raw)
    assert torch.equal(
        torch.from_numpy(zero_scores), torch.from_numpy(base_scores))

    missing = copy.deepcopy(conditioned)
    del missing["model_state"]["vls_protected_melee_conditioner.strength"]
    try:
        _policy(missing)
    except ValueError as exc:
        assert "tensor is missing" in str(exc)
    else:
        raise AssertionError("missing declared conditioner tensor was accepted")

    undeclared = copy.deepcopy(conditioned)
    undeclared["schema"].pop("vls_protected_melee_conditioner")
    try:
        _policy(undeclared)
    except ValueError as exc:
        assert "without matching schema metadata" in str(exc)
    else:
        raise AssertionError("undeclared conditioner tensor was ignored")


def test_version_two_applies_at_low_hp_and_matches_trainer() -> None:
    sys.path.insert(0, str(trainer_dir()))
    from train_selfplay_rl import model_from_checkpoint

    version_one = _without_prayer_head(
        torch.load(SOURCE, map_location="cpu", weights_only=False))
    version_two = _with_version_two_conditioner(version_one)
    baseline = _without_conditioner(version_two)
    raw = _inputs(version_two)
    raw[1, 2] = 0.005

    v1_scores, _ = _policy(version_one).score(raw)
    v2_scores, _ = _policy(version_two).score(raw)
    base_scores, _ = _policy(baseline).score(raw)

    # Version 1 deliberately bypasses low-HP targets; version 2 applies half
    # strength at 0.5% HP and reaches full strength at 1% HP.
    assert torch.equal(
        torch.from_numpy(v1_scores[1]),
        torch.from_numpy(base_scores[1]),
    )
    assert not torch.equal(
        torch.from_numpy(v2_scores[1]),
        torch.from_numpy(base_scores[1]),
    )

    reference = model_from_checkpoint(
        version_two, dropout_override=0.0, device=torch.device("cpu"))
    reference.eval()
    raw_t = torch.as_tensor(raw, dtype=torch.float32)
    mean_t = torch.as_tensor(
        version_two["input_mean"], dtype=torch.float32)
    std_t = torch.as_tensor(
        version_two["input_std"], dtype=torch.float32).clamp_min(1.0e-4)
    with torch.no_grad():
        expected = reference.policy_logits((raw_t - mean_t) / std_t)
    assert torch.equal(torch.from_numpy(v2_scores), expected)


if __name__ == "__main__":
    test_fast_matches_trainer_and_inactive_rows_are_bit_exact()
    test_zero_strength_is_exact_identity_and_schema_is_fail_closed()
    test_version_two_applies_at_low_hp_and_matches_trainer()
    print("VLS protected-melee conditioner: OK")
