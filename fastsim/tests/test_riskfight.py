"""Focused mechanics and reward-contract checks for Webweaver risk fights."""

from __future__ import annotations

import math
import unittest

from fastsim.riskfight import (
    KO_TERMINAL_REWARD,
    SHAPING_BUDGET,
    FightActions,
    FEATURE_NAMES,
    MainAction,
    MovementAction,
    PendingHit,
    PrayerAction,
    RewardLedger,
    RiskFight,
    VENGEANCE_COOLDOWN_TICKS,
    WEBWEAVER_NORMAL_PROJECTILE,
    WEBWEAVER_SWARM_PROJECTILES,
    projectile_delay_ticks,
    projectile_impact_tick,
    swarm_impact_ticks,
    validate_reward_invariant,
)


WAIT = FightActions(MainAction.WAIT, PrayerAction.NONE, MovementAction.HOLD)


class ProjectileTimingTests(unittest.TestCase):
    def test_normal_webweaver_near_and_far_delays(self) -> None:
        self.assertEqual(projectile_delay_ticks(WEBWEAVER_NORMAL_PROJECTILE, 1), 2)
        self.assertEqual(projectile_delay_ticks(WEBWEAVER_NORMAL_PROJECTILE, 9), 3)

    def test_swarm_is_staggered_near_and_far(self) -> None:
        self.assertEqual(tuple(projectile_delay_ticks(profile, 1) for profile in WEBWEAVER_SWARM_PROJECTILES), (1, 1, 2, 3))
        self.assertEqual(tuple(projectile_delay_ticks(profile, 9) for profile in WEBWEAVER_SWARM_PROJECTILES), (2, 2, 3, 3))

    def test_pid_changes_processing_order_not_absolute_projectile_arrival(self) -> None:
        for distance in (1, 9):
            for profile in (WEBWEAVER_NORMAL_PROJECTILE, *WEBWEAVER_SWARM_PROJECTILES):
                before = projectile_impact_tick(100, profile, distance, target_already_processed=False)
                after = projectile_impact_tick(100, profile, distance, target_already_processed=True)
                self.assertEqual(before, after)

    def test_real_swarm_queue_matches_both_pid_roles_near_and_far(self) -> None:
        for distance in (1, 9):
            expected = swarm_impact_ticks(0, distance, False)
            for pid in (0, 1):
                fight = RiskFight(1000 + distance * 10 + pid, start_distance=distance, initial_pid=pid, max_ticks=30)
                fight.step([
                    FightActions(MainAction.WEBWEAVER_SPEC, PrayerAction.NONE, MovementAction.HOLD),
                    WAIT,
                ])
                actual = tuple(sorted(hit.due_tick for hit in fight.pending if hit.owner == 0))
                self.assertEqual(actual, expected)


