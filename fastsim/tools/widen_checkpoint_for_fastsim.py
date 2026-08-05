"""Create a behavior-preserving state-114 copy of an older NH checkpoint.

The current FastSim observation is append-only relative to the retained
state-110 and state-111 direct-action models.  This tool appends zero-weight
columns for the new inputs, leaving every old-input logit unchanged.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastsim import paths, schema  # noqa: E402
from fastsim.policy import Policy  # noqa: E402

TRAINER_DIR = paths.trainer_dir()
sys.path.insert(0, str(TRAINER_DIR))

from train_selfplay_rl import adapt_checkpoint_input_size  # noqa: E402


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--force",
        action="store_true",
        help="replace an existing output file",
    )
    args = parser.parse_args()

    source = args.source.resolve()
    output = args.output.resolve()
    if not source.is_file():
        parser.error(f"source checkpoint does not exist: {source}")
    if output.exists() and not args.force:
        parser.error(f"output already exists: {output}")
    if source == output:
        parser.error("source and output must be different files")

    raw = torch.load(source, map_location="cpu", weights_only=False)
    if not isinstance(raw, dict) or not isinstance(raw.get("model_state"), dict):
        raise ValueError("source is not an NH PyTorch checkpoint")
    raw_schema = raw.get("schema")
    if not isinstance(raw_schema, dict):
        raise ValueError("checkpoint has no schema metadata")

    source_input_size = int(raw_schema.get("input_size", -1))
    if source_input_size not in (110, 111, schema.INPUT_SIZE):
        raise ValueError(
            f"only retained state-110/state-111/current checkpoints are supported; "
            f"source declares {source_input_size} inputs"
        )
    if int(raw_schema.get("action_count", -1)) != schema.ACTION_COUNT:
        raise ValueError("checkpoint action count does not match current FastSim")
    if tuple(int(value) for value in raw_schema.get("action_ids", ())) != tuple(
        schema.CURRENT_ACTION_IDS
    ):
        raise ValueError("checkpoint action IDs do not match the current direct-action bridge")

    widened = copy.deepcopy(raw)
    original_state = raw["model_state"]
    adapt_checkpoint_input_size(
        widened,
        input_size=schema.INPUT_SIZE,
        feature_size=schema.FEATURE_SIZE,
    )

    widened_schema = widened["schema"]
    if int(widened_schema["input_size"]) != schema.INPUT_SIZE:
        raise AssertionError("widening did not produce state 114")
    if int(widened_schema["feature_size"]) != schema.FEATURE_SIZE:
        raise AssertionError("widening did not produce feature size 163")

    first_weight_key = next(
        key
        for key in widened["model_state"]
        if key.startswith("encoder.") and key.endswith(".weight")
    )
    old_encoder = original_state[first_weight_key]
    new_encoder = widened["model_state"][first_weight_key]
    if not torch.equal(new_encoder[:, :source_input_size], old_encoder):
        raise AssertionError("widening changed existing encoder weights")
    if torch.count_nonzero(new_encoder[:, source_input_size:]).item() != 0:
        raise AssertionError("new encoder input columns are not neutral zeros")

    prayer_key = "defence_prayer_head.hidden.weight"
    if prayer_key in original_state:
        old_prayer = original_state[prayer_key]
        new_prayer = widened["model_state"][prayer_key]
        if not torch.equal(new_prayer[:, :source_input_size], old_prayer):
            raise AssertionError("widening changed existing defence-prayer weights")
        if torch.count_nonzero(new_prayer[:, source_input_size:]).item() != 0:
            raise AssertionError("new defence-prayer input columns are not neutral zeros")

    old_mean = np.asarray(raw["input_mean"], dtype=np.float32)
    old_std = np.asarray(raw["input_std"], dtype=np.float32)
    new_mean = np.asarray(widened["input_mean"], dtype=np.float32)
    new_std = np.asarray(widened["input_std"], dtype=np.float32)
    if not np.array_equal(new_mean[:source_input_size], old_mean):
        raise AssertionError("widening changed existing input means")
    if not np.array_equal(new_std[:source_input_size], old_std):
        raise AssertionError("widening changed existing input standard deviations")
    if not np.array_equal(
        new_mean[source_input_size:],
        np.zeros(schema.INPUT_SIZE - source_input_size, dtype=np.float32),
    ):
        raise AssertionError("new input means are not neutral zeros")
    if not np.array_equal(
        new_std[source_input_size:],
        np.ones(schema.INPUT_SIZE - source_input_size, dtype=np.float32),
    ):
        raise AssertionError("new input standard deviations are not neutral ones")

    provenance = widened.setdefault("fastsim_neutral_widening", {})
    provenance.update(
        {
            "schema": "kronos_fastsim_neutral_input_widening.v1",
            "source": str(source),
            "source_sha256": sha256(source),
            "source_input_size": source_input_size,
            "output_input_size": schema.INPUT_SIZE,
            "new_input_weights": "zero",
        }
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    torch.save(widened, output)

    loaded = Policy.load(output, device="cpu")
    report = {
        "pass": True,
        "source": str(source),
        "sourceSha256": provenance["source_sha256"],
        "sourceInputSize": source_input_size,
        "output": str(output),
        "outputSha256": sha256(output),
        "outputInputSize": loaded.input_size,
        "actionCount": loaded.action_count,
        "actionIdsMatchCurrent": tuple(loaded.action_ids)
        == tuple(schema.CURRENT_ACTION_IDS),
        "oldInputBehaviorPreservedByConstruction": True,
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
