import io
import json
import math
import sys
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import generate


def _result(
        shard,
        *,
        active_end_ns,
        finalized_ns,
        decisions,
        active_decisions,
        fight_ticks,
        rows_written,
        nhrl_bytes,
        nhev_bytes):
    return {
        "shard": shard,
        "common_start_ns": 10_000_000_000,
        "active_started_ns": 10_000_000_000 + shard * 1_000,
        "active_ended_ns": active_end_ns,
        "finalized_ns": finalized_ns,
        "wall_seconds": (
            finalized_ns - 10_000_000_000) / 1_000_000_000.0,
        "setup_seconds": 0.25 + shard,
        "warmup_seconds": 0.01,
        "active_wall_seconds": (
            active_end_ns - 10_000_000_000) / 1_000_000_000.0,
        "finalize_seconds": (
            finalized_ns - active_end_ns) / 1_000_000_000.0,
        "engine_step_seconds": 1.0,
        "writer_write_seconds": 0.5,
        "engine_flush_seconds": 0.02,
        "writer_close_seconds": 0.03,
        "durable_sync_seconds": 0.04,
        "fight_ticks": fight_ticks,
        "decisions_generated": decisions,
        "active_decisions": active_decisions,
        "rows_generated": decisions,
        "rows_written": rows_written,
        "nhrl_bytes": nhrl_bytes,
        "nhev_bytes": nhev_bytes,
        "output_bytes": nhrl_bytes + nhev_bytes,
        "side0_wins": 1,
        "side1_wins": 2,
        "draws": 3,
        "output": f"shard-{shard}.nhrl",
    }


def test_report_uses_one_common_interval_and_keeps_full_precision():
    args = SimpleNamespace(workers=2, fights=64, episodes_per_lane=1)
    results = [
        _result(
            0,
            active_end_ns=12_000_000_000,
            finalized_ns=12_500_000_000,
            decisions=150,
            active_decisions=140,
            fight_ticks=100,
            rows_written=150,
            nhrl_bytes=1000,
            nhev_bytes=500),
        _result(
            1,
            active_end_ns=13_000_000_000,
            finalized_ns=14_000_000_000,
            decisions=250,
            active_decisions=210,
            fight_ticks=150,
            rows_written=250,
            nhrl_bytes=2000,
            nhev_bytes=750),
    ]

    report = generate.build_report(args, results, 9.87654321)

    assert report["process_wall_seconds"] == 9.87654321
    assert report["wall_seconds"] == 9.87654321
    assert report["common_active_wall_seconds"] == 3.0
    assert report["common_total_wall_seconds"] == 4.0
    assert report["decisions_per_second"] == 100.0
    assert math.isclose(
        report["process_decisions_per_second"], 400 / 9.87654321)
    assert math.isclose(
        report["active_decisions_per_second"], 350 / 3)
    assert report["slot_decisions"] == 500
    assert report["decision_occupancy"] == 0.8
    assert report["rows_generated"] == 400
    assert report["rows_written"] == 400
    assert report["nhrl_bytes"] == 3000
    assert report["nhev_bytes"] == 1250
    assert report["output_bytes"] == 4250
    assert report["worker_start_skew_seconds"] == 0.000001


def test_report_handles_no_available_slots_without_dividing_by_zero():
    args = SimpleNamespace(workers=1, fights=0, episodes_per_lane=1)
    result = _result(
        0,
        active_end_ns=10_000_000_000,
        finalized_ns=10_000_000_000,
        decisions=0,
        active_decisions=0,
        fight_ticks=0,
        rows_written=0,
        nhrl_bytes=0,
        nhev_bytes=0)

    report = generate.build_report(args, [result], 0.0)

    assert report["decision_occupancy"] == 0.0
    assert report["decisions_per_second"] == 0.0
    assert report["slot_decisions_per_second"] == 0.0


def test_opt_in_warmup_is_disjoint_from_remaining_timed_ticks():
    output = io.StringIO()
    with redirect_stdout(output):
        result = generate.main([
            "--fights", "1",
            "--max-ticks", "3",
            "--workers", "1",
            "--benchmark",
            "--benchmark-warmup-ticks", "1",
            "--seed", "123",
        ])
    report = json.loads(output.getvalue())

    assert result == 0
    assert report["warmup_ticks"] == 1
    assert report["warmup_decisions"] == 2
    assert report["fight_ticks"] == 2
    assert report["decisions"] == 4
    # flush() deliberately clears the untimed pending record, so the first
    # timed step returns no row and the last timed row lands in finalization.
    assert report["active_decisions"] == 2
    assert report["finalize_decisions"] == 2
    assert report["rows_generated"] == 4
    assert report["rows_written"] == 0
    assert report["output_bytes"] == 0
    assert report["outputs"] == []


def test_opponent_requires_snapshot_provenance():
    try:
        generate.main([
            "--benchmark",
            "--opponent", "would-not-be-loaded.pt",
        ])
    except SystemExit as exc:
        assert exc.code == 2
    else:
        raise AssertionError(
            "an opponent checkpoint was accepted without a snapshot ID")


if __name__ == "__main__":
    test_report_uses_one_common_interval_and_keeps_full_precision()
    test_report_handles_no_available_slots_without_dividing_by_zero()
    test_opt_in_warmup_is_disjoint_from_remaining_timed_ticks()
    test_opponent_requires_snapshot_provenance()
    print("generation timing aggregation OK")
