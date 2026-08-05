"""Write the NHEV-v3 causal reward stream beside a FastSim rollout.

The trainer deliberately refuses corrected v25 reward training without this
sidecar. Its format and episode invariants come from
``NhRewardEventExporter.java`` and ``nh_reward_events.py``.
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import schema

MAGIC = 0x4E484556  # NHEV
VERSION = 3
RECORD_BYTES = 84

EVENT_DAMAGE_DEALT = 1
EVENT_DAMAGE_TAKEN = 2
EVENT_ROLLING_DPS = 3
EVENT_ROLLING_DTPS = 4
EVENT_ROLL_PRAYER = 6
EVENT_ROLL_TANK_GEAR = 7
EVENT_SPEC_OUTCOME = 9
EVENT_SUPPLY_RESOLUTION = 10
EVENT_FREEZE_LANDED = 15

UNIT_COMBAT = schema.CHANNEL_COMBAT
UNIT_DEFENCE = schema.CHANNEL_DEFENCE
UNIT_MOVEMENT = schema.CHANNEL_MOVEMENT
UNIT_SUPPLY = schema.CHANNEL_SUPPLY

EVENT_RECORD_DTYPE = np.dtype([
    ("event_sequence", ">i8"),
    ("bot_index", ">i4"),
    ("episode_id", ">i4"),
    ("event_type", ">i4"),
    ("resolution_tick", ">i8"),
    ("source_tick", ">i8"),
    ("target_decision_tick", ">i8"),
    ("causal_unit", ">i4"),
    ("gear_slot", ">i4"),
    ("allocation_ordinal", ">i4"),
    ("allocation_count", ">i4"),
    ("original_reward", ">f8"),
    ("allocation_weight", ">f8"),
    ("allocated_reward", ">f8"),
])
assert EVENT_RECORD_DTYPE.itemsize == RECORD_BYTES
_EVENT_RECORD_STRUCT = struct.Struct(">qiiiqqqiiiiddd")
assert _EVENT_RECORD_STRUCT.size == RECORD_BYTES


@dataclass(frozen=True, slots=True)
class RewardContributor:
    source_tick: int
    target_decision_tick: int
    causal_unit: int
    gear_slot: int = -1
    weight: float = 1.0


@dataclass(frozen=True, slots=True)
class RewardEvent:
    bot_index: int
    episode_id: int
    event_type: int
    resolution_tick: int
    original_reward: float
    contributors: tuple[RewardContributor, ...]


@dataclass(frozen=True, slots=True)
class RewardContributorColumns:
    """Reusable contributor set without one Python object per allocation."""

    source_tick: tuple[int, ...]
    target_decision_tick: tuple[int, ...]
    causal_unit: tuple[int, ...]
    gear_slot: tuple[int, ...]
    weight: tuple[float, ...]

    def __len__(self) -> int:
        return len(self.source_tick)

    def __iter__(self):
        for index in range(len(self)):
            yield RewardContributor(
                source_tick=self.source_tick[index],
                target_decision_tick=self.target_decision_tick[index],
                causal_unit=self.causal_unit[index],
                gear_slot=self.gear_slot[index],
                weight=self.weight[index],
            )

    def __getitem__(self, index):
        if isinstance(index, slice):
            return tuple(self)[index]
        index = int(index)
        if index < 0:
            index += len(self)
        if index < 0 or index >= len(self):
            raise IndexError(index)
        return RewardContributor(
            source_tick=self.source_tick[index],
            target_decision_tick=self.target_decision_tick[index],
            causal_unit=self.causal_unit[index],
            gear_slot=self.gear_slot[index],
            weight=self.weight[index],
        )


EMPTY_CONTRIBUTOR_COLUMNS = RewardContributorColumns((), (), (), (), ())


@dataclass(frozen=True, slots=True)
class RewardEventBatch:
    """One ordered tick of events stored as parallel numeric columns."""

    bot_index: np.ndarray
    episode_id: np.ndarray
    event_type: np.ndarray
    resolution_tick: np.ndarray
    original_reward: np.ndarray
    contributor_offset: np.ndarray
    contributor_count: np.ndarray
    source_tick: np.ndarray
    target_decision_tick: np.ndarray
    causal_unit: np.ndarray
    gear_slot: np.ndarray
    weight: np.ndarray

    def __len__(self) -> int:
        return len(self.bot_index)

    def __iter__(self):
        for index in range(len(self)):
            yield _event_from_columns(self, index)

    def __getitem__(self, index):
        if isinstance(index, slice):
            return tuple(
                _event_from_columns(self, item)
                for item in range(*index.indices(len(self))))
        index = int(index)
        if index < 0:
            index += len(self)
        if index < 0 or index >= len(self):
            raise IndexError(index)
        return _event_from_columns(self, index)

    def __eq__(self, other) -> bool:
        if not isinstance(other, (RewardEventBatch, RewardEventBatchBuilder)):
            return NotImplemented
        return tuple(self) == tuple(other)


class RewardEventBatchBuilder:
    """Append-friendly event builder that freezes into numeric columns.

    Python list appends are materially cheaper than assigning thousands of
    individual NumPy scalars. ``freeze`` performs one conversion per column,
    after which the writer stays fully columnar. Reusing the cleared lists
    cannot mutate a frozen batch.
    """

    def __init__(
        self,
        event_capacity: int = 16,
        contributor_capacity: int = 64,
    ):
        # Capacity hints remain accepted for API compatibility; CPython lists
        # grow geometrically and benchmark faster than manual NumPy growth for
        # this scalar append workload.
        _ = event_capacity, contributor_capacity
        self._event_count = 0
        self._contributor_count = 0
        self.bot_index = []
        self.episode_id = []
        self.event_type = []
        self.resolution_tick = []
        self.original_reward = []
        self.contributor_offset = []
        self.contributor_count = []
        self.source_tick = []
        self.target_decision_tick = []
        self.causal_unit = []
        self.gear_slot = []
        self.weight = []

    @staticmethod
    def _column(value, dtype, count: int, name: str) -> np.ndarray:
        column = np.asarray(value, dtype=dtype)
        if column.ndim == 0:
            return np.full(count, column.item(), dtype=dtype)
        column = column.reshape(-1)
        if len(column) != count:
            raise ValueError(
                f"reward-event {name} has {len(column)} values, expected "
                f"{count}")
        return column

    def append(
        self,
        *,
        bot_index: int,
        episode_id: int,
        event_type: int,
        resolution_tick: int,
        original_reward: float,
        source_tick,
        target_decision_tick,
        causal_unit,
        gear_slot=-1,
        weight=1.0,
    ) -> None:
        sources = np.asarray(source_tick, dtype=np.int64)
        if sources.ndim == 0:
            sources = sources.reshape(1)
        else:
            sources = sources.reshape(-1)
        count = len(sources)
        targets = self._column(
            target_decision_tick, np.int64, count, "target ticks")
        units = self._column(causal_unit, np.int32, count, "causal units")
        slots = self._column(gear_slot, np.int32, count, "gear slots")
        weights = self._column(weight, np.float64, count, "weights")

        contributor_offset = self._contributor_count
        self.bot_index.append(int(bot_index))
        self.episode_id.append(int(episode_id))
        self.event_type.append(int(event_type))
        self.resolution_tick.append(int(resolution_tick))
        self.original_reward.append(float(original_reward))
        self.contributor_offset.append(contributor_offset)
        self.contributor_count.append(count)
        self.source_tick.extend(sources.tolist())
        self.target_decision_tick.extend(targets.tolist())
        self.causal_unit.extend(units.tolist())
        self.gear_slot.extend(slots.tolist())
        self.weight.extend(weights.tolist())
        self._event_count += 1
        self._contributor_count += count

    def append_event(self, event: RewardEvent) -> None:
        contributors = tuple(event.contributors)
        self.append_contributors(
            bot_index=event.bot_index,
            episode_id=event.episode_id,
            event_type=event.event_type,
            resolution_tick=event.resolution_tick,
            original_reward=event.original_reward,
            contributors=contributors,
        )

    def append_contributors(
        self,
        *,
        bot_index: int,
        episode_id: int,
        event_type: int,
        resolution_tick: int,
        original_reward: float,
        contributors,
    ) -> None:
        """Append existing contributor objects without temporary columns."""
        contributors = tuple(contributors)
        count = len(contributors)
        contributor_offset = self._contributor_count
        self.bot_index.append(int(bot_index))
        self.episode_id.append(int(episode_id))
        self.event_type.append(int(event_type))
        self.resolution_tick.append(int(resolution_tick))
        self.original_reward.append(float(original_reward))
        self.contributor_offset.append(contributor_offset)
        self.contributor_count.append(count)

        for contributor in contributors:
            self.source_tick.append(int(contributor.source_tick))
            self.target_decision_tick.append(int(
                contributor.target_decision_tick))
            self.causal_unit.append(int(contributor.causal_unit))
            self.gear_slot.append(int(contributor.gear_slot))
            self.weight.append(float(contributor.weight))

        self._event_count += 1
        self._contributor_count += count

    def append_columns(
        self,
        *,
        bot_index: int,
        episode_id: int,
        event_type: int,
        resolution_tick: int,
        original_reward: float,
        contributors: RewardContributorColumns,
    ) -> None:
        """Append a cached contributor set with bulk list extensions."""
        count = len(contributors)
        self.bot_index.append(int(bot_index))
        self.episode_id.append(int(episode_id))
        self.event_type.append(int(event_type))
        self.resolution_tick.append(int(resolution_tick))
        self.original_reward.append(float(original_reward))
        self.contributor_offset.append(self._contributor_count)
        self.contributor_count.append(count)
        self.source_tick.extend(contributors.source_tick)
        self.target_decision_tick.extend(
            contributors.target_decision_tick)
        self.causal_unit.extend(contributors.causal_unit)
        self.gear_slot.extend(contributors.gear_slot)
        self.weight.extend(contributors.weight)
        self._event_count += 1
        self._contributor_count += count

    def clear(self) -> None:
        for column in (
            self.bot_index,
            self.episode_id,
            self.event_type,
            self.resolution_tick,
            self.original_reward,
            self.contributor_offset,
            self.contributor_count,
            self.source_tick,
            self.target_decision_tick,
            self.causal_unit,
            self.gear_slot,
            self.weight,
        ):
            column.clear()
        self._event_count = 0
        self._contributor_count = 0

    def __len__(self) -> int:
        return self._event_count

    def __iter__(self):
        for index in range(len(self)):
            yield _event_from_columns(self, index)

    def __getitem__(self, index):
        if isinstance(index, slice):
            return tuple(
                _event_from_columns(self, item)
                for item in range(*index.indices(len(self))))
        index = int(index)
        if index < 0:
            index += len(self)
        if index < 0 or index >= len(self):
            raise IndexError(index)
        return _event_from_columns(self, index)

    def __eq__(self, other) -> bool:
        if not isinstance(other, (RewardEventBatch, RewardEventBatchBuilder)):
            return NotImplemented
        return tuple(self) == tuple(other)

    def freeze(self) -> RewardEventBatch:
        return RewardEventBatch(
            bot_index=np.asarray(self.bot_index, dtype=np.int32),
            episode_id=np.asarray(self.episode_id, dtype=np.int32),
            event_type=np.asarray(self.event_type, dtype=np.int32),
            resolution_tick=np.asarray(
                self.resolution_tick, dtype=np.int64),
            original_reward=np.asarray(
                self.original_reward, dtype=np.float64),
            contributor_offset=np.asarray(
                self.contributor_offset, dtype=np.int64),
            contributor_count=np.asarray(
                self.contributor_count, dtype=np.int32),
            source_tick=np.asarray(self.source_tick, dtype=np.int64),
            target_decision_tick=np.asarray(
                self.target_decision_tick, dtype=np.int64),
            causal_unit=np.asarray(self.causal_unit, dtype=np.int32),
            gear_slot=np.asarray(self.gear_slot, dtype=np.int32),
            weight=np.asarray(self.weight, dtype=np.float64),
        )


def _event_from_columns(columns, index: int) -> RewardEvent:
    """Materialize one compatibility event only when callers iterate a batch."""
    offset = int(columns.contributor_offset[index])
    count = int(columns.contributor_count[index])
    stop = offset + count
    contributors = tuple(
        RewardContributor(
            source_tick=int(columns.source_tick[item]),
            target_decision_tick=int(columns.target_decision_tick[item]),
            causal_unit=int(columns.causal_unit[item]),
            gear_slot=int(columns.gear_slot[item]),
            weight=float(columns.weight[item]),
        )
        for item in range(offset, stop)
    )
    return RewardEvent(
        bot_index=int(columns.bot_index[index]),
        episode_id=int(columns.episode_id[index]),
        event_type=int(columns.event_type[index]),
        resolution_tick=int(columns.resolution_tick[index]),
        original_reward=float(columns.original_reward[index]),
        contributors=contributors,
    )


@dataclass(slots=True)
class _EpisodeState:
    last_tick: int = 0
    complete: bool = False
    event_sequence: int = 0
    event_count: int = 0
    allocation_count: int = 0
    signed_mass: float = 0.0
    positive_mass: float = 0.0
    negative_mass: float = 0.0


def _write_utf(handle, value: str) -> None:
    raw = str(value).encode("utf-8")
    if len(raw) > 0xFFFF:
        raise ValueError("NHEV UTF field is too long")
    handle.write(struct.pack(">H", len(raw)))
    handle.write(raw)


class RewardEventWriter:
    """Stream reward allocations and close with one summary per NHRL episode."""

    def __init__(
        self,
        rollout_path: str | Path,
        rollout_created_millis: int,
        action_ids_fingerprint: str,
    ):
        rollout_path = Path(rollout_path)
        self.path = rollout_path.with_suffix(".nhev")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = self.path.open("wb")
        self.handle.write(struct.pack(
            ">iiq", MAGIC, VERSION, int(rollout_created_millis)))
        _write_utf(self.handle, rollout_path.name)
        _write_utf(self.handle, action_ids_fingerprint)
        self.episodes: dict[tuple[int, int], _EpisodeState] = {}
        self.records_written = 0
        self._payload = bytearray()
        self._batch_payload = np.empty(0, dtype=EVENT_RECORD_DTYPE)

    def write(self, record, keep: np.ndarray | None = None) -> int:
        """Register emitted NHRL rows, then write their routed reward events."""
        rows = len(record.bot_index)
        if keep is None:
            selected_rows = range(rows)
        else:
            select = np.asarray(keep, dtype=bool)
            if select.shape != (rows,):
                raise ValueError("NHEV keep mask does not match the tick record")
            selected_rows = np.flatnonzero(select)

        selected_states = {}
        for row in selected_rows:
            key = (int(record.bot_index[row]), int(record.episode_id[row]))
            state = self.episodes.setdefault(key, _EpisodeState())
            selected_states[key] = state
            state.last_tick = max(
                state.last_tick,
                int(record.decision_tick[row]))
            state.complete |= bool(record.done[row])

        if isinstance(record.reward_events, RewardEventBatch):
            return self._write_batch(record.reward_events, selected_states)

        prepared = []
        allocation_capacity = 0
        for event in record.reward_events:
            key = (int(event.bot_index), int(event.episode_id))
            state = selected_states.get(key)
            if state is None:
                # A completed lane remains in the fixed-size engine arrays
                # while other fights continue. Java emits no later decisions
                # or events for it, so discard those inactive-row artifacts.
                continue
            prepared.append((state, event))
            allocation_capacity += len(event.contributors)

        required_bytes = allocation_capacity * RECORD_BYTES
        if len(self._payload) < required_bytes:
            self._payload = bytearray(required_bytes)

        written = 0
        if prepared:
            for state, event in prepared:
                written += self._prepare_event(
                    state,
                    event,
                    payload=self._payload,
                    byte_offset=written * RECORD_BYTES,
                )
            view = memoryview(self._payload)[:written * RECORD_BYTES]
            try:
                self.handle.write(view)
            finally:
                view.release()
            self.records_written += written
        return written

    @staticmethod
    def _packed_episode_keys(bot_index, episode_id) -> np.ndarray:
        bots = np.asarray(bot_index, dtype=np.int64).astype(
            np.uint64, copy=False)
        episodes = np.asarray(episode_id, dtype=np.int64).astype(
            np.uint64, copy=False)
        return (
            np.left_shift(bots, np.uint64(32))
            | np.bitwise_and(episodes, np.uint64(0xFFFFFFFF)))

    @staticmethod
    def _validate_batch_layout(batch: RewardEventBatch) -> None:
        event_columns = (
            batch.bot_index,
            batch.episode_id,
            batch.event_type,
            batch.resolution_tick,
            batch.original_reward,
            batch.contributor_offset,
            batch.contributor_count,
        )
        contributor_columns = (
            batch.source_tick,
            batch.target_decision_tick,
            batch.causal_unit,
            batch.gear_slot,
            batch.weight,
        )
        event_count = len(np.asarray(batch.bot_index))
        contributor_count = len(np.asarray(batch.source_tick))
        if any(
            np.asarray(column).ndim != 1
            or len(np.asarray(column)) != event_count
            for column in event_columns
        ):
            raise ValueError("invalid FastSim reward event batch")
        if any(
            np.asarray(column).ndim != 1
            or len(np.asarray(column)) != contributor_count
            for column in contributor_columns
        ):
            raise ValueError("invalid FastSim reward event batch")

        counts = np.asarray(batch.contributor_count, dtype=np.int64)
        offsets = np.asarray(batch.contributor_offset, dtype=np.int64)
        if (counts < 0).any() or (offsets < 0).any():
            raise ValueError("invalid FastSim reward event batch")
        expected_offsets = np.empty(event_count, dtype=np.int64)
        if event_count:
            expected_offsets[0] = 0
            if event_count > 1:
                np.cumsum(
                    counts[:-1], dtype=np.int64,
                    out=expected_offsets[1:])
        if (
            not np.array_equal(offsets, expected_offsets)
            or int(counts.sum(dtype=np.int64)) != contributor_count
        ):
            raise ValueError("invalid FastSim reward event batch")

    def _acquire_batch_payload(
        self,
        allocation_count: int,
    ) -> np.ndarray:
        """Return an exact prefix of the reusable structured record buffer."""
        capacity = len(self._batch_payload)
        if allocation_count > capacity:
            new_capacity = max(allocation_count, max(64, capacity * 2))
            self._batch_payload = np.empty(
                new_capacity, dtype=EVENT_RECORD_DTYPE)
        return self._batch_payload[:allocation_count]

    def _emit_batch_payload(self, payload: np.ndarray) -> None:
        """Write structured records without allocating an intermediate bytes."""
        records_view = memoryview(payload)
        byte_view = records_view.cast("B")
        try:
            self.handle.write(byte_view)
        finally:
            byte_view.release()
            records_view.release()

    def _write_batch(
        self,
        batch: RewardEventBatch,
        selected_states: dict[tuple[int, int], _EpisodeState],
    ) -> int:
        """Validate and pack a columnar tick without per-allocation objects."""
        self._validate_batch_layout(batch)
        if len(batch) == 0 or not selected_states:
            return 0

        # Match represented episodes before inspecting event contents. This
        # retains the scalar path's rule that inactive fixed-array artifacts
        # are ignored, even if their event fields would otherwise be invalid.
        state_keys = tuple(selected_states)
        state_values = tuple(selected_states.values())
        selected_key_values = self._packed_episode_keys(
            np.fromiter(
                (key[0] for key in state_keys),
                dtype=np.int64,
                count=len(state_keys)),
            np.fromiter(
                (key[1] for key in state_keys),
                dtype=np.int64,
                count=len(state_keys)),
        )
        key_order = np.argsort(selected_key_values, kind="stable")
        ordered_keys = selected_key_values[key_order]
        event_keys = self._packed_episode_keys(
            batch.bot_index, batch.episode_id)
        ordered_positions = np.searchsorted(ordered_keys, event_keys)
        represented = ordered_positions < len(ordered_keys)
        represented_rows = np.flatnonzero(represented)
        represented[represented_rows] &= (
            ordered_keys[ordered_positions[represented_rows]]
            == event_keys[represented_rows])
        event_indices = np.flatnonzero(represented)
        if len(event_indices) == 0:
            return 0
        state_indices = key_order[ordered_positions[event_indices]]

        bot_index = np.asarray(batch.bot_index, dtype=np.int64)[event_indices]
        episode_id = np.asarray(
            batch.episode_id, dtype=np.int64)[event_indices]
        event_type = np.asarray(
            batch.event_type, dtype=np.int64)[event_indices]
        resolution_tick = np.asarray(
            batch.resolution_tick, dtype=np.int64)[event_indices]
        reward = np.asarray(
            batch.original_reward, dtype=np.float64)[event_indices]
        counts = np.asarray(
            batch.contributor_count, dtype=np.int64)[event_indices]
        offsets = np.asarray(
            batch.contributor_offset, dtype=np.int64)[event_indices]
        if (
            (bot_index < 0).any()
            or (episode_id < 0).any()
            or (event_type <= 0).any()
            or (resolution_tick < 0).any()
            or not np.isfinite(reward).all()
            or (reward == 0.0).any()
            or (counts <= 0).any()
        ):
            raise ValueError("invalid FastSim reward event")

        event_count = len(event_indices)
        allocation_count = int(counts.sum(dtype=np.int64))
        local_offsets = np.empty(event_count, dtype=np.int64)
        local_offsets[0] = 0
        if event_count > 1:
            np.cumsum(
                counts[:-1], dtype=np.int64, out=local_offsets[1:])
        allocation_owner = np.repeat(
            np.arange(event_count, dtype=np.int64), counts)
        allocation_ordinal = (
            np.arange(allocation_count, dtype=np.int64)
            - np.repeat(local_offsets, counts))
        source_indices = (
            offsets[allocation_owner] + allocation_ordinal)

        source_tick = np.asarray(
            batch.source_tick, dtype=np.int64)[source_indices]
        target_tick = np.asarray(
            batch.target_decision_tick, dtype=np.int64)[source_indices]
        unit = np.asarray(
            batch.causal_unit, dtype=np.int64)[source_indices]
        gear_slot = np.asarray(
            batch.gear_slot, dtype=np.int64)[source_indices]
        weight = np.asarray(
            batch.weight, dtype=np.float64)[source_indices]

        # Sum one contributor ordinal at a time. This is vectorized across
        # events but performs each event's floating additions in the same
        # order as _prepare_event.
        weight_sum = np.zeros(event_count, dtype=np.float64)
        max_count = int(counts.max())
        for ordinal in range(max_count):
            active = np.flatnonzero(counts > ordinal)
            positions = local_offsets[active] + ordinal
            weight_sum[active] += weight[positions]
        if (
            not np.isfinite(weight).all()
            or (weight <= 0.0).any()
            or (np.abs(weight_sum - 1.0) > 1.0e-9).any()
        ):
            raise ValueError(
                "reward-event contributor weights must sum to one")

        owner_resolution_tick = resolution_tick[allocation_owner]
        if (
            (source_tick < 0).any()
            or (target_tick < 0).any()
            or (target_tick > source_tick).any()
            or (source_tick > owner_resolution_tick).any()
            or (unit < 0).any()
            or (unit >= schema.CAUSAL_UNIT_COUNT).any()
        ):
            raise ValueError("invalid FastSim reward contributor")

        gear_units = unit >= schema.CHANNEL_GEAR_BASE
        if gear_units.any():
            expected_slots = np.asarray(
                schema.OPTIONAL_GEAR_SLOTS, dtype=np.int64)[
                    unit[gear_units] - schema.CHANNEL_GEAR_BASE]
            if (gear_slot[gear_units] != expected_slots).any():
                raise ValueError(
                    "reward contributor gear slot does not match its unit")
        non_gear = ~gear_units
        non_gear_names_slot = (
            non_gear
            & (event_type[allocation_owner] != EVENT_ROLL_TANK_GEAR)
            & (gear_slot != -1))
        if non_gear_names_slot.any():
            raise ValueError(
                "non-gear reward contributor names a gear slot")

        allocated_values = np.empty(allocation_count, dtype=np.float64)
        allocated = np.zeros(event_count, dtype=np.float64)
        for ordinal in range(max_count):
            active = np.flatnonzero(counts > ordinal)
            positions = local_offsets[active] + ordinal
            values = reward[active] * weight[positions]
            last = counts[active] == ordinal + 1
            if last.any():
                last_events = active[last]
                values[last] = reward[last_events] - allocated[last_events]
            allocated[active] += values
            allocated_values[positions] = values
        if (np.abs(allocated - reward) > 1.0e-12).any():
            raise ValueError(
                "FastSim reward allocation did not conserve mass")

        # Episode state is deliberately updated in the original event stream
        # order. Interleaved episodes therefore receive exactly the same
        # sequence numbers and floating summary additions as the scalar path.
        sequence = np.empty(event_count, dtype=np.int64)
        for index in range(event_count):
            state = state_values[int(state_indices[index])]
            state.event_sequence += 1
            sequence[index] = state.event_sequence
            count = int(counts[index])
            value = float(reward[index])
            state.event_count += 1
            state.allocation_count += count
            state.signed_mass += value
            if value > 0.0:
                state.positive_mass += value
            else:
                state.negative_mass += value
            state.last_tick = max(
                state.last_tick, int(resolution_tick[index]))

        payload = self._acquire_batch_payload(allocation_count)
        payload["event_sequence"] = sequence[allocation_owner]
        payload["bot_index"] = bot_index[allocation_owner]
        payload["episode_id"] = episode_id[allocation_owner]
        payload["event_type"] = event_type[allocation_owner]
        payload["resolution_tick"] = owner_resolution_tick
        payload["source_tick"] = source_tick
        payload["target_decision_tick"] = target_tick
        payload["causal_unit"] = unit
        payload["gear_slot"] = gear_slot
        payload["allocation_ordinal"] = allocation_ordinal
        payload["allocation_count"] = counts[allocation_owner]
        payload["original_reward"] = reward[allocation_owner]
        payload["allocation_weight"] = weight
        payload["allocated_reward"] = allocated_values
        self._emit_batch_payload(payload)
        self.records_written += allocation_count
        return allocation_count

    def _prepare_event(
        self,
        state: _EpisodeState,
        event: RewardEvent,
        payload: bytearray | None = None,
        byte_offset: int = 0,
    ) -> tuple | int:
        contributors = tuple(event.contributors)
        reward = float(event.original_reward)
        bot_index = int(event.bot_index)
        episode_id = int(event.episode_id)
        event_type = int(event.event_type)
        resolution_tick = int(event.resolution_tick)
        if (
            bot_index < 0
            or episode_id < 0
            or event_type <= 0
            or resolution_tick < 0
            or not math.isfinite(reward)
            or reward == 0.0
            or not contributors
        ):
            raise ValueError("invalid FastSim reward event")

        weight_sum = 0.0
        for contributor in contributors:
            weight = float(contributor.weight)
            if not math.isfinite(weight) or weight <= 0.0:
                raise ValueError(
                    "reward-event contributor weights must sum to one")
            weight_sum += weight
        if abs(weight_sum - 1.0) > 1.0e-9:
            raise ValueError("reward-event contributor weights must sum to one")

        state.event_sequence += 1
        sequence = state.event_sequence
        count = len(contributors)
        allocated_values = (
            np.empty(count, dtype=np.float64)
            if payload is None else None)
        allocated = 0.0
        pack_into = _EVENT_RECORD_STRUCT.pack_into
        causal_unit_count = schema.CAUSAL_UNIT_COUNT
        channel_gear_base = schema.CHANNEL_GEAR_BASE
        optional_gear_slots = schema.OPTIONAL_GEAR_SLOTS
        row_offset = byte_offset
        for ordinal, contributor in enumerate(contributors):
            source_tick = int(contributor.source_tick)
            target_tick = int(contributor.target_decision_tick)
            unit = int(contributor.causal_unit)
            gear_slot = int(contributor.gear_slot)
            if (
                source_tick < 0
                or target_tick < 0
                or target_tick > source_tick
                or source_tick > resolution_tick
                or unit < 0
                or unit >= causal_unit_count
            ):
                raise ValueError("invalid FastSim reward contributor")
            if unit >= channel_gear_base:
                expected_slot = int(
                    optional_gear_slots[unit - channel_gear_base])
                if gear_slot != expected_slot:
                    raise ValueError(
                        "reward contributor gear slot does not match its unit")
            elif event_type != EVENT_ROLL_TANK_GEAR:
                if gear_slot != -1:
                    raise ValueError(
                        "non-gear reward contributor names a gear slot")

            weight = float(contributor.weight)
            value = (
                reward - allocated
                if ordinal + 1 == count else reward * weight)
            allocated += value
            if payload is None:
                allocated_values[ordinal] = value
            else:
                pack_into(
                    payload,
                    row_offset,
                    sequence,
                    bot_index,
                    episode_id,
                    event_type,
                    resolution_tick,
                    source_tick,
                    target_tick,
                    unit,
                    gear_slot,
                    ordinal,
                    count,
                    reward,
                    weight,
                    value,
                )
                row_offset += RECORD_BYTES

        if abs(allocated - reward) > 1.0e-12:
            raise ValueError("FastSim reward allocation did not conserve mass")
        state.event_count += 1
        state.allocation_count += count
        state.signed_mass += reward
        if reward > 0.0:
            state.positive_mass += reward
        else:
            state.negative_mass += reward
        state.last_tick = max(state.last_tick, resolution_tick)
        if payload is not None:
            return count
        return (
            sequence,
            bot_index,
            episode_id,
            event_type,
            resolution_tick,
            reward,
            contributors,
            np.fromiter(
                (float(item.weight) for item in contributors),
                dtype=np.float64,
                count=count,
            ),
            allocated_values,
        )

    def close(self) -> None:
        if self.handle is None:
            return
        episodes = sorted(self.episodes.items())
        summaries = bytearray(len(episodes) * RECORD_BYTES)
        for ordinal, ((bot_index, episode_id), state) in enumerate(episodes):
            _EVENT_RECORD_STRUCT.pack_into(
                summaries,
                ordinal * RECORD_BYTES,
                0,
                bot_index,
                episode_id,
                0,
                state.last_tick,
                state.event_count,
                state.allocation_count,
                int(state.complete),
                0,
                0,
                0,
                state.signed_mass,
                state.positive_mass,
                state.negative_mass,
            )
        if summaries:
            self.handle.write(summaries)
            self.records_written += len(episodes)
        self.handle.close()
        self.handle = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
