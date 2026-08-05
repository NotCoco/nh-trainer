"""Whole-engine checks for Java's composed combat and movement channels."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import generate  # noqa: E402
from fastsim import actions, engine, gear, observation, schema, state  # noqa: E402

MOVE_WEST_TWO = next(
    index for index, offset in enumerate(schema.MOVEMENT_OFFSETS)
    if tuple(offset) == (-2, 0))
MOVE_EAST_TWO = next(
    index for index, offset in enumerate(schema.MOVEMENT_OFFSETS)
    if tuple(offset) == (2, 0))


def test_vectorized_exploration_selection_matches_scalar_order():
    rng = np.random.default_rng(20260727)
    rows = 4096
    unit = rng.integers(
        0, schema.CAUSAL_UNIT_COUNT, size=rows, dtype=np.int64)
    gear_unit = unit >= schema.CHANNEL_GEAR_BASE
    support = rng.random((rows, schema.ACTION_COUNT)) < 0.12
    greedy = rng.integers(
        0, schema.ACTION_COUNT, size=rows, dtype=np.int64)
    virtual_none = gear_unit & (rng.random(rows) < 0.5)

    # Core support contains the greedy action and must have another choice.
    support[np.arange(rows), greedy] = True
    core = ~gear_unit
    extra = (greedy + 1) % schema.ACTION_COUNT
    support[np.arange(rows)[core], extra[core]] = True
    option_count = (
        support.sum(axis=1)
        - core.astype(np.int64)
        + virtual_none.astype(np.int64))
    choice = np.asarray(
        rng.random(rows) * option_count, dtype=np.int64)

    expected = np.empty(rows, dtype=np.int64)
    for row in range(rows):
        options = np.nonzero(support[row])[0]
        if gear_unit[row]:
            if virtual_none[row]:
                options = np.concatenate((
                    np.array([-1], dtype=np.int64), options))
        else:
            options = options[options != greedy[row]]
        expected[row] = options[choice[row]]

    actual = actions._select_exploration_actions(
        support, greedy, gear_unit, virtual_none, choice)
    assert np.array_equal(actual, expected)


class FixedScores:
    def __init__(self, combat=schema.COMBAT_NO_ATTACK,
                 movement=schema.MOVE_NONE, gear_action=None):
        self.combat = combat
        self.movement = movement
        self.gear_action = gear_action
        self.input_size = schema.INPUT_SIZE

    def score(self, inputs):
        rows = inputs.shape[0]
        scores = np.zeros((rows, schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 100.0
        scores[:, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = 100.0
        scores[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MELEE] = 100.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        scores[:, schema.COMBAT_BASE + self.combat] = 1000.0
        scores[:, schema.MOVEMENT_BASE + self.movement] = 1000.0
        if self.gear_action is not None:
            scores[:, self.gear_action] = 1000.0
        return scores, np.zeros(rows, dtype=np.float32)


def _set_lane(eng, distance):
    s = eng.state
    s.x[:, 0], s.y[:, 0] = 0, 0
    s.x[:, 1], s.y[:, 1] = distance, 0
    s.prev_x, s.prev_y = s.x.copy(), s.y.copy()
    s.origin_x, s.origin_y = s.x.copy(), s.y.copy()
    s.lane_min_x = np.minimum(s.origin_x[:, 0], s.origin_x[:, 1]) - state.LANE_RADIUS
    s.lane_max_x = np.maximum(s.origin_x[:, 0], s.origin_x[:, 1]) + state.LANE_RADIUS
    s.lane_min_y = np.minimum(s.origin_y[:, 0], s.origin_y[:, 1]) - state.LANE_RADIUS
    s.lane_max_y = np.maximum(s.origin_y[:, 0], s.origin_y[:, 1]) + state.LANE_RADIUS


def test_defence_only_exploration_is_main_policy_only():
    eng = engine.Engine(
        64,
        FixedScores(),
        opponent_policy=FixedScores(),
        seed=20260731,
        epsilon=1.0,
        exploration_units=(schema.CHANNEL_DEFENCE,),
        exploration_policy_side=0)

    eng.step()
    record = eng._pending
    main_rows = np.arange(0, eng.n_fights * 2, 2)
    opponent_rows = np.arange(1, eng.n_fights * 2, 2)

    assert record.eligible[main_rows, schema.CHANNEL_DEFENCE].all()
    assert (record.eligible[main_rows].sum(axis=1) == 1).all()
    assert not record.eligible[opponent_rows].any()
    assert record.deviated[main_rows, schema.CHANNEL_DEFENCE].all()
    assert not record.deviated[opponent_rows].any()

    non_defence = np.arange(schema.CAUSAL_UNIT_COUNT) != schema.CHANNEL_DEFENCE
    np.testing.assert_array_equal(
        record.causal_actual[:, non_defence],
        record.causal_greedy[:, non_defence])
    np.testing.assert_array_equal(
        record.causal_actual[opponent_rows],
        record.causal_greedy[opponent_rows])

    expected = 1.0 / record.alternatives[
        main_rows, schema.CHANNEL_DEFENCE]
    np.testing.assert_allclose(
        record.causal_prob[main_rows, schema.CHANNEL_DEFENCE],
        expected,
        rtol=0.0,
        atol=0.0)
    assert (record.causal_prob[:, non_defence] == 1.0).all()
    assert (record.causal_prob[opponent_rows] == 1.0).all()


def test_main_all_exploration_scope_leaves_opponent_untouched():
    units, policy_side = generate.resolve_exploration_scope("main-all", 1)
    assert units == tuple(range(schema.CAUSAL_UNIT_COUNT))
    assert policy_side == 1

    eng = engine.Engine(
        64,
        FixedScores(),
        opponent_policy=FixedScores(),
        seed=20260803,
        epsilon=1.0,
        exploration_units=units,
        exploration_policy_side=policy_side)
    eng.step()
    record = eng._pending
    fixed_rows = np.arange(0, eng.n_fights * 2, 2)
    main_rows = np.arange(1, eng.n_fights * 2, 2)

    assert not record.eligible[fixed_rows].any()
    assert not record.deviated[fixed_rows].any()
    np.testing.assert_array_equal(
        record.causal_actual[fixed_rows],
        record.causal_greedy[fixed_rows])
    assert record.eligible[main_rows].any()
    assert record.deviated[main_rows].any()


def _scalar_optional_support(test_state, gear_pick):
    n = test_state.n_fights * 2
    unit_count = len(schema.OPTIONAL_GEAR_SLOTS)
    support = np.zeros((n, unit_count, schema.ACTION_COUNT), dtype=bool)
    virtual_none = np.zeros((n, unit_count), dtype=bool)
    equipped = actions._flat(test_state.equipped_ids)
    free_slots = actions._flat(test_state.inventory_free_slots)

    for fighter in range(n):
        base = [
            int(action) for action in gear_pick["ordered_actions"][fighter]
            if action >= schema.GEAR_BASE
        ]
        core = int(gear_pick["core_row"][fighter])
        for unit_index, slot in enumerate(schema.OPTIONAL_GEAR_SLOTS):
            unit = schema.CHANNEL_GEAR_BASE + unit_index
            if unit in schema.INACTIVE_CAUSAL_UNITS:
                continue
            greedy = int(gear_pick["unit_actions"][fighter, unit_index])
            if greedy >= schema.GEAR_BASE:
                without_greedy = [
                    action for action in base
                    if int(gear.DIRECT_GEAR_SLOTS[
                        action - schema.GEAR_BASE]) != slot
                ]
                virtual_none[fighter, unit_index] = (
                    actions._capacity_safe_optional_order(
                        equipped[fighter], free_slots[fighter],
                        without_greedy, core) is not None)

            for action in gear.GEAR_ROWS_BY_SLOT[int(slot)]:
                action = int(action)
                if action == greedy:
                    continue
                local = action - schema.GEAR_BASE
                if not gear_pick["candidate"][fighter, local]:
                    continue
                proposed = list(base)
                matching = [
                    index for index, existing in enumerate(proposed)
                    if int(gear.DIRECT_GEAR_SLOTS[
                        existing - schema.GEAR_BASE]) == slot
                ]
                if matching:
                    proposed[matching[0]] = action
                else:
                    proposed.append(action)
                if actions._capacity_safe_optional_order(
                        equipped[fighter], free_slots[fighter],
                        proposed, core) is not None:
                    support[fighter, unit_index, action] = True
    return support, virtual_none


def _scalar_combat_gear_feasible(test_state, gear_pick, core_rows):
    n = test_state.n_fights * 2
    result = np.zeros((n, schema.COMBAT_COUNT), dtype=bool)
    equipped = actions._flat(test_state.equipped_ids)
    free_slots = actions._flat(test_state.inventory_free_slots)
    has_weapon = core_rows >= schema.GEAR_BASE
    two_handed = np.zeros(schema.COMBAT_COUNT, dtype=bool)
    two_handed[has_weapon] = gear.DIRECT_GEAR_TWO_HANDED[
        core_rows[has_weapon] - schema.GEAR_BASE]

    for fighter in range(n):
        base = [
            int(action) for action in gear_pick["ordered_actions"][fighter]
            if action >= schema.GEAR_BASE
        ]
        for candidate, core in enumerate(core_rows):
            retained = [
                action for action in base
                if not (
                    has_weapon[candidate]
                    and int(gear.DIRECT_GEAR_SLOTS[
                        action - schema.GEAR_BASE]) == gear.SLOT_WEAPON)
                and not (
                    two_handed[candidate]
                    and int(gear.DIRECT_GEAR_SLOTS[
                        action - schema.GEAR_BASE]) == gear.SLOT_SHIELD)
            ]
            result[fighter, candidate] = (
                actions._capacity_safe_optional_order(
                    equipped[fighter], free_slots[fighter],
                    retained, int(core)) is not None)
    return result


def _random_gear_state(rng, n_fights):
    equipped = np.full(
        (n_fights, 2, gear.SLOT_COUNT), -1, dtype=np.int32)
    flat = equipped.reshape(n_fights * 2, gear.SLOT_COUNT)
    for slot in schema.OPTIONAL_GEAR_SLOTS:
        concrete = gear.DIRECT_GEAR_ITEMS[
            (gear.DIRECT_GEAR_SLOTS == slot)
            & ~gear.DIRECT_GEAR_UNEQUIP]
        choices = np.concatenate((np.array([-1], dtype=np.int32), concrete))
        flat[:, slot] = rng.choice(choices, size=flat.shape[0])
    free_slots = rng.integers(
        0, 5, size=(n_fights, 2), dtype=np.int32)
    return SimpleNamespace(
        n_fights=n_fights,
        equipped_ids=equipped,
        inventory_free_slots=free_slots)


def _scalar_select_optional_gear_greedy(scores, test_state, greedy_combat):
    """Pre-vectorization selector retained as an exact differential oracle."""
    n = scores.shape[0]
    equipped = actions._flat(test_state.equipped_ids)
    free_slots = actions._flat(
        test_state.inventory_free_slots).astype(np.int32)
    core_row = actions._core_weapon_row(greedy_combat)
    core_local = core_row - schema.GEAR_BASE
    core_valid = core_row >= schema.GEAR_BASE
    core_two_handed = np.zeros(n, dtype=bool)
    core_two_handed[core_valid] = gear.DIRECT_GEAR_TWO_HANDED[
        core_local[core_valid]]
    unit_actions = np.full(
        (n, len(schema.OPTIONAL_GEAR_SLOTS)), -1, dtype=np.int64)
    unit_scores = np.full(unit_actions.shape, -np.inf, dtype=np.float64)
    candidate = np.zeros((n, schema.GEAR_COUNT), dtype=bool)
    current_weapon_two_handed = np.isin(
        equipped[:, gear.SLOT_WEAPON],
        (gear.NOXIOUS_HALBERD.item_id, gear.GRANITE_MAUL.item_id))
    shield_worn = equipped[:, gear.SLOT_SHIELD] >= 0

    for local in range(schema.GEAR_COUNT):
        slot = int(gear.DIRECT_GEAR_SLOTS[local])
        if slot == gear.SLOT_AMMO:
            continue
        if gear.DIRECT_GEAR_UNEQUIP[local]:
            changing = (equipped[:, slot] >= 0) & (free_slots > 0)
        else:
            changing = (
                equipped[:, slot] != int(gear.DIRECT_GEAR_ITEMS[local]))
            if (slot == gear.SLOT_WEAPON
                    and gear.DIRECT_GEAR_TWO_HANDED[local]):
                changing &= ~shield_worn
            if slot == gear.SLOT_SHIELD:
                changing &= ~current_weapon_two_handed
        reserved = core_valid & (slot == gear.SLOT_WEAPON)
        reserved |= core_two_handed & (slot == gear.SLOT_SHIELD)
        candidate[:, local] = changing & ~reserved

    for unit_index, slot in enumerate(schema.OPTIONAL_GEAR_SLOTS):
        if (schema.CHANNEL_GEAR_BASE + unit_index
                in schema.INACTIVE_CAUSAL_UNITS):
            continue
        rows = gear.GEAR_ROWS_BY_SLOT[int(slot)]
        allowed = candidate[:, rows - schema.GEAR_BASE]
        slot_scores = np.where(allowed, scores[:, rows], -np.inf)
        best_local = np.argmax(slot_scores, axis=1)
        best_score = slot_scores[np.arange(n), best_local]
        use = best_score > 0.0
        unit_actions[:, unit_index] = np.where(
            use, rows[best_local], -1)
        unit_scores[:, unit_index] = np.where(
            use, best_score, -np.inf)

    ordered = np.full_like(unit_actions, -1)
    ordered_units = np.full_like(unit_actions, -1)
    for fighter in range(n):
        free = int(free_slots[fighter])
        core = int(core_row[fighter])
        if core >= schema.GEAR_BASE:
            local = core - schema.GEAR_BASE
            if (gear.DIRECT_GEAR_SLOTS[local] == gear.SLOT_WEAPON
                    and gear.DIRECT_GEAR_TWO_HANDED[local]
                    and equipped[fighter, gear.SLOT_SHIELD] >= 0):
                free -= 1
        ranking = np.argsort(-unit_scores[fighter], kind="stable")
        cross_safe = []
        kept_two_handed = False
        kept_shield = False
        for unit in ranking:
            action = int(unit_actions[fighter, unit])
            if action < schema.GEAR_BASE:
                continue
            local = action - schema.GEAR_BASE
            slot = int(gear.DIRECT_GEAR_SLOTS[local])
            two_handed = (
                slot == gear.SLOT_WEAPON
                and not gear.DIRECT_GEAR_UNEQUIP[local]
                and gear.DIRECT_GEAR_TWO_HANDED[local])
            shield = (
                slot == gear.SLOT_SHIELD
                and not gear.DIRECT_GEAR_UNEQUIP[local])
            if ((two_handed and kept_shield)
                    or (shield and kept_two_handed)):
                unit_actions[fighter, unit] = -1
                continue
            kept_two_handed |= two_handed
            kept_shield |= shield
            cross_safe.append(int(unit))

        execution = []
        for unequip_phase in (False, True):
            for unit in cross_safe:
                action = int(unit_actions[fighter, unit])
                if action < schema.GEAR_BASE:
                    continue
                local = action - schema.GEAR_BASE
                unequip = bool(gear.DIRECT_GEAR_UNEQUIP[local])
                if unequip != unequip_phase:
                    continue
                slot = int(gear.DIRECT_GEAR_SLOTS[local])
                delta = (
                    -1 if unequip
                    else (1 if equipped[fighter, slot] < 0 else 0))
                if free + delta < 0:
                    unit_actions[fighter, unit] = -1
                    continue
                free += delta
                execution.append((unit, action))
        for position, (unit, action) in enumerate(execution):
            ordered[fighter, position] = action
            ordered_units[fighter, position] = unit
    return {
        "unit_actions": unit_actions,
        "ordered_actions": ordered,
        "ordered_units": ordered_units,
        "core_row": core_row,
        "core_two_handed": core_two_handed,
        "candidate": candidate,
    }


def test_vectorized_gear_selector_matches_scalar_oracle_with_ties():
    for seed in range(8):
        rng = np.random.default_rng(seed + 8801)
        test_state = _random_gear_state(rng, n_fights=64)
        n = test_state.n_fights * 2
        scores = rng.normal(size=(n, schema.ACTION_COUNT))
        scores[::3, schema.GEAR_BASE:] = rng.integers(
            -1, 3, size=(scores[::3, schema.GEAR_BASE:].shape))
        greedy_combat = rng.integers(
            0, schema.COMBAT_COUNT, size=n, dtype=np.int64)
        expected = _scalar_select_optional_gear_greedy(
            scores, test_state, greedy_combat)
        actual = actions._select_optional_gear_greedy(
            scores, test_state, greedy_combat)
        for name in expected:
            np.testing.assert_array_equal(
                actual[name], expected[name],
                err_msg=f"seed={seed} field={name}")


def test_vectorized_gear_support_matches_scalar_java_phase_oracle():
    """Batch formulas preserve the prior exact per-candidate phase checks."""
    for seed in range(4):
        rng = np.random.default_rng(seed + 3301)
        test_state = _random_gear_state(rng, n_fights=48)
        n = test_state.n_fights * 2
        scores = rng.normal(size=(n, schema.ACTION_COUNT))
        # Include tied rows so the greedy pick still exercises stable argmax.
        scores[::7, schema.GEAR_BASE:] = 0.0
        greedy_combat = rng.integers(
            0, schema.COMBAT_COUNT, size=n, dtype=np.int64)
        gear_pick = actions._select_optional_gear_greedy(
            scores, test_state, greedy_combat)

        expected_support, expected_none = _scalar_optional_support(
            test_state, gear_pick)
        actual_support, actual_none = actions._optional_gear_alternative_support(
            test_state, gear_pick)
        np.testing.assert_array_equal(actual_support, expected_support)
        np.testing.assert_array_equal(actual_none, expected_none)

        core_rows = actions._core_weapon_row(
            np.arange(schema.COMBAT_COUNT, dtype=np.int64))
        expected_combat = _scalar_combat_gear_feasible(
            test_state, gear_pick, core_rows)
        actual_combat = actions._combat_optional_gear_feasible(
            test_state, gear_pick, core_rows)
        np.testing.assert_array_equal(actual_combat, expected_combat)


def test_spec_none_is_control_state_not_the_combat_action():
    """resolvedCombatModelAction returns the attack-head choice for SPEC_NONE."""
    actor = FixedScores(combat=schema.COMBAT_SPEC_NONE)
    eng = engine.Engine(32, actor, seed=3, epsilon=0.0)

    eng.step()
    record = eng._pending

    assert (record.legal_mask[:, schema.COMBAT_SPEC_NONE]).all(), (
        "SPEC_NONE should remain globally legal")
    assert not record.sampling_support[:, 0, schema.COMBAT_SPEC_NONE].any(), (
        "SPEC_NONE must not enter combat causal-unit support")
    assert (record.chosen["combat"] == schema.COMBAT_NO_ATTACK).all(), (
        "SPEC_NONE incorrectly replaced the attack-head decision")


def test_combat_support_drops_optional_weapon_only_for_reserved_slot():
    """A combat-owned weapon may replace, not conflict with, optional gear."""
    optional_vls = schema.GEAR_BASE + 17
    eng = engine.Engine(
        8,
        FixedScores(
            combat=schema.COMBAT_NO_ATTACK,
            gear_action=optional_vls),
        seed=31,
        epsilon=0.0)
    _set_lane(eng, distance=1)

    eng.step()
    support = eng._pending.sampling_support[:, schema.CHANNEL_COMBAT]

    for combat in (
            schema.COMBAT_ATTACK_BASE + schema.STYLE_MAGIC * 2,
            schema.COMBAT_ATTACK_BASE + schema.STYLE_RANGED * 2,
            schema.COMBAT_ATTACK_BASE + schema.STYLE_MELEE * 2):
        assert support[:, combat].all(), (
            f"combat action {combat} was rejected only because its reserved "
            "weapon slot had a greedy optional action")


def test_pair_planning_leash_blocks_outward_but_keeps_inward_move():
    """NhSelfPlayPairLeash uses its nine-tile staged planning reserve."""
    actor = FixedScores(movement=MOVE_WEST_TWO)
    eng = engine.Engine(24, actor, seed=4, epsilon=0.0)
    _set_lane(eng, distance=9)

    before = eng.state.x[:, 0].copy()
    eng.step()
    record = eng._pending
    side0 = np.arange(0, eng.n_fights * 2, 2)

    west = schema.MOVEMENT_BASE + MOVE_WEST_TWO
    east = schema.MOVEMENT_BASE + MOVE_EAST_TWO
    assert not record.legal_mask[side0, west].any()
    assert record.legal_mask[side0, east].all()
    assert (eng.state.x[:, 0] == before).all(), (
        "engine executed a movement that the pair planning leash rejected")


def test_java_start_distance_plan_drives_engine_openings():
    eng = engine.Engine(
        260,
        FixedScores(),
        seed=0,
        epsilon=0.0,
        start_distance_min=1,
        start_distance_max=8,
        world_id=31)
    distances = eng.state.distance()

    assert distances.min() == 1
    assert distances.max() == 8
    assert set(distances.tolist()) == set(range(1, 9))


def test_melee_spec_route_steps_in_fires_and_spends_energy_once():
    """A reachable Voidwaker command owns the route and is not an idle loop."""
    voidwaker_attack = (
        schema.COMBAT_SPEC_BASE
        + schema.SPEC_VOIDWAKER * 2
        + schema.ATTACK_INTENT_ATTACK)
    eng = engine.Engine(
        24, FixedScores(combat=voidwaker_attack), seed=9, epsilon=0.0)
    _set_lane(eng, distance=2)

    # Only side 0 selects the spec; side 1 holds.
    original_score = eng.policy.score

    def one_sided_score(inputs):
        scores, value = original_score(inputs)
        scores[1::2, schema.COMBAT_BASE + voidwaker_attack] = 0.0
        return scores, value

    eng.policy.score = one_sided_score
    eng.step()

    assert (eng.state.distance() == 1).all(), (
        "TargetRoute did not take the one step into melee range")
    assert (eng.state.special_energy[:, 0] == 500).all(), (
        "the selected Voidwaker special did not consume exactly one spec")
    assert (eng.state.voidwaker_specs_used[:, 0] == 1).all()
    assert (eng.state.voidwaker_specs_used[:, 1] == 0).all()


def test_off_tick_special_stays_active_until_a_weapon_switch_cancels_it():
    """PlayerCombat exposes the queued special across decision boundaries."""
    voidwaker_off_tick = (
        schema.COMBAT_SPEC_BASE
        + schema.SPEC_VOIDWAKER * 2
        + schema.ATTACK_INTENT_OFF_TICK)
    actor = FixedScores(combat=voidwaker_off_tick)
    eng = engine.Engine(12, actor, seed=12, epsilon=0.0)
    _set_lane(eng, distance=2)

    eng.step()
    assert (eng.state.active_spec_kind == schema.SPEC_VOIDWAKER).all()
    assert (eng.state.special_energy == state.MAX_SPECIAL_ENERGY).all()

    completed = eng.step()
    assert (completed.next_inputs[:, schema.INPUT_SELF_SPEC_ACTIVE] == 1.0).all()

    actor.combat = (
        schema.COMBAT_ATTACK_BASE
        + schema.STYLE_MAGIC * 2
        + schema.ATTACK_INTENT_ATTACK)
    eng.step()
    assert (eng.state.active_spec_kind == -1).all()


def test_optional_vls_setup_marker_is_exactly_one_tick():
    """State114 marks only the prior tick's real optional VLS preparation."""
    vls_gear_row = schema.GEAR_BASE + 17
    actor = FixedScores(gear_action=vls_gear_row)
    eng = engine.Engine(8, actor, seed=13, epsilon=0.0)
    initial = eng.flush()
    assert initial is None
    legal = actions.compute(eng.state, eng.gear_tables)
    opening_inputs = observation.build(eng.state, eng.gear_tables, legal)
    assert (opening_inputs[
        :, schema.INPUT_SELF_OPTIONAL_VLS_SETUP_PENDING] == 0.0).all()

    # _advance_timers runs before the decision, leaving the required one tick.
    eng.state.attack_delay[:] = 2

    eng.step()
    completed = eng.step()
    assert (completed.next_inputs[
        :, schema.INPUT_SELF_OPTIONAL_VLS_SETUP_PENDING] == 1.0).all()

    completed = eng.step()
    assert (completed.next_inputs[
        :, schema.INPUT_SELF_OPTIONAL_VLS_SETUP_PENDING] == 0.0).all()


