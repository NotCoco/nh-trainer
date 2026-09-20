"""Focused accounting/selection checks; never runs a bridge or a training job."""
from __future__ import annotations

import copy
import contextlib
import io
import json
from collections import Counter
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from train_riskfight_browser_cuda import (
    BOOTSTRAP_SCRIPTS, HELDOUT_SCRIPTS, OBJECTIVE_VERSION, Frame, Schema,
    audit_objective_report, bootstrap_coverage, bootstrap_schedule, combo_improvement_evidence, combo_selection_rank,
    demonstration_agreement, demonstration_diagnostics, paired_metric_delta, parse_args, validate_combo_contract,
    validate_prior_seed_exposure,
)
from export_riskfight_browser_v2 import validate_export_qualification, validate_objective_evidence


CONTRACT = {
    "version": OBJECTIVE_VERSION, "gamma": 1, "combo_bonus_cap": 0,
    "stocked_healing_threshold": 44, "combo_window_tick_span": 1,
    "combo_min_damage": 40, "combo_ko_min_damage": 50, "material_hit_min_damage": 8,
    "combo_ko_terminal": 100, "ordinary_ko_terminal": 100, "exhausted_ko_terminal": 100,
    "death_terminal": -100, "draw_terminal": 0, "timeout_terminal": -30,
    "damage_reward": .01, "pressure_reward_limit": 5, "cast_reward": 0,
    "missed_attack_window_ticks": 20, "missed_attack_base_cost": .02, "missed_attack_recent_cost": .005,
    "combo_bonus_retained_only": "disabled; combo counts are diagnostics",
    "chance_probability_scale": 30, "chance_reward_limit": 20, "chance_window_tick_span": 1,
    "chance_credit": "bounded symmetric potential of accumulated same/adjacent-tick lethal probability; retained on every outcome",
}


def report(stock: float = 44, combo: bool = True) -> dict:
    return {
        "outcome": "ko", "winner": 0, "healingRemaining": [100, stock],
        "stockedKos": [int(stock > 0), 0], "exhaustedKos": [int(stock == 0), 0],
        "stockedComboKos": [int(combo), 0], "terminalReward": [100, -100],
        "comboReward": [0, 0], "objectiveReturn": [100, -100],
        "chanceCreated": [0, 0], "chanceReceived": [0, 0], "chanceReward": [0, 0],
        "pressureDamage": [0, 0], "pressureReward": [0, 0], "stallPenalty": [0, 0], "missedAttackTicks": [0, 0],
    }


def split(start: int) -> dict:
    return {"training_range_inclusive_exclusive": [start, start + 10],
            "bootstrap_range_inclusive_exclusive": [0, 0],
            "validation": [start + 20], "heldout": [start + 30]}


def evidence_fixture():
    current = {"checkpoint_sha256": "a" * 64, "parameter_sha256": "b" * 64, "runtime_profile": "risk_webweaver_v2"}
    stable = {"checkpoint_sha256": "c" * 64, "parameter_sha256": "d" * 64}
    diagnostics = {metric: {side: {"sum": value} for side in ("challenger", "opponent")}
                   for metric, value in (("decisions", 1000), ("pressureDamage", 2000), ("readyWaitTicks", 10))}
    heldout = {"objective_version": OBJECTIVE_VERSION, "opponent": current, "seed_count": 8,
               "no_illegal_actions": True, "score_rate": .56, "timeouts": 0, "diagnostics": diagnostics,
               "confidence_interval": {"chance_differential": [-.01, .1], "score_rate": [.51, .61]}}
    stable_metrics = {"objective_version": OBJECTIVE_VERSION, "opponent": stable, "seed_count": 8,
                      "no_illegal_actions": True, "score_rate": .8}
    scripts = {script.name: {
        "paired_combo_difference": {"metric": "combo_difference", "seed_count": 8, "confidence_interval_95": [-.2, -.1]},
        "paired_own_combo_ko_rate_difference": {"metric": "own_combo_ko", "mean_delta": -.1, "seed_count": 8, "confidence_interval_95": [-.2, -.01]},
        "paired_difference": {"metric": "score", "mean_delta": .02, "seed_count": 8, "confidence_interval_95": [-.03, .07]},
        "paired_chance_received_difference": {"metric": "chance_received", "mean_delta": -.02, "seed_count": 8, "confidence_interval_95": [-.1, .06]},
        "paired_chance_created_difference": {"metric": "chance_created", "mean_delta": .02, "seed_count": 8, "confidence_interval_95": [-.04, .08]},
        "candidate": {"no_illegal_actions": True}, "incumbent": {"no_illegal_actions": True}}
        for script in HELDOUT_SCRIPTS}
    varied = {"objective_version": OBJECTIVE_VERSION, "current_incumbent": current, "no_illegal_actions": True,
              "used_for_selection": False, "scripts": scripts, "mean_own_combo_ko_rate_delta": -.1,
              "mean_chance_received_delta": -.02, "any_significant_chance_received_regression": False,
              "any_significant_chance_created_regression": False, "any_significant_ordinary_score_regression": False}
    return {"objective_version": OBJECTIVE_VERSION, "reward_contract": CONTRACT, "bridge_schema": {"reward": CONTRACT},
            "current_incumbent": current, "stable_v1_reference": stable, "source_baseline_sha256": stable["checkpoint_sha256"],
            "baseline_parameter_sha256": stable["parameter_sha256"], "heldout": heldout,
            "varied_opponents": varied, "stable_v1_evaluation": stable_metrics,
            "improvement_evidence": combo_improvement_evidence(heldout, varied, stable_metrics)}


