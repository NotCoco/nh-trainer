"""Measure the reusable NHEV production buffer against fresh allocation.

Both encoders run the real ``RewardEventBatch`` validation and packing path.
The frozen reference differs only at the final payload boundary: it allocates
a fresh structured array for every write and converts it with ``tobytes``.
Outputs and episode state must match before timing begins. An in-memory sink
keeps the measurement focused on validation and packing rather than disk.
"""

from __future__ import annotations

import argparse
import gc
import io
import json
import statistics
import time
from types import SimpleNamespace

import numpy as np

from fastsim import reward_events, schema


class _LegacyBatchWriter(reward_events.RewardEventWriter):
    """The batch encoder immediately before direct binary packing."""

    def write(self, record, keep=None):
        rows = len(record.bot_index)
        select = (
            np.ones(rows, dtype=bool)
            if keep is None else np.asarray(keep, dtype=bool))
        if select.shape != (rows,):
            raise ValueError("NHEV keep mask does not match the tick record")

        selected_keys = set()
        for row in np.flatnonzero(select):
            key = (int(record.bot_index[row]), int(record.episode_id[row]))
            selected_keys.add(key)
            state = self.episodes.setdefault(
                key, reward_events._EpisodeState())
            state.last_tick = max(
                state.last_tick, int(record.decision_tick[row]))
            state.complete |= bool(record.done[row])

        prepared = []
        written = 0
        for event in record.reward_events:
            key = (int(event.bot_index), int(event.episode_id))
            if key not in selected_keys:
                continue
            state = self.episodes.get(key)
            if state is None:
                continue
            encoded = self._legacy_prepare_event(state, event)
            prepared.append(encoded)
            written += len(encoded[6])
        if prepared:
            payload = np.empty(
                written, dtype=reward_events.EVENT_RECORD_DTYPE)
            offset = 0
            for (
                sequence,
                bot_index,
                episode_id,
                event_type,
                resolution_tick,
                reward,
                contributors,
                weights,
                allocated_values,
            ) in prepared:
                count = len(contributors)
                rows = payload[offset:offset + count]
                rows["event_sequence"] = sequence
                rows["bot_index"] = bot_index
                rows["episode_id"] = episode_id
                rows["event_type"] = event_type
                rows["resolution_tick"] = resolution_tick
                rows["source_tick"] = tuple(
                    int(item.source_tick) for item in contributors)
                rows["target_decision_tick"] = tuple(
                    int(item.target_decision_tick) for item in contributors)
                rows["causal_unit"] = tuple(
                    int(item.causal_unit) for item in contributors)
                rows["gear_slot"] = tuple(
                    int(item.gear_slot) for item in contributors)
                rows["allocation_ordinal"] = range(count)
                rows["allocation_count"] = count
                rows["original_reward"] = reward
                rows["allocation_weight"] = weights
                rows["allocated_reward"] = allocated_values
                offset += count
            self.handle.write(payload.tobytes())
            self.records_written += written
        return written

    @staticmethod
    def _legacy_prepare_event(state, event):
        contributors = tuple(event.contributors)
        reward = float(event.original_reward)
        if (
            int(event.bot_index) < 0
            or int(event.episode_id) < 0
            or int(event.event_type) <= 0
            or int(event.resolution_tick) < 0
            or not np.isfinite(reward)
            or reward == 0.0
            or not contributors
        ):
            raise ValueError("invalid FastSim reward event")

        weights = np.asarray(
            [item.weight for item in contributors], dtype=np.float64)
        if (
            not np.isfinite(weights).all()
            or (weights <= 0.0).any()
            or abs(float(weights.sum()) - 1.0) > 1.0e-9
        ):
            raise ValueError(
                "reward-event contributor weights must sum to one")

        state.event_sequence += 1
        count = len(contributors)
        allocated_values = np.empty(count, dtype=np.float64)
        allocated = 0.0
        for ordinal, contributor in enumerate(contributors):
            source_tick = int(contributor.source_tick)
            target_tick = int(contributor.target_decision_tick)
            unit = int(contributor.causal_unit)
            gear_slot = int(contributor.gear_slot)
            if (
                source_tick < 0
                or target_tick < 0
                or target_tick > source_tick
                or source_tick > int(event.resolution_tick)
                or unit < 0
                or unit >= schema.CAUSAL_UNIT_COUNT
            ):
                raise ValueError("invalid FastSim reward contributor")
            if unit >= schema.CHANNEL_GEAR_BASE:
                expected_slot = int(
                    schema.OPTIONAL_GEAR_SLOTS[
                        unit - schema.CHANNEL_GEAR_BASE])
                if gear_slot != expected_slot:
                    raise ValueError(
                        "reward contributor gear slot does not match its unit")
            elif int(event.event_type) != reward_events.EVENT_ROLL_TANK_GEAR:
                if gear_slot != -1:
                    raise ValueError(
                        "non-gear reward contributor names a gear slot")

            weight = float(contributor.weight)
            value = (
                reward - allocated
                if ordinal + 1 == count else reward * weight)
            allocated += value
            allocated_values[ordinal] = value

        if abs(allocated - reward) > 1.0e-12:
            raise ValueError(
                "FastSim reward allocation did not conserve mass")
        state.event_count += 1
        state.allocation_count += count
        state.signed_mass += reward
        if reward > 0.0:
            state.positive_mass += reward
        else:
            state.negative_mass += reward
        state.last_tick = max(state.last_tick, int(event.resolution_tick))
        return (
            state.event_sequence,
            int(event.bot_index),
            int(event.episode_id),
            int(event.event_type),
            int(event.resolution_tick),
            reward,
            contributors,
            weights,
            allocated_values,
        )