def test_same_tick_style_switch_does_not_create_fake_attack_delay():
    """Direct gear is applied before combat and can attack on the same tick."""
    magic_attack = (
        schema.COMBAT_ATTACK_BASE
        + schema.STYLE_MAGIC * 2
        + schema.ATTACK_INTENT_ATTACK)
    eng = engine.Engine(
        16, FixedScores(combat=magic_attack), seed=10, epsilon=0.0)
    _set_lane(eng, distance=4)
    eng.state.style[:] = schema.STYLE_MELEE
    eng.state.weapon_id[:] = eng.gear_tables["weapon_id"][schema.STYLE_MELEE]

    eng.step()

    assert (eng.state.ticks_since_attack == 0).all(), (
        "same-tick style gear switch incorrectly delayed the attack")


def test_attack_hold_still_applies_the_java_magic_style_decision():
    """The Java attack head decodes HOLD with MAGIC as its desired style."""
    eng = engine.Engine(16, FixedScores(), seed=11, epsilon=0.0)
    _set_lane(eng, distance=4)
    eng.state.style[:] = schema.STYLE_RANGED
    eng.state.weapon_id[:] = eng.gear_tables["weapon_id"][schema.STYLE_RANGED]

    eng.step()

    assert (eng.state.style == schema.STYLE_MAGIC).all()
    assert (eng.state.weapon_id
            == eng.gear_tables["weapon_id"][schema.STYLE_MAGIC]).all()
    assert (eng.state.ticks_since_attack > 0).all(), (
        "HOLD unexpectedly launched an attack")


if __name__ == "__main__":
    failures = 0
    for name, function in sorted(globals().items()):
        if name.startswith("test_") and callable(function):
            try:
                function()
                print(f"  ok   {name}")
            except AssertionError as error:
                failures += 1
                print(f"  FAIL {name}: {error}")
    print("action composition:", "OK" if failures == 0 else f"{failures} FAILED")
    raise SystemExit(1 if failures else 0)
