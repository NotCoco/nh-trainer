"""FastSim parity for the detachable offensive-prayer style conditioner."""

from __future__ import annotations

import copy
import sys
import tempfile
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import policy, schema  # noqa: E402


CONFIG = {
    "kind": "dmm-offensive-prayer-style-residual",
    "version": 1,
    "input_indices": [52, 53, 54],
    "attack_action_rows": [1, 3, 5],
    "off_tick_action_rows": [2, 4, 6],
    "preserve_group_logmass": True,
}


def _state(
        weight: torch.Tensor | None = None,
        bias: torch.Tensor | None = None,
        include_conditioner: bool = True,
) -> dict[str, torch.Tensor]:
    encoded = 4
    base_bias = torch.linspace(
        -3.0, 4.0, schema.ACTION_COUNT, dtype=torch.float32)
    state = {
        "encoder.0.weight": torch.zeros(
            encoded, schema.INPUT_SIZE, dtype=torch.float32),
        "encoder.0.bias": torch.zeros(encoded, dtype=torch.float32),
        "policy.weight": torch.zeros(
            schema.ACTION_COUNT, encoded, dtype=torch.float32),
        "policy.bias": base_bias,
        "value.weight": torch.zeros(1, encoded, dtype=torch.float32),
        "value.bias": torch.tensor([0.75], dtype=torch.float32),
    }
    if include_conditioner:
        state["offensive_prayer_conditioner.weight"] = (
            torch.zeros(3, 3, dtype=torch.float32)
            if weight is None else weight.clone())
        state["offensive_prayer_conditioner.bias"] = (
            torch.zeros(3, dtype=torch.float32)
            if bias is None else bias.clone())
    return state


def _policy(
        weight: torch.Tensor | None = None,
        bias: torch.Tensor | None = None,
        config: dict | None = CONFIG,
        input_mean: np.ndarray | None = None,
        input_std: np.ndarray | None = None,
) -> policy.Policy:
    return policy.Policy(
        _state(weight, bias, include_conditioner=config is not None),
        (
            np.zeros(schema.INPUT_SIZE, dtype=np.float32)
            if input_mean is None else input_mean
        ),
        (
            np.ones(schema.INPUT_SIZE, dtype=np.float32)
            if input_std is None else input_std
        ),
        torch.device("cpu"),
        torch.float32,
        schema.CURRENT_ACTION_IDS,
        {} if config is None else {
            "offensive_prayer_conditioner": copy.deepcopy(config)},
    )


def _assert_raises_value_error(call, expected: str) -> None:
    try:
        call()
    except ValueError as exc:
        assert expected in str(exc), str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_exact_math_and_group_mass_preservation() -> None:
    weight = torch.tensor([
        [1.25, -0.50, 0.10],
        [-0.20, 0.75, 0.40],
        [0.35, -0.15, -0.90],
    ], dtype=torch.float32)
    bias = torch.tensor([0.05, -0.10, 0.20], dtype=torch.float32)
    actor = _policy(weight, bias)
    raw = np.zeros((3, schema.INPUT_SIZE), dtype=np.float32)
    raw[:, 52:55] = np.asarray([
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.2, 0.3, 0.5],
    ], dtype=np.float32)

    actual, value = actor.score(raw)
    base = actor.policy_b.repeat(len(raw), 1)
    prayer = torch.as_tensor(raw[:, 52:55])
    residual = torch.nn.functional.linear(prayer, weight, bias)
    expected = base.clone()
    touched = set()
    for group in ([1, 3, 5], [2, 4, 6]):
        rows = torch.as_tensor(group, dtype=torch.long)
        before = base.index_select(1, rows)
        adjusted = before + residual
        adjusted += (
            torch.logsumexp(before, dim=1, keepdim=True)
            - torch.logsumexp(adjusted, dim=1, keepdim=True))
        expected.index_copy_(1, rows, adjusted)
        touched.update(group)
        torch.testing.assert_close(
            torch.logsumexp(torch.as_tensor(actual)[:, rows], dim=1),
            torch.logsumexp(before, dim=1),
            rtol=1e-6,
            atol=1e-6,
        )

    torch.testing.assert_close(
        torch.as_tensor(actual), expected, rtol=0.0, atol=1e-7)
    untouched = [
        row for row in range(schema.ACTION_COUNT) if row not in touched]
    np.testing.assert_array_equal(
        actual[:, untouched], base.numpy()[:, untouched])
    np.testing.assert_array_equal(value, np.full(3, 0.75, dtype=np.float32))


def test_zero_initialization_preserves_every_output_exactly() -> None:
    baseline = _policy(config=None)
    conditioned = _policy()
    rng = np.random.default_rng(20260728)
    raw = rng.standard_normal(
        (16, schema.INPUT_SIZE), dtype=np.float32)

    base_scores, base_value = baseline.score(raw)
    scores, value = conditioned.score(raw)

    np.testing.assert_array_equal(scores, base_scores)
    np.testing.assert_array_equal(value, base_value)


