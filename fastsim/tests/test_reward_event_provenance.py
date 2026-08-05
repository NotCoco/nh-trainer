"""Focused NHEV contributor parity for damage, Vengeance, and tank gear."""

from __future__ import annotations

import numpy as np

from fastsim import engine, gear, reward_events, schema, state


class HoldScores:
    input_size = schema.INPUT_SIZE

    def score(self, inputs):
        rows = len(inputs)
        scores = np.zeros((rows, schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 100.0
        scores[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MAGIC] = 100.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        return scores, np.zeros(rows, dtype=np.float32)


class OneSidedMage(HoldScores):
    def score(self, inputs):
        scores, values = super().score(inputs)
        scores[:, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = 100.0
        attack = (
            schema.COMBAT_BASE + schema.COMBAT_ATTACK_BASE
            + schema.STYLE_MAGIC * 2 + schema.ATTACK_INTENT_ATTACK)
        scores[0::2, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 0.0
        scores[0::2, attack] = 200.0
        return scores, values


def _engine():
    return engine.Engine(
        1, HoldScores(), seed=1, epsilon=0.0,
        start_distance_min=4, start_distance_max=4)


def _allocations(event):
    return {
        (item.causal_unit, item.gear_slot): item.weight
        for item in event.contributors
    }


def test_direct_expected_damage_splits_core_and_exact_gear():
    eng = _engine()
    shape = (1, 2, state.PENDING_HITS_PER_SLOT)
    expected = np.zeros(shape, dtype=np.float64)
    source = np.full(shape, -1, dtype=np.int64)
    prayer = np.full(shape, -1, dtype=np.int64)
    tank = np.full(shape, -1, dtype=np.int64)
    defensive = np.zeros(shape, dtype=np.int32)
    offensive = np.zeros(shape, dtype=np.int32)
    vengeance = np.zeros(shape, dtype=bool)
    count = np.zeros((1, 2), dtype=np.int32)

    expected[0, 1, 0] = 10.0
    source[0, 1, 0] = 4
    prayer[0, 1, 0] = 3
    tank[0, 1, 0] = 4
    defensive[0, 1, 0] = (1 << gear.SLOT_HAT) | (1 << gear.SLOT_CHEST)
    offensive[0, 1, 0] = (1 << gear.SLOT_HAT) | (1 << gear.SLOT_AMULET)
    count[0, 1] = 1

    eng._book_landed_expected_damage(
        expected, source, prayer, tank, defensive, offensive,
        vengeance, count)

    assert len(eng._tick_reward_events) == 2
    dealt, taken = eng._tick_reward_events
    assert dealt.event_type == reward_events.EVENT_DAMAGE_DEALT
    assert taken.event_type == reward_events.EVENT_DAMAGE_TAKEN
    dealt_alloc = _allocations(dealt)
    taken_alloc = _allocations(taken)
    assert np.isclose(dealt_alloc[(reward_events.UNIT_COMBAT, -1)], 0.5)
    assert np.isclose(
        dealt_alloc[(schema.CHANNEL_GEAR_BASE, gear.SLOT_HAT)], 0.25)
    assert np.isclose(
        dealt_alloc[(schema.CHANNEL_GEAR_BASE + 2, gear.SLOT_AMULET)], 0.25)
    assert np.isclose(taken_alloc[(reward_events.UNIT_DEFENCE, -1)], 0.5)
    assert np.isclose(
        taken_alloc[(schema.CHANNEL_GEAR_BASE, gear.SLOT_HAT)], 0.25)
    assert np.isclose(
        taken_alloc[(schema.CHANNEL_GEAR_BASE + 4, gear.SLOT_CHEST)], 0.25)


def test_zero_actual_hit_does_not_become_expected_damage_provenance():
    eng = _engine()
    damage = np.zeros((1, 2), dtype=np.int32)
    expected = np.zeros((1, 2), dtype=np.float64)
    expected[0, 0] = 7.25
    active = np.array([[True, False]])
    eng._queue_hit(
        damage,
        np.full((1, 2), schema.STYLE_MAGIC, dtype=np.int32),
        np.ones((1, 2), dtype=np.int32),
        active,
        expected_damage=expected,
        tank_decision_tick=np.array([[0, -1]], dtype=np.int64))

    arriving = eng._take_pending_damage()
    assert arriving["hit_count"][0, 1] == 0
    assert arriving["damage"][0, 1] == 0
    eng._apply_pending_damage(arriving)
    assert eng.state.pending_expected_reward[0, 0] == 0.0
    assert not any(
        event.event_type == reward_events.EVENT_DAMAGE_DEALT
        for event in eng._tick_reward_events)


def test_rolling_vengeance_uses_supply_outgoing_and_combat_incoming():
    eng = _engine()
    s = eng.state
    target = 1
    s.recent_hit_count[0, target, 0] = 2
    s.recent_hit_damage[0, target, 0, :2] = [27, 53]
    s.recent_hit_source_ticks[0, target, 0, :2] = [9, 8]
    s.recent_hit_prayer_ticks[0, target, 0, :2] = [-1, 7]
    s.recent_hit_tank_ticks[0, target, 0, :2] = [-1, 8]
    s.recent_hit_vengeance_reflection[0, target, 0, 0] = True
    s.recent_hit_vengeance_source_ticks[0, target, 0, 0] = 0
    s.recent_hit_vengeance_trigger_ticks[0, target, 0, 0] = 8
    s.recent_hit_offensive_gear_masks[0, target, 0, 1] = (
        (1 << gear.SLOT_HAT) | (1 << gear.SLOT_AMULET))
    s.recent_hit_defensive_gear_masks[0, target, 0, 1] = (
        (1 << gear.SLOT_HAT) | (1 << gear.SLOT_CHEST))

    outgoing = eng._rolling_reward_contributors(
        0, 0, incoming=False)
    incoming = eng._rolling_reward_contributors(
        0, 1, incoming=True)
    out = {
        (item.causal_unit, item.gear_slot): item.weight
        for item in outgoing
    }
    inc = {
        (item.causal_unit, item.gear_slot): item.weight
        for item in incoming
    }
    assert np.isclose(out[(reward_events.UNIT_SUPPLY, -1)], 27.0 / 80.0)
    assert np.isclose(out[(reward_events.UNIT_COMBAT, -1)], 53.0 / 160.0)
    assert (reward_events.UNIT_DEFENCE, -1) not in out
    assert np.isclose(inc[(reward_events.UNIT_COMBAT, -1)], 27.0 / 80.0)
    assert np.isclose(inc[(reward_events.UNIT_DEFENCE, -1)], 53.0 / 160.0)
    assert (reward_events.UNIT_SUPPLY, -1) not in inc


def test_cached_rolling_provenance_matches_full_rebuild_exactly():
    cached = engine.Engine(
        8, OneSidedMage(), seed=83, epsilon=0.0, max_ticks=40,
        start_distance_min=4, start_distance_max=4)
    rebuilt = engine.Engine(
        8, OneSidedMage(), seed=83, epsilon=0.0, max_ticks=40,
        start_distance_min=4, start_distance_max=4)
    # Prevent episode resets from hiding an enter/expire cycle, then make the
    # comparison engine take the pre-optimization full-rebuild path.
    cached.state.hp[:] = 990
    rebuilt.state.hp[:] = 990
    rebuilt._rolling_reward_contributor_pair = (
        rebuilt._build_rolling_reward_contributor_pair)

    for _ in range(40):
        cached_record = cached.step()
        rebuilt_record = rebuilt.step()
        assert cached.rng.bit_generator.state == rebuilt.rng.bit_generator.state
        assert cached._tick_reward_events == rebuilt._tick_reward_events
        assert np.array_equal(
            cached.state.reward_delta, rebuilt.state.reward_delta)
        assert np.array_equal(
            cached.state.reward_total, rebuilt.state.reward_total)
        if cached_record is None:
            assert rebuilt_record is None
        else:
            assert cached_record.reward_events == rebuilt_record.reward_events

    assert cached.flush().reward_events == rebuilt.flush().reward_events


def test_positive_roll_tank_credits_only_matched_relevant_slots():
    eng = _engine()
    s = eng.state
    final_items = s.equipped_ids[0, 1]
    # Converge the greedy three-swap estimate so the next roll is a positive
    # matched-state event rather than another missing-switch component.
    for _ in range(2):
        _, _, _, final_items = eng._roll_tank_raw_reward(
            final_items,
            schema.STYLE_MAGIC,
            s.inventory_free_slots[0, 1])
    s.equipped_ids[0, 1] = np.asarray(final_items, dtype=np.int32)

    rows = 2
    eng._current_roll_context = {
        "eligible": np.ones(
            (rows, schema.CAUSAL_UNIT_COUNT), dtype=bool),
        "virtual_none": np.zeros(
            (rows, schema.CAUSAL_UNIT_COUNT), dtype=bool),
        "causal_actual": np.full(
            (rows, schema.CAUSAL_UNIT_COUNT), -1, dtype=np.int32),
        "reserved": np.zeros(
            (rows, schema.CAUSAL_UNIT_COUNT), dtype=bool),
        "decision_tick": np.zeros(rows, dtype=np.int64),
        "tank_gear_teacher_action_count": np.zeros(rows, dtype=np.int32),
        "tank_gear_teacher_actions": np.full(
            (rows, 4), -1, dtype=np.int32),
    }
    fired = np.array([[True, False]])
    eng._book_roll_tank_gear(
        fired,
        np.full((1, 2), schema.STYLE_MAGIC, dtype=np.int32))
    eng._finalize_tank_reward_events()
    event = eng._tick_reward_events[-1]
    assert event.original_reward > 0.0
    credited_slots = {item.gear_slot for item in event.contributors}
    assert credited_slots == {
        gear.SLOT_CAPE,
        gear.SLOT_CHEST,
        gear.SLOT_SHIELD,
        gear.SLOT_LEGS,
    }


if __name__ == "__main__":
    for name, function in sorted(globals().items()):
        if name.startswith("test_") and callable(function):
            function()
            print("  ok  ", name)
    print("reward event provenance: OK")
