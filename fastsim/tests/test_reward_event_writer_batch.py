"""The batched NHEV writer must remain byte-identical to scalar row filling."""

from __future__ import annotations

import struct
from types import SimpleNamespace

import numpy as np

from fastsim import reward_events, schema


class _ScalarWriter(reward_events.RewardEventWriter):
    def write(self, record, keep=None):
        rows = len(record.bot_index)
        select = (
            np.ones(rows, dtype=bool)
            if keep is None else np.asarray(keep, dtype=bool))
        selected_keys = set()
        for row in np.flatnonzero(select):
            key = (int(record.bot_index[row]), int(record.episode_id[row]))
            selected_keys.add(key)
            state = self.episodes.setdefault(
                key, reward_events._EpisodeState())
            state.last_tick = max(
                state.last_tick, int(record.decision_tick[row]))
            state.complete |= bool(record.done[row])

        chunks = []
        written = 0
        for event in record.reward_events:
            key = (int(event.bot_index), int(event.episode_id))
            if key not in selected_keys:
                continue
            state = self.episodes.get(key)
            if state is None:
                continue
            encoded = self._prepare_event(state, event)
            (
                sequence, bot_index, episode_id, event_type,
                resolution_tick, reward, contributors, weights,
                allocated_values,
            ) = encoded
            count = len(contributors)
            chunk = np.zeros(count, dtype=reward_events.EVENT_RECORD_DTYPE)
            for ordinal, contributor in enumerate(contributors):
                row = chunk[ordinal]
                row["event_sequence"] = sequence
                row["bot_index"] = bot_index
                row["episode_id"] = episode_id
                row["event_type"] = event_type
                row["resolution_tick"] = resolution_tick
                row["source_tick"] = int(contributor.source_tick)
                row["target_decision_tick"] = int(
                    contributor.target_decision_tick)
                row["causal_unit"] = int(contributor.causal_unit)
                row["gear_slot"] = int(contributor.gear_slot)
                row["allocation_ordinal"] = ordinal
                row["allocation_count"] = count
                row["original_reward"] = reward
                row["allocation_weight"] = weights[ordinal]
                row["allocated_reward"] = allocated_values[ordinal]
            chunks.append(chunk)
            written += count
        if chunks:
            payload = np.empty(written, dtype=reward_events.EVENT_RECORD_DTYPE)
            offset = 0
            for chunk in chunks:
                payload[offset:offset + len(chunk)] = chunk
                offset += len(chunk)
            self.handle.write(payload.tobytes())
            self.records_written += written
        return written


def _record():
    slot = int(schema.OPTIONAL_GEAR_SLOTS[0])
    contributor = reward_events.RewardContributor
    event = reward_events.RewardEvent
    return SimpleNamespace(
        bot_index=np.array([0, 1], dtype=np.int32),
        episode_id=np.array([7, 8], dtype=np.int32),
        decision_tick=np.array([12, 13], dtype=np.int64),
        done=np.array([False, True]),
        reward_events=(
            event(0, 7, reward_events.EVENT_DAMAGE_DEALT, 13, 0.1, (
                contributor(11, 10, schema.CHANNEL_COMBAT, weight=0.2),
                contributor(12, 11, schema.CHANNEL_DEFENCE, weight=0.3),
                contributor(
                    12, 12, schema.CHANNEL_GEAR_BASE, slot, 0.5),
            )),
            event(1, 8, reward_events.EVENT_FREEZE_LANDED, 14, -0.75, (
                contributor(13, 13, schema.CHANNEL_MOVEMENT),
            )),
            # This fixed-array artifact has no selected NHRL row and is skipped.
            event(2, 9, reward_events.EVENT_DAMAGE_TAKEN, 14, -1.0, (
                contributor(13, 13, schema.CHANNEL_DEFENCE),
            )),
        ),
    )


def test_batched_writer_is_byte_identical_to_scalar_writer(tmp_path):
    rollout = tmp_path / "batch-test.nhrl"
    kwargs = dict(
        rollout_path=rollout,
        rollout_created_millis=123456789,
        action_ids_fingerprint="test-fingerprint",
    )
    with reward_events.RewardEventWriter(**kwargs) as writer:
        assert writer.write(_record()) == 4
    batched = rollout.with_suffix(".nhev").read_bytes()

    with _ScalarWriter(**kwargs) as writer:
        assert writer.write(_record()) == 4
    scalar = rollout.with_suffix(".nhev").read_bytes()
    assert batched == scalar


