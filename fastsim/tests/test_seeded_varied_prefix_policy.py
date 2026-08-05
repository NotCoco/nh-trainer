"""Coverage for structurally varied persistent-style curricula."""

from __future__ import annotations

import sys
from itertools import product
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
                "decision_switch_tick": int(
                    self._decision_switch_tick[lane, 1]),
                "distance": max(dx, dy),
            })
        return super()._book_roll_prayer(
            fired, attack_style, spec_kind=spec_kind)


def _run(script: str, *, fights: int, seed: int, distance: int, ticks: int):
    runner = _RollCaptureEngine(
        n_fights=fights,
        policy=_StationaryPassive(),
        opponent_policy=scripted_policy.ScriptedPolicy(
            script, defence="seeded-protection", seed=seed),
        subject_side=0,
        seed=seed + 1000,
        replay_seed=seed + 2000,
        epsilon=0.0,
        max_ticks=ticks,
        start_distance_min=distance,
        start_distance_max=distance,
        world_id=35)
    runner.state.hp[:, 0] = 10000
    for _tick in range(ticks):
        runner.step()
    return runner


def _generic_prefix_style(
        lane: int, position: int, seed: int, style_count: int = 2) -> int:
    policy = scripted_policy.ScriptedPolicy(
        "seeded-varied-prefix-then-persistent-ranged",
        seed=seed)
    return int(policy._keyed_choice_indices(
        np.asarray([lane], dtype=np.int64),
        np.asarray([position], dtype=np.int64),
        style_count)[0])


def test_seeded_prefix_lengths_styles_pauses_and_terminal_ranged_vary():
    fights = 33
    seed = 7401
    runner = _run(
        "seeded-varied-prefix-then-persistent-ranged",
        fights=fights,
        seed=seed,
        distance=3,
        ticks=180)
    item_by_style = {
        schema.STYLE_MAGIC: gear.ZURIELS_STAFF.item_id,
        schema.STYLE_RANGED: gear.ZARYTE_CROSSBOW.item_id,
        schema.STYLE_MELEE: gear.NOXIOUS_HALBERD.item_id,
    }
    prefix_lengths = [
        (lane + seed * 5) % 11
        for lane in range(fights)
    ]
    assert set(prefix_lengths) == set(range(11))

    observed_extra_gaps = set()
    observed_prefixes = set()
    cooldown_by_style = {
        schema.STYLE_MAGIC: 4,
        schema.STYLE_RANGED: gear.ZARYTE_CROSSBOW.attack_ticks - 1,
        schema.STYLE_MELEE: gear.NOXIOUS_HALBERD.attack_ticks,
    }
    for lane, rolls in enumerate(runner.rolls):
        assert len(rolls) >= prefix_lengths[lane] + 8
        expected_prefix = tuple(
            _generic_prefix_style(lane, position, seed)
            for position in range(prefix_lengths[lane]))
        observed_prefixes.add(expected_prefix)
        assert tuple(
            roll["style"]
            for roll in rolls[:prefix_lengths[lane]]
        ) == expected_prefix
        assert all(
            roll["style"] == schema.STYLE_RANGED
            for roll in rolls[prefix_lengths[lane]:])
        for roll in rolls:
            expected_weapon = item_by_style[roll["style"]]
            assert roll["weapon"] == expected_weapon
            assert roll["decision_weapon"] == expected_weapon
            assert roll["decision_switch_tick"] <= roll["tick"] - 1
        for prior, current in zip(rolls, rolls[1:]):
            ordinary_gap = cooldown_by_style[prior["style"]]
            assert current["tick"] - prior["tick"] >= ordinary_gap
            observed_extra_gaps.add(
                current["tick"] - prior["tick"] - ordinary_gap)

    assert len(observed_prefixes) >= 20
    assert {0, 1, 2, 3}.issubset(observed_extra_gaps)


def test_training_seeds_cover_every_four_attack_magic_ranged_prefix():
    observed = set()
    for seed in range(717101, 717107):
        policy = scripted_policy.ScriptedPolicy(
            "seeded-varied-prefix-then-persistent-ranged",
            seed=seed)
        for lane in range(256):
            prefix_length = (lane + seed * 5) % 11
            if prefix_length < 4:
                continue
            styles = policy._keyed_choice_indices(
                np.full(4, lane, dtype=np.int64),
                np.arange(4, dtype=np.int64),
                2)
            observed.add(tuple(int(style) for style in styles))
    assert observed == set(product(range(2), repeat=4))
    assert (
        schema.STYLE_RANGED,
        schema.STYLE_MAGIC,
        schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
    ) in observed


def test_exact_live_hold_is_ranged_magic_magic_then_persistent_ranged():
    runner = _run(
        "live-rmm-then-persistent-ranged",
        fights=8,
        seed=7411,
        distance=3,
        ticks=100)
    expected = [
        schema.STYLE_RANGED,
        schema.STYLE_MAGIC,
        schema.STYLE_MAGIC,
    ]
    for rolls in runner.rolls:
        assert len(rolls) >= 10
        assert [roll["style"] for roll in rolls[:3]] == expected
        assert all(
            roll["style"] == schema.STYLE_RANGED
            for roll in rolls[3:10])
        assert all(roll["distance"] == 3 for roll in rolls[:10])