class ComboObjectiveTests(unittest.TestCase):
    def test_contract_rejects_previous_reward_and_pressure_inflation(self):
        self.assertEqual(OBJECTIVE_VERSION, "ko_chance_pressure_v1")
        validate_combo_contract(CONTRACT)
        for key, value in (("version", "lethal_chance_v1"), ("death_terminal", -10), ("damage_reward", 1),
                           ("chance_reward_limit", 100), ("combo_bonus_cap", 20)):
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_combo_contract({**CONTRACT, key: value})

    def test_every_ko_has_equal_terminal_value(self):
        for stock, combo in ((0, False), (22, False), (44, False), (44, True)):
            value = report(stock, combo)
            audit_objective_report(value, CONTRACT, np.asarray([100, -100]))
        with self.assertRaises(ValueError):
            audit_objective_report(report(), CONTRACT, np.asarray([101, -100]))
        value = report(0, False)
        value['terminalReward'][0] = 0
        with self.assertRaisesRegex(ValueError, 'terminal reward'):
            audit_objective_report(value, CONTRACT)

    def test_shaping_survives_all_outcomes_with_exact_accounting(self):
        for outcome, terminals in (("ko", [100, -100]), ("simultaneous-ko", [0, 0]), ("timeout", [-30, -30])):
            value = report()
            if outcome != 'ko':
                value.update(outcome=outcome, winner=None, stockedKos=[0, 0], stockedComboKos=[0, 0])
            chance = 20 * np.tanh(30 * .25 / 20)
            pressure = -5 * np.expm1(-.01 * 55 / 5)
            value.update(terminalReward=terminals, chanceCreated=[.35, .1], chanceReceived=[.1, .35],
                         chanceReward=[chance, -chance], pressureDamage=[55, 0], pressureReward=[pressure, 0],
                         stallPenalty=[-.055, 0], missedAttackTicks=[2, 0])
            value['objectiveReturn'] = [terminals[0] + chance + pressure - .055, terminals[1] - chance]
            audit_objective_report(value, CONTRACT, np.asarray(value['objectiveReturn']))
            value['chanceReward'][0] += 1
            with self.assertRaisesRegex(ValueError, 'chance reward'):
                audit_objective_report(value, CONTRACT)

    def test_no_combo_bonus_or_pressure_fabrication(self):
        for field, entry in (('comboReward', [1, 0]), ('pressureReward', [5, 0]),
                             ('stallPenalty', [.1, 0]), ('pressureDamage', [-1, 0]), ('missedAttackTicks', [1, 0])):
            value = report()
            value[field] = entry
            with self.subTest(field=field), self.assertRaises(ValueError):
                audit_objective_report(value, CONTRACT)

    def test_selection_uses_full_objective_then_all_ko_score(self):
        value = {'no_illegal_actions': True, 'mean_objective_return': 10, 'score_rate': .55, 'stocked_combo_ko_rate': .1}
        self.assertGreater(combo_selection_rank({**value, 'mean_objective_return': 11}), combo_selection_rank(value))
        self.assertGreater(combo_selection_rank({**value, 'score_rate': .56}), combo_selection_rank(value))
        self.assertEqual(combo_selection_rank({**value, 'stocked_combo_ko_rate': 1}), combo_selection_rank(value))
        self.assertLess(combo_selection_rank({**value, 'no_illegal_actions': False}), combo_selection_rank(value))

    def test_improved_wins_can_qualify_despite_fewer_combo_kos(self):
        value = evidence_fixture()
        self.assertTrue(validate_objective_evidence(value, 'a' * 64)['passed'])

    def test_better_chance_needs_noninferior_ko_score(self):
        value = evidence_fixture()
        heldout = value['heldout']
        heldout.update(score_rate=.51, confidence_interval={'score_rate': [.48, .54], 'chance_differential': [.01, .1]})
        self.assertTrue(combo_improvement_evidence(heldout, value['varied_opponents'], value['stable_v1_evaluation'])['passed'])
        heldout['confidence_interval']['score_rate'][0] = .47
        self.assertFalse(combo_improvement_evidence(heldout, value['varied_opponents'], value['stable_v1_evaluation'])['passed'])

    def test_no_passive_or_low_pressure_promotion(self):
        for mutation in ('pressure', 'stall', 'timeout', 'inconclusive'):
            value = evidence_fixture()
            heldout = value['heldout']
            if mutation == 'pressure': heldout['diagnostics']['pressureDamage']['challenger']['sum'] = 1700
            elif mutation == 'stall': heldout['diagnostics']['readyWaitTicks']['challenger']['sum'] = 81
            elif mutation == 'timeout': heldout['timeouts'] = 1
            else: heldout['confidence_interval']['score_rate'] = [.48, .6]
            with self.subTest(mutation=mutation):
                self.assertFalse(combo_improvement_evidence(heldout, value['varied_opponents'], value['stable_v1_evaluation'])['passed'])

    def test_export_rejects_missing_or_inconsistent_opponent_evidence(self):
        for mutation in ('reference', 'missing', 'chance', 'score', 'objective'):
            value = evidence_fixture()
            entry = value['varied_opponents']['scripts'][HELDOUT_SCRIPTS[0].name]
            if mutation == 'reference': value['current_incumbent']['checkpoint_sha256'] = 'x'
            elif mutation == 'missing': value['varied_opponents']['scripts'].pop(HELDOUT_SCRIPTS[0].name)
            elif mutation == 'chance': value['varied_opponents']['mean_chance_received_delta'] = -.5
            elif mutation == 'score': entry['paired_difference']['confidence_interval_95'] = [-.2, -.01]
            else: value['objective_version'] = 'old'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate_objective_evidence(value, 'a' * 64)

    def test_frozen_reference_ancestry_is_in_seed_guard(self):
        checkpoint = {'seed_split': split(100), 'resume_lineage': [], 'reference_seed_exposure': [{'seed_split': split(200)}]}
        validate_prior_seed_exposure(split(300), checkpoint)
        with self.assertRaisesRegex(ValueError, 'frozen-reference ancestor'):
            validate_prior_seed_exposure(split(200), checkpoint)