class VengeanceTests(unittest.TestCase):
    def test_regular_vengeance_is_legal_again_at_exactly_fifty_logical_ticks(self) -> None:
        fight = RiskFight(77, start_distance=9, initial_pid=0, max_ticks=80)
        cast = FightActions(MainAction.CAST_VENGEANCE, PrayerAction.NONE, MovementAction.HOLD)
        fight.step([cast, WAIT])
        actor = fight.fighters[0]
        self.assertTrue(actor.vengeance_active)
        self.assertEqual(actor.vengeance_runes, 9)
        self.assertEqual(actor.vengeance_cooldown, VENGEANCE_COOLDOWN_TICKS - 1)
        # Consume active Vengeance without killing either fighter so only the
        # cooldown gates the next cast.
        actor.vengeance_active = False
        while fight.tick < VENGEANCE_COOLDOWN_TICKS:
            self.assertFalse(fight.legal_main_mask(0)[MainAction.CAST_VENGEANCE])
            fight.step([WAIT, WAIT])
        self.assertTrue(fight.legal_main_mask(0)[MainAction.CAST_VENGEANCE])

    def test_no_runes_is_fail_closed_and_does_not_activate(self) -> None:
        fight = RiskFight(78, start_distance=9, initial_pid=0, max_ticks=10)
        fight.fighters[0].vengeance_runes = 0
        self.assertFalse(fight.legal_main_mask(0)[MainAction.CAST_VENGEANCE])
        fight.step([FightActions(MainAction.CAST_VENGEANCE, PrayerAction.NONE, MovementAction.HOLD), WAIT])
        self.assertFalse(fight.fighters[0].vengeance_active)
        self.assertEqual(fight.fighters[0].illegal_attempts, 1)

    def test_cast_has_no_unconditional_positive_shaping(self) -> None:
        fight = RiskFight(781, start_distance=9, initial_pid=0, max_ticks=10)
        reward, _ = fight.step([
            FightActions(MainAction.CAST_VENGEANCE, PrayerAction.NONE, MovementAction.HOLD), WAIT,
        ])
        self.assertEqual(float(reward[0]), 0.0)

    def test_runes_exhaust_after_ten_cooldown_observing_casts(self) -> None:
        fight = RiskFight(782, start_distance=9, initial_pid=0, max_ticks=520)
        for cast_number in range(10):
            self.assertTrue(fight.legal_main_mask(0)[MainAction.CAST_VENGEANCE])
            fight.step([
                FightActions(MainAction.CAST_VENGEANCE, PrayerAction.NONE, MovementAction.HOLD), WAIT,
            ])
            fight.fighters[0].vengeance_active = False
            target_tick = (cast_number + 1) * VENGEANCE_COOLDOWN_TICKS
            while fight.tick < target_tick:
                fight.step([WAIT, WAIT])
        self.assertEqual(fight.fighters[0].vengeance_runes, 0)
        self.assertFalse(fight.legal_main_mask(0)[MainAction.CAST_VENGEANCE])

    def test_vengeance_uses_ceil_seventy_five_percent(self) -> None:
        fight = RiskFight(79, start_distance=1, initial_pid=0, max_ticks=10)
        fight.fighters[1].vengeance_active = True
        fight.fighters[1].ring_ultor = True  # Isolate Vengeance from recoil.
        fight.pending.append(PendingHit(0, 0, 0, 1, 5, "melee", "test"))
        fight.step([WAIT, WAIT])
        self.assertEqual(fight.fighters[0].hp, 95)  # ceil(5 * .75) == 4
        self.assertFalse(fight.fighters[1].vengeance_active)


