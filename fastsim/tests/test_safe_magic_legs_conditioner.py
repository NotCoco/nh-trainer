"""FastSim parity for the one-scalar safe ordinary-Magic legs conditioner."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import policy, schema  # noqa: E402


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
    "action_id": int(schema.CURRENT_ACTION_IDS[63]),
    "action_row": 63,
    "preserve_group_logmass": False,
    "projection": "nonnegative_clamp",
}


def _state(
        *,
        strength: float | None,
        direct_weight: torch.Tensor | None = None,
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
        "direct_gear_conditioner.weight": (
            torch.zeros((6, 8), dtype=torch.float32)
            if direct_weight is None else direct_weight.clone()
        ),
    }
    if strength is not None:
        state["safe_magic_legs_conditioner.strength"] = torch.tensor(
            [strength], dtype=torch.float32)
    return state


def _policy(
        *,
        strength: float | None,
        safe_config: dict | None = SAFE_LEGS_CONFIG,
        direct_config: dict | None = DIRECT_GEAR_CONFIG,
        direct_weight: torch.Tensor | None = None,
) -> policy.Policy:
    checkpoint_schema = {}
    if direct_config is not None:
        checkpoint_schema["direct_gear_conditioning"] = copy.deepcopy(
            direct_config)
    if safe_config is not None:
        checkpoint_schema["safe_magic_legs_conditioner"] = copy.deepcopy(
            safe_config)
    state = _state(
        strength=strength,
        direct_weight=direct_weight,
    )
    if direct_config is None:
        del state["direct_gear_conditioner.weight"]
    return policy.Policy(
        state,
        np.zeros(schema.INPUT_SIZE, dtype=np.float32),
        np.ones(schema.INPUT_SIZE, dtype=np.float32),
        torch.device("cpu"),
        torch.float32,
        schema.CURRENT_ACTION_IDS,
        checkpoint_schema,
    )


def _scores_and_inputs() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    scores = np.zeros((5, schema.ACTION_COUNT), dtype=np.float32)
    scores[:, :schema.COMBAT_SPEC_NONE] = -5.0
    scores[:, schema.COMBAT_SPEC_NONE:] = -5.0
    scores[:, schema.COMBAT_SPEC_NONE] = 10.0
    # Safe Magic, threshold-edge Magic, Ranged, Melee, safe Magic.
    scores[[0, 1, 4], 1] = 9.0
    scores[2, 3] = 9.0
    scores[3, 5] = 9.0
    scores[:, 63] = np.asarray(
        [0.15, 0.20, 0.25, 0.30, -0.10], dtype=np.float32)
    scores[:, 70] = 0.10
    scores[:, 82] = -0.20
    inputs = np.zeros((5, schema.INPUT_SIZE), dtype=np.float32)
    inputs[:, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK] = np.asarray(
        [0.375, 0.5, 0.375, 0.125, 0.0], dtype=np.float32)
    legal = np.ones_like(scores, dtype=np.bool_)
    return scores, inputs, legal


def _assert_raises_value_error(call, expected: str) -> None:
    try:
        call()
    except ValueError as exc:
        assert expected in str(exc), str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_only_recent_ordinary_magic_receives_the_scalar_boost() -> None:
    direct_weight = torch.zeros((6, 8), dtype=torch.float32)
    direct_weight[3, 1] = 0.25
    parent = _policy(
        strength=None,
        safe_config=None,
        direct_weight=direct_weight,
    )
    conditioned = _policy(
        strength=1.5,
        direct_weight=direct_weight,
    )
    scores, inputs, legal = _scores_and_inputs()

    parent_scores = parent.condition_direct_gear(scores, inputs, legal)
    actual = conditioned.condition_direct_gear(scores, inputs, legal)
    expected = parent_scores.copy()
    expected[[0, 4], 63] += np.float32(1.5)

    np.testing.assert_array_equal(actual, expected)
    np.testing.assert_array_equal(actual[1], parent_scores[1])
    np.testing.assert_array_equal(actual[2], parent_scores[2])
    np.testing.assert_array_equal(actual[3], parent_scores[3])
    non_target_rows = [row for row in range(schema.ACTION_COUNT) if row != 63]
    np.testing.assert_array_equal(
        actual[:, non_target_rows],
        parent_scores[:, non_target_rows],
    )


def test_zero_strength_and_all_bypass_contexts_are_bit_exact() -> None:
    parent = _policy(strength=None, safe_config=None)
    zero = _policy(strength=0.0)
    scores, inputs, legal = _scores_and_inputs()

    parent_scores = parent.condition_direct_gear(scores, inputs, legal)
    zero_scores = zero.condition_direct_gear(scores, inputs, legal)

    np.testing.assert_array_equal(zero_scores, parent_scores)


def test_schema_and_tensor_fail_closed() -> None:
    wrong = copy.deepcopy(SAFE_LEGS_CONFIG)
    wrong["max_age_exclusive"] = 0.5001
    _assert_raises_value_error(
        lambda: _policy(strength=0.0, safe_config=wrong),
        "does not match FastSim's version-1 contract",
    )
    _assert_raises_value_error(
        lambda: _policy(strength=None),
        "tensor is missing",
    )
    _assert_raises_value_error(
        lambda: _policy(strength=-0.01),
        "finite non-negative tensor",
    )
    _assert_raises_value_error(
        lambda: _policy(
            strength=0.0,
            direct_config=None,
        ),
        "requires existing direct-gear conditioning",
    )


if __name__ == "__main__":
    test_only_recent_ordinary_magic_receives_the_scalar_boost()
    test_zero_strength_and_all_bypass_contexts_are_bit_exact()
    test_schema_and_tensor_fail_closed()
    print("safe magic legs conditioner: OK")