class ExportQualificationTests(unittest.TestCase):
    def setUp(self):
        schema = {"reward": CONTRACT, "feature_names": ["self_hp"], "action_heads": {"main": ["WAIT"]}, "source_sha256": {"engine.ts": "e" * 64}}
        current = {"checkpoint_sha256": "a" * 64, "parameter_sha256": "b" * 64}
        stable = {"checkpoint_sha256": "c" * 64, "parameter_sha256": "d" * 64}
        self.checksum = "f" * 64
        self.checkpoint = {"export_ready": False, "stage": "update_002", "objective_version": OBJECTIVE_VERSION,
                           "selection": {"stage": "update_002", "heldout_used_for_selection": False},
                           "source_requalification": {"required": False}, "reward_contract": CONTRACT,
                           "bridge_schema": schema, "bridge_sha256": "1" * 64, "parameter_sha256": "2" * 64,
                           "schema_sha256": "3" * 64, "current_incumbent": current, "stable_v1_reference": stable,
                           "source_baseline_sha256": stable["checkpoint_sha256"], "baseline_parameter_sha256": stable["parameter_sha256"],
                           "seed_split": split(100), "resume_lineage": [{"seed_split": split(300)}],
                           "reference_seed_exposure": [{"seed_split": split(400)}]}
        self.reference = {"seed_split": split(200)}
        self.qualification = {"mode": "evaluate_only", "learned_weight_computation": False,
                              "candidate_sha256": self.checksum, "candidate_parameter_sha256": "2" * 64,
                              "source_baseline_sha256": stable["checkpoint_sha256"], "schema_sha256": "3" * 64,
                              "current_incumbent": copy.deepcopy(current), "stable_v1_reference": copy.deepcopy(stable),
                              "baseline_parameter_sha256": stable["parameter_sha256"], "training_bridge_schema": copy.deepcopy(schema),
                              "training_bridge_sha256": "1" * 64, "bridge_schema": copy.deepcopy(schema), "seed_split": {"heldout": [1000, 1001]}, "fights": [{"seed": 1000}, {"seed": 1001}]}

    def qualify(self, qualification):
        return validate_export_qualification(self.checkpoint, qualification, self.checksum, "a" * 64, self.reference)

    def test_passing_fresh_report_can_qualify_fixed_previously_unqualified_weights(self):
        with patch("export_riskfight_browser_v2.validate_objective_evidence", return_value={"passed": True}) as gate:
            self.assertTrue(self.qualify(self.qualification)["passed"])
            gate.assert_called_once_with(self.qualification, "a" * 64)
        self.assertFalse(self.checkpoint["export_ready"])
        with self.assertRaisesRegex(ValueError, "explicit passing"):
            self.qualify(None)
        with patch("export_riskfight_browser_v2.validate_objective_evidence", side_effect=ValueError("strength gate failed")):
            with self.assertRaisesRegex(ValueError, "strength gate failed"):
                self.qualify(self.qualification)
        self.checkpoint["export_ready"] = True
        with patch("export_riskfight_browser_v2.validate_objective_evidence", return_value={"passed": True}) as gate:
            self.qualify(None)
            gate.assert_called_once_with(self.checkpoint, "a" * 64)

    def test_qualification_preserves_identity_and_training_provenance(self):
        changes = [("mode", "training"), ("learned_weight_computation", True), ("candidate_sha256", "wrong"),
                   ("candidate_parameter_sha256", "wrong"), ("source_baseline_sha256", "wrong"), ("schema_sha256", "wrong"),
                   ("current_incumbent", {}), ("stable_v1_reference", {}), ("baseline_parameter_sha256", "wrong"),
                   ("training_bridge_schema", {}), ("training_bridge_sha256", "wrong"),
                   ("bridge_schema", {"feature_names": ["private_hp"], "action_heads": {"main": ["WAIT"]}})]
        for key, value in changes:
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.qualify({**self.qualification, key: value})

    def test_qualification_seed_metadata_matches_completed_fights(self):
        for seeds in ([], [1000, 1000], [1000, 1002]):
            with self.subTest(seeds=seeds), self.assertRaisesRegex(ValueError, "seed metadata"):
                self.qualify({**self.qualification, "seed_split": {"heldout": seeds}})

    def test_fresh_report_cannot_qualify_inherited_or_source_incomplete_selection(self):
        for stage in ("current_incumbent", "resumed_v2", "update_000"):
            with self.subTest(stage=stage), self.assertRaisesRegex(ValueError, "validation-selected trained"):
                validate_export_qualification({**self.checkpoint, "stage": stage}, self.qualification, self.checksum, "a" * 64, self.reference)
        for selection in ({"stage": "update_003", "heldout_used_for_selection": False},
                          {"stage": "update_002", "heldout_used_for_selection": True}):
            with self.subTest(selection=selection), self.assertRaises(ValueError):
                validate_export_qualification({**self.checkpoint, "selection": selection}, self.qualification, self.checksum, "a" * 64, self.reference)
        with self.assertRaisesRegex(ValueError, "source requalification"):
            validate_export_qualification({**self.checkpoint, "source_requalification": {"required": True, "passed": False}},
                                          self.qualification, self.checksum, "a" * 64, self.reference)

    def test_fresh_seeds_exclude_prior_heldout_and_all_training_ancestry(self):
        for seed in (100, 120, 130, 200, 220, 230, 300, 330, 400, 430):
            with self.subTest(seed=seed), self.assertRaisesRegex(ValueError, "seed overlap"):
                self.qualify({**self.qualification, "seed_split": {"heldout": [1000, seed]}})
        self.checkpoint["export_ready"] = True
        with patch("export_riskfight_browser_v2.validate_objective_evidence", return_value={"passed": True}):
            self.assertTrue(self.qualify({**self.qualification, "seed_split": {"heldout": [130, 230]}, "fights": [{"seed": 130}, {"seed": 230}]})["passed"])


