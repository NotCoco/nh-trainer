"""Focused checks for the paired classic-Elo league evaluator."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import evaluate_elo_league as league  # noqa: E402
from fastsim import replay  # noqa: E402


def test_round_robin_covers_every_pair_once_and_one_match_per_round():
    count = 9
    rounds = league.build_round_robin(count, seed=42)
    pairs = []
    for matches in rounds:
        participants = []
        for match in matches:
            participants.extend((match.entrant_a, match.entrant_b))
            pairs.append(tuple(sorted((match.entrant_a, match.entrant_b))))
        assert len(participants) == len(set(participants))
    assert len(pairs) == count * (count - 1) // 2
    assert len(pairs) == len(set(pairs))
    side_zero = np.zeros(count, dtype=np.int64)
    side_one = np.zeros(count, dtype=np.int64)
    for matches in rounds:
        for match in matches:
            side_zero[match.entrant_a] += 1
            side_one[match.entrant_b] += 1
    assert np.all(np.abs(side_zero - side_one) <= 1)


def test_classic_elo_has_expected_equal_and_upset_changes():
    assert np.isclose(league.elo_delta(1500, 1500, 1.0), 16.0)
    favorite_win = league.elo_delta(1900, 1500, 1.0)
    underdog_win = league.elo_delta(1500, 1900, 1.0)
    assert np.isclose(favorite_win, 32.0 / 11.0)
    assert np.isclose(underdog_win, 320.0 / 11.0)
    assert underdog_win > favorite_win


def test_round_updates_are_simultaneous_and_zero_sum():
    results = [
        {"round": 0, "entrantA": 0, "entrantB": 1, "scoreA": 1.0},
        {"round": 0, "entrantA": 2, "entrantB": 3, "scoreA": 0.0},
        {"round": 1, "entrantA": 0, "entrantB": 2, "scoreA": 0.5},
        {"round": 1, "entrantA": 1, "entrantB": 3, "scoreA": 0.5},
    ]
    ratings = league.apply_elo_rounds(results, 4)
    assert np.isclose(ratings.mean(), league.START_RATING)
    assert results[0]["preMatchRatingA"] == league.START_RATING
    assert results[1]["preMatchRatingA"] == league.START_RATING


def test_vector_replay_draws_match_scalar_reference_exactly():
    runner = league.LeagueEngine.__new__(league.LeagueEngine)
    runner.n_fights = 5
    runner.world_tick = 37
    runner._lane_replay_seeds = np.asarray(
        [7, 11, 13, 17, 19], dtype=np.int64)
    runner._lane_replay_bot_indices = np.asarray([
        [2, 9], [5, 1], [17, 21], [0, 8], [3, 4],
    ], dtype=np.int64)
    runner._replay_hit_ordinals = np.asarray([
        [0, 1], [2, 0], [3, 4], [1, 5], [0, 2],
    ], dtype=np.int32)
    for draw_kind in (
            replay.DRAW_ONYX, replay.DRAW_DAMAGE, replay.DRAW_ACCURACY):
        actual = runner._replay_units(draw_kind)
        expected = np.asarray([
            [
                replay.unit(
                    int(runner._lane_replay_seeds[fight]),
                    runner.world_tick,
                    int(runner._lane_replay_bot_indices[fight, side]),
                    int(runner._replay_hit_ordinals[fight, side]),
                    draw_kind,
                )
                for side in range(2)
            ]
            for fight in range(runner.n_fights)
        ])
        assert np.array_equal(actual, expected)


def test_small_scripted_league_runs_every_pair_once_without_draws():
    names = ("fixed-magic", "fixed-ranged", "fixed-melee", "fixed-halberd")
    entrants = [
        league.Entrant(
            index=index,
            label=f"script:{name}",
            kind="script",
            source=name,
            script=name,
            prayer_head_version=1,
        )
        for index, name in enumerate(names)
    ]
    matches = [
        match
        for round_matches in league.build_round_robin(len(entrants), seed=7)
        for match in round_matches
    ]
    runner = league.simulate_batch(
        entrants,
        matches,
        seed=7,
        replay_seed=17,
        max_ticks=12,
        stall_ticks=6,
        world_id=35,
    )
    assert len(matches) == 6
    assert runner.n_fights == 6
    assert runner.summary()["fights"] == 6
    assert int(runner.incoming_attack_rolls.sum()) > 0
    assert np.all(runner.state.winner >= 0)
    assert np.all(runner.finish_tick > 0)


def test_active_lane_compaction_preserves_scripted_fight_results():
    names = (
        "fixed-magic", "fixed-ranged", "fixed-melee", "fixed-halberd",
        "seeded-block-switch", "seeded-comprehensive-human-ranged-pressure",
    )
    entrants = [
        league.Entrant(
            index=index,
            label=f"script:{name}",
            kind="script",
            source=name,
            script=name,
            prayer_head_version=1,
        )
        for index, name in enumerate(names)
    ]
    matches = [
        match
        for round_matches in league.build_round_robin(len(entrants), seed=19)
        for match in round_matches
    ]
    common = dict(
        seed=19,
        replay_seed=29,
        max_ticks=80,
        stall_ticks=25,
        world_id=35,
    )
    reference = league.simulate_batch(
        entrants, matches, compact_interval=0, **common)
    compacted = league.simulate_batch(
        entrants, matches, compact_interval=2, **common)
    assert np.array_equal(
        compacted.state.winner, reference.state.winner)
    assert np.array_equal(
        compacted.state.damage_dealt, reference.state.damage_dealt)
    assert np.array_equal(compacted.finish_tick, reference.finish_tick)
    assert np.array_equal(compacted.outcome_reason, reference.outcome_reason)
    assert np.array_equal(
        compacted.incoming_attack_rolls, reference.incoming_attack_rolls)
    assert np.array_equal(
        compacted.correct_prayer_rolls, reference.correct_prayer_rolls)
    assert np.array_equal(
        compacted.outgoing_style_rolls, reference.outgoing_style_rolls)
    assert np.allclose(
        compacted.expected_damage_dealt, reference.expected_damage_dealt,
        rtol=0.0, atol=0.0)
