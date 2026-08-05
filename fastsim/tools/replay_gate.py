"""Build and check deterministic Java/FastSim replay traces.

Raw NHRL files contain timestamps, absolute server ticks, and live player
indices, so byte equality is not meaningful.  This tool normalizes only those
provenance fields and then compares the complete v25 records in tick order.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SERVER = (
    ROOT.parent
    / "kronos-osrs-184-master"
    / "kronos-osrs-184-master"
    / "Kronos-master"
    / "kronos-server"
)
TRAINER = SERVER / "tools" / "nh-gpu-trainer"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(TRAINER))

import nh_reward_events  # noqa: E402
import nh_rollout  # noqa: E402


def _normalized_reward_events(
        rollout_path: Path, episode_id: int, base_tick: int,
        side_by_bot: dict[int, int]):
    sidecar_path = rollout_path.with_suffix(".nhev")
    if not sidecar_path.exists():
        return None, None
    sidecar = nh_reward_events.RewardEventFile(sidecar_path)
    records = sidecar.records
    keep = (
        (records["episode_id"] == int(episode_id))
        & np.isin(records["bot_index"], list(side_by_bot)))
    normalized = np.array(records[keep], copy=True)
    for index in range(len(normalized)):
        normalized[index]["bot_index"] = side_by_bot[
            int(normalized[index]["bot_index"])]
        normalized[index]["episode_id"] = 1
        # Event-type zero is the episode summary. Its source/target fields are
        # event/allocation counts, not ticks, so only its resolution tick needs
        # the Java server's absolute-tick offset removed.
        tick_fields = (
            ("resolution_tick",)
            if int(normalized[index]["event_type"]) == 0
            else (
                "resolution_tick",
                "source_tick",
                "target_decision_tick",
            ))
        for field in tick_fields:
            value = int(normalized[index][field])
            if value >= 0:
                normalized[index][field] = value - base_tick
    if len(normalized):
        normalized.sort(order=[
            "resolution_tick",
            "bot_index",
            "event_type",
            "source_tick",
            "target_decision_tick",
            "causal_unit",
            "gear_slot",
            "allocation_ordinal",
            "allocation_count",
            "original_reward",
            "allocation_weight",
            "allocated_reward",
        ])
        normalized["event_sequence"] = np.arange(
            1, len(normalized) + 1, dtype=np.int64)
    return sidecar.header, normalized


def _compare_reward_events(
        java_path: Path, fast_path: Path,
        java_episode: int, fast_episode: int,
        java_base: int, fast_base: int,
        java_sides: dict[int, int], fast_sides: dict[int, int],
        atol: float) -> dict:
    java_header, java_rows = _normalized_reward_events(
        java_path, java_episode, java_base, java_sides)
    fast_header, fast_rows = _normalized_reward_events(
        fast_path, fast_episode, fast_base, fast_sides)
    report = {
        "java": str(java_path.with_suffix(".nhev")),
        "fast": str(fast_path.with_suffix(".nhev")),
        "java_present": java_rows is not None,
        "fast_present": fast_rows is not None,
        "match": False,
    }
    if java_rows is None or fast_rows is None:
        report["first_mismatch"] = {"field": "sidecar_presence"}
        return report
    report["java_records"] = len(java_rows)
    report["fast_records"] = len(fast_rows)
    for label, rows in (("java", java_rows), ("fast", fast_rows)):
        values, counts = np.unique(rows["event_type"], return_counts=True)
        report[f"{label}_event_types"] = {
            nh_reward_events.EVENT_TYPE_NAMES.get(
                int(value), "episode_summary" if int(value) == 0 else str(int(value))
            ): int(count)
            for value, count in zip(values, counts)
        }
    report["header_schema_match"] = (
        java_header.version == fast_header.version
        and java_header.action_ids_fingerprint
        == fast_header.action_ids_fingerprint)
    if not report["header_schema_match"]:
        report["first_mismatch"] = {"field": "header_schema"}
        return report
    common = min(len(java_rows), len(fast_rows))
    for index in range(common):
        for field in java_rows.dtype.names:
            if not _equal(java_rows[index][field], fast_rows[index][field], atol):
                report["first_mismatch"] = {
                    "record": index,
                    "field": field,
                    "java": _value(java_rows[index][field]),
                    "fast": _value(fast_rows[index][field]),
                }
                return report
    if len(java_rows) != len(fast_rows):
        report["first_mismatch"] = {
            "record": common,
            "field": "record_presence",
            "java": common < len(java_rows),
            "fast": common < len(fast_rows),
        }
        return report
    report["match"] = True
    return report


def _episode_pair(path: Path, episode_id: int | None, pair_index: int):
    rollout = nh_rollout.RolloutFile(path)
    records = rollout.records
    chosen_episode = (
        int(np.min(records["episode_id"]))
        if episode_id is None else int(episode_id))
    episode_rows = records[records["episode_id"] == chosen_episode]
    bot_ids = sorted(int(value) for value in np.unique(episode_rows["bot_index"]))
    start = pair_index * 2
    if len(bot_ids) < start + 2:
        raise ValueError(
            f"{path} episode {chosen_episode} has {len(bot_ids)} bots; "
            f"pair {pair_index} does not exist")
    selected_bots = bot_ids[start:start + 2]
    keep = np.isin(episode_rows["bot_index"], selected_bots)
    selected = np.array(episode_rows[keep], copy=True)
    side_by_bot = {bot: side for side, bot in enumerate(selected_bots)}
    selected.sort(order=["episode_tick", "bot_index"])
    return rollout.header, selected, chosen_episode, side_by_bot


def write_plan(source: Path, output: Path, episode_id: int | None,
               pair_index: int) -> dict:
    header, records, chosen_episode, side_by_bot = _episode_pair(
        source, episode_id, pair_index)
    lines = [
        "episode_tick,side,attack,spec,defence,movement,supply,action_labels"
    ]
    seen: set[tuple[int, int]] = set()
    for row in records:
        side = side_by_bot[int(row["bot_index"])]
        tick = int(row["episode_tick"])
        key = (tick, side)
        if key in seen:
            raise ValueError(f"duplicate source row tick={tick} side={side}")
        seen.add(key)
        channels = [int(value) for value in row["channel_action_labels"]]
        if len(channels) != 5 or any(value < 0 for value in channels):
            raise ValueError(f"incomplete channel labels at tick={tick} side={side}")
        count = int(row["action_label_count"])
        labels = [int(value) for value in row["action_labels"][:count]]
        if any(value < 0 or value >= header.action_count for value in labels):
            raise ValueError(f"invalid same-tick labels at tick={tick} side={side}")
        lines.append(",".join(
            [str(tick), str(side), *(str(value) for value in channels),
             "|".join(str(value) for value in labels)]))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {
        "source": str(source),
        "output": str(output),
        "episode_id": chosen_episode,
        "pair_index": pair_index,
        "rows": len(records),
        "ticks": len({int(row["episode_tick"]) for row in records}),
    }


def _normalized_rows(path: Path, episode_id: int | None, pair_index: int):
    header, records, chosen_episode, side_by_bot = _episode_pair(
        path, episode_id, pair_index)
    normalized = np.array(records, copy=True)
    base_tick = int(np.min(normalized["decision_tick"]))
    normalized["row_id"] = np.arange(len(normalized), dtype=np.int64)
    normalized["decision_tick"] -= base_tick
    normalized["transition_tick"] -= base_tick
    normalized["episode_id"] = 1
    for index in range(len(normalized)):
        bot = int(records[index]["bot_index"])
        target = int(records[index]["target_index"])
        normalized[index]["bot_index"] = side_by_bot[bot]
        normalized[index]["target_index"] = side_by_bot.get(target, -1)
        for field in (
            "vengeance_trinket_last_cast_tick",
            "vengeance_opportunity_roll_tick",
        ):
            value = int(normalized[index][field])
            if value >= 0:
                normalized[index][field] = value - base_tick
        action_count = int(normalized[index]["action_label_count"])
        labels = np.sort(normalized[index]["action_labels"][:action_count])
        normalized[index]["action_labels"][:action_count] = labels
    keys = [
        (int(row["episode_tick"]), int(row["bot_index"]))
        for row in normalized
    ]
    return header, normalized, keys, chosen_episode, base_tick, side_by_bot


def _value(value):
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    return value


def _equal(left, right, atol: float) -> bool:
    if np.issubdtype(np.asarray(left).dtype, np.floating):
        return bool(np.allclose(
            left, right, rtol=0.0, atol=atol, equal_nan=True))
    return bool(np.array_equal(left, right))


def compare_rollouts(java_path: Path, fast_path: Path,
                     java_episode: int | None, fast_episode: int | None,
                     pair_index: int, atol: float,
                     profile: str = "strict") -> dict:
    (java_header, java_rows, java_keys, chosen_java_episode, java_base,
     java_sides) = _normalized_rows(java_path, java_episode, pair_index)
    (fast_header, fast_rows, fast_keys, chosen_fast_episode, fast_base,
     fast_sides) = _normalized_rows(fast_path, fast_episode, pair_index)
    report = {
        "java": str(java_path),
        "fast": str(fast_path),
        "java_episode": chosen_java_episode,
        "fast_episode": chosen_fast_episode,
        "java_rows": len(java_rows),
        "fast_rows": len(fast_rows),
        "pair_index": pair_index,
        "atol": atol,
        "profile": profile,
        "header_schema_match": (
            java_header.version == fast_header.version
            and java_header.input_size == fast_header.input_size
            and java_header.feature_size == fast_header.feature_size
            and java_header.action_count == fast_header.action_count
            and java_header.legal_mask_bytes == fast_header.legal_mask_bytes
            and java_header.action_ids_fingerprint
            == fast_header.action_ids_fingerprint
        ),
        "keys_match": java_keys == fast_keys,
        "match": False,
    }

    def finish():
        nhrl_match = bool(report["match"])
        report["nhrl_match"] = nhrl_match
        report["reward_events"] = _compare_reward_events(
            java_path, fast_path,
            chosen_java_episode, chosen_fast_episode,
            java_base, fast_base,
            java_sides, fast_sides,
            atol)
        report["match"] = (
            nhrl_match and report["reward_events"]["match"])
        return report

    if not report["header_schema_match"]:
        report["first_mismatch"] = {"field": "header_schema"}
        return finish()
    java_by_key = {key: java_rows[index] for index, key in enumerate(java_keys)}
    fast_by_key = {key: fast_rows[index] for index, key in enumerate(fast_keys)}
    for key in sorted(set(java_by_key) | set(fast_by_key)):
        if key not in java_by_key or key not in fast_by_key:
            report["first_mismatch"] = {
                "tick": key[0],
                "side": key[1],
                "field": "row_presence",
                "java": key in java_by_key,
                "fast": key in fast_by_key,
            }
            return finish()
        java_row = java_by_key[key]
        fast_row = fast_by_key[key]
        fields = java_rows.dtype.names
        if profile == "state":
            fields = (
                "action_label_count",
                "action_labels",
                "channel_action_labels",
                "vengeance_trinket_blocker_mask",
                "vengeance_trinket_cast_count",
                "vengeance_trinket_item_count",
                "vengeance_trinket_last_cast_tick",
                "vengeance_trinket_legal",
                "reward_raw",
                "reward_clamped",
                "done",
                "reward_total_at_decision",
                "reward_dps_at_decision",
                "input",
                "next_input",
                "legal_mask",
            )
        for field in fields:
            if not _equal(java_row[field], fast_row[field], atol):
                java_value = java_row[field]
                fast_value = fast_row[field]
                suffix = ""
                if np.asarray(java_value).ndim:
                    if np.issubdtype(np.asarray(java_value).dtype, np.floating):
                        differs = ~np.isclose(
                            java_value, fast_value, rtol=0.0, atol=atol,
                            equal_nan=True)
                    else:
                        differs = np.asarray(java_value) != np.asarray(fast_value)
                    first = tuple(int(value) for value in np.argwhere(differs)[0])
                    suffix = "".join(f"[{value}]" for value in first)
                    java_value = np.asarray(java_value)[first]
                    fast_value = np.asarray(fast_value)[first]
                report["first_mismatch"] = {
                    "tick": key[0],
                    "side": key[1],
                    "field": field + suffix,
                    "java": _value(java_value),
                    "fast": _value(fast_value),
                }
                return finish()
    report["match"] = True
    return finish()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan = subparsers.add_parser("plan", help="export a forced Java action plan")
    plan.add_argument("--source", type=Path, required=True)
    plan.add_argument("--out", type=Path, required=True)
    plan.add_argument("--episode-id", type=int, default=None)
    plan.add_argument("--pair-index", type=int, default=0)

    compare = subparsers.add_parser(
        "compare", help="compare canonical v25 rows and report first divergence")
    compare.add_argument("--java", type=Path, required=True)
    compare.add_argument("--fast", type=Path, required=True)
    compare.add_argument("--java-episode-id", type=int, default=None)
    compare.add_argument("--fast-episode-id", type=int, default=None)
    compare.add_argument("--pair-index", type=int, default=0)
    compare.add_argument("--atol", type=float, default=0.0)
    compare.add_argument("--profile", choices=["strict", "state"],
                         default="strict")
    compare.add_argument("--report", type=Path, default=None)

    args = parser.parse_args(argv)
    if args.command == "plan":
        report = write_plan(
            args.source, args.out, args.episode_id, args.pair_index)
    else:
        report = compare_rollouts(
            args.java, args.fast,
            args.java_episode_id, args.fast_episode_id,
            args.pair_index, args.atol, args.profile)
        if args.report is not None:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(
                json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if args.command == "plan" or report["match"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