class FinishingDemonstrationTests(unittest.TestCase):
    def test_216_schedule_balances_coverage_and_excludes_opponent_labels(self):
        configs, scripts, teachers = bootstrap_schedule(216, 360, 1234, True)
        self.assertEqual([row["seed"] for row in configs], list(range(1234, 1450)))
        self.assertTrue(np.all(teachers.reshape(-1, 2).sum(axis=1) == 1))
        self.assertEqual(int((scripts < 0).sum()), 108)
        self.assertEqual(int((~teachers & (scripts >= 0)).sum()), 108)
        self.assertFalse(teachers[scripts < 0].any())
        coverage, script_pairings = Counter(), Counter()
        for row in np.flatnonzero(teachers):
            config = configs[row // 2]
            cell = (int(scripts[row]), config["startDistance"], config["pid"], int(row % 2))
            coverage[(*cell, "current" if scripts[row ^ 1] < 0 else "script")] += 1
            if scripts[row ^ 1] >= 0:
                script_pairings[(*cell, int(scripts[row ^ 1]))] += 1
        self.assertEqual(len(coverage), 72)
        self.assertEqual(set(coverage.values()), {3})
        self.assertEqual(len(script_pairings), 108)
        self.assertEqual(set(script_pairings.values()), {1})

    def test_default_bootstrap_schedule_remains_two_teacher_selfplay(self):
        configs, scripts, teachers = bootstrap_schedule(9, 360, 42, False)
        self.assertTrue(teachers.all())
        self.assertTrue((scripts >= 0).all())
        self.assertEqual([row["startDistance"] for row in configs], [1, 5, 9] * 3)
        self.assertEqual([row["pid"] for row in configs], [0] * 3 + [1] * 3 + [0] * 3)
        self.assertEqual(scripts.tolist(), [0, 1, 1, 2, 2, 0] * 3)

    def test_actual_coverage_metadata_serializes_inside_bootstrap_report(self):
        for finishing, fights in ((True, 216), (False, 9)):
            with self.subTest(finishing=finishing):
                configs, scripts, teachers = bootstrap_schedule(fights, 360, 1234, finishing)
                coverage = bootstrap_coverage(configs, scripts, teachers)
                report = {"training": {"demonstration_diagnostics": coverage}, "selected": True}
                encoded = json.dumps(report, sort_keys=True, allow_nan=False)
                self.assertEqual(json.loads(encoded), report)
                self.assertTrue(all(type(row["side"]) is int for row in coverage["teacher_start_coverage"]))
                if finishing:
                    self.assertEqual(coverage["coverage_summary"], {"cells": 72, "min_fights_per_cell": 3, "max_fights_per_cell": 3})

    def setUp(self):
        # Only the public/self fields consumed by the teacher; no engine state.
        self.scales = {"self_hp": 115, "opponent_hp": 115, "self_attack_timer": 7,
                       "self_special": 100, "distance": 9, "self_attack_level": 120,
                       "self_strength_level": 120, "self_ranged_level": 120,
                       "self_magic_level": 120, "self_prayer_points": 99,
                       "self_gmaul_preloaded": 1, "self_weapon_gmaul": 1,
                       "self_gmaul_queued": 2, "self_vengeance_cooldown": 50,
                       "incoming_projectiles_one_tick": 4, "outgoing_projectiles_one_tick": 4,
                       "episode_progress": 360}
        self.schema = Schema(list(self.scales), {
            "main": ["WAIT", "WEBWEAVER_ATTACK", "WEBWEAVER_SPEC", "GMAUL_ATTACK", "GMAUL_SPEC", "ELDER_ATTACK",
                     "EAT_MARLIN", "EAT_SUMMER_PIE", "EAT_HALIBUT", "EAT_MARLIN_HALIBUT", "EAT_PIE_HALIBUT",
                     "CAST_VENGEANCE", "SIP_SUPER_RANGING", "SIP_SUPER_COMBAT", "SIP_BREW", "SIP_SANFEW",
                     "EQUIP_ULTOR", "EQUIP_RECOIL", "GMAUL_DOUBLE_SPEC", "GMAUL_PRELOAD", "GMAUL_RELEASE"],
            "prayer": ["NONE", "PROTECT_RANGED", "PROTECT_MELEE"],
            "movement": ["HOLD", "STEP_CLOSER", "STEP_AWAY"],
        }, {})

    def frame(self, *, allowed=None, **values):
        raw = {"self_hp": 99, "opponent_hp": 70, "self_attack_level": 118,
               "self_strength_level": 118, "self_ranged_level": 112, "self_magic_level": 99,
               "self_prayer_points": 99, "self_special": 100, "distance": 1, **values}
        row = [raw.get(name, 0) / scale for name, scale in self.scales.items()]
        masks = np.asarray([[allowed is None or name in (*allowed, "WAIT")
                             for name in self.schema.action_heads["main"]]] * 2)
        return Frame(np.asarray([row, row], dtype=np.float32), masks,
                     np.ones((2, 3), dtype=bool), np.zeros(2), np.zeros(1, dtype=bool), [None])

    def action(self, frame, script=None, **kwargs):
        chosen = (script or BOOTSTRAP_SCRIPTS[0]).actions(frame, np.asarray([0]), self.schema, **kwargs)[0]
        return tuple(self.schema.action_heads[head][index] for head, index in zip(("main", "movement"), chosen))

    def test_full_hp_cast_opportunity_is_deferred_only_with_opt_in(self):
        frame = self.frame(opponent_hp=99, distance=3, incoming_projectiles_one_tick=1,
                           outgoing_projectiles_one_tick=1)
        for script in (*BOOTSTRAP_SCRIPTS, *HELDOUT_SCRIPTS):
            with self.subTest(script=script.name):
                self.assertEqual(self.action(frame, script)[0], "CAST_VENGEANCE")
                self.assertEqual(self.action(frame, script), self.action(frame, script, finishing_demonstrations=False))
                self.assertEqual(self.action(frame, script, finishing_demonstrations=True)[0], "WEBWEAVER_ATTACK")

    def test_food_precedes_finish_and_other_routine_choices_are_preserved(self):
        cases = [({"self_hp": 20, "incoming_projectiles_one_tick": 1}, "EAT_MARLIN_HALIBUT"),
                 ({"opponent_hp": 40}, "GMAUL_DOUBLE_SPEC"),
                 ({"opponent_hp": 99, "distance": 9}, "WEBWEAVER_ATTACK"),
                 ({"opponent_hp": 99, "self_ranged_level": 99}, "SIP_SUPER_RANGING")]
        for values, expected in cases:
            for script in (*BOOTSTRAP_SCRIPTS, *HELDOUT_SCRIPTS):
                with self.subTest(values=values, script=script.name):
                    frame = self.frame(**values)
                    old = self.action(frame, script)
                    self.assertEqual(old[0], expected)
                    self.assertEqual(old, self.action(frame, script, finishing_demonstrations=True))

    def test_vengeance_can_prepare_legal_instant_maul_on_busy_normal_timer(self):
        frame = self.frame(self_attack_timer=4, incoming_projectiles_one_tick=1,
                           allowed=("CAST_VENGEANCE", "GMAUL_DOUBLE_SPEC"))
        self.assertEqual(self.action(frame, finishing_demonstrations=True), ("CAST_VENGEANCE", "HOLD"))
        frame.main_masks[:, self.schema.action_heads["main"].index("GMAUL_DOUBLE_SPEC")] = False
        self.assertEqual(self.action(frame, finishing_demonstrations=True)[0], "WAIT")

    def test_queued_arrow_finish_requires_next_tick_incoming(self):
        frame = self.frame(distance=5, self_attack_timer=2, outgoing_projectiles_one_tick=1,
                           incoming_projectiles_one_tick=1)
        self.assertEqual(self.action(frame, finishing_demonstrations=True)[0], "CAST_VENGEANCE")
        frame.observations[:, self.schema.feature_names.index("incoming_projectiles_one_tick")] = 0
        self.assertEqual(self.action(frame, finishing_demonstrations=True)[0], "WAIT")

    def test_recent_own_vengeance_allows_maul_before_stale_hp_drops(self):
        frame = self.frame(self_attack_timer=4, self_vengeance_cooldown=49,
                           allowed=("GMAUL_DOUBLE_SPEC",))
        self.assertEqual(self.action(frame, finishing_demonstrations=True), ("GMAUL_DOUBLE_SPEC", "HOLD"))
        for changes in ({"self_vengeance_cooldown": 47}, {"opponent_hp": 90}):
            values = {"self_attack_timer": 4, "self_vengeance_cooldown": 49, **changes}
            with self.subTest(changes=changes):
                self.assertEqual(self.action(self.frame(allowed=("GMAUL_DOUBLE_SPEC",), **values),
                                             finishing_demonstrations=True)[0], "WAIT")

    def test_elder_followup_requires_completed_maul_and_ready_shared_timer(self):
        values = {"self_weapon_gmaul": 1, "self_special": 0, "opponent_hp": 70}
        frame = self.frame(**values)
        self.assertEqual(self.action(frame)[0], "WEBWEAVER_ATTACK")
        self.assertEqual(self.action(frame, finishing_demonstrations=True), ("ELDER_ATTACK", "HOLD"))
        for changes in ({"self_attack_timer": 1}, {"self_gmaul_queued": 1},
                        {"self_gmaul_preloaded": 1}, {"self_weapon_gmaul": 0}, {"distance": 3}):
            with self.subTest(changes=changes):
                self.assertNotEqual(self.action(self.frame(**{**values, **changes}),
                                                finishing_demonstrations=True)[0], "ELDER_ATTACK")
        frame.main_masks[:, self.schema.action_heads["main"].index("ELDER_ATTACK")] = False
        self.assertEqual(self.action(frame, finishing_demonstrations=True)[0], "WEBWEAVER_ATTACK")

    def test_heldout_thresholds_and_training_only_cli_boundary_are_preserved(self):
        self.assertEqual([tuple(script.metadata().values()) for script in HELDOUT_SCRIPTS], [
            ("heldout_aggressive", 47, 31, 25, 70, 1), ("heldout_balanced", 61, 41, 37, 59, 4),
            ("heldout_conservative", 74, 51, 49, 42, 6)])
        self.assertFalse(parse_args(["--resume-v2", "unused.pt"]).finishing_demonstrations)
        self.assertTrue(parse_args(["--resume-v2", "unused.pt", "--finishing-demonstrations"]).finishing_demonstrations)
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            parse_args(["--evaluate-only", "unused.pt", "--current-incumbent-v2", "reference.pt", "--finishing-demonstrations"])

    def test_demo_counts_distinguish_labels_from_actual_engine_outcomes(self):
        names = self.schema.action_heads["main"]
        labels = [names.index(name) for name in ("CAST_VENGEANCE", "WAIT", "WEBWEAVER_ATTACK", "WAIT")]
        frames = [self.frame(episode_progress=tick) for tick in (1, 2, 5, 9)]
        arrays = {"observations": np.asarray([frame.observations[0] for frame in frames]),
                  "main_masks": np.asarray([frame.main_masks[0] for frame in frames]),
                  "actions": np.asarray([[index, 0] for index in labels])}
        arrays["main_masks"][-1, names.index("CAST_VENGEANCE")] = False
        actual = {key: [0, 0] for key in ("openingVengeanceCasts", "vengeanceCasts", "vengeanceReflectedDamage",
                                        "vengeanceStackDamage", "vengeanceComboDamage", "vengeanceComboKos",
                                        "doubleMaulAttacks", "elderAttacks", "elderAfterDoubleMaul", "stockedComboKos", "illegal")}
        actual.update(seed=42, winner=0, outcome="ko", vengeanceCasts=[1, 0], elderAfterDoubleMaul=[2, 0],
                      comboFinish={"usefulDamage": 60, "healingRemaining": 44})
        weights = np.ones(len(names))
        weights[names.index("CAST_VENGEANCE")] = 3
        weights[names.index("WAIT")] = .5
        result = demonstration_diagnostics(arrays, [actual], self.schema, 360, weights)
        self.assertEqual((result["cast_legal_rows"], result["cast_legal_labeled_cast"], result["cast_legal_deferred"]), (3, 1, 2))
        self.assertEqual(result["cast_legal_deferred_actions"], {"WAIT": 1, "WEBWEAVER_ATTACK": 1})
        self.assertEqual(result["cast_legal_row_weight_mass"], {"cast": 3, "deferred": 1.5})
        self.assertEqual(result["opening_cast_labels"], 1)
        self.assertEqual(result["actual_demo_outcomes"]["openingVengeanceCasts"], 0)
        self.assertEqual(result["actual_demo_outcomes"]["elderAfterDoubleMaul"], 2)
        self.assertEqual(result["actual_combo_finishes"][0]["comboFinish"], actual["comboFinish"])
        actual["openingVengeanceCasts"][1] = 1
        actual["elderAfterDoubleMaul"][1] = 99
        teacher = demonstration_diagnostics(arrays, [actual], self.schema, 360, weights, np.asarray([True, False]))
        opponent = demonstration_diagnostics(arrays, [actual], self.schema, 360, weights, np.asarray([False, True]))
        self.assertEqual(teacher["actual_demo_outcomes"]["actors"], 1)
        self.assertEqual(teacher["actual_demo_outcomes"]["openingVengeanceCasts"], 0)
        self.assertEqual(teacher["actual_demo_outcomes"]["elderAfterDoubleMaul"], 2)
        self.assertEqual(opponent["actual_demo_outcomes"]["openingVengeanceCasts"], 1)
        self.assertEqual(opponent["actual_demo_outcomes"]["elderAfterDoubleMaul"], 99)
        self.assertEqual(opponent["actual_combo_finishes"], [])

    def test_agreement_separates_opponent_context_and_joint_coordination(self):
        names = self.schema.action_heads["main"]
        label_names = ("WAIT", "GMAUL_DOUBLE_SPEC", "ELDER_ATTACK", "CAST_VENGEANCE")
        predicted_names = ("CAST_VENGEANCE", "GMAUL_DOUBLE_SPEC", "ELDER_ATTACK", "WAIT")
        frame = self.frame()
        data = {"observations": torch.as_tensor(np.repeat(frame.observations[:1], 4, axis=0)),
                "main_masks": torch.as_tensor(np.repeat(frame.main_masks[:1], 4, axis=0)),
                "movement_masks": torch.ones((4, 3), dtype=torch.bool),
                "actions": torch.tensor([[names.index(name), 0] for name in label_names]),
                "opponent_current": torch.tensor([True, True, False, False])}
        main, movement = torch.zeros((4, len(names))), torch.zeros((4, 3))
        for index, name in enumerate(predicted_names):
            main[index, names.index(name)] = 10
            movement[index, 2 if index == 1 else 0] = 10
        model = Mock(training=True, return_value=(main, None, movement, None))
        result = demonstration_agreement(model, data, self.schema, 360, 4)
        self.assertEqual(result["current"]["opening_cast_legal_defer"],
                         {"rows": 2, "main_correct": 1, "joint_correct": 0, "cast_predictions": 1})
        self.assertEqual(result["current"]["maul"]["main_correct"], 1)
        self.assertEqual(result["current"]["maul"]["joint_correct"], 0)
        self.assertEqual(result["script"]["elder"]["joint_correct"], 1)
        self.assertEqual(result["script"]["cast_legal_cast"]["cast_predictions"], 0)
        model.train.assert_called_once_with(True)


if __name__ == "__main__":
    unittest.main()
