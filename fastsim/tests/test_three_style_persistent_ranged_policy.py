"""Coverage for the varied three-style into persistent-Ranged curriculum."""

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
            lane = int(lane)
            self.rolls[lane].append({
                "tick": int(self.world_tick),
                "style": int(attack_style[lane, 1]),
                "weapon": int(self.state.weapon_id[lane, 1]),
                "decision_weapon": int(self._decision_weapon[lane, 1]),
                "decision_switch_tick": int(
                    self._decision_switch_tick[lane, 1]),
            })
        return super()._book_roll_prayer(
            fired, attack_style, spec_kind=spec_kind)


def _run(*, fights: int, seed: int, ticks: int = 180):
    runner = _RollCaptureEngine(
        n_fights=fights,
        policy=_StationaryPassive(),
        opponent_policy=scripted_policy.ScriptedPolicy(
            "seeded-three-style-prefix-then-persistent-ranged",
            defence="seeded-protection",
            seed=seed),
        subject_side=0,
        seed=seed + 1000,
        replay_seed=seed + 2000,
        epsilon=0.0,
        max_ticks=ticks,
        start_distance_min=1,
        start_distance_max=1,
        world_id=35)
    runner.state.hp[:, 0] = 10000
    for _tick in range(ticks):
        runner.step()
    return runner


def test_varied_three_style_prefixes_cover_close_human_like_histories():
    seed = 7461
    fights = 32
    runner = _run(fights=fights, seed=seed)
    templates = scripted_policy._THREE_STYLE_PERSISTENT_RANGED_PREFIXES
    lengths = scripted_policy._THREE_STYLE_PERSISTENT_RANGED_PREFIX_LENGTHS
    expected_prefixes = set()
    observed_extra_gaps = set()
    human_like_transition_lanes = 0
    cooldown_by_style = {
        schema.STYLE_MAGIC: 4,
        schema.STYLE_RANGED: gear.ZARYTE_CROSSBOW.attack_ticks - 1,
        schema.STYLE_MELEE: gear.NOXIOUS_HALBERD.attack_ticks,
    }
    item_by_style = {
        schema.STYLE_MAGIC: gear.ZURIELS_STAFF.item_id,
        schema.STYLE_RANGED: gear.ZARYTE_CROSSBOW.item_id,
        schema.STYLE_MELEE: gear.NOXIOUS_HALBERD.item_id,
    }

    for lane, rolls in enumerate(runner.rolls):
        family = (lane + seed * 3) % templates.shape[0]
        length = int(lengths[family])
        expected = tuple(int(style) for style in templates[family, :length])
        expected_prefixes.add(expected)
        assert schema.STYLE_MAGIC in expected
        assert schema.STYLE_MELEE in expected
        assert length >= 3
        assert expected[-2:] != (schema.STYLE_MAGIC, schema.STYLE_MELEE)
        assert len(rolls) >= length + 8
        assert tuple(roll["style"] for roll in rolls[:length]) == expected
        assert all(
            roll["style"] == schema.STYLE_RANGED
            for roll in rolls[length:length + 8])
        triples = tuple(zip(expected, expected[1:], expected[2:]))
        if (
                schema.STYLE_MAGIC,
                schema.STYLE_MELEE,
                schema.STYLE_RANGED,
        ) in triples:
            human_like_transition_lanes += 1
        for roll in rolls:
            assert roll["weapon"] == item_by_style[roll["style"]]
            assert roll["decision_weapon"] == item_by_style[roll["style"]]
            assert roll["decision_switch_tick"] <= roll["tick"] - 1
        for prior, current in zip(rolls, rolls[1:]):
            observed_extra_gaps.add(
                current["tick"] - prior["tick"]
                - cooldown_by_style[prior["style"]])

    assert expected_prefixes == {
        tuple(int(style) for style in templates[index, :int(lengths[index])])
        for index in range(templates.shape[0])
    }
    assert human_like_transition_lanes == 12
    assert {0, 1, 2, 3}.issubset(observed_extra_gaps)


def test_exact_live_reproduction_is_not_available_to_rollout_generation():
    assert (
        "seeded-three-style-prefix-then-persistent-ranged"
        in scripted_policy.ROLLOUT_SCRIPT_NAMES)
    assert (
        "live-magic-melee-then-persistent-ranged"
        in scripted_policy.EVALUATION_ONLY_SCRIPT_NAMES)
    assert (
        "live-magic-melee-then-persistent-ranged"
        not in scripted_policy.ROLLOUT_SCRIPT_NAMES)


def test_seeded_switching_protection_is_varied_and_attack_independent():
    count = 24
    inputs = np.zeros((count, schema.INPUT_SIZE), dtype=np.float32)
    inputs[:, schema.INPUT_SELF_ATTACK_READY] = 1.0
    policy = scripted_policy.ScriptedPolicy(
        "seeded-three-style-prefix-then-persistent-ranged",
        defence="seeded-switching-protection",
        seed=7462)
    seen = [set() for _row in range(count)]
    attack_rows = []
    for _tick in range(40):
        scores, _values = policy.score(inputs)
        defence = np.argmax(
            scores[
                :,
                schema.DEFENCE_BASE:
                schema.DEFENCE_BASE + schema.DEFENCE_COUNT,
            ],
            axis=1)
        for row, prayer in enumerate(defence):
            seen[row].add(int(prayer))
        attack_rows.append(np.argmax(
            scores[
                :,
                schema.COMBAT_BASE:
                schema.COMBAT_BASE + schema.COMBAT_COUNT,
            ],
            axis=1))
    assert all(prayers == {
        schema.PRAY_PROTECT_MAGIC,
        schema.PRAY_PROTECT_MISSILES,
        schema.PRAY_PROTECT_MELEE,
    } for prayers in seen)

    static_policy = scripted_policy.ScriptedPolicy(
        "seeded-three-style-prefix-then-persistent-ranged",
        defence="seeded-protection",
        seed=7462)
    for dynamic_attack in attack_rows[:8]:
        static_scores, _values = static_policy.score(inputs)
        static_attack = np.argmax(
            static_scores[
                :,
                schema.COMBAT_BASE:
                schema.COMBAT_BASE + schema.COMBAT_COUNT,
            ],
            axis=1)
        np.testing.assert_array_equal(dynamic_attack, static_attack)


if __name__ == "__main__":
    test_varied_three_style_prefixes_cover_close_human_like_histories()
    test_exact_live_reproduction_is_not_available_to_rollout_generation()
    test_seeded_switching_protection_is_varied_and_attack_independent()
