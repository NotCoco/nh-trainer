"""Focused head-v3 prior-state history timing, schema, and parity checks."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import engine, policy, schema  # noqa: E402


class _HistoryV3Actor:
    defence_prayer_head_version = 3
    input_size = schema.INPUT_SIZE

    def __init__(self):
        self.inputs: list[np.ndarray] = []
        self.prayer_contexts: list[np.ndarray] = []
        self.prior_states: list[np.ndarray] = []
        self.prior_valid: list[np.ndarray] = []

    def score(
            self,
            inputs,
            prayer_history_codes,
            prior_state_history,
            prior_state_history_valid):
        self.inputs.append(np.asarray(inputs).copy())
        self.prayer_contexts.append(
            np.asarray(prayer_history_codes).copy())
        self.prior_states.append(
            np.asarray(prior_state_history).copy())
        self.prior_valid.append(
            np.asarray(prior_state_history_valid).copy())
        rows = inputs.shape[0]
        scores = np.zeros(
            (rows, schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 1000.0
        scores[:, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = 1000.0
        scores[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MAGIC] = 1000.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 1000.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 1000.0
        return scores, np.zeros(rows, dtype=np.float32)


def test_engine_history_excludes_current_and_is_newest_first():
    actor = _HistoryV3Actor()
    eng = engine.Engine(
        1,
        actor,
        seed=43,
        epsilon=0.0,
        max_ticks=40,
        start_distance_min=1,
        start_distance_max=1)

    eng.state.reward_total[:] = 1.0
    assert eng.step() is None
    assert not actor.prior_valid[0].any()
    assert not actor.prior_states[0].any()

    eng.state.reward_total[:] = 2.0
    eng.step()
    np.testing.assert_array_equal(
        actor.prior_valid[1][:, :2],
        [[True, False], [True, False]])
    np.testing.assert_allclose(
        actor.prior_states[1][:, 0],
        actor.inputs[0].astype(np.float32),
        rtol=0.0,
        atol=0.0)
    assert not np.array_equal(
        actor.prior_states[1][:, 0],
        actor.inputs[1])

    eng.state.reward_total[:] = 3.0
    eng.step()
    np.testing.assert_array_equal(
        actor.prior_valid[2][:, :3],
        [[True, True, False], [True, True, False]])
    np.testing.assert_allclose(
        actor.prior_states[2][:, 0],
        actor.inputs[1].astype(np.float32),
        rtol=0.0,
        atol=0.0)
    np.testing.assert_allclose(
        actor.prior_states[2][:, 1],
        actor.inputs[0].astype(np.float32),
        rtol=0.0,
        atol=0.0)


def test_engine_history_wraps_without_losing_lag_order():
    actor = _HistoryV3Actor()
    eng = engine.Engine(
        1,
        actor,
        seed=47,
        epsilon=0.0,
        max_ticks=40,
        start_distance_min=1,
        start_distance_max=1)
    decisions = schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS + 3
    for tick in range(decisions):
        eng.state.reward_total[:] = float(tick + 1)
        eng.step()

    final_index = decisions - 1
    assert actor.prior_valid[final_index].all()
    for lag in range(schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS):
        np.testing.assert_allclose(
            actor.prior_states[final_index][:, lag],
            actor.inputs[final_index - lag - 1].astype(np.float32),
            rtol=0.0,
            atol=0.0)


def test_engine_history_resets_between_episodes():
    actor = _HistoryV3Actor()
    eng = engine.Engine(
        1,
        actor,
        seed=53,
        epsilon=0.0,
        max_ticks=40,
        episodes_per_lane=2)
    eng.step()
    eng.step()
    assert actor.prior_valid[-1][:, 0].all()

    eng.state.alive[:] = False
    eng._reset_finished_lanes()
    assert not eng.state.defence_prayer_prior_state_history_count.any()
    eng.step()

    assert not actor.prior_valid[-1].any()
    assert not actor.prior_states[-1].any()
    assert np.all(
        eng.state.defence_prayer_prior_state_history_count == 1)


def _head_config(version: int) -> dict[str, object]:
    if version == 2:
        head_size = (
            schema.INPUT_SIZE
            + schema.DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE)
        return {
            "kind": "dmm-defence-prayer-group-replacement",
            "version": 2,
            "base_input_size": schema.INPUT_SIZE,
            "history_context_size":
                schema.DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE,
            "head_input_size": head_size,
            "input_size": head_size,
            "history_feature_order":
                list(schema.DEFENCE_PRAYER_HISTORY_FEATURE_ORDER),
            "action_rows": [18, 19, 20],
        }
    return {
        "kind": "dmm-defence-prayer-group-replacement",
        "version": 3,
        "input_source": (
            "normalized_input_plus_ordered_prayer_history"
            "_plus_prior_state_history"),
        "base_input_size": schema.INPUT_SIZE,
        "history_context_size":
            schema.DEFENCE_PRAYER_V3_HISTORY_CONTEXT_SIZE,
        "ordered_history_context_size":
            schema.DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE,
        "prior_state_history_lags":
            schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
        "prior_state_input_size":
            schema.DEFENCE_PRAYER_PRIOR_STATE_INPUT_SIZE,
        "prior_state_stride":
            schema.DEFENCE_PRAYER_PRIOR_STATE_STRIDE,
        "prior_state_history_context_size":
            schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_CONTEXT_SIZE,
        "prior_state_lag_order": "newest_first",
        "prior_state_feature_order": "normalized_state_then_valid",
        "current_row_excluded": True,
        "head_input_size": schema.DEFENCE_PRAYER_V3_HEAD_INPUT_SIZE,
        "input_size": schema.DEFENCE_PRAYER_V3_HEAD_INPUT_SIZE,
        "history_feature_order":
            list(schema.DEFENCE_PRAYER_HISTORY_FEATURE_ORDER),
        "action_rows": [18, 19, 20],
    }


def _synthetic_v2_v3_pair() -> tuple[policy.Policy, policy.Policy]:
    generator = torch.Generator().manual_seed(20260729)
    encoded = 8
    hidden = 5
    v2_width = (
        schema.INPUT_SIZE + schema.DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE)
    shared_head_weight = torch.randn(
        hidden, v2_width, generator=generator)
    common_state = {
        "encoder.0.weight": torch.randn(
            encoded, schema.INPUT_SIZE, generator=generator),
        "encoder.0.bias": torch.randn(encoded, generator=generator),
        "policy.weight": torch.randn(
            schema.ACTION_COUNT, encoded, generator=generator),
        "policy.bias": torch.randn(
            schema.ACTION_COUNT, generator=generator),
        "value.weight": torch.randn(1, encoded, generator=generator),
        "value.bias": torch.randn(1, generator=generator),
        "defence_prayer_head.hidden.bias": torch.randn(
            hidden, generator=generator),
        "defence_prayer_head.output.weight": torch.randn(
            3, hidden, generator=generator),
        "defence_prayer_head.output.bias": torch.randn(
            3, generator=generator),
    }
    mean = np.linspace(
        -0.25, 0.25, schema.INPUT_SIZE, dtype=np.float32)
    std = np.linspace(
        0.5, 1.5, schema.INPUT_SIZE, dtype=np.float32)

    v2_state = dict(common_state)
    v2_state["defence_prayer_head.hidden.weight"] = shared_head_weight
    v3_state = dict(common_state)
    v3_state["defence_prayer_head.hidden.weight"] = torch.cat((
        shared_head_weight,
        torch.zeros(
            hidden,
            schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_CONTEXT_SIZE),
    ), dim=1)
    args = (
        mean,
        std,
        torch.device("cpu"),
        torch.float32,
        schema.CURRENT_ACTION_IDS,
    )
    return (
        policy.Policy(v2_state, *args, {
            "defence_prayer_head": _head_config(2)}),
        policy.Policy(v3_state, *args, {
            "defence_prayer_head": _head_config(3)}),
    )


def test_v3_zero_column_migration_preserves_v2_exactly():
    v2, v3 = _synthetic_v2_v3_pair()
    rng = np.random.default_rng(59)
    rows = 11
    raw = rng.standard_normal(
        (rows, schema.INPUT_SIZE)).astype(np.float32)
    prayer = rng.integers(
        0,
        4,
        size=(rows, schema.DEFENCE_PRAYER_HISTORY_CODE_COUNT),
        dtype=np.uint8)
    prior = rng.standard_normal((
        rows,
        schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
        schema.INPUT_SIZE,
    )).astype(np.float32)
    valid = rng.integers(
        0,
        2,
        size=(
            rows,
            schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
        ),
        dtype=np.uint8)

    v2_scores, v2_value = v2.score(raw, prayer)
    v3_scores, v3_value = v3.score(raw, prayer, prior, valid)
    non_head = np.ones(schema.ACTION_COUNT, dtype=bool)
    non_head[[18, 19, 20]] = False
    np.testing.assert_array_equal(
        v3_scores[:, non_head], v2_scores[:, non_head])
    np.testing.assert_allclose(
        v3_scores[:, ~non_head],
        v2_scores[:, ~non_head],
        rtol=1e-6,
        atol=1e-5)
    np.testing.assert_array_equal(v3_value, v2_value)


def test_v3_head_input_order_and_invalid_zero_padding():
    _v2, v3 = _synthetic_v2_v3_pair()
    raw = np.arange(
        2 * schema.INPUT_SIZE, dtype=np.float32).reshape(
            2, schema.INPUT_SIZE) / 100.0
    prayer = np.asarray(
        [[1, 2, 3, 3, 2], [3, 0, 1, 2, 0]],
        dtype=np.uint8)
    prior = np.full((
        2,
        schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
        schema.INPUT_SIZE,
    ), 999.0, dtype=np.float32)
    prior[0, 0] = raw[0] + 10.0
    prior[0, 1] = raw[0] + 20.0
    prior[1, 0] = raw[1] + 30.0
    valid = np.zeros(
        (2, schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS),
        dtype=bool)
    valid[0, :2] = True
    valid[1, 0] = True

    captured: list[torch.Tensor] = []
    original_linear = v3._linear

    def capture_head_input(value, params):
        if params is v3.defence_prayer_hidden:
            captured.append(value.detach().clone())
        return original_linear(value, params)

    v3._linear = capture_head_input
    v3.score(raw, prayer, prior, valid)
    head_input = captured[0].cpu().numpy()

    current = (raw - v3.mean.cpu().numpy()) / v3.std.cpu().numpy()
    np.testing.assert_allclose(
        head_input[:, :schema.INPUT_SIZE], current)
    ordered = torch.nn.functional.one_hot(
        torch.as_tensor(prayer, dtype=torch.long),
        num_classes=4)[..., 1:].reshape(2, -1).numpy()
    ordered_start = schema.INPUT_SIZE
    ordered_end = (
        ordered_start + schema.DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE)
    np.testing.assert_array_equal(
        head_input[:, ordered_start:ordered_end], ordered)

    prior_context = head_input[:, ordered_end:].reshape(
        2,
        schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
        schema.DEFENCE_PRAYER_PRIOR_STATE_STRIDE)
    expected_lag0 = (
        prior[:, 0] - v3.mean.cpu().numpy()
    ) / v3.std.cpu().numpy()
    np.testing.assert_allclose(
        prior_context[:, 0, :schema.INPUT_SIZE],
        expected_lag0)
    np.testing.assert_array_equal(
        prior_context[:, 0, -1], [1.0, 1.0])
    np.testing.assert_allclose(
        prior_context[0, 1, :schema.INPUT_SIZE],
        (prior[0, 1] - v3.mean.cpu().numpy())
        / v3.std.cpu().numpy())
    assert prior_context[0, 1, -1] == 1.0
    assert not prior_context[1, 1:].any()


def test_v3_fails_closed_without_exact_history():
    _v2, v3 = _synthetic_v2_v3_pair()
    raw = np.zeros((2, schema.INPUT_SIZE), dtype=np.float32)
    prayer = np.zeros(
        (2, schema.DEFENCE_PRAYER_HISTORY_CODE_COUNT),
        dtype=np.uint8)
    prior = np.zeros((
        2,
        schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
        schema.INPUT_SIZE,
    ), dtype=np.float32)
    valid = np.zeros(
        (2, schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS),
        dtype=bool)

    for args in (
        (raw, prayer),
        (raw, prayer, prior[:, :-1], valid),
        (raw, prayer, prior, valid[:, :-1]),
    ):
        try:
            v3.score(*args)
        except ValueError:
            pass
        else:
            raise AssertionError(
                "v3 prayer head accepted missing or malformed history")


if __name__ == "__main__":
    test_engine_history_excludes_current_and_is_newest_first()
    test_engine_history_wraps_without_losing_lag_order()
    test_engine_history_resets_between_episodes()
    test_v3_zero_column_migration_preserves_v2_exactly()
    test_v3_head_input_order_and_invalid_zero_padding()
    test_v3_fails_closed_without_exact_history()
    print("defence-prayer prior-state history: OK")
