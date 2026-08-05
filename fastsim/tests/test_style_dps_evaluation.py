"""Focused checks for the source-formula Magic/Ranged DPS sweep."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import evaluate_style_dps  # noqa: E402


def test_sweep_covers_every_legal_switchable_gear_combination():
    rows, equipped = evaluate_style_dps.defender_gear_states()
    assert len(rows) == 756
    assert equipped.shape == (756, 14)


def test_report_uses_current_kronos_attack_speeds_and_prayer_reduction():
    report = evaluate_style_dps.build_report()
    assert report["configuration"]["magicAttackTicks"] == 4
    assert report["configuration"]["rangedAttackTicks"] == 5
    assert len(report["rows"]) == 756
    for row in report["rows"]:
        assert row["magic"]["protectedDps"] < row["magic"]["unprotectedDps"]
        assert row["ranged"]["protectedDps"] < row["ranged"]["unprotectedDps"]
        assert 0.0 <= row["twoStyleMinimaxProtectMagicPct"] <= 100.0


def test_voidwaker_special_is_magic_and_protection_reduces_it():
    result = evaluate_style_dps._voidwaker_summary()
    assert result["specialEnergyCostPct"] == 50
    assert (
        result["specialExpectedDamageProtectMagic"]
        < result["specialExpectedDamageUnprotected"])
