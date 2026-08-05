"""Differential checks for the vectorized attack-teacher hot paths."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import combat, engine, gear, reward_events, schema  # noqa: E402


class HoldScores:
    input_size = schema.INPUT_SIZE

    def score(self, inputs):
        rows = len(inputs)
        scores = np.zeros((rows, schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 100.0
        scores[:, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = 100.0
        scores[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MAGIC] = 100.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        return scores, np.zeros(rows, dtype=np.float32)


def _direct_action_reference(slot, item_id):
    matches = np.flatnonzero(
        (gear.DIRECT_GEAR_SLOTS == int(slot))
        & (gear.DIRECT_GEAR_ITEMS == int(item_id)))
    assert len(matches) == 1
    return int(schema.GEAR_BASE + matches[0])


def _offensive_influence_reference(
        eng, roll_style, active, spell_magic, ignore_defence):
    context = eng._current_roll_context
    result = np.zeros((eng.n_fights, 2), dtype=np.int32)
    styles = np.asarray(roll_style, dtype=np.int32)
    active = np.asarray(active, dtype=bool)
    spell = np.broadcast_to(np.asarray(spell_magic, dtype=bool), active.shape)
    ignored = np.broadcast_to(
        np.asarray(ignore_defence, dtype=bool), active.shape)
    applicable = (
        context["eligible"]
        | context["virtual_none"]
        | (context["causal_actual"] >= 0))

    for fight_index, side in np.argwhere(active):
        flat_row = int(fight_index) * 2 + int(side)
        style = int(styles[fight_index, side])
        if style == schema.STYLE_MAGIC and (
                not bool(spell[fight_index, side])
                or bool(ignored[fight_index, side])):
            continue
        for unit_index, raw_slot in enumerate(schema.OPTIONAL_GEAR_SLOTS):
            unit = schema.CHANNEL_GEAR_BASE + unit_index
            if (
                unit in schema.INACTIVE_CAUSAL_UNITS
                or not bool(applicable[flat_row, unit])
                or bool(context["reserved"][flat_row, unit])
            ):
                continue
            slot = int(raw_slot)
            current_id = int(
                eng.state.equipped_ids[fight_index, side, slot])
            current_item = gear.BY_ID.get(current_id)
            current = (
                np.zeros(schema.BONUS_COUNT, dtype=np.int32)
                if current_item is None else
                np.asarray(current_item.bonuses, dtype=np.int32))
            influential = False
            for local in np.flatnonzero(gear.DIRECT_GEAR_SLOTS == slot):
                alternative_id = int(gear.DIRECT_GEAR_ITEMS[local])
                if alternative_id == current_id:
                    continue
                alternative_item = gear.BY_ID.get(alternative_id)
                alternative = (
                    np.zeros(schema.BONUS_COUNT, dtype=np.int32)
                    if alternative_item is None else
                    np.asarray(alternative_item.bonuses, dtype=np.int32))
                if style == schema.STYLE_MAGIC:
                    influential = (
                        current[schema.MAGIC_ATTACK]
                        != alternative[schema.MAGIC_ATTACK]
                        or current[schema.MAGIC_DAMAGE]
                        != alternative[schema.MAGIC_DAMAGE]
                        or (
                            slot in (gear.SLOT_CHEST, gear.SLOT_LEGS)
                            and (current[schema.MAGIC_ATTACK] < 0)
                            != (alternative[schema.MAGIC_ATTACK] < 0)))
                elif style == schema.STYLE_RANGED:
                    influential = (
                        (
                            not bool(ignored[fight_index, side])
                            and current[schema.RANGE_ATTACK]
                            != alternative[schema.RANGE_ATTACK]
                        )
                        or current[schema.RANGED_STRENGTH]
                        != alternative[schema.RANGED_STRENGTH])
                else:
                    attack_index = int(combat.style_attack_bonus_index(
                        np.asarray(style)))
                    influential = (
                        (
                            not bool(ignored[fight_index, side])
                            and current[attack_index]
                            != alternative[attack_index]
                        )
                        or current[schema.MELEE_STRENGTH]
                        != alternative[schema.MELEE_STRENGTH])
                if influential:
                    break
            if influential:
                result[fight_index, side] |= 1 << slot
    return result


def _tank_reference(eng, equipped_ids, incoming_style, free_slots):
    clean_ids = np.where(np.asarray(equipped_ids) > 0, equipped_ids, 0)
    expected = gear.equipment_bonuses(
        clean_ids[None, :],
        eng.gear_tables["item_bonus_lookup"])[0]
    expected_items = clean_ids.astype(np.int32, copy=True)
    initial_score = eng._tank_defence_score(expected, incoming_style)
    swapped_slots = set()
    teacher_actions = []
    teacher_slots = []
    swaps_used = 0
    free = max(0, int(free_slots))

    for _ in range(3):
        best_score = eng._tank_defence_score(expected, incoming_style)
        best = None
        for slot in engine.TANK_GEAR_SLOTS:
            if slot in swapped_slots:
                continue
            current_id = int(expected_items[slot])
            if current_id > 0 and free > 0:
                candidate_bonuses = expected.copy()
                current = gear.BY_ID.get(current_id)
                if current is not None:
                    candidate_bonuses -= np.asarray(
                        current.bonuses, dtype=np.int32)
                candidate_items = expected_items.copy()
                candidate_items[slot] = 0
                score = eng._tank_defence_score(
                    candidate_bonuses, incoming_style)
                if score > best_score:
                    best_score = score
                    best = (
                        slot,
                        candidate_bonuses,
                        candidate_items,
                        -1,
                        _direct_action_reference(slot, -1),
                    )
            for item in engine.TANK_GEAR_CANDIDATES[slot]:
                if item.item_id == current_id:
                    continue
                candidate_bonuses, candidate_items = (
                    eng._apply_expected_tank_equip(
                        expected, expected_items, slot, item))
                score = eng._tank_defence_score(
                    candidate_bonuses, incoming_style)
                if score > best_score:
                    best_score = score
                    best = (
                        slot,
                        candidate_bonuses,
                        candidate_items,
                        1 if current_id == 0 else 0,
                        _direct_action_reference(slot, item.item_id),
                    )
        if best is None:
            break
        (
            slot,
            expected,
            expected_items,
            free_delta,
            teacher_action,
        ) = best
        swapped_slots.add(slot)
        teacher_slots.append(int(slot))
        teacher_actions.append(int(teacher_action))
        swaps_used += 1
        free = max(0, free + free_delta)

    final_score = eng._tank_defence_score(expected, incoming_style)
    gap = max(0, final_score - initial_score)
    raw = (
        engine.REWARD_ROLL_TANK_MISSING[min(swaps_used, 3)]
        - gap * engine.REWARD_ROLL_TANK_GAP_SCALE)
    return (
        raw,
        tuple(teacher_actions),
        tuple(teacher_slots),
        tuple(int(item) for item in expected_items),
    )


def _book_tank_reference(eng, fired, hit_style):
    """Scalar pre-dedupe implementation retained as a differential oracle."""
    fired = np.asarray(fired, dtype=bool)
    context = eng._current_roll_context
    defensive_masks = np.zeros((eng.n_fights, 2), dtype=np.int32)
    if not fired.any() or context is None:
        return defensive_masks
    state = eng.state
    target = state.flip(fired)

    for fight_index, defender_side in np.argwhere(target):
        attacker_side = 1 - int(defender_side)
        style = int(hit_style[fight_index, attacker_side])
        (
            raw,
            teacher_actions,
            teacher_slots,
            expected_items,
        ) = _tank_reference(
            eng,
            state.equipped_ids[fight_index, defender_side],
            style,
            state.inventory_free_slots[fight_index, defender_side])
        flat_row = int(fight_index) * 2 + int(defender_side)
        count = min(4, len(teacher_actions))
        context["tank_gear_teacher_action_count"][flat_row] = count
        context["tank_gear_teacher_actions"][flat_row] = -1
        if count:
            context["tank_gear_teacher_actions"][
                flat_row, :count] = teacher_actions[:count]

        applicable = (
            context["eligible"][flat_row]
            | context["virtual_none"][flat_row]
            | (context["causal_actual"][flat_row] >= 0))
        current_items = np.where(
            state.equipped_ids[fight_index, defender_side] > 0,
            state.equipped_ids[fight_index, defender_side],
            0)
        relevant_slots = []
        for raw_slot in engine.TANK_GEAR_SLOTS:
            slot = int(raw_slot)
            relevant = slot in teacher_slots
            if (
                not relevant
                and slot in engine.STABLE_TANK_RELEVANT_SLOTS
                and int(expected_items[slot]) > 0
                and int(expected_items[slot]) == int(current_items[slot])
            ):
                relevant = True
            if relevant:
                relevant_slots.append(slot)

        matched_slots = [
            slot for slot in relevant_slots
            if int(expected_items[slot]) == int(current_items[slot])
        ]
        missed_slots = [
            slot for slot in relevant_slots
            if int(expected_items[slot]) != int(current_items[slot])
        ]
        for slot in relevant_slots:
            unit = engine.OPTIONAL_GEAR_UNIT_BY_SLOT[slot]
            if (
                not context["reserved"][flat_row, unit]
                and applicable[unit]
            ):
                defensive_masks[
                    fight_index, attacker_side] |= 1 << slot

        recipients = []
        candidate_slots = matched_slots if raw > 0.0 else missed_slots
        for slot in sorted(candidate_slots):
            unit = engine.OPTIONAL_GEAR_UNIT_BY_SLOT[int(slot)]
            if context["reserved"][flat_row, unit]:
                recipient = (reward_events.UNIT_COMBAT, int(slot))
            elif applicable[unit]:
                recipient = (unit, int(slot))
            else:
                continue
            if recipient not in recipients:
                recipients.append(recipient)
        if not recipients:
            continue

        state.pending_roll_tank_gear_reward[
            fight_index, defender_side] += raw
        target_tick = int(context["decision_tick"][flat_row])
        weight = 1.0 / len(recipients)
        contributors = tuple(
            reward_events.RewardContributor(
                source_tick=eng.world_tick,
                target_decision_tick=target_tick,
                causal_unit=unit,
                gear_slot=slot,
                weight=weight)
            for unit, slot in recipients)
        eng._tick_tank_components.append({
            "fight": int(fight_index),
            "side": int(defender_side),
            "raw": float(raw),
            "contributors": contributors,
        })
    return defensive_masks


def _direct_items_by_slot():
    return {
        int(slot): np.concatenate((
            np.asarray([0], dtype=np.int32),
            gear.DIRECT_GEAR_ITEMS[gear.DIRECT_GEAR_SLOTS == int(slot)]))
        for slot in schema.OPTIONAL_GEAR_SLOTS
    }


def test_vectorized_offensive_influence_matches_scalar_reference():
    rng = np.random.default_rng(997)
    eng = engine.Engine(16, HoldScores(), seed=9, epsilon=0.0)
    choices = _direct_items_by_slot()
    rows = eng.n_fights * 2

    for _ in range(40):
        for fight_index in range(eng.n_fights):
            for side in (0, 1):
                for raw_slot in schema.OPTIONAL_GEAR_SLOTS:
                    slot = int(raw_slot)
                    eng.state.equipped_ids[
                        fight_index, side, slot] = rng.choice(choices[slot])
        eng._current_roll_context = {
            "eligible": rng.random(
                (rows, schema.CAUSAL_UNIT_COUNT)) < 0.6,
            "virtual_none": rng.random(
                (rows, schema.CAUSAL_UNIT_COUNT)) < 0.2,
            "causal_actual": np.where(
                rng.random((rows, schema.CAUSAL_UNIT_COUNT)) < 0.2,
                1,
                -1),
            "reserved": rng.random(
                (rows, schema.CAUSAL_UNIT_COUNT)) < 0.2,
        }
        styles = rng.integers(
            schema.STYLE_MAGIC,
            schema.STYLE_MELEE + 1,
            size=(eng.n_fights, 2),
            dtype=np.int32)
        active = rng.random((eng.n_fights, 2)) < 0.45
        spell = rng.random((eng.n_fights, 2)) < 0.7
        ignored = rng.random((eng.n_fights, 2)) < 0.3
        actual = eng._offensive_gear_influence_mask(
            styles,
            active,
            spell_magic=spell,
            ignore_defence=ignored)
        expected = _offensive_influence_reference(
            eng, styles, active, spell, ignored)
        assert np.array_equal(actual, expected)


def test_projected_tank_search_matches_copying_reference():
    rng = np.random.default_rng(1337)
    eng = engine.Engine(1, HoldScores(), seed=11, epsilon=0.0)
    choices = _direct_items_by_slot()
    for _ in range(120):
        equipped = gear.initial_equipment_ids()
        for raw_slot in schema.OPTIONAL_GEAR_SLOTS:
            slot = int(raw_slot)
            equipped[slot] = rng.choice(choices[slot])
        style = int(rng.integers(
            schema.STYLE_MAGIC, schema.STYLE_MELEE + 1))
        free_slots = int(rng.integers(0, 9))
        actual = eng._roll_tank_raw_reward(
            equipped, style, free_slots)
        expected = _tank_reference(
            eng, equipped, style, free_slots)
        assert actual == expected


def test_tank_batch_dedupe_matches_scalar_reference_and_first_occurrence():
    fights = 6
    rows = fights * 2
    actual = engine.Engine(fights, HoldScores(), seed=17, epsilon=0.0)
    expected = engine.Engine(fights, HoldScores(), seed=17, epsilon=0.0)

    base = gear.initial_equipment_ids()
    equipped = np.broadcast_to(base, (fights, 2, len(base))).copy()
    flat_equipped = equipped.reshape(rows, -1)
    flat_equipped[4:, gear.SLOT_CHEST] = gear.VIRTUS_ROBE_TOP.item_id
    flat_equipped[8:, gear.SLOT_SHIELD] = gear.DRAGONFIRE_SHIELD.item_id
    free_slots = np.full((fights, 2), 2, dtype=np.int32)
    free_slots.reshape(-1)[10:] = 1
    for eng in (actual, expected):
        eng.state.equipped_ids[:] = equipped
        eng.state.inventory_free_slots[:] = free_slots
        eng.state.pending_roll_tank_gear_reward[:] = 0.0
        eng._tick_tank_components = []

    eligible = np.ones(
        (rows, schema.CAUSAL_UNIT_COUNT), dtype=bool)
    virtual_none = np.zeros_like(eligible)
    causal_actual = np.full(
        (rows, schema.CAUSAL_UNIT_COUNT), -1, dtype=np.int32)
    reserved = np.zeros_like(eligible)
    chest_unit = engine.OPTIONAL_GEAR_UNIT_BY_SLOT[gear.SLOT_CHEST]
    shield_unit = engine.OPTIONAL_GEAR_UNIT_BY_SLOT[gear.SLOT_SHIELD]
    reserved[1, chest_unit] = True
    eligible[3, shield_unit] = False

    def make_context():
        return {
            "eligible": eligible.copy(),
            "virtual_none": virtual_none.copy(),
            "causal_actual": causal_actual.copy(),
            "reserved": reserved.copy(),
            "decision_tick": np.arange(rows, dtype=np.int64) + 80,
            "tank_gear_teacher_action_count": np.full(
                rows, 99, dtype=np.int32),
            "tank_gear_teacher_actions": np.full(
                (rows, 4), 99, dtype=np.int32),
        }

    actual._current_roll_context = make_context()
    expected._current_roll_context = make_context()
    fired = np.ones((fights, 2), dtype=bool)
    hit_style = np.full(
        (fights, 2), schema.STYLE_MAGIC, dtype=np.int32)

    original = actual._roll_tank_raw_reward
    actual_calls = []

    def counted(equipped_ids, style, free):
        actual_calls.append((
            np.asarray(equipped_ids, dtype=np.int32).tobytes(),
            int(style),
            int(free)))
        return original(equipped_ids, style, free)

    actual._roll_tank_raw_reward = counted
    actual_masks = actual._book_roll_tank_gear(fired, hit_style)
    expected_masks = _book_tank_reference(expected, fired, hit_style)

    first_occurrences = []
    seen = set()
    for flat_row in range(rows):
        key = (
            flat_equipped[flat_row].tobytes(),
            int(hit_style.reshape(-1)[flat_row ^ 1]),
            int(free_slots.reshape(-1)[flat_row]))
        if key not in seen:
            seen.add(key)
            first_occurrences.append(key)
    assert actual_calls == first_occurrences
    assert np.array_equal(actual_masks, expected_masks)
    assert np.array_equal(
        actual._current_roll_context["tank_gear_teacher_action_count"],
        expected._current_roll_context["tank_gear_teacher_action_count"])
    assert np.array_equal(
        actual._current_roll_context["tank_gear_teacher_actions"],
        expected._current_roll_context["tank_gear_teacher_actions"])
    assert np.array_equal(
        actual.state.pending_roll_tank_gear_reward,
        expected.state.pending_roll_tank_gear_reward)
    assert actual._tick_tank_components == expected._tick_tank_components


if __name__ == "__main__":
    for name, function in sorted(globals().items()):
        if name.startswith("test_") and callable(function):
            function()
            print("  ok  ", name)
    print("teacher optimization parity: OK")
