"""Coverage for complete recent-history pressure without a fixed shortcut."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastsim import evaluation, gear, schema, scripted_policy  # noqa: E402


class _StationaryPassive(scripted_policy.ScriptedPolicy):
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
        return scores, values


class _RollCaptureEngine(evaluation.EvaluationEngine):
    def __init__(self, *args, scripted_side: int, **kwargs):
        self.scripted_side = int(scripted_side)
        super().__init__(*args, **kwargs)
        self.rolls = [[] for _lane in range(self.n_fights)]
        self.weapon_by_tick = [dict() for _lane in range(self.n_fights)]

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
        return super()._book_roll_prayer(
            fired, attack_style, spec_kind=spec_kind)


def _run(
        *,
        scripted_side: int,
        seed: int,
        fights: int = 108,
        script: str = "seeded-complete-history-ranged-pressure"):
    pressure = scripted_policy.ScriptedPolicy(
        script,
        defence="seeded-switching-protection",
        seed=seed)
    passive = _StationaryPassive()
    policies = (
        (pressure, passive)
        if scripted_side == 0
        else (passive, pressure))
    runner = _RollCaptureEngine(
        n_fights=fights,
        policy=policies[0],
        opponent_policy=policies[1],
        scripted_side=scripted_side,
        subject_side=1 - scripted_side,
        seed=seed + 1000,
        replay_seed=seed + 2000,
        epsilon=0.0,
        max_ticks=220,
        start_distance_min=1,
        start_distance_max=1,
        world_id=43)
    runner.state.hp[:] = 10000
    for _tick in range(220):
        runner.step()
    return runner


def _decode_history(history_code: int) -> tuple[int, int, int]:
    return (
        history_code // 9,
        (history_code // 3) % 3,
        history_code % 3,
    )


def test_every_three_attack_history_has_all_continuations_and_extra_ranged():
    seed = 15401
    lanes = np.arange(108, dtype=np.int64)
    scenarios = scripted_policy.ScriptedPolicy.seeded_complete_history_scenarios(
        lanes, np.zeros_like(lanes), seed)
    assert set(map(int, scenarios)) == set(range(108))

    observed = {history: [] for history in range(27)}
    for scenario in scenarios:
        scenario = int(scenario)
        observed[scenario // 4].append(
            int(scripted_policy._COMPLETE_HISTORY_TERMINAL_STYLES[
                scenario % 4]))
    for continuations in observed.values():
        assert continuations.count(schema.STYLE_MAGIC) == 1
        assert continuations.count(schema.STYLE_RANGED) == 2
        assert continuations.count(schema.STYLE_MELEE) == 1

    run_lengths = (
        scripted_policy.ScriptedPolicy.seeded_complete_history_run_lengths(
            scenarios, seed))
    assert set(map(int, run_lengths)) == set(range(2, 9))


def test_complete_history_plan_reaches_real_rolls_with_hold_and_fake_variants():
    seed = 15402
    item_by_style = {
        schema.STYLE_MAGIC: {gear.ZURIELS_STAFF.item_id},
        schema.STYLE_RANGED: {gear.ZARYTE_CROSSBOW.item_id},
        schema.STYLE_MELEE: {
            gear.VESTAS_LONGSWORD.item_id,
            gear.NOXIOUS_HALBERD.item_id,
        },
    }
    for scripted_side in (0, 1):
        runner = _run(scripted_side=scripted_side, seed=seed)
        for lane, rolls in enumerate(runner.rolls):
            scenario = int(
                scripted_policy.ScriptedPolicy
                .seeded_complete_history_scenarios(
                    np.asarray([lane]), np.asarray([0]), seed)[0])
            history = _decode_history(scenario // 4)
            terminal_variant = scenario % 4
            terminal_style = int(
                scripted_policy._COMPLETE_HISTORY_TERMINAL_STYLES[
                    terminal_variant])
            run_length = int(
                scripted_policy.ScriptedPolicy
                .seeded_complete_history_run_lengths(
                    np.asarray([scenario]), seed)[0])
            assert len(rolls) >= 3 + run_length
            assert tuple(style for _tick, style in rolls[:3]) == history
            assert [
                style for _tick, style in rolls[3:3 + run_length]
            ] == [terminal_style] * run_length
            for tick, style in rolls[:3 + run_length]:
                assert runner.weapon_by_tick[lane][tick] in item_by_style[style]

            if terminal_style != schema.STYLE_RANGED or run_length < 2:
                continue
            first, second = rolls[3:5]
            between = {
                runner.weapon_by_tick[lane][tick]
                for tick in range(first[0] + 1, second[0])
            }
            assert runner.weapon_by_tick[lane][second[0] - 1] == (
                gear.ZARYTE_CROSSBOW.item_id)
            if terminal_variant == 1:
                assert between == {gear.ZARYTE_CROSSBOW.item_id}
            else:
                assert between & {
                    gear.ZURIELS_STAFF.item_id,
                    gear.VESTAS_LONGSWORD.item_id,
                }


def test_complete_history_curriculum_is_trainable_not_a_live_trace():
    name = "seeded-complete-history-ranged-pressure"
    assert name in scripted_policy.ROLLOUT_SCRIPT_NAMES
    assert name not in scripted_policy.EVALUATION_ONLY_SCRIPT_NAMES
    assert all(
        not candidate.startswith("live-")
        for candidate in scripted_policy.ROLLOUT_SCRIPT_NAMES)


def test_balanced_complete_history_has_two_real_variants_per_style():
    script = "seeded-complete-history-balanced-pressure"
    seed = 15901
    lanes = np.arange(27 * 6, dtype=np.int64)
    scenarios = (
        scripted_policy.ScriptedPolicy
        .seeded_balanced_complete_history_scenarios(
            lanes, np.zeros_like(lanes), seed))
    assert set(map(int, scenarios)) == set(range(27 * 6))

    observed = {history: [] for history in range(27)}
    for scenario in scenarios:
        scenario = int(scenario)
        observed[scenario // 6].append(int(
            scripted_policy._BALANCED_COMPLETE_HISTORY_TERMINAL_STYLES[
                scenario % 6]))
    for continuations in observed.values():
        assert continuations.count(schema.STYLE_MAGIC) == 2
        assert continuations.count(schema.STYLE_RANGED) == 2
        assert continuations.count(schema.STYLE_MELEE) == 2

    expected_item = {
        schema.STYLE_MAGIC: gear.ZURIELS_STAFF.item_id,
        schema.STYLE_RANGED: gear.ZARYTE_CROSSBOW.item_id,
        schema.STYLE_MELEE: gear.VESTAS_LONGSWORD.item_id,
    }
    for scripted_side in (0, 1):
        runner = _run(
            scripted_side=scripted_side,
            seed=seed,
            fights=27 * 6,
            script=script)
        for lane, rolls in enumerate(runner.rolls):
            scenario = int(
                scripted_policy.ScriptedPolicy
                .seeded_balanced_complete_history_scenarios(
                    np.asarray([lane]), np.asarray([0]), seed)[0])
            history = _decode_history(scenario // 6)
            terminal_variant = scenario % 6
            terminal_style = int(
                scripted_policy
                ._BALANCED_COMPLETE_HISTORY_TERMINAL_STYLES[
                    terminal_variant])
            run_length = int(
                scripted_policy.ScriptedPolicy
                .seeded_complete_history_run_lengths(
                    np.asarray([scenario]), seed)[0])
            assert len(rolls) >= 3 + run_length
            assert tuple(style for _tick, style in rolls[:3]) == history
            terminal_rolls = rolls[3:3 + run_length]
            assert [style for _tick, style in terminal_rolls] == (
                [terminal_style] * run_length)
            if run_length < 2:
                continue
            first, second = terminal_rolls[:2]
            roll_item = expected_item[terminal_style]
            assert runner.weapon_by_tick[lane][second[0] - 1] == roll_item
            between = {
                runner.weapon_by_tick[lane][tick]
                for tick in range(first[0] + 1, second[0])
            }
            if terminal_variant % 2 == 0:
                assert between == {roll_item}
            else:
                assert between - {roll_item}

    assert script in scripted_policy.ROLLOUT_SCRIPT_NAMES
    assert script not in scripted_policy.EVALUATION_ONLY_SCRIPT_NAMES


if __name__ == "__main__":
    test_every_three_attack_history_has_all_continuations_and_extra_ranged()
    test_complete_history_plan_reaches_real_rolls_with_hold_and_fake_variants()
    test_complete_history_curriculum_is_trainable_not_a_live_trace()
    test_balanced_complete_history_has_two_real_variants_per_style()
