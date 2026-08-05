"""Focused coverage for the per-attack rapid style-switch cohort."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

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
        self.rolls = [[] for _lane in range(self.n_fights)]
        self._decision_weapon = self.state.weapon_id.copy()
        self._decision_switch_tick = self._weapon_switch_ticks.copy()

    def step(self):
        self._decision_weapon = self.state.weapon_id.copy()
        self._decision_switch_tick = self._weapon_switch_ticks.copy()
        return super().step()

    def _book_roll_prayer(self, fired, attack_style, spec_kind=None):
        fired = np.asarray(fired, dtype=bool)
        attack_style = np.asarray(attack_style)
        for lane in np.flatnonzero(fired[:, 1]):
            self.rolls[int(lane)].append({
                "tick": int(self.world_tick),
                "style": int(attack_style[lane, 1]),
                "weapon": int(self.state.weapon_id[lane, 1]),
                "decision_weapon": int(self._decision_weapon[lane, 1]),
                "decision_switch_tick": int(
                    self._decision_switch_tick[lane, 1]),
            })
        return super()._book_roll_prayer(
            fired, attack_style, spec_kind=spec_kind)


def test_seeded_rapid_switch_cycles_all_permutations_on_real_rolls():
    runner = _RollCaptureEngine(
        n_fights=6,
        policy=_StationaryPassive(),
        opponent_policy=scripted_policy.ScriptedPolicy(
            "seeded-rapid-switch", defence="seeded-protection", seed=0),
        subject_side=0,
        seed=4101,
        replay_seed=4102,
        epsilon=0.0,
        max_ticks=100,
        start_distance_min=1,
        start_distance_max=1,
        world_id=35)
    runner.state.hp[:, 0] = 10000

    for _tick in range(60):
        runner.step()

    expected_permutations = {
        tuple(permutation)
        for permutation in scripted_policy._BLOCK_STYLE_PERMUTATIONS
    }
    observed_permutations = set()
    item_by_style = {
        schema.STYLE_MAGIC: gear.ZURIELS_STAFF,
        schema.STYLE_RANGED: gear.ZARYTE_CROSSBOW,
        schema.STYLE_MELEE: gear.VESTAS_LONGSWORD,
    }
    cooldown_by_style = {
        schema.STYLE_MAGIC: 4,
        schema.STYLE_RANGED: gear.ZARYTE_CROSSBOW.attack_ticks - 1,
        schema.STYLE_MELEE: gear.NOXIOUS_HALBERD.attack_ticks,
    }
    for rolls in runner.rolls:
        assert len(rolls) >= 9
        styles = [roll["style"] for roll in rolls[:9]]
        observed_permutations.add(tuple(styles[:3]))
        assert styles[:3] * 3 == styles
        assert all(left != right for left, right in zip(styles, styles[1:]))
        assert {style: styles.count(style) for style in item_by_style} == {
            style: 3 for style in item_by_style
        }

        for roll in rolls[:9]:
            item = item_by_style[roll["style"]]
            assert roll["decision_weapon"] == item.item_id
            assert roll["decision_switch_tick"] <= roll["tick"] - 1
            expected_roll_weapon = (
                gear.NOXIOUS_HALBERD.item_id
                if roll["style"] == schema.STYLE_MELEE
                else item.item_id
            )
            assert roll["weapon"] == expected_roll_weapon
        for prior, current in zip(rolls[:8], rolls[1:9]):
            gap = current["tick"] - prior["tick"]
            cooldown = cooldown_by_style[prior["style"]]
            assert cooldown <= gap <= cooldown + 1

    assert observed_permutations == expected_permutations