class RewardContractTests(unittest.TestCase):
    def test_reward_dominance_is_mathematically_strict(self) -> None:
        proof = validate_reward_invariant()
        self.assertTrue(proof["terminal_gt_twice_budget"])
        self.assertTrue(proof["win_strictly_dominates_non_ko"])
        self.assertTrue(proof["death_strictly_worse_than_non_ko"])
        self.assertEqual(proof["win_min"], 68.0)
        self.assertEqual(proof["death_max"], -68.0)

    def test_shaping_is_hard_bounded_and_terminal_is_one_shot(self) -> None:
        ledger = RewardLedger()
        ledger.add_shaping(1_000_000)
        self.assertEqual(ledger.shaping, SHAPING_BUDGET)
        ledger.emit_terminal(KO_TERMINAL_REWARD)
        ledger.emit_terminal(-KO_TERMINAL_REWARD)
        self.assertEqual(ledger.terminal, KO_TERMINAL_REWARD)
        self.assertEqual(ledger.total, KO_TERMINAL_REWARD + SHAPING_BUDGET)

    def test_nonfinite_rewards_and_unknown_terminals_fail_closed(self) -> None:
        ledger = RewardLedger()
        with self.assertRaises(ValueError):
            ledger.add_shaping(math.nan)
        with self.assertRaises(ValueError):
            ledger.emit_terminal(17.0)

    def test_valid_combat_attribution_emits_winner_and_loser_once(self) -> None:
        fight = RiskFight(80, start_distance=1, initial_pid=0, max_ticks=10)
        fight.fighters[1].hp = 1
        fight.pending.append(PendingHit(0, 0, 0, 1, 1, "melee", "gmaul_spec"))
        fight.step([WAIT, WAIT])
        self.assertEqual(fight.metrics.outcome, "valid_ko")
        self.assertEqual(fight.metrics.winner, 0)
        self.assertEqual(fight.metrics.terminal_emissions, 2)
        self.assertEqual(fight.fighters[0].reward.terminal, KO_TERMINAL_REWARD)
        self.assertEqual(fight.fighters[1].reward.terminal, -KO_TERMINAL_REWARD)
        self.assertEqual(fight.result_dict()["ko_launch_tick"], 0)
        self.assertAlmostEqual(sum(fighter.reward.total for fighter in fight.fighters), 0.0)

    def test_vengeance_and_recoil_have_opponent_causal_attribution(self) -> None:
        vengeance = RiskFight(801, start_distance=1, initial_pid=0, max_ticks=10)
        vengeance.fighters[0].hp = 3
        vengeance.fighters[1].vengeance_active = True
        vengeance.fighters[1].last_vengeance_cast_tick = 0
        vengeance.fighters[1].ring_ultor = True
        vengeance.tick = 4
        vengeance.pending.append(PendingHit(4, 2, 0, 1, 5, "melee", "gmaul_attack"))
        vengeance.step([WAIT, WAIT])
        self.assertEqual((vengeance.metrics.outcome, vengeance.metrics.winner, vengeance.metrics.ko_source), ("valid_ko", 1, "vengeance"))
        self.assertEqual(vengeance.result_dict()["ko_source_tick"], 0)

        recoil = RiskFight(802, start_distance=1, initial_pid=0, max_ticks=10)
        recoil.fighters[0].hp = 1
        recoil.pending.append(PendingHit(0, 0, 0, 1, 1, "melee", "gmaul_attack"))
        recoil.step([WAIT, WAIT])
        self.assertEqual((recoil.metrics.outcome, recoil.metrics.winner, recoil.metrics.ko_source), ("valid_ko", 1, "recoil"))

    def test_incomplete_or_unknown_ko_attribution_is_rejected(self) -> None:
        fight = RiskFight(806, start_distance=1, initial_pid=0, max_ticks=10)
        fight.fighters[1].hp = 1
        fight.pending.append(PendingHit(0, 0, 0, 1, 1, "melee", "unknown"))
        fight.step([WAIT, WAIT])
        self.assertEqual(fight.metrics.outcome, "invalid_death")
        self.assertEqual([fighter.reward.terminal for fighter in fight.fighters], [0.0, 0.0])

    def test_unattributed_death_gets_no_ko_terminal(self) -> None:
        fight = RiskFight(803, start_distance=1, initial_pid=0, max_ticks=10)
        fight.fighters[1].hp = 0
        fight.step([WAIT, WAIT])
        self.assertEqual(fight.metrics.outcome, "invalid_death")
        self.assertEqual([fighter.reward.terminal for fighter in fight.fighters], [0.0, 0.0])

    def test_timeout_emits_exactly_once_without_terminal_bonus(self) -> None:
        fight = RiskFight(804, start_distance=9, initial_pid=0, max_ticks=1)
        _, done = fight.step([WAIT, WAIT])
        self.assertTrue(done)
        self.assertEqual(fight.metrics.outcome, "timeout")
        self.assertEqual(fight.metrics.terminal_emissions, 2)
        reward_again, done_again = fight.step([WAIT, WAIT])
        self.assertTrue(done_again)
        self.assertEqual(reward_again.tolist(), [0.0, 0.0])
        self.assertEqual(fight.metrics.terminal_emissions, 2)

    def test_shaping_ledger_is_observable_for_markov_reward_state(self) -> None:
        fight = RiskFight(805, start_distance=9, initial_pid=0, max_ticks=10)
        self_index = FEATURE_NAMES.index("self_shaping_ledger")
        opponent_index = FEATURE_NAMES.index("opponent_shaping_ledger")
        fight.fighters[0].reward.add_shaping(8.0)
        observation = fight.observe(0)
        self.assertAlmostEqual(float(observation[self_index]), 0.25)
        self.assertAlmostEqual(float(observation[opponent_index]), 0.0)

    def test_simultaneous_death_is_bad_for_each_agent_not_shared_collusion_reward(self) -> None:
        fight = RiskFight(81, start_distance=1, initial_pid=0, max_ticks=10)
        fight.fighters[0].hp = 1
        fight.fighters[1].hp = 1
        fight.pending.extend((
            PendingHit(0, 0, 0, 1, 1, "ranged", "webweaver_attack"),
            PendingHit(0, 0, 1, 0, 1, "ranged", "webweaver_attack"),
        ))
        fight.step([WAIT, WAIT])
        self.assertEqual(fight.metrics.outcome, "simultaneous_ko")
        self.assertEqual([fighter.reward.terminal for fighter in fight.fighters], [-KO_TERMINAL_REWARD, -KO_TERMINAL_REWARD])


if __name__ == "__main__":
    unittest.main()