def _columnar(events):
    builder = reward_events.RewardEventBatchBuilder(
        event_capacity=1, contributor_capacity=1)
    for event in events:
        builder.append_event(event)
    return builder.freeze()


def _event_records(payload, rollout_name, fingerprint):
    name_bytes = rollout_name.encode("utf-8")
    fingerprint_bytes = fingerprint.encode("utf-8")
    header_bytes = (
        16 + 2 + len(name_bytes) + 2 + len(fingerprint_bytes))
    records = np.frombuffer(
        payload[header_bytes:], dtype=reward_events.EVENT_RECORD_DTYPE)
    return records[records["event_sequence"] > 0]


def _interleaved_record():
    contributor = reward_events.RewardContributor
    event = reward_events.RewardEvent
    first_slot = int(schema.OPTIONAL_GEAR_SLOTS[0])
    second_slot = int(schema.OPTIONAL_GEAR_SLOTS[1])
    events = (
        event(
            0,
            7,
            reward_events.EVENT_DAMAGE_DEALT,
            50,
            0.3,
            (
                contributor(
                    45, 44, schema.CHANNEL_COMBAT, weight=0.1),
                contributor(
                    46, 45, schema.CHANNEL_DEFENCE, weight=0.2),
                contributor(
                    47,
                    47,
                    schema.CHANNEL_GEAR_BASE,
                    first_slot,
                    0.7),
            ),
        ),
        event(
            1,
            8,
            reward_events.EVENT_DAMAGE_TAKEN,
            50,
            -0.7,
            (
                contributor(
                    43, 42, schema.CHANNEL_COMBAT, weight=1.0 / 3.0),
                contributor(
                    44, 43, schema.CHANNEL_MOVEMENT, weight=1.0 / 3.0),
                contributor(
                    45, 44, schema.CHANNEL_SUPPLY, weight=1.0 / 3.0),
            ),
        ),
        event(
            0,
            7,
            reward_events.EVENT_SPEC_OUTCOME,
            51,
            0.123456789,
            (
                contributor(
                    48, 48, schema.CHANNEL_COMBAT, weight=0.17),
                contributor(
                    49, 48, schema.CHANNEL_DEFENCE, weight=0.23),
                contributor(
                    50,
                    50,
                    schema.CHANNEL_GEAR_BASE + 1,
                    second_slot,
                    0.60),
            ),
        ),
        # The keep mask excludes this fixed-array artifact. Its fields are
        # deliberately malformed to prove filtering occurs before validation.
        event(
            2,
            9,
            reward_events.EVENT_DAMAGE_TAKEN,
            5,
            1.0,
            (contributor(99, 99, -4, weight=0.5),),
        ),
    )
    record = SimpleNamespace(
        bot_index=np.array([0, 1, 2], dtype=np.int32),
        episode_id=np.array([7, 8, 9], dtype=np.int32),
        decision_tick=np.array([50, 50, 50], dtype=np.int64),
        done=np.zeros(3, dtype=bool),
        reward_events=events,
    )
    return record, events