class _FreshBatchWriter(reward_events.RewardEventWriter):
    """The production columnar path before payload-buffer reuse."""

    def _acquire_batch_payload(self, allocation_count):
        return np.empty(
            allocation_count, dtype=reward_events.EVENT_RECORD_DTYPE)

    def _emit_batch_payload(self, payload):
        self.handle.write(payload.tobytes())


class _NullSink:
    @staticmethod
    def write(payload):
        return len(payload)


def _make_writer(writer_type, handle):
    writer = writer_type.__new__(writer_type)
    writer.handle = handle
    writer.episodes = {}
    writer.records_written = 0
    writer._payload = bytearray()
    writer._batch_payload = np.empty(
        0, dtype=reward_events.EVENT_RECORD_DTYPE)
    return writer


def _make_record(event_count: int):
    contributor_counts = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 19)
    bot_count = 512
    events = []
    allocation_count = 0
    for event_index in range(event_count):
        count = contributor_counts[event_index % len(contributor_counts)]
        weight = 1.0 / count
        contributors = []
        for ordinal in range(count):
            unit = (event_index + ordinal) % schema.CAUSAL_UNIT_COUNT
            gear_slot = (
                int(schema.OPTIONAL_GEAR_SLOTS[
                    unit - schema.CHANNEL_GEAR_BASE])
                if unit >= schema.CHANNEL_GEAR_BASE else -1)
            source_tick = 100 + event_index % 100
            contributors.append(reward_events.RewardContributor(
                source_tick=source_tick,
                target_decision_tick=source_tick - ordinal % 2,
                causal_unit=unit,
                gear_slot=gear_slot,
                weight=weight,
            ))
        bot_index = event_index % bot_count
        reward = (1.0 if event_index % 2 == 0 else -1.0) * (
            0.125 * (event_index % 7 + 1))
        events.append(reward_events.RewardEvent(
            bot_index=bot_index,
            episode_id=1_000 + bot_index,
            event_type=reward_events.EVENT_DAMAGE_DEALT,
            resolution_tick=500,
            original_reward=reward,
            contributors=tuple(contributors),
        ))
        allocation_count += count
    object_record = SimpleNamespace(
        bot_index=np.arange(bot_count, dtype=np.int32),
        episode_id=np.arange(
            1_000, 1_000 + bot_count, dtype=np.int32),
        decision_tick=np.full(bot_count, 500, dtype=np.int64),
        done=np.zeros(bot_count, dtype=bool),
        reward_events=tuple(events),
    )
    builder = reward_events.RewardEventBatchBuilder(
        event_capacity=event_count,
        contributor_capacity=allocation_count,
    )
    for event in events:
        builder.append_event(event)
    batch_record = SimpleNamespace(
        bot_index=object_record.bot_index,
        episode_id=object_record.episode_id,
        decision_tick=object_record.decision_tick,
        done=object_record.done,
        reward_events=builder.freeze(),
    )
    return object_record, batch_record, allocation_count


