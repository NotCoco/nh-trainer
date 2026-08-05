"""Byte-parity checks for the reusable NHRL serialization buffer."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import engine, nhrl_writer, policy, schema  # noqa: E402


class _FreshZeroRolloutWriter(nhrl_writer.RolloutWriter):
    """The former allocation strategy, retained as a byte-level oracle."""

    def _output_rows(self, count: int) -> np.ndarray:
        return np.zeros(count, dtype=self.dtype)


def _sparse_mask(rows: int, count: int, seed: int) -> np.ndarray:
    mask = np.zeros(rows, dtype=bool)
    if count:
        rng = np.random.default_rng(seed)
        mask[rng.choice(rows, size=count, replace=False)] = True
    return mask


def test_reused_poisoned_buffer_matches_fresh_zero_encoding(
        tmp_path: Path) -> None:
    eng = engine.Engine(
        n_fights=32,
        policy=policy.RandomPolicy(seed=3),
        seed=11,
        epsilon=0.22,
        max_ticks=10)
    record = None
    for _ in range(3):
        record = eng.step()
        if record is not None:
            break
    assert record is not None
    rows = record.inputs.shape[0]
    assert rows == 64

    # Keeping the timestamp fixed makes the complete files, including their
    # headers, directly comparable.
    reused_path = tmp_path / "reused.nhrl"
    fresh_path = tmp_path / "fresh.nhrl"
    calls = (
        (_sparse_mask(rows, 3, 1), schema.PAIR_MODE_MIRROR, -1),
        (None, schema.PAIR_MODE_FIXED, -1),
        (_sparse_mask(rows, 7, 2), schema.PAIR_MODE_SNAPSHOT, 7),
        (_sparse_mask(rows, 31, 3), schema.PAIR_MODE_COHORT, -1),
        (_sparse_mask(rows, 1, 4), schema.PAIR_MODE_EVALUATION, -1),
        (_sparse_mask(rows, 0, 5), schema.PAIR_MODE_MIRROR, -1),
    )

    with (
            patch.object(
                nhrl_writer.time, "time", return_value=1_750_000_000.125),
            nhrl_writer.RolloutWriter(
                reused_path,
                schema.CURRENT_ACTION_IDS,
                exploration_rate=0.22) as reused,
            _FreshZeroRolloutWriter(
                fresh_path,
                schema.CURRENT_ACTION_IDS,
                exploration_rate=0.22) as fresh):
        # Begin with dirty storage so even the first small write proves that
        # every serialized byte is assigned. Later writes poison the grown
        # buffer again before it is reused by smaller sparse batches.
        reused._output_rows(4)
        reused._record_buffer.view(np.uint8).fill(0xA5)

        grown_capacity = None
        for index, (keep, pair_mode, snapshot_id) in enumerate(calls):
            expected = rows if keep is None else int(keep.sum())
            assert reused.write(
                record,
                source_pair_mode=pair_mode,
                opponent_snapshot_id=snapshot_id,
                keep=keep) == expected
            assert fresh.write(
                record,
                source_pair_mode=pair_mode,
                opponent_snapshot_id=snapshot_id,
                keep=keep) == expected
            assert reused.rows_written == fresh.rows_written

            if index == 1:
                grown_capacity = reused._record_buffer.shape[0]
                assert grown_capacity >= rows
            elif index > 1:
                assert reused._record_buffer.shape[0] == grown_capacity

            reused._record_buffer.view(np.uint8).fill(0x5A + index)

    assert reused_path.read_bytes() == fresh_path.read_bytes()


def test_snapshot_provenance_fails_closed(tmp_path: Path) -> None:
    eng = engine.Engine(
        n_fights=1,
        policy=policy.RandomPolicy(seed=17),
        seed=19,
        epsilon=0.22,
        max_ticks=3)
    record = None
    while record is None:
        record = eng.step()

    out = tmp_path / "invalid-provenance.nhrl"
    with nhrl_writer.RolloutWriter(
            out,
            schema.CURRENT_ACTION_IDS,
            exploration_rate=0.22) as writer:
        try:
            writer.write(
                record,
                source_pair_mode=schema.PAIR_MODE_SNAPSHOT)
        except ValueError:
            pass
        else:
            raise AssertionError(
                "snapshot rows were accepted without a positive snapshot ID")
        try:
            writer.write(
                record,
                source_pair_mode=schema.PAIR_MODE_MIRROR,
                opponent_snapshot_id=7)
        except ValueError:
            pass
        else:
            raise AssertionError(
                "mirror rows were accepted with a snapshot ID")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        test_reused_poisoned_buffer_matches_fresh_zero_encoding(root)
        test_snapshot_provenance_fails_closed(root)
    print("NHRL reusable buffer byte parity OK")
