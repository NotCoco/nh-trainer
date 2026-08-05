#!/usr/bin/env python3
"""Replay one recorded Java hand fight through the FastSim policy path.

The Java prayer trace already contains the exact state114 row and detachable
head history seen by the live bot.  The NH log supplies the human-visible world
state that produced those rows.  This evaluator joins the two by server tick,
scores every trace row with FastSim's checkpoint loader, and writes a compact
tick-by-tick diagnostic without trying to approximate the human with a scripted
opponent.

This is evaluation-only.  It does not run combat, mutate a checkpoint, or write
training rows.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastsim import policy, schema  # noqa: E402


TRACE_SCHEMA = "kronos.nh.current-direct-prayer-trace.v1"
REPORT_SCHEMA = "kronos.fastsim.java-handfight-replay.v1"
FLOAT_PATTERN = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?"
HEAD_ACTION_RE = re.compile(
    rf"#head=(?P<head>\d+)\|score=(?P<score>{FLOAT_PATTERN})"
    r"\|a=(?P<action>\d+)(?P<fields>(?:\|[^#]*)?)"
    r"(?=\|#head=|$)"
)
FIELD_RE = re.compile(r"\|([A-Za-z][A-Za-z0-9_]*)=([^|, ]+)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Join a current-direct Java prayer trace to its NH log and replay "
            "the exact model inputs through FastSim."
        )
    )
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--trace", type=Path, required=True)
    parser.add_argument("--java-log", type=Path, required=True)
    parser.add_argument(
        "--device", choices=("cpu", "cuda", "auto"), default="cpu"
    )
    parser.add_argument("--atol", type=float, default=5.0e-5)
    parser.add_argument("--rtol", type=float, default=1.0e-5)
    parser.add_argument(
        "--allow-model-divergence",
        action="store_true",
        help=(
            "Score a child checkpoint on the recorded Teacher180 inputs. "
            "The report still records parity deltas, but a changed prayer "
            "selection is treated as the experiment rather than an error."
        ),
    )
    parser.add_argument("--report", type=Path)
    return parser.parse_args()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _typed(value: str):
    if value == "true":
        return True
    if value == "false":
        return False
    if value in ("none", "null"):
        return None
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(FLOAT_PATTERN, value):
        return float(value)
    return value


def _token(line: str, key: str, *, required: bool = True):
    match = re.search(rf"(?:^|\s){re.escape(key)}=([^ ]+)", line)
    if match is None:
        if required:
            raise ValueError(f"missing {key}= in log line: {line[:160]}")
        return None
    return _typed(match.group(1))


def _tokens(line: str) -> dict:
    return {
        key: _typed(value)
        for key, value in re.findall(r"(?:^|\s)([A-Za-z][A-Za-z0-9_]*)=([^ ]+)", line)
    }


def _between(line: str, start: str, end: str) -> str:
    start_at = line.find(start)
    if start_at < 0:
        raise ValueError(f"missing marker {start!r}")
    start_at += len(start)
    end_at = line.find(end, start_at)
    if end_at < 0:
        raise ValueError(f"missing marker {end!r}")
    return line[start_at:end_at]


def _head_actions(chunk: str) -> list[dict]:
    if chunk == "none":
        return []
    actions = []
    for match in HEAD_ACTION_RE.finditer(chunk):
        row = {
            "modelAction": int(match.group("head")),
            "scoreRoundedInLog": float(match.group("score")),
            "actionId": int(match.group("action")),
        }
        row.update(
            (key, _typed(value))
            for key, value in FIELD_RE.findall(match.group("fields"))
        )
        actions.append(row)
    if not actions:
        raise ValueError(f"could not parse selected action chunk: {chunk[:160]}")
    return actions


def _parse_decision(line_number: int, line: str) -> dict:
    channel_markers = (
        ("combat", "src=selfplay_neural_vector:combat=", ",specChoice="),
        ("spec", ",specChoice=", ",defence="),
        ("defence", ",defence=", ",movement="),
        ("movement", ",movement=", ",supply="),
        ("supply", ",supply=", ",gearPicked="),
        ("gear", ",gearPicked=", ",gearTop="),
    )
    channels = {
        name: _head_actions(_between(line, start, end))
        for name, start, end in channel_markers
    }
    summary = re.search(
        r"\sstyle=(\w+)\sdef=(\w+)\soff=(\w+)\smove=(\w+)"
        r"\ssupply=(\w+)\sspec=(\w+)\sattack=(\w+)"
        r"\sequipment=(\w+)\s*$",
        line,
    )
    if summary is None:
        raise ValueError(f"could not parse live_decision summary on line {line_number}")
    keys = (
        "style",
        "defence",
        "offencePrayer",
        "movement",
        "supply",
        "spec",
        "attack",
        "equipment",
    )
    return {
        "lineNumber": line_number,
        "tick": int(_token(line, "tick")),
        "bot": str(_token(line, "bot")),
        "target": str(_token(line, "target")),
        "channels": channels,
        "summary": dict(zip(keys, summary.groups(), strict=True)),
    }


def _parse_gear(line: str) -> dict[str, int]:
    match = re.search(r"\sgear=(head=.*?)\soppPray=", line)
    if match is None:
        raise ValueError("live_applied_state is missing its final gear snapshot")
    result = {}
    for pair in match.group(1).split(","):
        name, value = pair.split("=", 1)
        result[name] = int(value)
    return result


def _opponent_visible(line: str) -> dict:
    prayer = re.search(
        r"\soppPray=m=(true|false),r=(true|false),me=(true|false)", line
    )
    gear_match = re.search(r"\soppGear=(\d+)\((.*)\)\s*$", line)
    if prayer is None or gear_match is None:
        raise ValueError("live_applied_state is missing opponent prayer/weapon")
    magic, ranged, melee = prayer.groups()
    return {
        "prayer": {
            "magic": magic == "true",
            "ranged": ranged == "true",
            "melee": melee == "true",
        },
        "weaponId": int(gear_match.group(1)),
        "weaponName": gear_match.group(2),
    }


def _parse_applied(line_number: int, line: str) -> dict:
    return {
        "lineNumber": line_number,
        "tick": int(_token(line, "tick")),
        "bot": str(_token(line, "bot")),
        "target": str(_token(line, "target")),
        "position": {
            "origin": {
                "x": int(_token(line, "fightOriginX")),
                "y": int(_token(line, "fightOriginY")),
                "z": int(_token(line, "fightOriginZ")),
            },
            "self": {
                "x": int(_token(line, "selfX")),
                "y": int(_token(line, "selfY")),
                "z": int(_token(line, "selfZ")),
                "dx": int(_token(line, "selfDx")),
                "dy": int(_token(line, "selfDy")),
            },
            "opponent": {
                "x": int(_token(line, "oppX")),
                "y": int(_token(line, "oppY")),
                "z": int(_token(line, "oppZ")),
                "dx": int(_token(line, "oppDx")),
                "dy": int(_token(line, "oppDy")),
            },
            "distance": int(_token(line, "liveDistance")),
            "sameTile": bool(_token(line, "sameTile")),
        },
        "freeze": {
            "selfFrozen": bool(_token(line, "selfFrozen")),
            "selfTicks": int(_token(line, "selfFreezeTicks")),
            "opponentFrozen": bool(_token(line, "oppFrozen")),
            "opponentTicks": int(_token(line, "oppFreezeTicks")),
        },
        "self": {
            "hp": int(_token(line, "selfHp")),
            "requestedStyle": str(_token(line, "requestedStyle")),
            "appliedStyle": str(_token(line, "appliedStyle")),
            "currentOffence": str(_token(line, "currentOffence")),
            "requestedDefence": str(_token(line, "requestedDef")),
            "activeDefence": str(_token(line, "activeDef")),
            "attackIntent": str(_token(line, "attackIntent")),
            "attackRequested": bool(_token(line, "attackRequested")),
            "attackDelay": bool(_token(line, "attackDelay")),
            "selectedSupply": str(_token(line, "selectedSupply")),
            "appliedSupply": str(_token(line, "appliedSupply")),
            "supplyConsumed": bool(_token(line, "supplyConsumed")),
            "weaponId": int(_token(line, "weapon")),
            "shieldId": int(_token(line, "shield")),
            "specialEnergy": int(_token(line, "specialEnergy")),
            "specialActive": bool(_token(line, "specialActive")),
            "gear": _parse_gear(line),
        },
        "opponentVisible": _opponent_visible(line),
        "pidState": str(_token(line, "pidState")),
        "canAttackObserved": bool(_token(line, "canAttackObserved")),
        "canAttackLive": bool(_token(line, "canAttackLive")),
    }


def _parse_prayer_state(line_number: int, line: str) -> dict:
    return {
        "lineNumber": line_number,
        "tick": int(_token(line, "tick")),
        "requested": _token(line, "requested"),
        "resolved": _token(line, "resolved"),
        "applied": _token(line, "applied"),
        "active": _token(line, "active"),
        "prayerInfoDelay": int(_token(line, "prayerInfoDelay")),
        "opponentLikely": _token(line, "oppLikely"),
        "opponentGearStyle": _token(line, "oppGearStyle"),
        "opponentWeaponStyle": _token(line, "oppWeaponStyle"),
        "visibleThreat": _token(line, "visibleThreat"),
        "liveOpponentLikely": _token(line, "liveLikely"),
        "liveGearStyle": _token(line, "liveGearStyle"),
        "liveWeaponStyle": _token(line, "liveWeaponStyle"),
        "liveThreat": _token(line, "liveThreat"),
    }


def _parse_roll(line_number: int, line: str) -> dict:
    row = _tokens(line)
    row["lineNumber"] = line_number
    return row


def _store_unique(rows: dict[int, dict], row: dict, kind: str) -> None:
    tick = int(row["tick"])
    if tick in rows:
        raise ValueError(f"duplicate {kind} row for tick {tick}")
    rows[tick] = row


def _load_trace(path: Path) -> list[dict]:
    records = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"invalid JSON on trace line {line_number}: {exc.msg}"
                ) from exc
            if not isinstance(value, dict):
                raise ValueError(f"trace line {line_number} is not an object")
            if value.get("schema") != TRACE_SCHEMA:
                raise ValueError(
                    f"trace line {line_number} has unsupported schema "
                    f"{value.get('schema')!r}"
                )
            records.append(value)
    if not records:
        raise ValueError("trace contains no records")

    ticks = [int(row["tick"]) for row in records]
    episode_ticks = [int(row["episodeTick"]) for row in records]
    if ticks != list(range(ticks[0], ticks[0] + len(ticks))):
        raise ValueError("trace ticks must be contiguous and ordered")
    if episode_ticks != list(range(episode_ticks[0], episode_ticks[0] + len(records))):
        raise ValueError("trace episode ticks must be contiguous and ordered")
    if len({int(row["episodeId"]) for row in records}) != 1:
        raise ValueError("trace crosses episode IDs")
    if len({int(row["botIndex"]) for row in records}) != 1:
        raise ValueError("trace crosses bot indexes")
    return records


def _parse_java_log(path: Path, trace_ticks: list[int], episode_id: int) -> dict:
    tick_set = set(trace_ticks)
    first_tick = trace_ticks[0]
    last_tick = trace_ticks[-1]
    decisions: dict[int, dict] = {}
    applied: dict[int, dict] = {}
    prayer: dict[int, dict] = {}
    rolls: dict[int, list[dict]] = defaultdict(list)
    starts = []
    ends = []
    terminal_events = []

    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.rstrip("\r\n")
            if line.startswith("live_decision "):
                tick = int(_token(line, "tick"))
                if tick in tick_set:
                    _store_unique(
                        decisions, _parse_decision(line_number, line), "live_decision"
                    )
            elif line.startswith("live_applied_state "):
                tick = int(_token(line, "tick"))
                if tick in tick_set:
                    _store_unique(
                        applied, _parse_applied(line_number, line), "live_applied_state"
                    )
            elif line.startswith("live_prayer_state "):
                tick = int(_token(line, "tick"))
                if tick in tick_set:
                    _store_unique(
                        prayer, _parse_prayer_state(line_number, line), "live_prayer_state"
                    )
            elif line.startswith("roll_time_interaction "):
                tick = int(_token(line, "tick"))
                if first_tick - 1 <= tick <= last_tick:
                    rolls[tick].append(_parse_roll(line_number, line))
            elif line.startswith("policy_reward_start "):
                row = _tokens(line)
                row["lineNumber"] = line_number
                if int(row.get("id", -1)) == episode_id:
                    starts.append(row)
            elif line.startswith("policy_reward_end "):
                row = _tokens(line)
                row["lineNumber"] = line_number
                if int(row.get("id", -1)) == episode_id:
                    ends.append(row)
            elif line.startswith("policy_reward_event "):
                row = _tokens(line)
                if (
                    int(row.get("id", -1)) == episode_id
                    and row.get("type") == "kill"
                ):
                    row["lineNumber"] = line_number
                    terminal_events.append(row)

    expected_ticks = set(trace_ticks)
    for name, rows in (
        ("live_decision", decisions),
        ("live_applied_state", applied),
        ("live_prayer_state", prayer),
    ):
        missing = sorted(expected_ticks - set(rows))
        extra = sorted(set(rows) - expected_ticks)
        if missing or extra:
            raise ValueError(f"{name} tick mismatch: missing={missing} extra={extra}")
    if len(starts) != 1 or len(ends) != 1:
        raise ValueError(
            f"expected one policy reward start/end for episode {episode_id}, "
            f"got {len(starts)}/{len(ends)}"
        )
    return {
        "decisions": decisions,
        "applied": applied,
        "prayer": prayer,
        "rolls": rolls,
        "start": starts[0],
        "end": ends[0],
        "terminalEvents": terminal_events,
    }


def _prayer_name(action_id: int, row_by_action_id: dict[int, int]) -> str:
    row = row_by_action_id.get(int(action_id), -1)
    local = row - schema.DEFENCE_BASE
    if 0 <= local < schema.DEFENCE_COUNT:
        return schema.PRAYER_NAMES[local]
    return f"action_{action_id}"


def _style_block(values: np.ndarray) -> str | None:
    local = np.asarray(values, dtype=np.float64)
    if local.shape != (3,) or float(np.max(local)) <= 0.5:
        return None
    return ("magic", "ranged", "melee")[int(np.argmax(local))]


def _prayer_bits(values: np.ndarray) -> str | None:
    return _style_block(values)


def _compact_model_observation(raw: np.ndarray) -> dict:
    base = schema.INPUT_STYLE_BLOCK_BASE
    return {
        "distance": int(round(float(raw[schema.INPUT_DISTANCE]) * 12.0)),
        "selfHpRatio": float(raw[schema.INPUT_SELF_HP]),
        "opponentHpRatio": float(raw[schema.INPUT_OPP_HP]),
        "selfPositionDelta": {
            "dx": int(round(float(raw[schema.INPUT_SELF_DX]) * 4.0)),
            "dy": int(round(float(raw[schema.INPUT_SELF_DY]) * 4.0)),
        },
        "opponentPositionDelta": {
            "dx": int(round(float(raw[schema.INPUT_OPP_DX]) * 4.0)),
            "dy": int(round(float(raw[schema.INPUT_OPP_DY]) * 4.0)),
        },
        "targetRelative": {
            "dx": int(round(float(raw[schema.INPUT_TARGET_REL_DX]) * 16.0)),
            "dy": int(round(float(raw[schema.INPUT_TARGET_REL_DY]) * 16.0)),
        },
        "selfFreezeTicks": int(
            round(
                float(raw[schema.INPUT_SELF_FREEZE_TICKS])
                * schema.FREEZE_TICKS_NORMALIZER
            )
        ),
        "opponentFreezeTicks": int(
            round(
                float(raw[schema.INPUT_OPP_FREEZE_TICKS])
                * schema.FREEZE_TICKS_NORMALIZER
            )
        ),
        "opponentLikelyStyle": _style_block(raw[base + 9 : base + 12]),
        "opponentGearStyle": _style_block(raw[base + 12 : base + 15]),
        "selfPrayer": _prayer_bits(
            raw[
                schema.INPUT_SELF_PROTECT_MAGIC :
                schema.INPUT_SELF_PROTECT_MELEE + 1
            ]
        ),
        "opponentPrayer": _prayer_bits(
            raw[
                schema.INPUT_OPP_PROTECT_MAGIC :
                schema.INPUT_OPP_PROTECT_MELEE + 1
            ]
        ),
        "opponentTicksSinceObservedAttack": float(
            raw[schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK]
        ),
    }


def _replay_trace(
    checkpoint: Path,
    records: list[dict],
    device: str,
    atol: float,
    rtol: float,
) -> tuple[dict, list[dict]]:
    if atol < 0.0 or rtol < 0.0:
        raise ValueError("tolerances must be non-negative")
    candidate = policy.Policy.load(checkpoint, device=device)
    row_by_action_id = {
        int(action_id): row for row, action_id in enumerate(candidate.action_ids)
    }

    states = np.asarray([row["state114"] for row in records], dtype=np.float32)
    histories = np.asarray(
        [
            [*row["attackHistoryCodes"], *row["ownPrayerHistoryCodes"]]
            for row in records
        ],
        dtype=np.int64,
    )
    prior = np.asarray([row["priorState114"] for row in records], dtype=np.float32)
    prior_valid = np.asarray(
        [row["priorStateValid"] for row in records], dtype=np.int64
    )
    if states.shape != (len(records), schema.INPUT_SIZE):
        raise ValueError(f"state114 batch has shape {states.shape}")
    if histories.shape != (
        len(records),
        schema.DEFENCE_PRAYER_HISTORY_CODE_COUNT,
    ):
        raise ValueError(f"prayer history batch has shape {histories.shape}")
    if prior.shape != (
        len(records),
        schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
        schema.INPUT_SIZE,
    ):
        raise ValueError(f"prior-state batch has shape {prior.shape}")
    if prior_valid.shape != prior.shape[:2]:
        raise ValueError(f"prior-state validity batch has shape {prior_valid.shape}")
    if np.any((prior_valid != 0) & (prior_valid != 1)):
        raise ValueError("priorStateValid must be binary")
    if np.any(np.diff(prior_valid, axis=1) > 0):
        raise ValueError("priorStateValid must be newest-first contiguous")
    if np.any(prior[prior_valid == 0] != 0.0):
        raise ValueError("invalid priorState114 rows must be zero padded")

    scores, values = candidate.score(
        states,
        prayer_history_codes=histories,
        prior_state_history=prior,
        prior_state_history_valid=prior_valid,
    )
    results = []
    for index, record in enumerate(records):
        protection_ids = [
            int(value) for value in record["protectionPrayerActionIds"]
        ]
        if protection_ids != [420467, 420468, 420469]:
            raise ValueError(
                f"record {index} has unexpected protection IDs {protection_ids}"
            )
        java_scores = np.asarray(record["protectionPrayerScores"], dtype=np.float64)
        fast_scores = np.asarray(
            [scores[index, row_by_action_id[action_id]] for action_id in protection_ids],
            dtype=np.float64,
        )
        deltas = np.abs(fast_scores - java_scores)
        score_match = bool(
            np.allclose(fast_scores, java_scores, atol=atol, rtol=rtol)
        )

        legal_ids = [int(value) for value in record["legalDefenceActionIds"]]
        if not legal_ids:
            raise ValueError(f"record {index} has no legal defence action")
        missing = [value for value in legal_ids if value not in row_by_action_id]
        if missing:
            raise ValueError(f"record {index} has unknown legal actions {missing}")
        legal_scores = np.asarray(
            [scores[index, row_by_action_id[action_id]] for action_id in legal_ids],
            dtype=np.float64,
        )
        greedy_offset = int(np.argmax(legal_scores))
        greedy_id = legal_ids[greedy_offset]
        best_score = float(legal_scores[greedy_offset])
        tolerance = atol + rtol * abs(best_score)
        acceptable_ids = [
            action_id
            for action_id, action_score in zip(legal_ids, legal_scores, strict=True)
            if best_score - float(action_score) <= tolerance
        ]
        java_selected = int(record["selectedDefenceActionId"])
        java_model_action = int(record["selectedDefenceModelAction"])
        if row_by_action_id.get(java_selected) != java_model_action:
            raise ValueError(
                f"record {index} has inconsistent selected action row/id"
            )
        selection_match = greedy_id == java_selected
        result = {
            "javaPrayerScores": {
                _prayer_name(action_id, row_by_action_id): float(value)
                for action_id, value in zip(protection_ids, java_scores, strict=True)
            },
            "fastSimPrayerScores": {
                _prayer_name(action_id, row_by_action_id): float(value)
                for action_id, value in zip(protection_ids, fast_scores, strict=True)
            },
            "absoluteDeltas": {
                _prayer_name(action_id, row_by_action_id): float(value)
                for action_id, value in zip(protection_ids, deltas, strict=True)
            },
            "scoreMatch": score_match,
            "legalDefenceActionIds": legal_ids,
            "legalFastSimScores": {
                str(action_id): float(value)
                for action_id, value in zip(legal_ids, legal_scores, strict=True)
            },
            "javaSelectedActionId": java_selected,
            "javaSelectedPrayer": _prayer_name(java_selected, row_by_action_id),
            "fastSimGreedyActionId": greedy_id,
            "fastSimGreedyPrayer": _prayer_name(greedy_id, row_by_action_id),
            "acceptableFastSimActionIds": acceptable_ids,
            "selectionMatch": selection_match,
            "value": float(values[index]),
            "attackHistoryCodes": [int(value) for value in histories[index, :3]],
            "ownPrayerHistoryCodes": [int(value) for value in histories[index, 3:]],
            "priorStateValidCount": int(np.count_nonzero(prior_valid[index])),
            "modelObservation": _compact_model_observation(states[index]),
        }
        results.append(result)

    score_matches = sum(bool(row["scoreMatch"]) for row in results)
    selection_matches = sum(bool(row["selectionMatch"]) for row in results)
    max_delta = max(
        max(float(value) for value in row["absoluteDeltas"].values())
        for row in results
    )
    summary = {
        "device": str(candidate.device),
        "inputSize": candidate.input_size,
        "actionCount": candidate.action_count,
        "defencePrayerHeadVersion": candidate.defence_prayer_head_version,
        "records": len(records),
        "scoreComparisons": len(records) * 3,
        "absoluteTolerance": atol,
        "relativeTolerance": rtol,
        "maxAbsolutePrayerScoreDelta": max_delta,
        "scoreMatches": score_matches,
        "selectionMatches": selection_matches,
        "pass": score_matches == len(records) and selection_matches == len(records),
    }
    return summary, results


def _active_prayer(bits: dict[str, bool]) -> str:
    active = [name for name, enabled in bits.items() if enabled]
    return active[0] if len(active) == 1 else "none" if not active else "+".join(active)


def _freeze_transitions(applied: dict[int, dict], ticks: list[int]) -> dict[int, list[dict]]:
    transitions: dict[int, list[dict]] = defaultdict(list)
    previous = {"self": None, "opponent": None}
    for tick in ticks:
        freeze = applied[tick]["freeze"]
        current = {
            "self": int(freeze["selfTicks"]),
            "opponent": int(freeze["opponentTicks"]),
        }
        for target, remaining in current.items():
            prior = previous[target]
            if remaining > 0 and prior is None:
                transitions[tick].append(
                    {"target": target, "kind": "observedAtTraceStart", "remaining": remaining}
                )
            elif prior is not None and remaining > max(prior - 1, 0):
                transitions[tick].append(
                    {"target": target, "kind": "newOrRefreshed", "remaining": remaining}
                )
            previous[target] = remaining
    return transitions


def _fraction(value) -> tuple[int, int]:
    if not isinstance(value, str) or not re.fullmatch(r"\d+/\d+", value):
        raise ValueError(f"expected correct/total fraction, got {value!r}")
    left, right = value.split("/", 1)
    return int(left), int(right)


def _roll_summary(log: dict, ticks: list[int]) -> tuple[dict, bool]:
    bot = str(log["start"]["self"])
    opponent = str(log["start"]["opp"])
    fight_rolls = [
        row
        for tick in ticks
        for row in log["rolls"].get(tick, [])
    ]
    incoming = [
        row
        for row in fight_rolls
        if row.get("attacker") == opponent and row.get("defender") == bot
    ]
    outgoing = [
        row
        for row in fight_rolls
        if row.get("attacker") == bot and row.get("defender") == opponent
    ]
    by_style = {}
    for style in ("magic", "ranged", "melee"):
        style_rows = [row for row in incoming if row.get("style") == style]
        correct = sum(bool(row.get("protected")) for row in style_rows)
        by_style[style] = {
            "rolls": len(style_rows),
            "correct": correct,
            "correctPct": (
                None if not style_rows else round(100.0 * correct / len(style_rows), 3)
            ),
        }
    correct = sum(bool(row.get("protected")) for row in incoming)
    end = log["end"]
    checks = (
        int(end["rollPrayerChecks"]) == len(incoming)
        and int(end["rollPrayerCorrect"]) == correct
        and int(end["rollPrayerIncorrect"]) == len(incoming) - correct
    )
    for style, key in (
        ("magic", "rollPrayerMagic"),
        ("ranged", "rollPrayerRanged"),
        ("melee", "rollPrayerMelee"),
    ):
        logged_correct, logged_rolls = _fraction(end[key])
        checks = checks and (
            logged_correct == by_style[style]["correct"]
            and logged_rolls == by_style[style]["rolls"]
        )
    prelude = log["rolls"].get(ticks[0] - 1, [])
    return {
        "incomingRolls": len(incoming),
        "incomingCorrect": correct,
        "incomingIncorrect": len(incoming) - correct,
        "incomingCorrectPct": (
            None if not incoming else round(100.0 * correct / len(incoming), 3)
        ),
        "incomingByStyle": by_style,
        "outgoingRolls": len(outgoing),
        "preTraceRolls": prelude,
        "matchesPolicyRewardEnd": checks,
    }, checks


def _longest_hold(values: list[str]) -> int:
    longest = 0
    current = 0
    previous = None
    for value in values:
        if value == previous:
            current += 1
        else:
            previous = value
            current = 1
        longest = max(longest, current)
    return longest


def _prayer_style(value: str) -> str | None:
    normalized = str(value).upper()
    if normalized.endswith("MAGIC"):
        return "magic"
    if normalized.endswith("MISSILES") or normalized.endswith("RANGED"):
        return "ranged"
    if normalized.endswith("MELEE"):
        return "melee"
    return None


def _candidate_trace_counterfactual(
    log: dict,
    ticks: list[int],
    replay_rows: list[dict],
) -> dict:
    """Judge child choices on the fixed recorded states with Java timing.

    This deliberately does not claim to be a closed-loop replay: changing a
    prayer would change later own-prayer history, damage and potentially the
    human's response. It answers the narrower and useful question of what the
    checkpoint chooses for every exact state Teacher180 saw in the hand fight.
    """
    selected_by_tick = {
        tick: str(replay["fastSimGreedyPrayer"])
        for tick, replay in zip(ticks, replay_rows, strict=True)
    }
    bot = str(log["start"]["self"])
    opponent = str(log["start"]["opp"])
    incoming = [
        (tick, row)
        for tick in ticks
        for row in log["rolls"].get(tick, [])
        if row.get("attacker") == opponent and row.get("defender") == bot
    ]
    by_style = {}
    sequence = []
    longest_ranged_miss = 0
    current_ranged_miss = 0
    for tick, row in incoming:
        # Java makes a just-selected protection ineffective for a same-tick
        # roll, so the decision from the preceding server tick is used.
        selected_tick = tick - 1
        selected = selected_by_tick.get(selected_tick)
        if selected is None:
            effective_style = str(row.get("defenderPrayer") or "none").lower()
            source = "recorded-pretrace-prayer"
        else:
            effective_style = _prayer_style(selected) or "none"
            source = "candidate-previous-tick-selection"
        style = str(row.get("style"))
        correct = effective_style == style
        if style == "ranged" and not correct:
            current_ranged_miss += 1
            longest_ranged_miss = max(
                longest_ranged_miss, current_ranged_miss)
        else:
            current_ranged_miss = 0
        sequence.append({
            "tick": tick,
            "style": style,
            "candidateDecisionTick": selected_tick,
            "candidateSelectedPrayer": selected,
            "candidateEffectiveStyle": effective_style,
            "candidatePrayerSource": source,
            "correct": correct,
        })

    for style in ("magic", "ranged", "melee"):
        rows = [row for row in sequence if row["style"] == style]
        correct = sum(bool(row["correct"]) for row in rows)
        by_style[style] = {
            "rolls": len(rows),
            "correct": correct,
            "correctPct": None if not rows else round(100.0 * correct / len(rows), 3),
        }
    correct = sum(bool(row["correct"]) for row in sequence)
    selections = [str(row["fastSimGreedyPrayer"]) for row in replay_rows]
    return {
        "scope": "fixed recorded inputs; diagnostic, not closed-loop",
        "oneTickPrayerEffectivenessDelayApplied": True,
        "decisionTicks": len(replay_rows),
        "selectedPrayerTicks": dict(sorted(Counter(selections).items())),
        "changedSelectionsFromRecordedTeacher180": sum(
            row["fastSimGreedyPrayer"] != row["javaSelectedPrayer"]
            for row in replay_rows
        ),
        "incomingRolls": len(sequence),
        "incomingCorrect": correct,
        "incomingCorrectPct": (
            None if not sequence else round(100.0 * correct / len(sequence), 3)
        ),
        "incomingByStyle": by_style,
        "longestConsecutiveUnprotectedRangedRolls": longest_ranged_miss,
        "incomingSequence": sequence,
    }


def _position_summary(applied: dict[int, dict], ticks: list[int]) -> dict:
    self_xy = [
        (applied[tick]["position"]["self"]["x"], applied[tick]["position"]["self"]["y"])
        for tick in ticks
    ]
    opponent_xy = [
        (
            applied[tick]["position"]["opponent"]["x"],
            applied[tick]["position"]["opponent"]["y"],
        )
        for tick in ticks
    ]

    def side_summary(values: list[tuple[int, int]]) -> dict:
        return {
            "start": {"x": values[0][0], "y": values[0][1]},
            "end": {"x": values[-1][0], "y": values[-1][1]},
            "minX": min(value[0] for value in values),
            "maxX": max(value[0] for value in values),
            "minY": min(value[1] for value in values),
            "maxY": max(value[1] for value in values),
            "changedTicks": sum(left != right for left, right in zip(values, values[1:])),
        }

    return {
        "self": side_summary(self_xy),
        "opponent": side_summary(opponent_xy),
        "sameTileTicks": sum(
            bool(applied[tick]["position"]["sameTile"]) for tick in ticks
        ),
    }


def _gpu_eval_coverage() -> dict:
    from tools.evaluate_prayer_adaptation_matrix import SCENARIOS, Scenario

    scenario_fields = list(Scenario.__dataclass_fields__)
    recorded_fields = {
        "trace",
        "java_log",
        "timeline",
        "replay_plan",
        "positions",
        "actions",
    }
    recorded_sequence_fields = sorted(recorded_fields.intersection(scenario_fields))
    return {
        "exactRecordedSequencePresent": bool(recorded_sequence_fields),
        "scenarioInterfaceFields": scenario_fields,
        "recordedSequenceFields": recorded_sequence_fields,
        "currentPrayerMatrixScenarios": [
            {"name": value.name, "attack": value.attack, "kind": value.kind}
            for value in SCENARIOS
        ],
        "reason": (
            "Current GPU prayer-matrix cells select procedural ScriptedPolicy "
            "opponents and engine-generated world state. Their Scenario interface "
            "has no Java trace/log or per-tick world-state input. Engine replay_plan "
            "forces action rows only; it does not inject recorded positions, visible "
            "gear/prayers, freezes, or state114 history."
        ),
        "nearestProceduralCoverage": [
            "fixed-ranged",
            "heldout-human-recurring-fullgear",
            "honest-gear-style-transitions",
        ],
        "exactEvaluator": str(Path(__file__).resolve()),
    }


def build_report(
    checkpoint: Path,
    trace_path: Path,
    java_log_path: Path,
    device: str,
    atol: float,
    rtol: float,
    allow_model_divergence: bool = False,
) -> dict:
    records = _load_trace(trace_path)
    ticks = [int(row["tick"]) for row in records]
    episode_id = int(records[0]["episodeId"])
    log = _parse_java_log(java_log_path, ticks, episode_id)
    replay_summary, replay_rows = _replay_trace(
        checkpoint, records, device, atol, rtol
    )
    row_by_action_id = {
        int(action_id): row for row, action_id in enumerate(schema.CURRENT_ACTION_IDS)
    }

    transitions = _freeze_transitions(log["applied"], ticks)
    selected_log_matches = 0
    active_prayer_matches = 0
    timeline = []
    for record, replay in zip(records, replay_rows, strict=True):
        tick = int(record["tick"])
        decision = log["decisions"][tick]
        applied = log["applied"][tick]
        prayer_state = log["prayer"][tick]
        defence_actions = decision["channels"]["defence"]
        if len(defence_actions) != 1:
            raise ValueError(f"tick {tick} has {len(defence_actions)} defence actions")
        logged_action = defence_actions[0]
        selected_log_match = (
            int(logged_action["actionId"]) == int(record["selectedDefenceActionId"])
            and int(logged_action["modelAction"])
            == int(record["selectedDefenceModelAction"])
        )
        selected_log_matches += selected_log_match
        expected_prayer = _prayer_name(
            int(record["selectedDefenceActionId"]), row_by_action_id
        )
        active_match = (
            decision["summary"]["defence"] == expected_prayer
            and applied["self"]["requestedDefence"] == expected_prayer
            and applied["self"]["activeDefence"] == expected_prayer
            and prayer_state["requested"] == expected_prayer
            and prayer_state["active"] == expected_prayer
        )
        active_prayer_matches += active_match
        timeline.append(
            {
                "tick": tick,
                "episodeTick": int(record["episodeTick"]),
                "sourceLines": {
                    "decision": decision["lineNumber"],
                    "prayer": prayer_state["lineNumber"],
                    "applied": applied["lineNumber"],
                    "rolls": [
                        row["lineNumber"] for row in log["rolls"].get(tick, [])
                    ],
                },
                "position": applied["position"],
                "visible": {
                    "opponent": applied["opponentVisible"],
                    "prayerResolution": prayer_state,
                },
                "freeze": {
                    **applied["freeze"],
                    "transitions": transitions.get(tick, []),
                },
                "bot": {
                    **applied["self"],
                    "pidState": applied["pidState"],
                    "canAttackObserved": applied["canAttackObserved"],
                    "canAttackLive": applied["canAttackLive"],
                },
                "actions": decision,
                "modelReplay": {
                    **replay,
                    "logSelectedActionMatchesTrace": bool(selected_log_match),
                    "activePrayerMatchesSelected": bool(active_match),
                },
                "attackRolls": log["rolls"].get(tick, []),
            }
        )

    roll_summary, roll_consistent = _roll_summary(log, ticks)
    selected_names = [row["javaSelectedPrayer"] for row in replay_rows]
    selected_by_live_gear: dict[str, Counter] = defaultdict(Counter)
    selected_by_model_gear: dict[str, Counter] = defaultdict(Counter)
    visible_model_gear_style_matches = 0
    for tick, replay in zip(ticks, replay_rows, strict=True):
        selected = str(replay["javaSelectedPrayer"])
        live_style = str(log["prayer"][tick]["liveGearStyle"] or "none").upper()
        model_style = str(
            replay["modelObservation"]["opponentGearStyle"] or "none"
        ).upper()
        selected_by_live_gear[str(live_style)][selected] += 1
        selected_by_model_gear[model_style][selected] += 1
        visible_model_gear_style_matches += live_style == model_style
    selected_by_live_gear_json = {
        style: dict(sorted(counts.items()))
        for style, counts in sorted(selected_by_live_gear.items())
    }
    selected_by_model_gear_json = {
        style: dict(sorted(counts.items()))
        for style, counts in sorted(selected_by_model_gear.items())
    }
    bot_name = str(log["start"]["self"])
    opponent_name = str(log["start"]["opp"])
    roll_summary["incomingSequence"] = [
        {
            "tick": tick,
            "style": roll["style"],
            "attackerWeapon": roll["attackerWeapon"],
            "selectedPrayerThisDecision": replay_rows[index]["javaSelectedPrayer"],
            "visualActivePrayerThisTick": log["applied"][tick]["self"][
                "activeDefence"
            ],
            "rollEffectivePrayer": roll["defenderPrayer"],
            "protected": roll["protected"],
            "damage": roll["damage"],
            "lineNumber": roll["lineNumber"],
        }
        for index, tick in enumerate(ticks)
        for roll in log["rolls"].get(tick, [])
        if roll.get("attacker") == opponent_name
        and roll.get("defender") == bot_name
    ]
    roll_summary["incomingSequencePrayerTiming"] = (
        "selectedPrayerThisDecision and visualActivePrayerThisTick are the "
        "same-tick model/application state. rollEffectivePrayer is Java's "
        "one-tick-delayed prayer used for that attack roll."
    )
    opponent_prayers = [
        _active_prayer(log["applied"][tick]["opponentVisible"]["prayer"])
        for tick in ticks
    ]
    opponent_weapons = Counter(
        (
            int(log["applied"][tick]["opponentVisible"]["weaponId"]),
            str(log["applied"][tick]["opponentVisible"]["weaponName"]),
        )
        for tick in ticks
    )
    log_chain = {
        "records": len(records),
        "traceTicks": {"first": ticks[0], "last": ticks[-1], "contiguous": True},
        "liveDecisionRows": len(log["decisions"]),
        "livePrayerRows": len(log["prayer"]),
        "liveAppliedRows": len(log["applied"]),
        "selectedActionIdAndRowMatchesTrace": selected_log_matches,
        "selectedPrayerMatchesRequestedAndActive": active_prayer_matches,
        "rollSummaryMatchesPolicyRewardEnd": roll_consistent,
    }
    log_chain["pass"] = (
        selected_log_matches == len(records)
        and active_prayer_matches == len(records)
        and roll_consistent
    )
    report = {
        "schema": REPORT_SCHEMA,
        "authority": "diagnostic-only",
        "writesTrainingRows": False,
        "inputs": {
            "checkpoint": str(checkpoint),
            "checkpointSha256": _sha256(checkpoint),
            "trace": str(trace_path),
            "traceSha256": _sha256(trace_path),
            "javaLog": str(java_log_path),
            "javaLogSha256": _sha256(java_log_path),
        },
        "gpuEvaluationCoverage": _gpu_eval_coverage(),
        "fight": {
            "episodeId": episode_id,
            "botIndex": int(records[0]["botIndex"]),
            "bot": log["start"]["self"],
            "opponent": log["start"]["opp"],
            "rewardStart": log["start"],
            "rewardEnd": log["end"],
            "terminalEvents": log["terminalEvents"],
            "decisionTicks": len(records),
            "timelinePhase": (
                "Per-tick positions, bot gear and visible opponent weapon/prayer "
                "come from live_applied_state after the policy action. Attack-roll "
                "rows are attached to their exact server tick."
            ),
            "opponentVisibleGearEvidence": (
                "live_applied_state exposes the opponent weapon every tick. Full "
                "opponent head/body/legs/shield snapshots are retained where the "
                "Java attack-roll log emits them; unlogged slots are not inferred "
                "between rolls."
            ),
            "positionSummary": _position_summary(log["applied"], ticks),
            "freezeTransitions": [
                {"tick": tick, **transition}
                for tick in ticks
                for transition in transitions.get(tick, [])
            ],
            "opponentVisibleWeaponTicks": [
                {"weaponId": key[0], "weaponName": key[1], "ticks": count}
                for key, count in sorted(opponent_weapons.items())
            ],
            "opponentVisiblePrayerTicks": dict(sorted(Counter(opponent_prayers).items())),
            "selectedPrayerTicks": dict(sorted(Counter(selected_names).items())),
            "selectedPrayerByVisibleOpponentGearStyle": selected_by_live_gear_json,
            "selectedPrayerByModelOpponentGearStyle": selected_by_model_gear_json,
            "visibleAndModelGearStyleTickMatches": visible_model_gear_style_matches,
            "visibleAndModelGearStyleAllTicksMatch": (
                visible_model_gear_style_matches == len(records)
            ),
            "longestSelectedPrayerHoldTicks": _longest_hold(selected_names),
            "rolls": roll_summary,
        },
        "logTraceCorrelation": log_chain,
        "fastSimReplay": replay_summary,
        "candidateOnRecordedInputs": _candidate_trace_counterfactual(
            log, ticks, replay_rows
        ),
        "timeline": timeline,
    }
    report["allowModelDivergence"] = bool(allow_model_divergence)
    report["pass"] = bool(
        log_chain["pass"]
        and (replay_summary["pass"] or allow_model_divergence)
    )
    return report


def main() -> None:
    args = parse_args()
    checkpoint = args.checkpoint.resolve()
    trace_path = args.trace.resolve()
    java_log_path = args.java_log.resolve()
    for path in (checkpoint, trace_path, java_log_path):
        if not path.is_file():
            raise FileNotFoundError(path)
    report = build_report(
        checkpoint,
        trace_path,
        java_log_path,
        args.device,
        args.atol,
        args.rtol,
        args.allow_model_divergence,
    )
    rendered = json.dumps(report, indent=2)
    if args.report is None:
        print(rendered)
    else:
        report_path = args.report.resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(rendered + "\n", encoding="utf-8")
        print(
            json.dumps(
                {
                    "schema": report["schema"],
                    "report": str(report_path),
                    "pass": report["pass"],
                    "gpuExactSequencePresent": report["gpuEvaluationCoverage"][
                        "exactRecordedSequencePresent"
                    ],
                    "rolls": report["fight"]["rolls"],
                    "logTraceCorrelation": report["logTraceCorrelation"],
                    "fastSimReplay": report["fastSimReplay"],
                    "candidateOnRecordedInputs": report[
                        "candidateOnRecordedInputs"
                    ],
                },
                indent=2,
            )
        )
    if not report["pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