def test_columnar_writer_preserves_interleaved_order_and_float_bytes(tmp_path):
    rollout = tmp_path / "columnar-interleaved.nhrl"
    fingerprint = "columnar-test-fingerprint"
    kwargs = dict(
        rollout_path=rollout,
        rollout_created_millis=987654321,
        action_ids_fingerprint=fingerprint,
    )
    keep = np.array([True, True, False])
    scalar_record, events = _interleaved_record()

    with _ScalarWriter(**kwargs) as scalar_writer:
        assert scalar_writer.write(scalar_record, keep=keep) == 9
        assert scalar_writer.write(scalar_record, keep=keep) == 9
    scalar_bytes = rollout.with_suffix(".nhev").read_bytes()
    scalar_states = scalar_writer.episodes

    columnar_record = SimpleNamespace(
        bot_index=scalar_record.bot_index,
        episode_id=scalar_record.episode_id,
        decision_tick=scalar_record.decision_tick,
        done=scalar_record.done,
        reward_events=_columnar(events),
    )
    with reward_events.RewardEventWriter(**kwargs) as columnar_writer:
        assert columnar_writer.write(columnar_record, keep=keep) == 9
        assert columnar_writer.write(columnar_record, keep=keep) == 9
    columnar_bytes = rollout.with_suffix(".nhev").read_bytes()

    assert columnar_bytes == scalar_bytes
    assert columnar_writer.episodes == scalar_states
    assert set(columnar_writer.episodes) == {(0, 7), (1, 8)}
    assert columnar_writer.episodes[(0, 7)].event_sequence == 4
    assert columnar_writer.episodes[(1, 8)].event_sequence == 2

    records = _event_records(
        columnar_bytes, rollout.name, fingerprint)
    first_tick = records[:9]
    assert [
        (
            int(row["bot_index"]),
            int(row["event_sequence"]),
            int(row["allocation_ordinal"]),
        )
        for row in first_tick
    ] == [
        (0, 1, 0), (0, 1, 1), (0, 1, 2),
        (1, 1, 0), (1, 1, 1), (1, 1, 2),
        (0, 2, 0), (0, 2, 1), (0, 2, 2),
    ]

    first_reward = 0.3
    allocated_before_last = (
        first_reward * 0.1 + first_reward * 0.2)
    expected_last = first_reward - allocated_before_last
    assert struct.pack(
        ">d", float(first_tick[2]["allocated_reward"])) == struct.pack(
            ">d", expected_last)


def _record_with_events(record, events, *, done=None):
    return SimpleNamespace(
        bot_index=record.bot_index,
        episode_id=record.episode_id,
        decision_tick=record.decision_tick,
        done=record.done if done is None else np.asarray(done, dtype=bool),
        reward_events=events,
    )


def test_reused_payload_poison_shrink_grow_and_sparse_keep_are_exact(tmp_path):
    template, events = _interleaved_record()
    valid_events = events[:3]
    calls = (
        (_record_with_events(template, valid_events[:1]), None),
        (_record_with_events(
            template,
            tuple(valid_events[index % 3] for index in range(10))),
         np.array([True, True, False])),
        (_record_with_events(
            template,
            tuple(valid_events[index % 3] for index in range(25))),
         np.array([True, True, False])),
        (_record_with_events(
            template,
            events,
            done=np.array([False, True, False])),
         np.array([False, True, False])),
    )
    fingerprint = "reused-payload-test"

    scalar_rollout = tmp_path / "scalar" / "payload-test.nhrl"
    scalar_rollout.parent.mkdir()
    with _ScalarWriter(
        rollout_path=scalar_rollout,
        rollout_created_millis=123456789,
        action_ids_fingerprint=fingerprint,
    ) as scalar_writer:
        for record, keep in calls:
            scalar_writer.write(record, keep=keep)

    reused_rollout = tmp_path / "reused" / "payload-test.nhrl"
    reused_rollout.parent.mkdir()
    with reward_events.RewardEventWriter(
        rollout_path=reused_rollout,
        rollout_created_millis=123456789,
        action_ids_fingerprint=fingerprint,
    ) as reused_writer:
        first_record, first_keep = calls[0]
        reused_writer.write(
            _record_with_events(
                first_record, _columnar(first_record.reward_events)),
            keep=first_keep,
        )
        first_payload = reused_writer._batch_payload
        first_capacity = len(first_payload)
        assert first_capacity >= 3

        # Every byte in the reusable buffer starts dirty before a smaller
        # write. Exact output proves every field in the emitted prefix is set.
        first_payload.view(np.uint8).fill(0xA5)
        medium_record, medium_keep = calls[1]
        reused_writer.write(
            _record_with_events(
                medium_record, _columnar(medium_record.reward_events)),
            keep=medium_keep,
        )
        assert reused_writer._batch_payload is first_payload

        large_record, large_keep = calls[2]
        reused_writer.write(
            _record_with_events(
                large_record, _columnar(large_record.reward_events)),
            keep=large_keep,
        )
        grown_payload = reused_writer._batch_payload
        assert grown_payload is not first_payload
        assert len(grown_payload) >= first_capacity * 2

        grown_payload.view(np.uint8).fill(0x5A)
        sparse_record, sparse_keep = calls[3]
        reused_writer.write(
            _record_with_events(
                sparse_record, _columnar(sparse_record.reward_events)),
            keep=sparse_keep,
        )
        assert reused_writer._batch_payload is grown_payload

    scalar_bytes = scalar_rollout.with_suffix(".nhev").read_bytes()
    reused_bytes = reused_rollout.with_suffix(".nhev").read_bytes()
    assert reused_bytes == scalar_bytes
    assert reused_writer.episodes == scalar_writer.episodes
    assert reused_writer.episodes[(1, 8)].complete