def test_seeded_long_mr_prefix_varies_length_cadence_and_terminal_style():
    seed = 7441
    fights = 39
    runner = _run(
        "seeded-long-mr-prefix-then-persistent-balanced",
        fights=fights,
        seed=seed,
        distance=2,
        ticks=360)
    lanes = np.arange(fights, dtype=np.int64)
    prefix_lengths = (
        scripted_policy.ScriptedPolicy.seeded_long_prefix_lengths(
            lanes, seed))
    terminal_styles = (
        scripted_policy.ScriptedPolicy.seeded_long_terminal_styles(
            lanes, seed))
    assert set(map(int, prefix_lengths)) == set(range(4, 17))
    assert {
        style: int(np.count_nonzero(terminal_styles == style))
        for style in (
            schema.STYLE_MAGIC,
            schema.STYLE_RANGED,
            schema.STYLE_MELEE)
    } == {
        schema.STYLE_MAGIC: 13,
        schema.STYLE_RANGED: 13,
        schema.STYLE_MELEE: 13,
    }

    observed_gaps = set()
    item_by_style = {
        schema.STYLE_MAGIC: gear.ZURIELS_STAFF.item_id,
        schema.STYLE_RANGED: gear.ZARYTE_CROSSBOW.item_id,
        schema.STYLE_MELEE: gear.NOXIOUS_HALBERD.item_id,
    }
    for lane, rolls in enumerate(runner.rolls):
        prefix_length = int(prefix_lengths[lane])
        terminal_style = int(terminal_styles[lane])
        assert len(rolls) >= prefix_length + 6
        expected_prefix = tuple(
            _generic_prefix_style(lane, position, seed)
            for position in range(prefix_length))
        assert tuple(
            roll["style"] for roll in rolls[:prefix_length]
        ) == expected_prefix
        assert set(expected_prefix) <= {
            schema.STYLE_MAGIC,
            schema.STYLE_RANGED,
        }
        assert all(
            roll["style"] == terminal_style
            for roll in rolls[prefix_length:])
        for roll in rolls:
            expected_weapon = item_by_style[roll["style"]]
            assert roll["weapon"] == expected_weapon
            assert roll["decision_weapon"] == expected_weapon
            assert roll["decision_switch_tick"] <= roll["tick"] - 1
        observed_gaps.update(
            current["tick"] - prior["tick"]
            for prior, current in zip(rolls, rolls[1:]))

    assert len(observed_gaps) >= 8


def test_exact_human_mmmrm_hold_then_persistent_ranged():
    runner = _run(
        "live-mmmrm-then-persistent-ranged",
        fights=8,
        seed=7451,
        distance=4,
        ticks=140)
    expected = [
        schema.STYLE_MAGIC,
        schema.STYLE_MAGIC,
        schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
        schema.STYLE_MAGIC,
    ]
    for rolls in runner.rolls:
        assert len(rolls) >= 12
        assert [roll["style"] for roll in rolls[:5]] == expected
        assert all(
            roll["style"] == schema.STYLE_RANGED
            for roll in rolls[5:12])
        assert all(
            roll["decision_switch_tick"] <= roll["tick"] - 1
            for roll in rolls[:12])
        assert all(roll["distance"] == 4 for roll in rolls[:12])


def test_exact_live_magic_melee_then_persistent_ranged():
    runner = _run(
        "live-magic-melee-then-persistent-ranged",
        fights=8,
        seed=7452,
        distance=1,
        ticks=100)
    expected = [schema.STYLE_MAGIC, schema.STYLE_MELEE]
    for rolls in runner.rolls:
        assert len(rolls) >= 8
        assert [roll["style"] for roll in rolls[:2]] == expected
        assert all(
            roll["style"] == schema.STYLE_RANGED
            for roll in rolls[2:8])
        assert all(
            roll["decision_switch_tick"] <= roll["tick"] - 1
            for roll in rolls[:8])


def test_seeded_balanced_terminal_styles_cover_all_three_equally():
    seed = 7421
    fights = 33
    runner = _run(
        "seeded-varied-prefix-then-persistent-balanced",
        fights=fights,
        seed=seed,
        distance=2,
        ticks=180)
    terminal_counts = {
        schema.STYLE_MAGIC: 0,
        schema.STYLE_RANGED: 0,
        schema.STYLE_MELEE: 0,
    }
    for lane, rolls in enumerate(runner.rolls):
        prefix_length = (lane + seed * 5) % 11
        terminal = (lane + seed) % 3
        assert len(rolls) >= prefix_length + 8
        assert all(
            roll["style"] == terminal
            for roll in rolls[prefix_length:])
        terminal_counts[terminal] += 1
    assert terminal_counts == {
        schema.STYLE_MAGIC: 11,
        schema.STYLE_RANGED: 11,
        schema.STYLE_MELEE: 11,
    }