def _measure(writer_type, record, writes):
    gc.collect()
    gc.disable()
    try:
        writer = _make_writer(writer_type, _NullSink())
        writer.write(record)
        started = time.perf_counter()
        for _ in range(writes):
            writer.write(record)
        return time.perf_counter() - started
    finally:
        gc.enable()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--events", type=int, default=16_384)
    parser.add_argument("--writes", type=int, default=8)
    parser.add_argument("--repeats", type=int, default=7)
    args = parser.parse_args(argv)
    if args.events <= 0 or args.writes <= 0 or args.repeats <= 0:
        raise ValueError("events, writes, and repeats must be positive")

    _, record, allocations = _make_record(args.events)
    if not isinstance(record.reward_events, reward_events.RewardEventBatch):
        raise AssertionError("benchmark did not build a RewardEventBatch")

    fresh_bytes = io.BytesIO()
    current_bytes = io.BytesIO()
    fresh = _make_writer(_FreshBatchWriter, fresh_bytes)
    current = _make_writer(reward_events.RewardEventWriter, current_bytes)
    fresh.write(record)
    current.write(record)
    if fresh_bytes.getvalue() != current_bytes.getvalue():
        raise AssertionError("fresh and reused encoders produced different bytes")
    if fresh.episodes != current.episodes:
        raise AssertionError("fresh and reused episode state differs")

    _measure(_FreshBatchWriter, record, args.writes)
    _measure(reward_events.RewardEventWriter, record, args.writes)
    samples = {"fresh_batch": [], "reused_batch": []}
    for repeat in range(args.repeats):
        order = (
            (_FreshBatchWriter, reward_events.RewardEventWriter)
            if repeat % 2 == 0
            else (reward_events.RewardEventWriter, _FreshBatchWriter))
        for writer_type in order:
            label = (
                "fresh_batch"
                if writer_type is _FreshBatchWriter else "reused_batch")
            samples[label].append(
                _measure(writer_type, record, args.writes))

    fresh_seconds = statistics.median(samples["fresh_batch"])
    reused_seconds = statistics.median(samples["reused_batch"])
    paired_speedups = [
        fresh / reused
        for fresh, reused in zip(
            samples["fresh_batch"], samples["reused_batch"])
    ]
    paired_median_speedup = statistics.median(paired_speedups)
    total_events = args.events * args.writes
    total_allocations = allocations * args.writes
    print(json.dumps({
        "events": args.events,
        "allocations": allocations,
        "writes_per_sample": args.writes,
        "repeats": args.repeats,
        "input_type": "RewardEventBatch",
        "byte_identical": True,
        "episode_state_identical": True,
        "fresh_batch_median_seconds": fresh_seconds,
        "reused_batch_median_seconds": reused_seconds,
        "speedup": paired_median_speedup,
        "paired_median_speedup": paired_median_speedup,
        "ratio_of_median_seconds": fresh_seconds / reused_seconds,
        "fresh_batch_events_per_second": total_events / fresh_seconds,
        "reused_batch_events_per_second": total_events / reused_seconds,
        "fresh_batch_allocations_per_second": (
            total_allocations / fresh_seconds),
        "reused_batch_allocations_per_second": (
            total_allocations / reused_seconds),
        "fresh_batch_samples_seconds": samples["fresh_batch"],
        "reused_batch_samples_seconds": samples["reused_batch"],
        "paired_speedups": paired_speedups,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
