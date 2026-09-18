"""Deterministically export the retained risk-fight checkpoint for browser inference.

This is serialization only: it performs no optimization, gradient calculation, or
learned weight computation.  Training remains CUDA-only in train_riskfight_cuda.py.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as F

from fastsim.riskfight import FEATURE_NAMES, MainAction, MovementAction, PrayerAction


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CHECKPOINT = (
    ROOT
    / "fastsim"
    / "out"
    / "riskfight"
    / "20260831T140504Z"
    / "webweaver-riskfight-candidate.pt"
)
DEFAULT_OUTPUT = ROOT / "src" / "generated" / "webweaver-riskfight-candidate.json"
EXPECTED_CHECKPOINT_SHA256 = "86ccdd26a15c377247e6fedc3ebd2d5844c0127e007353c34f34920f0f3a64b0"
EXPECTED_KIND = "webweaver-riskfight-candidate"
EXPECTED_SCHEMA_VERSION = 1
EXPECTED_STATE_SHAPES = {
    "encoder.0.weight": (192, 45),
    "encoder.0.bias": (192,),
    "encoder.1.weight": (192,),
    "encoder.1.bias": (192,),
    "encoder.3.weight": (192, 192),
    "encoder.3.bias": (192,),
    "main_head.weight": (18, 192),
    "main_head.bias": (18,),
    "prayer_head.weight": (3, 192),
    "prayer_head.bias": (3,),
    "movement_head.weight": (3, 192),
    "movement_head.bias": (3,),
    "value_head.weight": (1, 192),
    "value_head.bias": (1,),
}


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parameter_sha256(state: dict[str, torch.Tensor]) -> str:
    digest = hashlib.sha256()
    # Keep byte-for-byte parity with train_riskfight_cuda.model_digest().
    for tensor in state.values():
        contiguous = tensor.detach().to(device="cpu", dtype=torch.float32).contiguous().view(-1)
        digest.update(struct.pack(f"<{contiguous.numel()}f", *contiguous.tolist()))
    return digest.hexdigest()


def schema_sha256(feature_names: list[str], action_heads: dict[str, list[str]]) -> str:
    canonical = json.dumps(
        {"feature_names": feature_names, "action_heads": action_heads},
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def tensor_payload(tensor: torch.Tensor) -> dict[str, Any]:
    contiguous = tensor.detach().to(device="cpu", dtype=torch.float32).contiguous()
    return {
        "shape": list(contiguous.shape),
        "values": contiguous.view(-1).tolist(),
    }


def inference_fixture(state: dict[str, torch.Tensor], feature_names: list[str] | None = None,
                      action_heads: dict[str, list[str]] | None = None) -> dict[str, Any]:
    """Produce a deterministic CPU/PyTorch forward pass for browser parity QA."""
    feature_names = list(FEATURE_NAMES) if feature_names is None else feature_names
    action_heads = action_heads or {
        "main": [action.name for action in MainAction],
        "prayer": [action.name for action in PrayerAction],
        "movement": [action.name for action in MovementAction],
    }
    observation = torch.tensor(
        [(index - 22) / 11.0 for index in range(len(feature_names))],
        dtype=torch.float32,
    )
    with torch.no_grad():
        hidden = F.linear(observation, state["encoder.0.weight"], state["encoder.0.bias"])
        hidden = F.layer_norm(
            hidden,
            (hidden.shape[-1],),
            state["encoder.1.weight"],
            state["encoder.1.bias"],
            eps=1e-5,
        )
        hidden = F.silu(hidden)
        hidden = F.linear(hidden, state["encoder.3.weight"], state["encoder.3.bias"])
        hidden = F.silu(hidden)
        main_logits = F.linear(hidden, state["main_head.weight"], state["main_head.bias"])
        prayer_logits = F.linear(hidden, state["prayer_head.weight"], state["prayer_head.bias"])
        movement_logits = F.linear(hidden, state["movement_head.weight"], state["movement_head.bias"])
        value = F.linear(hidden, state["value_head.weight"], state["value_head.bias"])[0]
    main_index = int(torch.argmax(main_logits).item())
    prayer_index = int(torch.argmax(prayer_logits).item())
    movement_index = int(torch.argmax(movement_logits).item())
    return {
        "producer": "PyTorch CPU float32",
        "observation": observation.tolist(),
        "main_logits": main_logits.tolist(),
        "prayer_logits": prayer_logits.tolist(),
        "movement_logits": movement_logits.tolist(),
        "value": float(value.item()),
        "argmax": {
            "main": action_heads["main"][main_index],
            "prayer": action_heads["prayer"][prayer_index],
            "movement": action_heads["movement"][movement_index],
        },
    }


def export(checkpoint_path: Path, output_path: Path) -> dict[str, Any]:
    checkpoint_path = checkpoint_path.resolve()
    output_path = output_path.resolve()
    checkpoint_hash = file_sha256(checkpoint_path)
    if checkpoint_hash != EXPECTED_CHECKPOINT_SHA256:
        raise SystemExit(
            "refusing unexpected risk-fight checkpoint: "
            f"sha256={checkpoint_hash}, expected={EXPECTED_CHECKPOINT_SHA256}"
        )

    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    if checkpoint.get("kind") != EXPECTED_KIND:
        raise SystemExit(f"unexpected checkpoint kind: {checkpoint.get('kind')!r}")
    if checkpoint.get("schema_version") != EXPECTED_SCHEMA_VERSION:
        raise SystemExit(f"unexpected checkpoint schema version: {checkpoint.get('schema_version')!r}")
    if checkpoint.get("promoted") is not False:
        raise SystemExit("risk-fight browser candidate must remain explicitly unpromoted")

    feature_names = list(checkpoint.get("feature_names", ()))
    action_heads = {
        "main": list(checkpoint.get("main_actions", ())),
        "prayer": list(checkpoint.get("prayer_actions", ())),
        "movement": list(checkpoint.get("movement_actions", ())),
    }
    expected_features = list(FEATURE_NAMES)
    expected_actions = {
        "main": [action.name for action in MainAction],
        "prayer": [action.name for action in PrayerAction],
        "movement": [action.name for action in MovementAction],
    }
    if feature_names != expected_features:
        raise SystemExit("checkpoint feature order does not match risk_webweaver_v1")
    if action_heads != expected_actions:
        raise SystemExit("checkpoint action order does not match risk_webweaver_v1")

    model_state = checkpoint.get("model_state")
    if not isinstance(model_state, dict):
        raise SystemExit("checkpoint model_state is missing")
    actual_shapes = {name: tuple(tensor.shape) for name, tensor in model_state.items()}
    if actual_shapes != EXPECTED_STATE_SHAPES:
        raise SystemExit(f"checkpoint layer shapes changed: {actual_shapes!r}")

    payload = {
        "format": "riskfight-browser-policy-v1",
        "kind": EXPECTED_KIND,
        "schema_version": EXPECTED_SCHEMA_VERSION,
        "runtime_profile": "risk_webweaver_v1",
        "label": "Riskfight CUDA Candidate",
        "promoted": False,
        "source_checkpoint": checkpoint_path.relative_to(ROOT).as_posix(),
        "source_checkpoint_sha256": checkpoint_hash,
        "parameter_sha256": parameter_sha256(model_state),
        "schema_sha256": schema_sha256(feature_names, action_heads),
        "feature_names": feature_names,
        "action_heads": action_heads,
        "verification": inference_fixture(model_state),
        "network": {
            "hidden_size": 192,
            "layer_norm_epsilon": 1e-5,
            "activation": "silu",
            "tensors": {name: tensor_payload(tensor) for name, tensor in model_state.items()},
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()
    payload = export(arguments.checkpoint, arguments.output)
    print(
        json.dumps(
            {
                "output": str(arguments.output.resolve()),
                "source_checkpoint_sha256": payload["source_checkpoint_sha256"],
                "parameter_sha256": payload["parameter_sha256"],
                "schema_sha256": payload["schema_sha256"],
                "learned_weight_computation": False,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
