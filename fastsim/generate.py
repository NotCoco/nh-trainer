"""Generate NH training data without starting the server.

Examples
--------
Ten thousand fights of self-play with a checkpoint, written where the trainer
already looks for rollouts:

    python generate.py --fights 10000 --policy <checkpoint>.pt --out auto

A pure speed check with no checkpoint (random scores, real fight rules):

    python generate.py --fights 4096 --benchmark

One checkpoint against another (the head-to-head / snapshot case):

    python generate.py --fights 2000 --policy a.pt --opponent b.pt --out auto
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import queue
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastsim import (engine, nhrl_writer, paths, policy, reward_events, schema,
                     scripted_policy, world_map)

_WORKER_START_LEAD_NS = 50_000_000


def build_policy(path: str | None, device: str, seed: int):
    if path is None:
        return policy.RandomPolicy(seed=seed)
    return policy.Policy.load(path, device=device)


def resolve_exploration_scope(
        name: str,
        main_policy_side: int) -> tuple[tuple[int, ...] | None, int | None]:
    if name == "all":
        return None, None
    if name == "defence":
        return (schema.CHANNEL_DEFENCE,), main_policy_side
    if name == "main-all":
        return tuple(range(schema.CAUSAL_UNIT_COUNT)), main_policy_side
    raise ValueError(f"unsupported exploration scope: {name}")


def default_output(tag: str, world_id: int = 35) -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    name = f"nh-rollout-fastsim-{tag}-{stamp}-loop1-world{world_id}.nhrl"
    return paths.rollout_dir() / name


def load_replay_plan(path: str | None):
    if path is None:
        return None
    plan = {}
    with Path(path).open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            tick = int(row["episode_tick"])
            side = int(row["side"])
            if side not in (0, 1):
                raise ValueError(f"replay-plan side must be 0 or 1, got {side}")
            key = (tick, side)
            if key in plan:
                raise ValueError(
                    f"duplicate replay-plan row tick={tick} side={side}")
            channels = tuple(
                int(row[name])
                for name in ("attack", "spec", "defence", "movement", "supply"))
            same_tick = tuple(
                int(value)
                for value in row["action_labels"].split("|")
                if value != "")
            plan[key] = tuple(sorted(set(channels + same_tick)))
    return plan


def _wait_for_common_start(shard_index: int, timing_sync) -> tuple[int, int]:
    """Release prepared workers against one system-wide perf-counter target."""
    if timing_sync is None:
        now = time.perf_counter_ns()
        return now, now

    start_event, ready_queue, common_start_value = timing_sync
    ready_queue.put(("ready", shard_index))
    start_event.wait()
    common_start_ns = int(common_start_value.value)
    while True:
        remaining_ns = common_start_ns - time.perf_counter_ns()
        if remaining_ns <= 0:
            break
        # Leave only the final fraction of a millisecond to the scheduler.
        if remaining_ns > 1_000_000:
            time.sleep((remaining_ns - 500_000) / 1_000_000_000.0)
    return common_start_ns, time.perf_counter_ns()


def _durable_sync(path: Path | None) -> None:
    """Flush a closed output through the OS when explicitly requested."""
    if path is None or not path.exists():
        return
    with path.open("r+b", buffering=0) as handle:
        os.fsync(handle.fileno())


def run_shard(
        args,
        shard_index: int,
        out_path: Path | None,
        timing_sync=None) -> dict:
    """One batch of fights, start to finish. This is what a worker runs."""
    shard_started_ns = time.perf_counter_ns()
    seed = args.seed + shard_index * 7919  # a prime, so shards do not overlap
    world_id = args.world_id + shard_index
    if args.lane_radius != 3:
        raise ValueError(
            "training generation requires Java's lane radius 3; "
            f"got {args.lane_radius}")
    if not world_map.SELF_PLAY_MAP.has_plan(
            world_id, args.start_distance_min, args.start_distance_max):
        available = ", ".join(
            f"world={world},distance={minimum}-{maximum}"
            for world, minimum, maximum
            in sorted(world_map.SELF_PLAY_MAP.plans))
        raise ValueError(
            "no cache-derived Java lane plan for "
            f"world={world_id}, distance={args.start_distance_min}-"
            f"{args.start_distance_max}; available: {available}")

    main_policy = build_policy(args.policy, args.device, seed)
    if args.opponent_script:
        opponent = scripted_policy.build(
            args.opponent_script,
            args.opponent_script_defence,
            seed=seed,
            use_vengeance=args.opponent_script_vengeance)
    else:
        opponent = (
            build_policy(args.opponent, args.device, seed + 1)
            if args.opponent else None)
    if opponent is not None and opponent.action_ids != main_policy.action_ids:
        raise ValueError(
            "policy and opponent checkpoints use different Java action mappings")
    main_policy_side = 0 if args.main_policy_side == "first" else 1
    if main_policy_side == 1 and opponent is None:
        raise ValueError(
            "--main-policy-side second requires --opponent or "
            "--opponent-script")
    engine_policy = main_policy if main_policy_side == 0 else opponent
    engine_opponent = opponent if main_policy_side == 0 else main_policy
    exploration_units_name = getattr(args, "exploration_units", "all")
    restricted_exploration_units, exploration_policy_side = (
        resolve_exploration_scope(exploration_units_name, main_policy_side)
    )
    replay_plan = load_replay_plan(args.replay_plan)
    if replay_plan is not None:
        if args.fights != 1 or args.workers != 1:
            raise ValueError("a replay plan requires exactly one fight and one worker")
        if args.epsilon != 0.0:
            raise ValueError("a replay plan requires --epsilon 0")

    eng = engine.Engine(n_fights=args.fights, policy=engine_policy, seed=seed,
                        epsilon=args.epsilon, max_ticks=args.max_ticks,
                        opponent_policy=engine_opponent,
                        start_distance_min=args.start_distance_min,
                        start_distance_max=args.start_distance_max,
                        world_id=world_id,
                        lane_radius=args.lane_radius,
                        episodes_per_lane=args.episodes_per_lane,
                        replay_seed=args.replay_seed,
                        replay_plan=replay_plan,
                        exploration_units=restricted_exploration_units,
                        exploration_policy_side=exploration_policy_side)

    writer = None
    event_writer = None
    event_path = None
    if out_path is not None:
        writer = nhrl_writer.RolloutWriter(
            out_path,
            action_ids=main_policy.action_ids,
            exploration_rate=args.epsilon,
            data_folder=str(paths.server_dir() / "data"))
        event_writer = reward_events.RewardEventWriter(
            out_path,
            rollout_created_millis=writer.created_millis,
            action_ids_fingerprint=writer.action_ids_fingerprint)
        event_path = event_writer.path

    setup_ended_ns = time.perf_counter_ns()
    warmup_started_ns = setup_ended_ns
    warmup_ticks = 0
    warmup_decisions = 0
    requested_warmup = (
        max(0, int(getattr(args, "benchmark_warmup_ticks", 0)))
        if getattr(args, "benchmark", False) else 0)
    while warmup_ticks < requested_warmup and eng.has_work():
        record = eng.step()
        warmup_ticks += 1
        if record is not None:
            warmup_decisions += int(record.alive_mask.sum())
    if warmup_ticks:
        record = eng.flush()
        if record is not None:
            warmup_decisions += int(record.alive_mask.sum())
    warmup_ended_ns = time.perf_counter_ns()

    common_start_ns, active_started_ns = _wait_for_common_start(
        shard_index, timing_sync)
    ticks = 0
    rows = 0
    rows_generated = 0
    decisions = 0
    active_decisions = 0
    finalize_decisions = 0
    engine_step_ns = 0
    writer_write_ns = 0
    engine_flush_ns = 0
    writer_close_ns = 0
    durable_sync_ns = 0

    def emit(record):
        # step() returns the previous tick's record once its next_input is
        # known, so None just means "nothing complete yet".
        nonlocal rows, rows_generated, decisions, writer_write_ns
        if record is None:
            return 0
        # Finished fights stop contributing rows.
        keep = record.alive_mask
        count = int(keep.sum())
        decisions += count
        rows_generated += count
        if writer is None:
            return count
        write_started_ns = time.perf_counter_ns()
        try:
            snapshot_id = (
                int(args.opponent_snapshot_id)
                if args.opponent_snapshot_id is not None else -1)
            if args.opponent_script:
                source_pair_mode = schema.PAIR_MODE_COHORT
            elif args.opponent_snapshot_id is not None:
                source_pair_mode = schema.PAIR_MODE_SNAPSHOT
            else:
                source_pair_mode = schema.PAIR_MODE_MIRROR
            rows += writer.write(
                record,
                source_pair_mode=source_pair_mode,
                opponent_snapshot_id=snapshot_id,
                keep=keep)
            event_writer.write(record, keep=keep)
        finally:
            writer_write_ns += time.perf_counter_ns() - write_started_ns
        return count

    try:
        while eng.has_work():
            step_started_ns = time.perf_counter_ns()
            record = eng.step()
            engine_step_ns += time.perf_counter_ns() - step_started_ns
            active_decisions += emit(record)
            ticks += 1
        active_ended_ns = time.perf_counter_ns()
        flush_started_ns = active_ended_ns
        record = eng.flush()
        engine_flush_ns += time.perf_counter_ns() - flush_started_ns
        finalize_decisions += emit(record)
    finally:
        close_started_ns = time.perf_counter_ns()
        if event_writer is not None:
            event_writer.close()
        if writer is not None:
            writer.close()
        writer_close_ns += time.perf_counter_ns() - close_started_ns
        if getattr(args, "durable_output", False):
            durable_started_ns = time.perf_counter_ns()
            _durable_sync(out_path)
            _durable_sync(event_path)
            durable_sync_ns += time.perf_counter_ns() - durable_started_ns
    finalized_ns = time.perf_counter_ns()

    fight_ticks = ticks * args.fights
    nhrl_bytes = (
        out_path.stat().st_size
        if out_path is not None and out_path.exists() else 0)
    nhev_bytes = (
        event_path.stat().st_size
        if event_path is not None and event_path.exists() else 0)
    return {
        **eng.summary(),
        "shard": shard_index,
        "wall_seconds": (finalized_ns - common_start_ns) / 1_000_000_000.0,
        "common_start_ns": common_start_ns,
        "active_started_ns": active_started_ns,
        "active_ended_ns": active_ended_ns,
        "finalized_ns": finalized_ns,
        "setup_seconds": (
            setup_ended_ns - shard_started_ns) / 1_000_000_000.0,
        "warmup_seconds": (
            warmup_ended_ns - warmup_started_ns) / 1_000_000_000.0,
        "active_wall_seconds": (
            active_ended_ns - active_started_ns) / 1_000_000_000.0,
        "finalize_seconds": (
            finalized_ns - active_ended_ns) / 1_000_000_000.0,
        "engine_step_seconds": engine_step_ns / 1_000_000_000.0,
        "writer_write_seconds": writer_write_ns / 1_000_000_000.0,
        "engine_flush_seconds": engine_flush_ns / 1_000_000_000.0,
        "writer_close_seconds": writer_close_ns / 1_000_000_000.0,
        "durable_sync_seconds": durable_sync_ns / 1_000_000_000.0,
        "warmup_ticks": warmup_ticks,
        "warmup_decisions": warmup_decisions,
        "ticks_simulated": ticks,
        "fight_ticks": fight_ticks,
        "decisions_generated": decisions,
        "active_decisions": active_decisions,
        "finalize_decisions": finalize_decisions,
        "rows_generated": rows_generated,
        "rows_written": rows,
        "nhrl_bytes": nhrl_bytes,
        "nhev_bytes": nhev_bytes,
        "output_bytes": nhrl_bytes + nhev_bytes,
        "output": str(out_path) if out_path else None,
    }


def _shard_entry(payload):
    args, shard_index, out_path, timing_sync = payload
    try:
        return run_shard(
            args,
            shard_index,
            Path(out_path) if out_path else None,
            timing_sync=timing_sync)
    except BaseException:
        if timing_sync is not None:
            _, ready_queue, _ = timing_sync
            ready_queue.put(("error", shard_index))
        raise


def _sum_result(results: list[dict], field: str) -> float:
    return sum(float(result.get(field, 0.0)) for result in results)


def build_report(args, results: list[dict], process_wall_seconds: float) -> dict:
    """Aggregate synchronized shards over their actual common clock interval."""
    common_start_ns = min(
        (int(result["common_start_ns"]) for result in results), default=0)
    common_active_end_ns = max(
        (int(result["active_ended_ns"]) for result in results),
        default=common_start_ns)
    common_finalized_ns = max(
        (int(result["finalized_ns"]) for result in results),
        default=common_start_ns)
    common_active_wall = max(
        0.0, (common_active_end_ns - common_start_ns) / 1_000_000_000.0)
    common_total_wall = max(
        0.0, (common_finalized_ns - common_start_ns) / 1_000_000_000.0)

    total_fight_ticks = sum(int(r["fight_ticks"]) for r in results)
    total_slot_decisions = total_fight_ticks * 2
    total_decisions = sum(
        int(r["decisions_generated"]) for r in results)
    total_active_decisions = sum(
        int(r.get("active_decisions", 0)) for r in results)
    occupancy = (
        total_decisions / total_slot_decisions
        if total_slot_decisions else 0.0)
    active_starts = [
        int(result["active_started_ns"]) for result in results]
    start_skew = (
        (max(active_starts) - min(active_starts)) / 1_000_000_000.0
        if active_starts else 0.0)

    report = {
        "workers": max(1, args.workers),
        "fights_total": (
            args.fights * args.episodes_per_lane * max(1, args.workers)),
        # Keep the old names, but no longer round away useful benchmark data.
        "wall_seconds": process_wall_seconds,
        "simulation_wall_seconds": common_total_wall,
        "process_wall_seconds": process_wall_seconds,
        "common_start_perf_counter_ns": common_start_ns,
        "common_active_end_perf_counter_ns": common_active_end_ns,
        "common_finalized_perf_counter_ns": common_finalized_ns,
        "common_active_wall_seconds": common_active_wall,
        "common_total_wall_seconds": common_total_wall,
        "worker_start_skew_seconds": start_skew,
        "warmup_ticks": sum(
            int(r.get("warmup_ticks", 0)) for r in results),
        "warmup_decisions": sum(
            int(r.get("warmup_decisions", 0)) for r in results),
        "fight_ticks": total_fight_ticks,
        "decisions": total_decisions,
        "useful_decisions": total_decisions,
        "active_decisions": total_active_decisions,
        "finalize_decisions": sum(
            int(r.get("finalize_decisions", 0)) for r in results),
        "slot_decisions": total_slot_decisions,
        "decision_occupancy": occupancy,
        "fight_ticks_per_second": (
            total_fight_ticks / max(common_total_wall, 1e-9)),
        "decisions_per_second": (
            total_decisions / max(common_total_wall, 1e-9)),
        "simulation_decisions_per_second": (
            total_decisions / max(common_total_wall, 1e-9)),
        "active_decisions_per_second": (
            total_active_decisions / max(common_active_wall, 1e-9)),
        "process_decisions_per_second": (
            total_decisions / max(process_wall_seconds, 1e-9)),
        "slot_decisions_per_second": (
            total_slot_decisions / max(common_total_wall, 1e-9)),
        "simulation_slot_decisions_per_second": (
            total_slot_decisions / max(common_total_wall, 1e-9)),
        "rows_generated": sum(
            int(r.get("rows_generated", 0)) for r in results),
        "rows_written": sum(int(r["rows_written"]) for r in results),
        "nhrl_bytes": sum(int(r.get("nhrl_bytes", 0)) for r in results),
        "nhev_bytes": sum(int(r.get("nhev_bytes", 0)) for r in results),
        "sidecar_bytes": sum(
            int(r.get("sidecar_bytes", 0)) for r in results),
        "output_bytes": sum(
            int(r.get("output_bytes", 0)) for r in results),
        "setup_seconds_worker_sum": _sum_result(results, "setup_seconds"),
        "warmup_seconds_worker_sum": _sum_result(results, "warmup_seconds"),
        "engine_step_seconds_worker_sum": _sum_result(
            results, "engine_step_seconds"),
        "writer_write_seconds_worker_sum": _sum_result(
            results, "writer_write_seconds"),
        "engine_flush_seconds_worker_sum": _sum_result(
            results, "engine_flush_seconds"),
        "writer_close_seconds_worker_sum": _sum_result(
            results, "writer_close_seconds"),
        "durable_sync_seconds_worker_sum": _sum_result(
            results, "durable_sync_seconds"),
        "finalize_seconds_worker_sum": _sum_result(
            results, "finalize_seconds"),
        "side0_wins": sum(int(r["side0_wins"]) for r in results),
        "side1_wins": sum(int(r["side1_wins"]) for r in results),
        "draws": sum(int(r["draws"]) for r in results),
        "outputs": [r["output"] for r in results if r["output"]],
        "opponent_script": getattr(args, "opponent_script", None),
        "opponent_script_defence": (
            getattr(args, "opponent_script_defence", None)
            if getattr(args, "opponent_script", None) else None),
        "opponent_script_defence_description": (
            scripted_policy.DEFENCE_DESCRIPTIONS[
                args.opponent_script_defence]
            if getattr(args, "opponent_script", None) else None),
        "main_policy_side": (
            0 if getattr(args, "main_policy_side", "first") == "first" else 1),
        "exploration_units": getattr(args, "exploration_units", "all"),
        "worker_timings": [
            {
                "shard": int(result["shard"]),
                "common_start_perf_counter_ns": int(
                    result["common_start_ns"]),
                "active_started_perf_counter_ns": int(
                    result["active_started_ns"]),
                "active_ended_perf_counter_ns": int(
                    result["active_ended_ns"]),
                "finalized_perf_counter_ns": int(
                    result["finalized_ns"]),
                "setup_seconds": float(result["setup_seconds"]),
                "warmup_seconds": float(result["warmup_seconds"]),
                "active_wall_seconds": float(result["active_wall_seconds"]),
                "finalize_seconds": float(result["finalize_seconds"]),
                "engine_step_seconds": float(result["engine_step_seconds"]),
                "writer_write_seconds": float(
                    result["writer_write_seconds"]),
                "engine_flush_seconds": float(
                    result["engine_flush_seconds"]),
                "writer_close_seconds": float(
                    result["writer_close_seconds"]),
                "durable_sync_seconds": float(
                    result["durable_sync_seconds"]),
                "start_late_seconds": max(
                    0.0,
                    (int(result["active_started_ns"])
                     - int(result["common_start_ns"])) / 1_000_000_000.0),
            }
            for result in results
        ],
    }
    return report


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fights", type=int, default=1024,
                        help="how many fights to run at once")
    parser.add_argument("--max-ticks", type=int, default=1200,
                        help="tick cap per episode (the project standard is 1200)")
    parser.add_argument("--episodes-per-lane", type=int, default=1,
                        help="fresh fights to run on each stable Java-style lane")
    parser.add_argument("--policy", default=None,
                        help=(
                            "trainable checkpoint .pt (omit for random); "
                            "placement is selected by --main-policy-side"))
    parser.add_argument(
        "--main-policy-side",
        choices=("first", "second"),
        default="first",
        help=(
            "place --policy on side 0/first or side 1/second; second "
            "requires an explicit opponent or scripted opponent"))
    parser.add_argument("--opponent", default=None,
                        help="checkpoint .pt driving side 1 (defaults to mirror)")
    parser.add_argument(
        "--opponent-script",
        choices=scripted_policy.ROLLOUT_SCRIPT_NAMES,
        default=None,
        help="deterministic cohort opponent driving side 1")
    parser.add_argument(
        "--opponent-script-defence",
        choices=scripted_policy.DEFENCE_NAMES,
        default="smite",
        help=(
            "defensive-prayer behavior used by --opponent-script; "
            "'melee' is the full-fight hold, while the melee-magic choices "
            "produce real per-tick delayed/patterned switches"))
    parser.add_argument(
        "--opponent-script-vengeance",
        action="store_true",
        help=(
            "make the scripted opponent use each mechanically legal "
            "Vengeance trinket charge while still prioritizing urgent food"))
    parser.add_argument(
        "--opponent-snapshot-id", type=int, default=None,
        help="positive ancestral snapshot ID recorded for --opponent rows")
    parser.add_argument("--epsilon", type=float, default=0.22,
                        help="exploration rate, matching the Java default")
    parser.add_argument(
        "--exploration-units",
        choices=("all", "main-all", "defence"),
        default="all",
        help=(
            "causal units eligible for epsilon exploration; 'main-all' "
            "explores every channel only on --policy, while 'defence' "
            "explores only --policy's defence-prayer channel; both leave "
            "the opponent untouched"))
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--replay-seed", type=int, default=None,
                        help="replay-only keyed combat seed shared with Java")
    parser.add_argument("--replay-plan", default=None,
                        help="CSV action plan exported by tools/replay_gate.py")
    parser.add_argument("--start-distance-min", type=int, default=1,
                        help="Java self-play opening-distance minimum")
    parser.add_argument("--start-distance-max", type=int, default=8,
                        help="Java self-play opening-distance maximum")
    parser.add_argument("--world-id", type=int, default=35,
                        help="world id used by Java's deterministic distance plan")
    parser.add_argument("--lane-radius", type=int, default=3,
                        help="Java self-play lane radius")
    parser.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    parser.add_argument("--out", default=None,
                        help="output .nhrl path, or 'auto' for the trainer's rollout dir")
    parser.add_argument("--benchmark", action="store_true",
                        help="report speed and write nothing")
    parser.add_argument(
        "--benchmark-warmup-ticks", type=int, default=0,
        help="benchmark-only engine ticks to run before synchronized timing "
             "(still writes nothing)")
    parser.add_argument(
        "--durable-output", action="store_true",
        help="after closing output files, fsync them before reporting time")
    parser.add_argument("--tag", default="selfplay",
                        help="label used in the auto-generated filename")
    parser.add_argument("--workers", type=int, default=1,
                        help="run this many shards in parallel, one process per "
                             "CPU core. Each shard writes its own .nhrl, which is "
                             "already how the Java server does it; workers use "
                             "consecutive cache-derived world ids")
    args = parser.parse_args(argv)
    if args.benchmark_warmup_ticks < 0:
        parser.error("--benchmark-warmup-ticks cannot be negative")
    if args.benchmark_warmup_ticks and not args.benchmark:
        parser.error("--benchmark-warmup-ticks requires --benchmark")
    if args.opponent and args.opponent_script:
        parser.error("--opponent and --opponent-script are mutually exclusive")
    if args.opponent_script_vengeance and not args.opponent_script:
        parser.error("--opponent-script-vengeance requires --opponent-script")
    if (
            args.main_policy_side == "second"
            and not (args.opponent or args.opponent_script)):
        parser.error(
            "--main-policy-side second requires --opponent or "
            "--opponent-script")
    if (
            args.opponent_script
            and args.epsilon != 0.0
            and args.exploration_units == "all"):
        parser.error(
            "--opponent-script requires --epsilon 0 so the fixed cohort "
            "cannot be changed by unrestricted exploration; use "
            "--exploration-units defence to explore only --policy")
    if args.opponent_snapshot_id is not None:
        if args.opponent_snapshot_id <= 0:
            parser.error("--opponent-snapshot-id must be positive")
        if not args.opponent:
            parser.error("--opponent-snapshot-id requires --opponent")
    elif args.opponent:
        parser.error(
            "--opponent requires --opponent-snapshot-id so ancestral "
            "rows cannot be mislabeled as mirror data")

    stamp = time.strftime("%Y%m%d-%H%M%S")
    shard_outputs = []
    for shard in range(max(1, args.workers)):
        if args.benchmark:
            shard_outputs.append(None)
        elif args.out in (None, "auto"):
            world_id = args.world_id + shard
            name = (
                f"nh-rollout-fastsim-{args.tag}-{stamp}"
                f"-loop1-world{world_id}.nhrl")
            shard_outputs.append(paths.rollout_dir() / name)
        else:
            base = Path(args.out)
            shard_outputs.append(base if args.workers == 1 else
                                 base.with_name(
                                     f"{base.stem}-world"
                                     f"{args.world_id + shard}{base.suffix}"))

    process_started_ns = time.perf_counter_ns()
    if args.workers <= 1:
        results = [run_shard(args, 0, shard_outputs[0])]
    else:
        import multiprocessing as mp

        with mp.Manager() as manager:
            start_event = manager.Event()
            ready_queue = manager.Queue()
            common_start_value = manager.Value("q", 0)
            timing_sync = (
                start_event, ready_queue, common_start_value)
            payloads = [
                (args, shard, str(path) if path else None, timing_sync)
                for shard, path in enumerate(shard_outputs)]
            with mp.Pool(processes=args.workers) as pool:
                pending = pool.map_async(_shard_entry, payloads)
                ready = set()
                while len(ready) < args.workers:
                    try:
                        status, shard = ready_queue.get(timeout=0.1)
                    except queue.Empty:
                        continue
                    if status == "error":
                        common_start_value.value = time.perf_counter_ns()
                        start_event.set()
                        results = pending.get()
                        raise RuntimeError(
                            f"worker {shard} failed before synchronized start")
                    if status != "ready" or shard in ready:
                        raise RuntimeError(
                            "invalid synchronized-worker readiness message")
                    ready.add(shard)
                common_start_value.value = (
                    time.perf_counter_ns() + _WORKER_START_LEAD_NS)
                start_event.set()
                results = pending.get()

    # Include normal sidecar creation in one-shot process wall time. Console
    # JSON rendering remains reporting overhead, not generation work.
    for result in results:
        result["sidecar_bytes"] = 0
        if result["output"]:
            main_policy_side = (
                0 if args.main_policy_side == "first" else 1)
            sidecar = Path(result["output"]).with_suffix(".fastsim.json")
            sidecar.write_text(json.dumps(
                {**result,
                 "rolloutVersion": schema.NHRL_VERSION,
                 "mainPolicySide": main_policy_side,
                 "mainPolicyBotIndexParity": (
                     "odd" if main_policy_side == 0 else "even"),
                 "opponentScriptDefenceFallback": (
                     scripted_policy.NON_PROTECTION_FALLBACK_NAME
                     if args.opponent_script
                     and args.opponent_script_defence
                     in ("smite", "redemption")
                     else None),
                 "opponentScriptDefenceDescription": (
                     scripted_policy.DEFENCE_DESCRIPTIONS[
                         args.opponent_script_defence]
                     if args.opponent_script else None),
                 "offensiveStyleTeacherOffPrayerBonus":
                     engine.OFFENSIVE_STYLE_TEACHER_OFF_PRAYER_BONUS,
                 "offensiveStyleTeacherPrayerTiming":
                     "decision-visible-delayed-input",
                 "args": vars(args),
                 "note": "generated by KronosFastSim, not the Java server"},
                indent=2))
            if args.durable_output:
                _durable_sync(sidecar)
            result["sidecar_bytes"] = sidecar.stat().st_size
    process_wall_seconds = (
        time.perf_counter_ns() - process_started_ns) / 1_000_000_000.0

    report = build_report(args, results, process_wall_seconds)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
