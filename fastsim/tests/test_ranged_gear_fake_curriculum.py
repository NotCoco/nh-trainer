"""Focused coverage for the general Ranged gear-fake curriculum."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastsim import evaluation, gear, schema, scripted_policy  # noqa: E402


_HUMAN_FAKE_WEAPONS_FOR_TEST = (
    gear.ZURIELS_STAFF.item_id,
    gear.VESTAS_LONGSWORD.item_id,
    gear.VOIDWAKER.item_id,
    gear.NOXIOUS_HALBERD.item_id,
    gear.GRANITE_MAUL.item_id,
    gear.ZARYTE_CROSSBOW.item_id,
)


class _CloseThenHoldPassive(scripted_policy.ScriptedPolicy):
    def __init__(self):
        super().__init__("passive", defence="seeded-switching-protection")

    def score(self, inputs: np.ndarray):
        scores, values = super().score(inputs)
        scores[
            :,
            schema.MOVEMENT_BASE:
            schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT,
        ] = -100.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        rel_dx = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DX] * 16.0).astype(np.int16)
        rel_dy = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DY] * 16.0).astype(np.int16)
        distance = np.maximum(np.abs(rel_dx), np.abs(rel_dy))
        needs_close = distance > 1
        for local_action in range(
                schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT):
            dx, dy = schema.MOVEMENT_OFFSETS[local_action]
            remaining = np.maximum(
                np.abs(rel_dx - int(dx)),
                np.abs(rel_dy - int(dy)))
            improves = needs_close & (remaining < distance)
            scores[
                improves,
                schema.MOVEMENT_BASE + local_action,
            ] = 200.0 - remaining[improves]
        return scores, values


class _GearRollCaptureEngine(evaluation.EvaluationEngine):
    def __init__(self, *args, scripted_side: int, **kwargs):
        self.scripted_side = int(scripted_side)
        super().__init__(*args, **kwargs)
        self.rolls = [[] for _lane in range(self.n_fights)]
        self.equipment_at_rolls = [[] for _lane in range(self.n_fights)]
        self.weapon_by_tick = [dict() for _lane in range(self.n_fights)]
        self.position_by_tick = [dict() for _lane in range(self.n_fights)]
        self._defender_inputs = [[] for _lane in range(self.n_fights)]
        self.prayer_label_rows = [[] for _lane in range(self.n_fights)]

    def step(self):
        result = super().step()
        if result is not None:
            defender_side = 1 - self.scripted_side
            for lane in range(self.n_fights):
                row = lane * 2 + defender_side
                prior_inputs = self._defender_inputs[lane][-16:]
                attack_style_code = int(
                    result.roll_prayer_teacher_attack_style_code[row])
                if attack_style_code > 0:
                    self.prayer_label_rows[lane].append({
                        "attackStyleCode": attack_style_code,
                        "attackHistory": tuple(map(
                            int,
                            result.defence_prayer_attack_history_codes[row],
                        )),
                        "currentInput": result.inputs[row].copy(),
                        "priorInputs": tuple(
                            inputs.copy() for inputs in prior_inputs),
                    })
                self._defender_inputs[lane].append(
                    result.inputs[row].copy())
        for lane in range(self.n_fights):
            self.position_by_tick[lane][self.world_tick] = (
                int(self.state.x[lane, self.scripted_side]),
                int(self.state.y[lane, self.scripted_side]),
            )
        return result

    def _apply_direct_gear(self, combat_action, gear_pick):
        result = super()._apply_direct_gear(combat_action, gear_pick)
        weapons = np.asarray(self.state.weapon_id)[:, self.scripted_side]
        for lane, weapon_id in enumerate(weapons):
            self.weapon_by_tick[lane][self.world_tick] = int(weapon_id)
        return result

    def _book_roll_prayer(self, fired, attack_style, spec_kind=None):
        fired = np.asarray(fired, dtype=bool)
        attack_style = np.asarray(attack_style)
        for lane in np.flatnonzero(fired[:, self.scripted_side]):
            lane = int(lane)
            self.rolls[lane].append((
                int(self.world_tick),
                int(attack_style[lane, self.scripted_side]),
            ))
            self.equipment_at_rolls[lane].append(
                self.state.equipped_ids[lane, self.scripted_side].copy())
        return super()._book_roll_prayer(
            fired, attack_style, spec_kind=spec_kind)


def _run(
        script: str,
        *,
        scripted_side: int,
        seed: int,
        fights: int = 32,
        ticks: int = 320,
        distance_min: int = 1,
        distance_max: int = 8):
    pressure = scripted_policy.ScriptedPolicy(
        script,
        defence="seeded-switching-protection",
        seed=seed)
    passive = _CloseThenHoldPassive()
    policies = (
        (pressure, passive)
        if scripted_side == 0
        else (passive, pressure))
    runner = _GearRollCaptureEngine(
        n_fights=fights,
        policy=policies[0],
        opponent_policy=policies[1],
        scripted_side=scripted_side,
        subject_side=1 - scripted_side,
        seed=seed + 1000,
        replay_seed=seed + 2000,
        epsilon=0.0,
        max_ticks=ticks,
        start_distance_min=distance_min,
        start_distance_max=distance_max,
        world_id=35)
    starting_distances = np.maximum(
        np.abs(runner.state.x[:, 1] - runner.state.x[:, 0]),
        np.abs(runner.state.y[:, 1] - runner.state.y[:, 0]))
    runner.state.hp[:] = 10000
    for _tick in range(ticks):
        runner.step()
    return runner, starting_distances


def _decode_opponent_weapon(inputs: np.ndarray) -> int | None:
    candidates = (
        gear.ZURIELS_STAFF.item_id,
        gear.VESTAS_LONGSWORD.item_id,
        gear.ZARYTE_CROSSBOW.item_id,
    )
    actual_sin = float(inputs[schema.INPUT_OPP_WEAPON_SIN])
    actual_cos = float(inputs[schema.INPUT_OPP_WEAPON_COS])
    errors = {
        item_id: max(
            abs(actual_sin - np.sin(item_id * schema.WEAPON_EMBED_FREQ)),
            abs(actual_cos - np.cos(item_id * schema.WEAPON_EMBED_FREQ)),
        )
        for item_id in candidates
    }
    item_id = min(errors, key=errors.get)
    return item_id if errors[item_id] <= 1.0e-5 else None


def test_trainable_curriculum_keeps_rolls_ranged_while_gear_fakes_both_roles():
    seed = 8102
    fights = 32
    lanes = np.arange(fights, dtype=np.int64)
    prefix_lengths = (
        scripted_policy.ScriptedPolicy.seeded_ranged_fake_prefix_lengths(
            lanes, seed))
    assert set(map(int, prefix_lengths)) == set(range(5, 13))

    for scripted_side in (0, 1):
        randomized_runner, randomized_starts = _run(
            "seeded-three-style-then-ranged-gear-fakes",
            scripted_side=scripted_side,
            seed=seed)
        assert set(map(int, randomized_starts)) == set(range(1, 9))
        for lane, roll_events in enumerate(randomized_runner.rolls):
            prefix_length = int(prefix_lengths[lane])
            styles = [style for _tick, style in roll_events]
            assert styles[prefix_length:prefix_length + 12] == [
                schema.STYLE_RANGED,
            ] * 12

        runner, starting_distances = _run(
            "seeded-three-style-then-ranged-gear-fakes",
            scripted_side=scripted_side,
            seed=seed,
            distance_min=1,
            distance_max=1)
        assert set(map(int, starting_distances)) == {1}

        for lane, roll_events in enumerate(runner.rolls):
            prefix_length = int(prefix_lengths[lane])
            styles = [style for _tick, style in roll_events]
            assert set(styles[:prefix_length]) == {
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE,
            }
            assert styles[prefix_length:prefix_length + 12] == [
                schema.STYLE_RANGED,
            ] * 12

            terminal_rolls = roll_events[
                prefix_length:prefix_length + 5]
            assert len(terminal_rolls) == 5
            continuous_crossbow = (lane + seed * 5) % 4 == 0
            for (previous_tick, _), (roll_tick, _) in zip(
                    terminal_rolls, terminal_rolls[1:]):
                worn = runner.weapon_by_tick[lane]
                between = [
                    worn[tick]
                    for tick in range(previous_tick + 1, roll_tick)
                ]
                assert worn[roll_tick - 1] == gear.ZARYTE_CROSSBOW.item_id
                if continuous_crossbow:
                    assert set(between) == {gear.ZARYTE_CROSSBOW.item_id}
                else:
                    assert any(
                        weapon in (
                            gear.ZURIELS_STAFF.item_id,
                            gear.VESTAS_LONGSWORD.item_id)
                        for weapon in between)

        fake_weapons = {
            weapon
            for lane, worn in enumerate(runner.weapon_by_tick)
            if (lane + seed * 5) % 4 != 0
            for weapon in worn.values()
        }
        assert gear.ZURIELS_STAFF.item_id in fake_weapons
        assert gear.VESTAS_LONGSWORD.item_id in fake_weapons


def test_held_out_gear_flick_trace_is_exact_and_never_rollout_eligible():
    runner, _starting_distances = _run(
        "live-ranged-gear-flick-pressure",
        scripted_side=1,
        seed=8103,
        fights=4,
        ticks=220,
        distance_min=1,
        distance_max=1)
    expected_prefix = [
        schema.STYLE_MAGIC,
        schema.STYLE_MELEE,
        schema.STYLE_RANGED,
        schema.STYLE_MAGIC,
    ]
    for lane, roll_events in enumerate(runner.rolls):
        styles = [style for _tick, style in roll_events]
        assert styles[:4] == expected_prefix
        assert styles[4:14] == [schema.STYLE_RANGED] * 10

        terminal_rolls = roll_events[4:8]
        seen_fakes = set()
        for (previous_tick, _), (roll_tick, _) in zip(
                terminal_rolls, terminal_rolls[1:]):
            worn = runner.weapon_by_tick[lane]
            between = {
                worn[tick]
                for tick in range(previous_tick + 1, roll_tick)
            }
            assert between & {
                gear.ZURIELS_STAFF.item_id,
                gear.VESTAS_LONGSWORD.item_id,
            }
            seen_fakes.update(between)
            assert worn[roll_tick - 1] == gear.ZARYTE_CROSSBOW.item_id
        assert gear.ZURIELS_STAFF.item_id in seen_fakes
        assert gear.VESTAS_LONGSWORD.item_id in seen_fakes

    trainable = "seeded-three-style-then-ranged-gear-fakes"
    held_out = "live-ranged-gear-flick-pressure"
    assert trainable in scripted_policy.ROLLOUT_SCRIPT_NAMES
    assert held_out in scripted_policy.EVALUATION_ONLY_SCRIPT_NAMES
    assert held_out not in scripted_policy.ROLLOUT_SCRIPT_NAMES
    assert all(
        not name.startswith("live-")
        for name in scripted_policy.ROLLOUT_SCRIPT_NAMES)


def test_phase_balanced_curriculum_covers_exact_credited_cues_and_history():
    script = "seeded-ranged-phase-balanced-gear-fakes"
    seed = 17201
    required_weapons = {
        gear.ZURIELS_STAFF.item_id,
        gear.VESTAS_LONGSWORD.item_id,
        gear.ZARYTE_CROSSBOW.item_id,
    }
    assert script in scripted_policy.ROLLOUT_SCRIPT_NAMES
    assert script not in scripted_policy.EVALUATION_ONLY_SCRIPT_NAMES

    for scripted_side in (0, 1):
        cue_sequences = set()
        for distance_min, distance_max in ((1, 1), (1, 8)):
            runner, starting_distances = _run(
                script,
                scripted_side=scripted_side,
                seed=seed + scripted_side,
                fights=36,
                ticks=320,
                distance_min=distance_min,
                distance_max=distance_max)
            assert set(map(int, starting_distances)) == set(
                range(distance_min, distance_max + 1))

            prefix_lengths = (
                scripted_policy.ScriptedPolicy
                .seeded_ranged_fake_prefix_lengths(
                    np.arange(36, dtype=np.int64),
                    seed + scripted_side))
            for lane, roll_events in enumerate(runner.rolls):
                prefix_length = int(prefix_lengths[lane])
                styles = [style for _tick, style in roll_events]
                assert styles[prefix_length:prefix_length + 12] == [
                    schema.STYLE_RANGED,
                ] * 12

                root_rows = [
                    row for row in runner.prayer_label_rows[lane]
                    if row["attackStyleCode"] == 2
                    and row["attackHistory"] == (2, 2, 2)
                ]
                assert len(root_rows) >= 9
                current_cues = [
                    _decode_opponent_weapon(row["currentInput"])
                    for row in root_rows[:9]
                ]
                assert set(current_cues) == required_weapons
                assert all(current_cues.count(item_id) == 3
                           for item_id in required_weapons)
                cue_sequences.add(tuple(current_cues[:3]))

                for row in root_rows:
                    prior_weapons = {
                        _decode_opponent_weapon(inputs)
                        for inputs in row["priorInputs"]
                    }
                    assert required_weapons <= prior_weapons

        # Lane phase and direction produce all six permutations instead of one
        # fixed three-cue cadence that a history head could memorize.
        assert len(cue_sequences) == 6


def test_freeze_then_ranged_curriculum_yields_frozen_full_history_roots():
    script = "seeded-freeze-then-ranged-phase-balanced-gear-fakes"
    required_weapons = {
        gear.ZURIELS_STAFF.item_id,
        gear.VESTAS_LONGSWORD.item_id,
        gear.ZARYTE_CROSSBOW.item_id,
    }
    assert script in scripted_policy.ROLLOUT_SCRIPT_NAMES
    assert script not in scripted_policy.EVALUATION_ONLY_SCRIPT_NAMES

    for scripted_side in (0, 1):
        runner, starting_distances = _run(
            script,
            scripted_side=scripted_side,
            seed=17230 + scripted_side,
            fights=36,
            ticks=360,
            distance_min=1,
            distance_max=1)
        assert set(map(int, starting_distances)) == {1}
        cues = []
        for lane_rows in runner.prayer_label_rows:
            for row in lane_rows:
                if (
                        row["attackStyleCode"] != 2
                        or row["attackHistory"] != (2, 2, 2)
                        or row["currentInput"][schema.INPUT_SELF_FROZEN] < 0.5
                        or len(row["priorInputs"]) != 16):
                    continue
                prior_weapons = {
                    _decode_opponent_weapon(inputs)
                    for inputs in row["priorInputs"]
                }
                if not required_weapons <= prior_weapons:
                    continue
                cues.append(_decode_opponent_weapon(row["currentInput"]))
        assert len(cues) >= 60
        assert all(cues.count(item_id) >= 10 for item_id in required_weapons)


def test_multigear_movement_pressure_is_natural_and_split_disjoint():
    trainable = "seeded-ranged-multigear-movement-pressure"
    heldouts = (
        "heldout-ranged-multigear-movement-a",
        "heldout-ranged-multigear-movement-b",
    )
    fake_items = {
        gear.ZURIELS_STAFF.item_id,
        gear.VESTAS_LONGSWORD.item_id,
        gear.VOIDWAKER.item_id,
        gear.NOXIOUS_HALBERD.item_id,
    }
    assert trainable in scripted_policy.ROLLOUT_SCRIPT_NAMES
    for heldout in heldouts:
        assert heldout in scripted_policy.EVALUATION_ONLY_SCRIPT_NAMES
        assert heldout not in scripted_policy.ROLLOUT_SCRIPT_NAMES

    for script_index, script in enumerate((trainable, *heldouts)):
        for scripted_side in (0, 1):
            seed = 164100 + script_index * 100 + scripted_side
            runner, starts = _run(
                script,
                scripted_side=scripted_side,
                seed=seed,
                fights=32,
                ticks=360,
                distance_min=1,
                distance_max=8)
            assert set(map(int, starts)) == set(range(1, 9))
            seen_fakes = set()
            moved_lanes = 0
            for lane, roll_events in enumerate(runner.rolls):
                prefix_length = (
                    int(scripted_policy.ScriptedPolicy
                        .seeded_ranged_fake_prefix_lengths(
                            np.asarray([lane]), seed)[0])
                    if script == trainable
                    else (6 if script.endswith("-a") else 7))
                styles = [style for _tick, style in roll_events]
                terminal = roll_events[
                    prefix_length:prefix_length + 10]
                assert len(terminal) == 10
                assert styles[prefix_length:prefix_length + 10] == [
                    schema.STYLE_RANGED,
                ] * 10

                for (previous_tick, _), (roll_tick, _) in zip(
                        terminal, terminal[1:]):
                    worn = runner.weapon_by_tick[lane]
                    between = {
                        worn[tick]
                        for tick in range(previous_tick + 1, roll_tick)
                        if tick in worn
                    }
                    seen_fakes.update(between & fake_items)
                    assert worn[roll_tick - 1] == (
                        gear.ZARYTE_CROSSBOW.item_id)

                positions = runner.position_by_tick[lane]
                terminal_start_tick = terminal[0][0]
                terminal_end_tick = terminal[-1][0]
                terminal_positions = {
                    position
                    for tick, position in positions.items()
                    if terminal_start_tick <= tick <= terminal_end_tick
                }
                moved_lanes += len(terminal_positions) > 1

            assert seen_fakes == fake_items
            assert moved_lanes >= 16


def test_comprehensive_human_ranged_pressure_crosses_real_contexts():
    script = "seeded-comprehensive-human-ranged-pressure"
    assert script in scripted_policy.ROLLOUT_SCRIPT_NAMES
    assert script not in scripted_policy.EVALUATION_ONLY_SCRIPT_NAMES

    all_run_lengths = set()
    all_fake_weapons = set()
    all_ranged_armour = set()
    moved_then_stopped = 0
    always_stationary = 0
    for scripted_side in (0, 1):
        seed = 187100 + scripted_side
        runner, starts = _run(
            script,
            scripted_side=scripted_side,
            seed=seed,
            fights=64,
            ticks=520,
            distance_min=1,
            distance_max=8)
        assert set(map(int, starts)) == set(range(1, 9))

        for lane, roll_events in enumerate(runner.rolls):
            assert len(roll_events) >= 12
            styles = [style for _tick, style in roll_events]
            assert styles.count(schema.STYLE_RANGED) >= 6
            runs = []
            for style in styles:
                if runs and runs[-1][0] == style:
                    runs[-1] = (style, runs[-1][1] + 1)
                else:
                    runs.append((style, 1))
            all_run_lengths.update(
                length for style, length in runs
                if style == schema.STYLE_RANGED)

            for (previous_tick, _), (roll_tick, style) in zip(
                    roll_events, roll_events[1:]):
                if style != schema.STYLE_RANGED:
                    continue
                worn = runner.weapon_by_tick[lane]
                between = {
                    worn[tick]
                    for tick in range(previous_tick + 1, roll_tick)
                    if tick in worn
                }
                all_fake_weapons.update(
                    between & set(map(int, _HUMAN_FAKE_WEAPONS_FOR_TEST)))
                assert worn[roll_tick - 1] == gear.ZARYTE_CROSSBOW.item_id

            for (_tick, style), equipped in zip(
                    roll_events,
                    runner.equipment_at_rolls[lane],
                    strict=True):
                if style != schema.STYLE_RANGED:
                    continue
                all_ranged_armour.add((
                    int(equipped[gear.SLOT_CHEST]),
                    int(equipped[gear.SLOT_LEGS]),
                    int(equipped[gear.SLOT_SHIELD]),
                    int(equipped[gear.SLOT_HAT]),
                ))

            positions = runner.position_by_tick[lane]
            unique_early = {
                value for tick, value in positions.items() if tick <= 120}
            unique_late = {
                value for tick, value in positions.items() if tick >= 300}
            if len(unique_early) > 1 and len(unique_late) == 1:
                moved_then_stopped += 1
            if len(set(positions.values())) == 1:
                always_stationary += 1

    assert max(all_run_lengths) >= 12
    assert len(all_run_lengths) >= 8
    assert {
        gear.ZURIELS_STAFF.item_id,
        gear.VESTAS_LONGSWORD.item_id,
        gear.VOIDWAKER.item_id,
        gear.NOXIOUS_HALBERD.item_id,
        gear.GRANITE_MAUL.item_id,
    } <= all_fake_weapons
    assert len(all_ranged_armour) >= 12
    assert moved_then_stopped >= 2
    assert always_stationary >= 2


if __name__ == "__main__":
    test_trainable_curriculum_keeps_rolls_ranged_while_gear_fakes_both_roles()
    test_held_out_gear_flick_trace_is_exact_and_never_rollout_eligible()
    test_phase_balanced_curriculum_covers_exact_credited_cues_and_history()
    test_freeze_then_ranged_curriculum_yields_frozen_full_history_roots()
    test_multigear_movement_pressure_is_natural_and_split_disjoint()
    test_comprehensive_human_ranged_pressure_crosses_real_contexts()