def test_fixed_ranged_and_magic_do_not_force_stand_under():
    expected_weapon = {
        "fixed-ranged": gear.ZARYTE_CROSSBOW.item_id,
        "fixed-magic": gear.ZURIELS_STAFF.item_id,
    }
    for script in ("fixed-ranged", "fixed-magic"):
        runner = _run(
            script, fights=4, seed=7431, distance=6, ticks=60)
        assert all(
            roll["distance"] == 6
            for rolls in runner.rolls
            for roll in rolls)
        assert all(
            roll["weapon"] == expected_weapon[script]
            and roll["decision_weapon"] == expected_weapon[script]
            and roll["decision_switch_tick"] <= roll["tick"] - 1
            for rolls in runner.rolls
            for roll in rolls)


def test_honest_style_transitions_cover_every_pair_prefix_and_repeat():
    seed = 7461
    fights = 18
    runner = _run(
        "honest-gear-style-transitions",
        fights=fights,
        seed=seed,
        distance=8,
        ticks=240)
    lanes = np.arange(fights, dtype=np.int64)
    from_styles, to_styles, prefix_lengths = (
        scripted_policy.ScriptedPolicy.honest_style_transition_spec(
            lanes, seed))
    cold_starts, warm_starts = (
        scripted_policy.ScriptedPolicy.honest_style_transition_block_starts(
            lanes, seed))
    assert {
        (int(from_style), int(to_style), int(prefix))
        for from_style, to_style, prefix in zip(
            from_styles, to_styles, prefix_lengths)
    } == {
        (from_style, to_style, prefix)
        for from_style in (
            schema.STYLE_MAGIC,
            schema.STYLE_RANGED,
            schema.STYLE_MELEE)
        for to_style in (
            schema.STYLE_MAGIC,
            schema.STYLE_RANGED,
            schema.STYLE_MELEE)
        if from_style != to_style
        for prefix in (1, 2, 3)
    }

    weapon_by_style = {
        schema.STYLE_MAGIC: gear.ZURIELS_STAFF.item_id,
        schema.STYLE_RANGED: gear.ZARYTE_CROSSBOW.item_id,
        schema.STYLE_MELEE: gear.NOXIOUS_HALBERD.item_id,
    }
    for lane, rolls in enumerate(runner.rolls):
        from_style = int(from_styles[lane])
        to_style = int(to_styles[lane])
        cold_start = int(cold_starts[lane])
        warm_start = int(warm_starts[lane])
        block_rolls = scripted_policy.HONEST_STYLE_TRANSITION_B_ROLLS
        required = warm_start + block_rolls
        assert len(rolls) >= required
        expected_styles = (
            [from_style] * cold_start
            + [to_style] * block_rolls
            + [from_style] * int(prefix_lengths[lane])
            + [to_style] * block_rolls)
        assert [roll["style"] for roll in rolls[:required]] == expected_styles
        for roll in rolls[:required]:
            expected_weapon = weapon_by_style[roll["style"]]
            assert roll["weapon"] == expected_weapon
            assert roll["decision_weapon"] == expected_weapon
            assert roll["decision_switch_tick"] <= roll["tick"] - 1

    assert (
        "honest-gear-style-transitions"
        in scripted_policy.EVALUATION_ONLY_SCRIPT_NAMES)
    assert (
        "honest-gear-style-transitions"
        not in scripted_policy.ROLLOUT_SCRIPT_NAMES)


def test_evaluator_exposes_new_structural_and_exact_live_choices():
    for choice in (
            "seeded-varied-prefix-then-persistent-ranged",
            "seeded-varied-prefix-then-persistent-balanced",
            "seeded-long-mr-prefix-then-persistent-balanced",
            "live-rmm-then-persistent-ranged",
            "live-mmmrm-then-persistent-ranged",
            "live-magic-melee-then-persistent-ranged",
            "honest-gear-style-transitions"):
        assert ATTACK_SCRIPT_BY_CHOICE[choice] == choice


if __name__ == "__main__":
    test_seeded_prefix_lengths_styles_pauses_and_terminal_ranged_vary()
    test_training_seeds_cover_every_four_attack_magic_ranged_prefix()
    test_exact_live_hold_is_ranged_magic_magic_then_persistent_ranged()
    test_seeded_long_mr_prefix_varies_length_cadence_and_terminal_style()
    test_exact_human_mmmrm_hold_then_persistent_ranged()
    test_exact_live_magic_melee_then_persistent_ranged()
    test_seeded_balanced_terminal_styles_cover_all_three_equally()
    test_fixed_ranged_and_magic_do_not_force_stand_under()
    test_honest_style_transitions_cover_every_pair_prefix_and_repeat()
    test_evaluator_exposes_new_structural_and_exact_live_choices()
