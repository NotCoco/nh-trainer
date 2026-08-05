"""Compare the decision distribution of Java and FastSim v25 rollouts.

This is intentionally behavioural: it measures the composed rollout rows that
the trainer consumes, rather than re-checking individual mechanics in isolation.
"""

from __future__ import annotations

import argparse
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

import nh_rollout  # noqa: E402
from fastsim import schema  # noqa: E402


CHANNELS = (
    ("attack", 0, 7),
    ("spec", 7, 18),
    ("defence", 18, 23),
    ("movement", 23, 49),
    ("supply", 49, 57),
)
ACTION_ROW_BY_ID = {
    action_id: row for row, action_id in enumerate(schema.CURRENT_ACTION_IDS)
}


def _sample(paths: list[Path], count: int, seed: int) -> dict[str, np.ndarray]:
    corpus = nh_rollout.RolloutCorpus(paths)
    batch = corpus.sample_batch(count, np.random.default_rng(seed))
    nh_rollout.validate_action_ids_fingerprint(corpus, schema.CURRENT_ACTION_IDS)
    return batch


def _filter_pair_mode(
    batch: dict[str, np.ndarray], pair_mode: int | None
) -> dict[str, np.ndarray]:
    if pair_mode is None:
        return batch
    keep = batch["source_pair_mode_code"] == pair_mode
    if not np.any(keep):
        raise ValueError(f"sample contains no source_pair_mode_code={pair_mode}")
    return {
        key: value[keep] if isinstance(value, np.ndarray)
        and value.shape[:1] == keep.shape else value
        for key, value in batch.items()
    }


def _filter_episode_id(
    batch: dict[str, np.ndarray], episode_id: int | None
) -> dict[str, np.ndarray]:
    if episode_id is None:
        return batch
    keep = batch["episode_id"] == episode_id
    if not np.any(keep):
        raise ValueError(f"sample contains no episode_id={episode_id}")
    return {
        key: value[keep] if isinstance(value, np.ndarray)
        and value.shape[:1] == keep.shape else value
        for key, value in batch.items()
    }


def _local_channel_labels(batch: dict[str, np.ndarray]) -> np.ndarray:
    labels = np.asarray(batch["channel_action_labels"], dtype=np.int64)
    # v25 stores model-row indices in this five-slot diagnostic field. Accept
    # absolute action ids as well so the comparator fails usefully if a future
    # exporter changes representation while retaining the same semantics.
    if np.all((labels >= -1) & (labels < schema.ACTION_COUNT)):
        return labels
    local = np.full(labels.shape, -1, dtype=np.int64)
    for action_id, row in ACTION_ROW_BY_ID.items():
        local[labels == action_id] = row
    return local


def _summary(batch: dict[str, np.ndarray]) -> dict[str, object]:
    inputs = np.asarray(batch["input"], dtype=np.float64)
    legal = nh_rollout.unpack_legal_mask(
        batch["legal_mask"], schema.ACTION_COUNT)
    labels = _local_channel_labels(batch)
    result: dict[str, object] = {
        "rows": len(inputs),
        "no_attack": float(np.mean(labels[:, 0] == 0)),
        "stood_still": float(np.mean(labels[:, 3] == schema.MOVEMENT_BASE)),
        "distance_median": float(np.median(inputs[:, schema.INPUT_DISTANCE])),
        "movement_any_legal": float(np.mean(
            np.any(legal[:, schema.MOVEMENT_BASE + 1:
                         schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT], axis=1))),
        "legal_count_mean": float(np.mean(np.sum(legal, axis=1))),
        "input_mean": np.mean(inputs, axis=0),
    }
    for name, start, stop in CHANNELS:
        result[f"{name}_legal_mean"] = float(
            np.mean(np.sum(legal[:, start:stop], axis=1)))
    result["gear_legal_mean"] = float(
        np.mean(np.sum(legal[:, schema.GEAR_BASE:], axis=1)))
    for channel_index, (name, start, stop) in enumerate(CHANNELS):
        histogram = np.array(
            [np.mean(labels[:, channel_index] == row)
             for row in range(start, stop)])
        result[f"{name}_hist"] = histogram
    return result


def _print_summary(name: str, summary: dict[str, object]) -> None:
    print(name)
    for key in (
        "rows", "no_attack", "stood_still", "distance_median",
        "movement_any_legal", "legal_count_mean",
    ):
        value = summary[key]
        print(f"  {key}: {value:.6f}" if isinstance(value, float)
              else f"  {key}: {value}")
    for channel, _, _ in CHANNELS:
        values = np.asarray(summary[f"{channel}_hist"])
        print(f"  {channel}: " + " ".join(f"{value:.4f}" for value in values))
    legal_parts = [
        *(f"{name}={summary[f'{name}_legal_mean']:.3f}"
          for name, _, _ in CHANNELS),
        f"gear={summary['gear_legal_mean']:.3f}",
    ]
    print("  legal_by_channel: " + " ".join(legal_parts))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--java", type=Path, action="append", required=True)
    parser.add_argument("--fast", type=Path, action="append", required=True)
    parser.add_argument("--sample", type=int, default=240_000)
    parser.add_argument(
        "--java-pair-mode", type=int, default=1,
        help="1 selects current-policy mirror rows; use -1 for all rows")
    parser.add_argument(
        "--episode-id", type=int,
        help="compare the same per-bot episode generation, e.g. 1")
    args = parser.parse_args()

    java = _sample(args.java, args.sample, seed=0)
    fast = _sample(args.fast, min(args.sample, sum(
        item.header.rows for item in nh_rollout.RolloutCorpus(args.fast).files)),
        seed=1)
    java = _filter_pair_mode(
        java, None if args.java_pair_mode < 0 else args.java_pair_mode)
    java = _filter_episode_id(java, args.episode_id)
    fast = _filter_episode_id(fast, args.episode_id)

    java_summary = _summary(java)
    fast_summary = _summary(fast)
    _print_summary("java", java_summary)
    _print_summary("fast", fast_summary)

    differences = np.abs(
        np.asarray(java_summary["input_mean"])
        - np.asarray(fast_summary["input_mean"]))
    order = np.argsort(differences)[::-1][:20]
    print("largest_input_mean_gaps")
    for index in order:
        print(
            f"  {index:3d}: java={java_summary['input_mean'][index]:.6f} "
            f"fast={fast_summary['input_mean'][index]:.6f} "
            f"abs={differences[index]:.6f}")


if __name__ == "__main__":
    main()