def test_frozen_columnar_batch_does_not_alias_reused_builder():
    record = _record()
    builder = reward_events.RewardEventBatchBuilder(
        event_capacity=1, contributor_capacity=1)
    for event in record.reward_events:
        builder.append_event(event)
    frozen = builder.freeze()
    original_bot_index = frozen.bot_index.copy()
    original_weight = frozen.weight.copy()

    builder.clear()
    builder.append_event(record.reward_events[1])
    assert np.array_equal(frozen.bot_index, original_bot_index)
    assert np.array_equal(frozen.weight, original_weight)


def _invalid_record(event):
    return SimpleNamespace(
        bot_index=np.array([0], dtype=np.int32),
        episode_id=np.array([7], dtype=np.int32),
        decision_tick=np.array([12], dtype=np.int64),
        done=np.array([False]),
        reward_events=(event,),
    )


def _assert_rejected(tmp_path, name, event, message, expected_sequence):
    writer = reward_events.RewardEventWriter(
        rollout_path=tmp_path / f"{name}.nhrl",
        rollout_created_millis=123456789,
        action_ids_fingerprint="test-fingerprint",
    )
    try:
        writer.write(_invalid_record(event))
    except ValueError as error:
        assert str(error) == message
    else:
        raise AssertionError("invalid reward event was accepted")
    state = writer.episodes[(0, 7)]
    assert state.event_sequence == expected_sequence
    assert state.event_count == 0
    assert state.allocation_count == 0
    assert state.signed_mass == 0.0
    writer.close()


def test_validation_still_fails_before_or_after_sequence_at_the_same_boundary(
    tmp_path,
):
    contributor = reward_events.RewardContributor
    event = reward_events.RewardEvent
    _assert_rejected(
        tmp_path,
        "bad-weight",
        event(
            0,
            7,
            reward_events.EVENT_DAMAGE_DEALT,
            13,
            1.0,
            (contributor(12, 12, schema.CHANNEL_COMBAT, weight=0.5),),
        ),
        "reward-event contributor weights must sum to one",
        0,
    )
    _assert_rejected(
        tmp_path,
        "bad-source",
        event(
            0,
            7,
            reward_events.EVENT_DAMAGE_DEALT,
            13,
            1.0,
            (contributor(14, 12, schema.CHANNEL_COMBAT),),
        ),
        "invalid FastSim reward contributor",
        1,
    )


def test_an_unselected_malformed_event_remains_ignored(tmp_path):
    record = _invalid_record(SimpleNamespace(
        bot_index=99,
        episode_id=99,
        contributors=None,
    ))
    with reward_events.RewardEventWriter(
        rollout_path=tmp_path / "unselected.nhrl",
        rollout_created_millis=123456789,
        action_ids_fingerprint="test-fingerprint",
    ) as writer:
        assert writer.write(record) == 0
        assert set(writer.episodes) == {(0, 7)}


if __name__ == "__main__":
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        test_batched_writer_is_byte_identical_to_scalar_writer(root)
        test_columnar_writer_preserves_interleaved_order_and_float_bytes(root)
        test_reused_payload_poison_shrink_grow_and_sparse_keep_are_exact(root)
        test_frozen_columnar_batch_does_not_alias_reused_builder()
        test_validation_still_fails_before_or_after_sequence_at_the_same_boundary(
            root)
        test_an_unselected_malformed_event_remains_ignored(root)
    print("reward event writer batch: OK")
