"""Focused v26 defence-prayer history and detached-head checks."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import engine, nhrl_writer, policy, schema, state  # noqa: E402


STEP_EAST = next(
    index
    for index, offset in enumerate(schema.MOVEMENT_OFFSETS)
    if tuple(offset) == (1, 0)
)


class _HistoryActor:
    """Deterministic actor that also records every v2 context it receives."""

    defence_prayer_head_version = 2
    input_size = schema.INPUT_SIZE

    def __init__(self, combat, movement=schema.MOVE_NONE, movement_side=None):
        self.combat = combat
        self.movement = movement
        self.movement_side = movement_side
        self.contexts = []

    def score(self, inputs, prayer_history_codes):
        self.contexts.append(np.asarray(prayer_history_codes).copy())
        rows = inputs.shape[0]
        scores = np.zeros((rows, schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 100.0
        scores[:, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = 100.0
        scores[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MAGIC] = 100.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        scores[:, schema.COMBAT_BASE + self.combat] = 1000.0
        if self.movement_side is not None:
            selected = np.arange(self.movement_side, rows, 2)
            scores[selected, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 0.0
            scores[selected, schema.MOVEMENT_BASE + self.movement] = 1000.0
        return scores, np.zeros(rows, dtype=np.float32)


def _ordinary(style):
    return (
        schema.COMBAT_ATTACK_BASE
        + style * 2
        + schema.ATTACK_INTENT_ATTACK
    )


def _special(kind):
    return (
        schema.COMBAT_SPEC_BASE
        + kind * 2
        + schema.ATTACK_INTENT_ATTACK
    )


def _set_lane(eng, distance):
    s = eng.state
    s.x[:, 0], s.y[:, 0] = 0, 0
    s.x[:, 1], s.y[:, 1] = distance, 0
    s.prev_x, s.prev_y = s.x.copy(), s.y.copy()
    s.origin_x, s.origin_y = s.x.copy(), s.y.copy()
    s.lane_min_x = (
        np.minimum(s.origin_x[:, 0], s.origin_x[:, 1]) - state.LANE_RADIUS)
    s.lane_max_x = (
        np.maximum(s.origin_x[:, 0], s.origin_x[:, 1]) + state.LANE_RADIUS)
    s.lane_min_y = (
        np.minimum(s.origin_y[:, 0], s.origin_y[:, 1]) - state.LANE_RADIUS)
    s.lane_max_y = (
        np.maximum(s.origin_y[:, 0], s.origin_y[:, 1]) + state.LANE_RADIUS)


def test_attack_history_has_one_decision_delay_and_ordered_shift():
    actor = _HistoryActor(_ordinary(schema.STYLE_MAGIC))
    eng = engine.Engine(
        1, actor, seed=17, epsilon=0.0, max_ticks=20,
        start_distance_min=1, start_distance_max=1)

    assert eng.step() is None
    assert np.array_equal(actor.contexts[0], np.zeros((2, 5), dtype=np.uint8))
    # The launch occurred after scoring T, so it exists in state for T+1 but
    # was not visible in the context used to choose T.
    assert np.array_equal(
        eng.state.defence_prayer_attack_history_codes[:, :, 0],
        np.full((1, 2), 3, dtype=np.uint8))

    completed = eng.step()
    assert completed is not None
    assert np.array_equal(actor.contexts[1][:, :3], [[3, 0, 0], [3, 0, 0]])
    assert np.array_equal(
        completed.next_defence_prayer_attack_history_codes,
        actor.contexts[1][:, :3])
    assert np.array_equal(
        completed.next_defence_prayer_attack_history_codes,
        eng._pending.defence_prayer_attack_history_codes)

    # The current active prayer is already present in state114. The head-only
    # history intentionally receives that decision-start prayer one decision
    # later, as the newest previous-prayer entry.
    eng.step()
    assert np.array_equal(actor.contexts[2][:, 3:], [[3, 0], [3, 0]])

    # Exercise the exact newest-first shift independently of weapon cooldowns.
    fired = np.array([[True, False]])
    eng._record_defence_prayer_attack_history(
        fired, np.array([[schema.STYLE_RANGED, schema.STYLE_MAGIC]]))
    eng._record_defence_prayer_attack_history(
        fired, np.array([[schema.STYLE_MELEE, schema.STYLE_MAGIC]]))
    assert np.array_equal(
        eng.state.defence_prayer_attack_history_codes[0, 1],
        [1, 2, 3])


def test_history_resets_between_episodes():
    actor = _HistoryActor(schema.COMBAT_NO_ATTACK)
    eng = engine.Engine(
        1, actor, seed=3, epsilon=0.0, max_ticks=20,
        episodes_per_lane=2)
    eng.state.defence_prayer_attack_history_codes[:] = [1, 2, 3]
    eng.state.defence_prayer_own_prayer_history_codes[:] = [3, 2]
    eng.state.alive[:] = False
    eng._reset_finished_lanes()
    assert not eng.state.defence_prayer_attack_history_codes.any()
    assert not eng.state.defence_prayer_own_prayer_history_codes.any()


def test_selected_but_cancelled_attack_does_not_shift():
    actor = _HistoryActor(
        _ordinary(schema.STYLE_MAGIC),
        movement=STEP_EAST,
        movement_side=0)
    eng = engine.Engine(1, actor, seed=5, epsilon=0.0, max_ticks=20)
    _set_lane(eng, distance=0)
    eng.state.style[:] = schema.STYLE_MAGIC
    eng.state.weapon_id[:] = eng.gear_tables["weapon_id"][schema.STYLE_MAGIC]

    eng.step()

    # Side 0 explicitly stepped out of the overlap. Its selected attack never
    # rolled, so defender side 1 receives no history entry.
    assert eng.state.moving[0, 0]
    assert not eng.state.defence_prayer_attack_history_codes[0, 1].any()


def test_voidwaker_records_magic_roll_style():
    actor = _HistoryActor(_special(schema.SPEC_VOIDWAKER))
    eng = engine.Engine(1, actor, seed=7, epsilon=0.0, max_ticks=20)
    _set_lane(eng, distance=1)

    # Only side 0 launches; side 1 holds.
    original_score = actor.score

    def one_sided(inputs, prayer_history_codes):
        scores, value = original_score(inputs, prayer_history_codes)
        scores[1, schema.COMBAT_BASE + _special(schema.SPEC_VOIDWAKER)] = 0.0
        return scores, value

    actor.score = one_sided
    eng.step()

    assert eng.state.special_energy[0, 0] == 500
    assert np.array_equal(
        eng.state.defence_prayer_attack_history_codes[0, 1],
        [3, 0, 0])


def _synthetic_policy(head_version: int) -> policy.Policy:
    generator = torch.Generator().manual_seed(20260728)
    encoded = 8
    hidden = 4
    base_head_weight = torch.randn(
        hidden, schema.INPUT_SIZE, generator=generator)
    if head_version == 1:
        head_weight = base_head_weight
        head_config = {
            "kind": "dmm-defence-prayer-group-replacement",
            "version": 1,
            "input_size": schema.INPUT_SIZE,
            "action_rows": [18, 19, 20],
        }
    else:
        head_weight = torch.cat((
            base_head_weight,
            torch.zeros(hidden, schema.DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE),
        ), dim=1)
        head_config = {
            "kind": "dmm-defence-prayer-group-replacement",
            "version": 2,
            "base_input_size": schema.INPUT_SIZE,
            "history_context_size":
                schema.DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE,
            "head_input_size":
                schema.INPUT_SIZE + schema.DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE,
            "input_size":
                schema.INPUT_SIZE + schema.DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE,
            "history_feature_order":
                list(schema.DEFENCE_PRAYER_HISTORY_FEATURE_ORDER),
            "action_rows": [18, 19, 20],
        }
    model_state = {
        "encoder.0.weight": torch.randn(
            encoded, schema.INPUT_SIZE, generator=generator),
        "encoder.0.bias": torch.randn(encoded, generator=generator),
        "policy.weight": torch.randn(
            schema.ACTION_COUNT, encoded, generator=generator),
        "policy.bias": torch.randn(
            schema.ACTION_COUNT, generator=generator),
        "value.weight": torch.randn(1, encoded, generator=generator),
        "value.bias": torch.randn(1, generator=generator),
        "defence_prayer_head.hidden.weight": head_weight,
        "defence_prayer_head.hidden.bias": torch.randn(
            hidden, generator=generator),
        "defence_prayer_head.output.weight": torch.randn(
            3, hidden, generator=generator),
        "defence_prayer_head.output.bias": torch.randn(
            3, generator=generator),
    }
    return policy.Policy(
        model_state,
        np.zeros(schema.INPUT_SIZE, dtype=np.float32),
        np.ones(schema.INPUT_SIZE, dtype=np.float32),
        torch.device("cpu"),
        torch.float32,
        schema.CURRENT_ACTION_IDS,
        {"defence_prayer_head": head_config},
    )


def test_v1_parity_and_v2_zero_column_parity():
    rng = np.random.default_rng(29)
    raw = rng.standard_normal((12, schema.INPUT_SIZE)).astype(np.float32)
    arbitrary_history = rng.integers(
        0, 4,
        size=(len(raw), schema.DEFENCE_PRAYER_HISTORY_CODE_COUNT),
        dtype=np.uint8)
    zeros = np.zeros_like(arbitrary_history)
    v1 = _synthetic_policy(1)
    v2 = _synthetic_policy(2)

    v1_scores, v1_value = v1.score(raw)
    ignored_scores, ignored_value = v1.score(raw, arbitrary_history)
    np.testing.assert_array_equal(ignored_scores, v1_scores)
    np.testing.assert_array_equal(ignored_value, v1_value)

    v2_scores, v2_value = v2.score(raw, zeros)
    np.testing.assert_allclose(v2_scores, v1_scores, rtol=1e-6, atol=1e-6)
    np.testing.assert_array_equal(v2_value, v1_value)

    try:
        v2.score(raw)
    except ValueError as exc:
        assert "requires five explicit history codes" in str(exc)
    else:
        raise AssertionError("v2 prayer head accepted missing history")


def test_v26_writer_roundtrips_current_and_next_history(tmp_path: Path):
    actor = _HistoryActor(_ordinary(schema.STYLE_MAGIC))
    eng = engine.Engine(
        1, actor, seed=31, epsilon=0.0, max_ticks=20,
        start_distance_min=1, start_distance_max=1)
    eng.step()
    record = eng.step()
    assert record is not None

    out_path = tmp_path / "history-v26.nhrl"
    with nhrl_writer.RolloutWriter(
            out_path, schema.CURRENT_ACTION_IDS, exploration_rate=0.0) as writer:
        writer.write(record)

    raw = np.frombuffer(
        out_path.read_bytes()[-2 * schema.NHRL_RECORD_SIZE:],
        dtype=nhrl_writer.record_dtype())
    assert len(raw) == 2
    np.testing.assert_array_equal(
        raw["defence_prayer_attack_history_codes"],
        record.defence_prayer_attack_history_codes)
    np.testing.assert_array_equal(
        raw["defence_prayer_own_prayer_history_codes"],
        record.defence_prayer_own_prayer_history_codes)
    np.testing.assert_array_equal(
        raw["next_defence_prayer_attack_history_codes"],
        record.next_defence_prayer_attack_history_codes)
    np.testing.assert_array_equal(
        raw["next_defence_prayer_own_prayer_history_codes"],
        record.next_defence_prayer_own_prayer_history_codes)


if __name__ == "__main__":
    test_attack_history_has_one_decision_delay_and_ordered_shift()
    test_history_resets_between_episodes()
    test_selected_but_cancelled_attack_does_not_shift()
    test_voidwaker_records_magic_roll_style()
    test_v1_parity_and_v2_zero_column_parity()
    with tempfile.TemporaryDirectory() as temporary:
        test_v26_writer_roundtrips_current_and_next_history(Path(temporary))
    print("defence-prayer history: OK")
