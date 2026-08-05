"""Focused coverage for the bounded freeze/step-out/halberd cohort."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastsim import evaluation, gear, schema, scripted_policy  # noqa: E402


MELEE_ATTACK = (
    schema.COMBAT_ATTACK_BASE
    + schema.STYLE_MELEE * 2
    + schema.ATTACK_INTENT_ATTACK)


def _selected(scores: np.ndarray, base: int, count: int) -> np.ndarray:
    return np.argmax(scores[:, base:base + count], axis=1)


def _show_halberd(inputs: np.ndarray) -> None:
    angle = gear.NOXIOUS_HALBERD.item_id * schema.WEAPON_EMBED_FREQ
    inputs[:, schema.INPUT_SELF_WEAPON_SIN] = np.sin(angle)
    inputs[:, schema.INPUT_SELF_WEAPON_COS] = np.cos(angle)


def test_seeded_mix_limits_curriculum_and_balances_protection_prayers():
    policy = scripted_policy.ScriptedPolicy(
        "freeze-stepout-halberd",
        defence="seeded-protection",
        seed=0)
    inputs = np.zeros((24, schema.INPUT_SIZE), dtype=np.float32)
    inputs[:, schema.INPUT_OPP_FROZEN] = 1.0
    inputs[:, schema.INPUT_TARGET_REL_DX] = 2.0 / 16.0

    scores, _values = policy.score(inputs)
    halberd_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.NOXIOUS_HALBERD.item_id)[0])
    halberd_lanes = (
        scores[1::2, schema.GEAR_BASE + halberd_local] == 100.0)
    prayers = _selected(
        scores, schema.DEFENCE_BASE, schema.DEFENCE_COUNT)[1::2]

    assert np.array_equal(
        halberd_lanes,
        np.array([True] * 6 + [False] * 6))
    assert np.array_equal(
        prayers,
        np.tile(np.array([
            schema.PRAY_PROTECT_MAGIC,
            schema.PRAY_PROTECT_MISSILES,
            schema.PRAY_PROTECT_MELEE,
        ]), 4))


@pytest.mark.parametrize("attacker_frozen", [False, True])
@pytest.mark.parametrize("distance", range(6))
def test_route_variant_scores_every_exact_boundary(
        attacker_frozen: bool, distance: int):
    policy = scripted_policy.ScriptedPolicy(
        "freeze-stepout-halberd", seed=3)
    inputs = np.zeros((2, schema.INPUT_SIZE), dtype=np.float32)
    inputs[:, schema.INPUT_OPP_FROZEN] = 1.0
    inputs[:, schema.INPUT_SELF_FROZEN] = float(attacker_frozen)
    inputs[:, schema.INPUT_TARGET_REL_DX] = distance / 16.0
    inputs[:, schema.INPUT_SELF_ATTACK_READY] = 1.0
    _show_halberd(inputs)

    # One full prior decision must already have exposed the weapon.
    policy.score(inputs)
    scores, _values = policy.score(inputs)
    combat = _selected(scores, 0, schema.COMBAT_SPEC_NONE)[1]
    movement = _selected(
        scores, schema.MOVEMENT_BASE, schema.MOVEMENT_COUNT)[1]

    expected_attack = (
        distance == 2 if attacker_frozen else distance in (3, 4))
    assert (combat == MELEE_ATTACK) == expected_attack
    if attacker_frozen or expected_attack:
        assert movement == schema.MOVE_NONE
    else:
        assert movement >= schema.MOVE_OFFSET_BASE
        dx, dy = schema.MOVEMENT_OFFSETS[movement]
        remaining = max(abs(distance - int(dx)), abs(int(dy)))
        assert abs(remaining - 4) < abs(distance - 4)


class _RollCaptureEngine(evaluation.EvaluationEngine):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.rolls: list[dict] = []
        self.decision_distances: list[int] = []

    def step(self):
        self.decision_distances.append(int(self.state.distance()[0]))
        return super().step()

    def _book_roll_prayer(self, fired, attack_style, spec_kind=None):
        fired = np.asarray(fired, dtype=bool)
        attack_style = np.asarray(attack_style)
        if fired[0, 1]:
            self.rolls.append({
                "tick": self.world_tick,
                "style": int(attack_style[0, 1]),
                "weapon": int(self.state.weapon_id[0, 1]),
                "decision_distance": self.decision_distances[-1],
                "roll_distance": int(self.state.distance()[0]),
                "target_freeze": int(self.state.freeze_ticks[0, 0]),
                "attacker_freeze": int(self.state.freeze_ticks[0, 1]),
                "weapon_switch_tick": int(self._weapon_switch_ticks[0, 1]),
            })
        return super()._book_roll_prayer(
            fired, attack_style, spec_kind=spec_kind)


def _capture_engine(
        opponent_policy,
        *,
        distance: int,
        attacker_frozen: bool = False,
        target_frozen: bool = False,
        staged_target_frozen: bool = False,
        seed: int = 0) -> _RollCaptureEngine:
    runner = _RollCaptureEngine(
        n_fights=1,
        policy=scripted_policy.ScriptedPolicy("passive", defence="magic"),
        opponent_policy=opponent_policy,
        subject_side=0,
        seed=seed,
        replay_seed=9000 + seed,
        epsilon=0.0,
        max_ticks=160,
        start_distance_min=1,
        start_distance_max=1,
        world_id=35)
    state = runner.state
    left = int(state.lane_min_x[0]) + 1
    middle_y = (int(state.lane_min_y[0]) + int(state.lane_max_y[0])) // 2
    state.x[0] = (left, left + distance)
    state.y[0] = (middle_y, middle_y)
    state.prev_x[:] = state.x
    state.prev_y[:] = state.y
    state.lock_ticks[:] = 0
    state.attack_delay[:] = 0
    state.hp[0, 0] = 1000
    state.freeze_ticks[0, 0] = 40 if target_frozen else 0
    state.freeze_ticks[0, 1] = 40 if attacker_frozen else 0
    state.seen_opp_frozen[0, 1] = staged_target_frozen
    state.seen_opp_freeze_ticks[0, 1] = (
        40 if staged_target_frozen else 0)
    return runner


def _pre_equip(runner: _RollCaptureEngine, item: gear.Item) -> None:
    state = runner.state
    state.equipped_ids[0, 1, gear.SLOT_WEAPON] = item.item_id
    state.weapon_id[0, 1] = item.item_id
    if item.two_handed:
        state.equipped_ids[0, 1, gear.SLOT_SHIELD] = -1
        state.has_shield[0, 1] = False


@pytest.mark.parametrize(
    ("item", "script", "attacker_frozen", "expected"),
    [
        (gear.NOXIOUS_HALBERD, "fixed-halberd", False, {0, 1, 2, 3, 4}),
        (gear.NOXIOUS_HALBERD, "fixed-halberd", True, {1, 2}),
        (gear.VESTAS_LONGSWORD, "vls-pressure", False, {0, 1, 2, 3}),
        (gear.VESTAS_LONGSWORD, "vls-pressure", True, {1}),
    ])
def test_actual_melee_roll_boundaries_match_weapon_reach_and_route_drag(
        item: gear.Item,
        script: str,
        attacker_frozen: bool,
        expected: set[int]):
    observed = set()
    for distance in range(6):
        runner = _capture_engine(
            scripted_policy.ScriptedPolicy(script, defence="magic"),
            distance=distance,
            attacker_frozen=attacker_frozen,
            target_frozen=True)
        _pre_equip(runner, item)
        runner.step()
        if any(roll["style"] == schema.STYLE_MELEE
               for roll in runner.rolls):
            observed.add(distance)
    assert observed == expected


@pytest.mark.parametrize("start_distance", [0, 1, 2])
def test_unfrozen_route_variant_steps_out_then_drags_in_for_real_roll(
        start_distance: int):
    runner = _capture_engine(
        scripted_policy.ScriptedPolicy(
            "freeze-stepout-halberd",
            defence="seeded-protection",
            seed=3),
        distance=start_distance,
        target_frozen=True,
        staged_target_frozen=True)

    for _tick in range(10):
        runner.step()
        halberd_rolls = [
            roll for roll in runner.rolls
            if roll["weapon"] == gear.NOXIOUS_HALBERD.item_id]
        if halberd_rolls:
            break

    assert any(distance in (3, 4)
               for distance in runner.decision_distances)
    roll = halberd_rolls[0]
    assert roll["decision_distance"] in (3, 4)
    assert roll["roll_distance"] == 2
    assert roll["target_freeze"] > 0
    assert roll["weapon_switch_tick"] <= roll["tick"] - 1


def test_script_can_still_roll_from_two_while_it_is_frozen():
    runner = _capture_engine(
        scripted_policy.ScriptedPolicy(
            "freeze-stepout-halberd",
            defence="seeded-protection",
            seed=3),
        distance=2,
        attacker_frozen=True,
        target_frozen=True,
        staged_target_frozen=True)

    for _tick in range(10):
        runner.step()
        halberd_rolls = [
            roll for roll in runner.rolls
            if roll["weapon"] == gear.NOXIOUS_HALBERD.item_id]
        if halberd_rolls:
            break

    roll = halberd_rolls[0]
    assert roll["decision_distance"] == 2
    assert roll["roll_distance"] == 2
    assert roll["attacker_freeze"] > 0
    assert roll["target_freeze"] > 0


def test_script_freezes_then_repeats_visible_halberd_rolls_every_seven_ticks():
    runner = _RollCaptureEngine(
        n_fights=1,
        policy=scripted_policy.ScriptedPolicy("passive", defence="magic"),
        opponent_policy=scripted_policy.ScriptedPolicy(
            "freeze-stepout-halberd",
            defence="seeded-protection",
            seed=0),
        subject_side=0,
        seed=0,
        replay_seed=9000,
        epsilon=0.0,
        max_ticks=160,
        start_distance_min=2,
        start_distance_max=2,
        world_id=35)
    runner.state.hp[0, 0] = 1000

    for _tick in range(25):
        runner.step()
    halberd_rolls = [
        roll for roll in runner.rolls
        if roll["weapon"] == gear.NOXIOUS_HALBERD.item_id]

    assert len(halberd_rolls) >= 3
    assert np.diff([roll["tick"] for roll in halberd_rolls[:3]]).tolist() == [
        gear.NOXIOUS_HALBERD.attack_ticks,
        gear.NOXIOUS_HALBERD.attack_ticks,
    ]
    assert all(roll["target_freeze"] > 0 for roll in halberd_rolls[:3])
    assert all(roll["decision_distance"] == 2 for roll in halberd_rolls[:3])
    assert all(
        roll["weapon_switch_tick"] <= roll["tick"] - 1
        for roll in halberd_rolls[:3])
