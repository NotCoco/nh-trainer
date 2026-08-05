"""Coverage for late mixed-history pressure curricula and the held-out trace."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastsim import evaluation, gear, schema, scripted_policy  # noqa: E402
from tools import evaluate_fixed_attack  # noqa: E402


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
        self.equipment_at_rolls = [
            [] for _lane in range(self.n_fights)]

    def _book_roll_prayer(self, fired, attack_style, spec_kind=None):
        fired = np.asarray(fired, dtype=bool)
        attack_style = np.asarray(attack_style)
        for lane in np.flatnonzero(fired[:, 1]):
            self.rolls[int(lane)].append(int(attack_style[int(lane), 1]))
            self.equipment_at_rolls[int(lane)].append(
                self.state.equipped_ids[int(lane), 1].copy())
        return super()._book_roll_prayer(
            fired, attack_style, spec_kind=spec_kind)


def _run(script: str, *, fights: int, seed: int, ticks: int = 600):
    runner = _RollCaptureEngine(
        n_fights=fights,
        policy=_StationaryPassive(),
        opponent_policy=scripted_policy.ScriptedPolicy(
            script, defence="seeded-switching-protection", seed=seed),
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


def test_mixed_ranged_pressure_varies_late_handoff_and_keeps_fakes():
    seed = 7521
    fights = 39
    runner = _run(
        "seeded-mixed-then-ranged-pressure",
        fights=fights,
        seed=seed)
    lanes = np.arange(fights, dtype=np.int64)
    prefix_lengths = (
        scripted_policy.ScriptedPolicy.seeded_pressure_prefix_lengths(
            lanes, seed))
    assert set(map(int, prefix_lengths)) == set(range(6, 19))

    for lane, rolls in enumerate(runner.rolls):
        prefix_length = int(prefix_lengths[lane])
        assert len(rolls) >= prefix_length + 18
        assert set(rolls[:3]) == {
            schema.STYLE_MAGIC,
            schema.STYLE_RANGED,
            schema.STYLE_MELEE,
        }
        pressure = rolls[prefix_length:prefix_length + 18]
        assert pressure.count(schema.STYLE_RANGED) >= 15
        assert any(style != schema.STYLE_RANGED for style in pressure)


def test_balanced_pressure_covers_all_three_terminal_styles():
    seed = 7522
    fights = 39
    runner = _run(
        "seeded-mixed-then-balanced-pressure",
        fights=fights,
        seed=seed)
    lanes = np.arange(fights, dtype=np.int64)
    prefix_lengths = (
        scripted_policy.ScriptedPolicy.seeded_pressure_prefix_lengths(
            lanes, seed))
    terminal_styles = (
        scripted_policy.ScriptedPolicy.seeded_long_terminal_styles(
            lanes, seed))
    assert {
        style: int(np.count_nonzero(terminal_styles == style))
        for style in range(3)
    } == {
        schema.STYLE_MAGIC: 13,
        schema.STYLE_RANGED: 13,
        schema.STYLE_MELEE: 13,
    }
    for lane, rolls in enumerate(runner.rolls):
        start = int(prefix_lengths[lane])
        terminal = int(terminal_styles[lane])
        pressure = rolls[start:start + 18]
        assert len(pressure) == 18
        assert pressure.count(terminal) >= 15
        assert any(style != terminal for style in pressure)


def test_live_human_pressure_trace_is_exact_and_evaluation_only():
    expected = [
        schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
        schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
        schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
    ]
    for script in (
            "live-human-ranged-pressure",
            "live-human-ranged-pressure-fullgear"):
        runner = _run(script, fights=4, seed=7523, ticks=500)
        for rolls in runner.rolls:
            assert rolls[:len(expected)] == expected
        assert script in scripted_policy.EVALUATION_ONLY_SCRIPT_NAMES
        assert script not in scripted_policy.ROLLOUT_SCRIPT_NAMES
    assert all(
        not name.startswith("live-")
        for name in scripted_policy.ROLLOUT_SCRIPT_NAMES)


def test_recurring_live_trace_is_exact_fullgear_and_evaluation_only():
    expected = [
        schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_RANGED,
        schema.STYLE_MAGIC,
        *([schema.STYLE_RANGED] * 8),
        schema.STYLE_MAGIC,
        schema.STYLE_MAGIC,
        schema.STYLE_MAGIC,
        *([schema.STYLE_RANGED] * 8),
    ]
    script = "live-human-recurring-ranged-pressure-fullgear"
    runner = _run(script, fights=4, seed=7524, ticks=700)
    expected_loadouts = {
        schema.STYLE_MAGIC: {
            gear.SLOT_WEAPON: gear.ZURIELS_STAFF.item_id,
            gear.SLOT_CHEST: gear.VIRTUS_ROBE_TOP.item_id,
            gear.SLOT_LEGS: gear.VIRTUS_ROBE_BOTTOM.item_id,
            gear.SLOT_SHIELD: gear.ELIDINIS_WARD_F.item_id,
        },
        schema.STYLE_RANGED: {
            gear.SLOT_WEAPON: gear.ZARYTE_CROSSBOW.item_id,
            gear.SLOT_CHEST: gear.MASORI_BODY_F.item_id,
            gear.SLOT_LEGS: gear.TORVA_PLATELEGS.item_id,
            gear.SLOT_SHIELD: gear.DRAGONFIRE_SHIELD.item_id,
        },
        schema.STYLE_MELEE: {
            gear.SLOT_WEAPON: gear.NOXIOUS_HALBERD.item_id,
            gear.SLOT_CHEST: gear.MASORI_BODY_F.item_id,
            gear.SLOT_LEGS: gear.TORVA_PLATELEGS.item_id,
        },
    }
    for lane, rolls in enumerate(runner.rolls):
        assert rolls[:len(expected)] == expected
        for style, equipped in zip(
                expected,
                runner.equipment_at_rolls[lane][:len(expected)],
                strict=True):
            for slot, item_id in expected_loadouts[style].items():
                assert int(equipped[slot]) == item_id
    assert script in scripted_policy.EVALUATION_ONLY_SCRIPT_NAMES
    assert script not in scripted_policy.ROLLOUT_SCRIPT_NAMES
    assert evaluate_fixed_attack._terminal_phase_spec(
        script, lane_index=0, seed=7524) == (
            16, schema.STYLE_RANGED)


def _style_runs(styles: list[int]) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    for style in styles:
        if runs and runs[-1][0] == style:
            runs[-1] = (style, runs[-1][1] + 1)
        else:
            runs.append((style, 1))
    return runs


def test_recurring_three_style_blocks_are_varied_and_rollout_eligible():
    script = "seeded-recurring-three-style-blocks"
    runner = _run(script, fights=24, seed=7525, ticks=1100)
    orders = set()
    lengths = set()
    for rolls in runner.rolls:
        sample = rolls[:45]
        assert len(sample) == 45
        assert set(sample) == {
            schema.STYLE_MAGIC,
            schema.STYLE_RANGED,
            schema.STYLE_MELEE,
        }
        runs = _style_runs(sample)
        assert len(runs) >= 6
        assert all(
            sum(style == target for style, _length in runs) >= 2
            for target in (
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE))
        orders.add(tuple(style for style, _length in runs[:3]))
        lengths.update(length for _style, length in runs[:-1])
    assert len(orders) >= 4
    assert len(lengths) >= 5
    assert script in scripted_policy.ROLLOUT_SCRIPT_NAMES
    assert script not in scripted_policy.EVALUATION_ONLY_SCRIPT_NAMES


def _defence_traces(
        defence: str,
        *,
        fights: int,
        seed: int,
        ticks: int) -> list[list[int]]:
    policy = scripted_policy.ScriptedPolicy(
        "passive", defence=defence, seed=seed)
    inputs = np.zeros((fights * 2, schema.INPUT_SIZE), dtype=np.float32)
    traces = [[] for _lane in range(fights)]
    for _tick in range(ticks):
        scores, _values = policy.score(inputs)
        prayer = np.argmax(
            scores[
                :,
                schema.DEFENCE_BASE:
                schema.DEFENCE_BASE + schema.DEFENCE_COUNT,
            ],
            axis=1,
        )
        for lane in range(fights):
            traces[lane].append(int(prayer[lane * 2]))
    return traces


def _switch_count(values: list[int]) -> int:
    return sum(left != right for left, right in zip(values, values[1:]))


def test_seeded_human_prayer_mix_covers_human_families():
    seed = 0
    fights = 36
    traces = _defence_traces(
        "seeded-human-prayer-mix",
        fights=fights,
        seed=seed,
        ticks=180)
    families = (np.arange(fights) + seed) % 6
    family_traces = {
        family: [traces[lane] for lane in np.flatnonzero(families == family)]
        for family in range(6)
    }

    assert all(len(set(trace)) == 1 for trace in family_traces[0])
    assert set.union(*(set(trace) for trace in family_traces[0])) == {0, 1, 2}
    assert all(
        len(set(trace)) == 2 and _switch_count(trace) >= 8
        for trace in family_traces[1])
    assert all(
        set(trace) == {0, 1, 2} and _switch_count(trace) >= 8
        for trace in family_traces[2])
    assert all(
        len(set(trace)) == 2 and _switch_count(trace) == 1
        for trace in family_traces[3])
    assert all(
        set(trace) == {0, 1, 2} and _switch_count(trace) == 2
        for trace in family_traces[4])
    irregular_runs = [
        run
        for trace in family_traces[5]
        for run in _style_runs(trace)
    ]
    assert set.union(*(set(trace) for trace in family_traces[5])) == {0, 1, 2}
    assert len({length for _style, length in irregular_runs}) >= 6
    assert all(_switch_count(trace) >= 12 for trace in family_traces[5])


def _set_opponent_weapon(inputs: np.ndarray, item_id: int) -> None:
    angle = item_id * schema.WEAPON_EMBED_FREQ
    inputs[:, schema.INPUT_OPP_WEAPON_SIN] = np.sin(angle)
    inputs[:, schema.INPUT_OPP_WEAPON_COS] = np.cos(angle)


def _selected_defence(policy, inputs: np.ndarray) -> np.ndarray:
    scores, _values = policy.score(inputs)
    return np.argmax(
        scores[
            :,
            schema.DEFENCE_BASE:
            schema.DEFENCE_BASE + schema.DEFENCE_COUNT,
        ],
        axis=1,
    )


def test_seeded_reactive_protection_uses_only_delayed_attack_observations():
    policy = scripted_policy.ScriptedPolicy(
        "passive", defence="seeded-reactive-protection", seed=0)
    inputs = np.zeros((6, schema.INPUT_SIZE), dtype=np.float32)

    _set_opponent_weapon(inputs, gear.ZURIELS_STAFF.item_id)
    inputs[:, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK] = 0.0
    assert int(_selected_defence(policy, inputs)[0]) == schema.PRAY_PROTECT_MAGIC

    # A visible gear change without a delayed attack-age reset is only a fake.
    _set_opponent_weapon(inputs, gear.ZARYTE_CROSSBOW.item_id)
    inputs[:, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK] = 1.0 / 8.0
    assert int(_selected_defence(policy, inputs)[0]) == schema.PRAY_PROTECT_MAGIC

    inputs[:, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK] = 0.0
    reacted = _selected_defence(policy, inputs)[::2]
    assert list(map(int, reacted)) == [
        schema.PRAY_PROTECT_MISSILES,
        schema.PRAY_PROTECT_MAGIC,
        schema.PRAY_PROTECT_MAGIC,
    ]
    inputs[:, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK] = 1.0 / 8.0
    reacted = _selected_defence(policy, inputs)[::2]
    assert list(map(int, reacted)) == [
        schema.PRAY_PROTECT_MISSILES,
        schema.PRAY_PROTECT_MISSILES,
        schema.PRAY_PROTECT_MAGIC,
    ]
    inputs[:, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK] = 2.0 / 8.0
    reacted = _selected_defence(policy, inputs)[::2]
    assert list(map(int, reacted)) == [
        schema.PRAY_PROTECT_MISSILES,
        schema.PRAY_PROTECT_MISSILES,
        schema.PRAY_PROTECT_MISSILES,
    ]


if __name__ == "__main__":
    test_mixed_ranged_pressure_varies_late_handoff_and_keeps_fakes()
    test_balanced_pressure_covers_all_three_terminal_styles()
    test_live_human_pressure_trace_is_exact_and_evaluation_only()
    test_recurring_live_trace_is_exact_fullgear_and_evaluation_only()
    test_recurring_three_style_blocks_are_varied_and_rollout_eligible()
    test_seeded_human_prayer_mix_covers_human_families()
    test_seeded_reactive_protection_uses_only_delayed_attack_observations()