def test_raw_no_prayer_bypasses_normalized_affine_cancellation_exactly() -> None:
    mean = np.linspace(
        -2.75, 3.25, schema.INPUT_SIZE, dtype=np.float32)
    std = np.linspace(
        0.35, 2.15, schema.INPUT_SIZE, dtype=np.float32)
    raw_matrix = torch.tensor([
        [1.25, -0.50, 0.10],
        [-0.20, 0.75, 0.40],
        [0.35, -0.15, -0.90],
    ], dtype=torch.float32)
    prayer_mean = torch.as_tensor(mean[52:55])
    prayer_std = torch.as_tensor(std[52:55])
    normalized_weight = raw_matrix * prayer_std.unsqueeze(0)
    normalized_bias = raw_matrix @ prayer_mean

    baseline = _policy(
        config=None,
        input_mean=mean,
        input_std=std,
    )
    conditioned = _policy(
        normalized_weight,
        normalized_bias,
        input_mean=mean,
        input_std=std,
    )
    rng = np.random.default_rng(20260728)
    raw = rng.standard_normal(
        (4, schema.INPUT_SIZE), dtype=np.float32)
    raw[:, 52:55] = 0.0

    base_scores, base_value = baseline.score(raw)
    scores, value = conditioned.score(raw)

    np.testing.assert_array_equal(scores, base_scores)
    np.testing.assert_array_equal(value, base_value)


def test_checkpoint_loading_and_fail_closed_contracts() -> None:
    state = _state()
    blob = {
        "model_state": state,
        "input_mean": np.zeros(schema.INPUT_SIZE, dtype=np.float32),
        "input_std": np.ones(schema.INPUT_SIZE, dtype=np.float32),
        "schema": {
            "input_size": schema.INPUT_SIZE,
            "action_count": schema.ACTION_COUNT,
            "action_ids": list(schema.CURRENT_ACTION_IDS),
            "offensive_prayer_conditioner": copy.deepcopy(CONFIG),
        },
    }
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "conditioned.pt"
        torch.save(blob, path)
        loaded = policy.Policy.load(path, device="cpu")
        assert loaded.offensive_prayer_config == CONFIG
        assert tuple(loaded.offensive_prayer_linear[0].shape) == (3, 3)
        assert tuple(loaded.offensive_prayer_linear[1].shape) == (3,)

    schema_mismatches = (
        ("preserve_group_logmass", False),
        ("version", 1.5),
        ("input_indices", [52, 53, 55]),
        ("attack_action_rows", [1, 3, 6]),
        ("off_tick_action_rows", [2, 4, 7]),
    )
    for key, value in schema_mismatches:
        wrong_schema = copy.deepcopy(CONFIG)
        wrong_schema[key] = value
        _assert_raises_value_error(
            lambda wrong_schema=wrong_schema: _policy(config=wrong_schema),
            "does not match FastSim's version-1 combat-style contract",
        )

    missing_bias = _state()
    del missing_bias["offensive_prayer_conditioner.bias"]
    _assert_raises_value_error(
        lambda: policy.Policy(
            missing_bias,
            np.zeros(schema.INPUT_SIZE, dtype=np.float32),
            np.ones(schema.INPUT_SIZE, dtype=np.float32),
            torch.device("cpu"),
            torch.float32,
            schema.CURRENT_ACTION_IDS,
            {"offensive_prayer_conditioner": copy.deepcopy(CONFIG)},
        ),
        "tensor is missing",
    )

    wrong_shape = _state(weight=torch.zeros(2, 3))
    _assert_raises_value_error(
        lambda: policy.Policy(
            wrong_shape,
            np.zeros(schema.INPUT_SIZE, dtype=np.float32),
            np.ones(schema.INPUT_SIZE, dtype=np.float32),
            torch.device("cpu"),
            torch.float32,
            schema.CURRENT_ACTION_IDS,
            {"offensive_prayer_conditioner": copy.deepcopy(CONFIG)},
        ),
        "weight [3, 3] and bias [3]",
    )

    _assert_raises_value_error(
        lambda: policy.Policy(
            _state(),
            np.zeros(schema.INPUT_SIZE, dtype=np.float32),
            np.ones(schema.INPUT_SIZE, dtype=np.float32),
            torch.device("cpu"),
            torch.float32,
            schema.CURRENT_ACTION_IDS,
            {},
        ),
        "tensors without matching schema metadata",
    )


if __name__ == "__main__":
    test_exact_math_and_group_mass_preservation()
    test_zero_initialization_preserves_every_output_exactly()
    test_raw_no_prayer_bypasses_normalized_affine_cancellation_exactly()
    test_checkpoint_loading_and_fail_closed_contracts()
    print("offensive prayer conditioner: OK")
