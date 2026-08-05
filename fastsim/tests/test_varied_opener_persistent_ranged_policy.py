"""Focused coverage for the human mixed-opener into ranged-hold cohort."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from evaluate_fixed_attack import ATTACK_SCRIPT_BY_CHOICE  # noqa: E402
from fastsim import evaluation, gear, schema, scripted_policy  # noqa: E402


class _StationaryPassive(scripted_policy.ScriptedPolicy):
    def __init__(self):
        super().__init__("passive", defence="magic")

    def score(self, inputs: np.ndarray):
        scores, values = super().score(inputs)
        scores[
            :,
            schema.MOVEMENT_BASE:
            schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT,
        ] = -100.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        return scores, values


class _RollCaptureEngine(evaluation.EvaluationEngine):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.rolls = []
        self._decision_weapon = self.state.weapon_id.copy()
        self._subject_seen_weapon = self.state.seen_opp_weapon_id.copy()
        self._decision_switch_tick = self._weapon_switch_ticks.copy()

    def step(self):
        self._decision_weapon = self.state.weapon_id.copy()
        self._subject_seen_weapon = self.state.seen_opp_weapon_id.copy()
        self._decision_switch_tick = self._weapon_switch_ticks.copy()
        return super().step()

    def _book_roll_prayer(self, fired, attack_style, spec_kind=None):
        fired = np.asarray(fired, dtype=bool)
        attack_style = np.asarray(attack_style)
        if fired[0, 1]:
            dx = abs(int(self.state.x[0, 0]) - int(self.state.x[0, 1]))
            dy = abs(int(self.state.y[0, 0]) - int(self.state.y[0, 1]))
            self.rolls.append({
                "tick": int(self.world_tick),
                "style": int(attack_style[0, 1]),
                "weapon": int(self.state.weapon_id[0, 1]),
                "decision_weapon": int(self._decision_weapon[0, 1]),
                "subject_seen_weapon": int(
                    self._subject_seen_weapon[0, 0]),
                "decision_switch_tick": int(
                    self._decision_switch_tick[0, 1]),
                "distance": max(dx, dy),
            })
        return super()._book_roll_prayer(
            fired, attack_style, spec_kind=spec_kind)


class _BalancedRollCaptureEngine(evaluation.EvaluationEngine):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.rolls = [[] for _lane in range(self.n_fights)]
        self._decision_weapon = self.state.weapon_id.copy()
        self._subject_seen_weapon = self.state.seen_opp_weapon_id.copy()
        self._decision_switch_tick = self._weapon_switch_ticks.copy()

    def step(self):
        self._decision_weapon = self.state.weapon_id.copy()
        self._subject_seen_weapon = self.state.seen_opp_weapon_id.copy()
        self._decision_switch_tick = self._weapon_switch_ticks.copy()
        return super().step()

    def _book_roll_prayer(self, fired, attack_style, spec_kind=None):
        fired = np.asarray(fired, dtype=bool)
        attack_style = np.asarray(attack_style)
        for lane in np.flatnonzero(fired[:, 1]):
            lane = int(lane)
            dx = abs(
                int(self.state.x[lane, 0])
                - int(self.state.x[lane, 1]))
            dy = abs(
                int(self.state.y[lane, 0])
                - int(self.state.y[lane, 1]))
            self.rolls[lane].append({
                "tick": int(self.world_tick),
                "style": int(attack_style[lane, 1]),
                "weapon": int(self.state.weapon_id[lane, 1]),
                "decision_weapon": int(
                    self._decision_weapon[lane, 1]),
                "subject_seen_weapon": int(
                    self._subject_seen_weapon[lane, 0]),
                "decision_switch_tick": int(
                    self._decision_switch_tick[lane, 1]),
                "distance": max(dx, dy),
            })
        return super()._book_roll_prayer(
            fired, attack_style, spec_kind=spec_kind)


def test_varied_opener_transitions_to_persistent_visible_ranged():
    runner = _RollCaptureEngine(
        n_fights=1,
        policy=_StationaryPassive(),
        opponent_policy=scripted_policy.ScriptedPolicy(
            "varied-opener-then-persistent-ranged",
            defence="seeded-protection",
            seed=0),
        subject_side=0,
        seed=4201,
        replay_seed=4202,
        epsilon=0.0,
        max_ticks=160,
        start_distance_min=2,
        start_distance_max=2,
        world_id=35)
    runner.state.hp[:, 0] = 10000

    for _tick in range(120):
        runner.step()

    expected_opener = [
        schema.STYLE_RANGED,
        schema.STYLE_MAGIC,
        schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
        schema.STYLE_MELEE,
        schema.STYLE_MELEE,
        schema.STYLE_RANGED,
        schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
        schema.STYLE_MELEE,
    ]
    assert len(runner.rolls) >= 16
    assert [roll["style"] for roll in runner.rolls[:10]] == expected_opener
    assert all(
        roll["style"] == schema.STYLE_RANGED
        for roll in runner.rolls[10:16])

    item_by_style = {
        schema.STYLE_MAGIC: gear.ZURIELS_STAFF.item_id,
        schema.STYLE_RANGED: gear.ZARYTE_CROSSBOW.item_id,
        schema.STYLE_MELEE: gear.NOXIOUS_HALBERD.item_id,
    }
    for roll in runner.rolls[:16]:
        expected_weapon = item_by_style[roll["style"]]
        assert roll["weapon"] == expected_weapon
        assert roll["decision_weapon"] == expected_weapon
        assert roll["subject_seen_weapon"] == expected_weapon
        assert roll["decision_switch_tick"] <= roll["tick"] - 1

    melee_rolls = [
        roll for roll in runner.rolls[:10]
        if roll["style"] == schema.STYLE_MELEE
    ]
    assert melee_rolls
    assert all(1 <= roll["distance"] <= 2 for roll in melee_rolls)
    assert all(1 <= roll["distance"] <= 2 for roll in runner.rolls[10:16])


def test_balanced_terminal_styles_are_equal_visible_and_persistent():
    runner = _BalancedRollCaptureEngine(
        n_fights=9,
        policy=_StationaryPassive(),
        opponent_policy=scripted_policy.ScriptedPolicy(
            "varied-opener-then-persistent-balanced",
            defence="seeded-protection",
            seed=0),
        subject_side=0,
        seed=4301,
        replay_seed=4302,
        epsilon=0.0,
        max_ticks=300,
        start_distance_min=6,
        start_distance_max=6,
        world_id=35)
    runner.state.hp[:, 0] = 10000

    for _tick in range(260):
        runner.step()

    expected_opener = [
        schema.STYLE_RANGED,
        schema.STYLE_MAGIC,
        schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
        schema.STYLE_MELEE,
        schema.STYLE_MELEE,
        schema.STYLE_RANGED,
        schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
        schema.STYLE_MELEE,
    ]
    expected_terminal = [
        schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
        schema.STYLE_MELEE,
    ] * 3
    item_by_style = {
        schema.STYLE_MAGIC: gear.ZURIELS_STAFF.item_id,
        schema.STYLE_RANGED: gear.ZARYTE_CROSSBOW.item_id,
        schema.STYLE_MELEE: gear.NOXIOUS_HALBERD.item_id,
    }

    for lane, rolls in enumerate(runner.rolls):
        assert len(rolls) >= 30
        assert [roll["style"] for roll in rolls[:10]] == expected_opener
        assert all(
            roll["style"] == expected_terminal[lane]
            for roll in rolls[10:30])
        for roll in rolls[:30]:
            expected_weapon = item_by_style[roll["style"]]
            assert roll["weapon"] == expected_weapon
            assert roll["decision_weapon"] == expected_weapon
            assert roll["subject_seen_weapon"] == expected_weapon
            assert roll["decision_switch_tick"] <= roll["tick"] - 1
        assert all(1 <= roll["distance"] <= 2 for roll in rolls[10:30])

    observed_terminal = [
        rolls[10]["style"] for rolls in runner.rolls]
    assert {
        style: observed_terminal.count(style)
        for style in set(observed_terminal)
    } == {
        schema.STYLE_MAGIC: 3,
        schema.STYLE_RANGED: 3,
        schema.STYLE_MELEE: 3,
    }


def test_evaluator_exposes_exact_and_balanced_persistent_choices():
    assert ATTACK_SCRIPT_BY_CHOICE[
        "varied-opener-then-persistent-ranged"
    ] == "varied-opener-then-persistent-ranged"
    assert ATTACK_SCRIPT_BY_CHOICE[
        "varied-opener-then-persistent-balanced"
    ] == "varied-opener-then-persistent-balanced"
