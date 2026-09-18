"""Serialize an explicitly selected browser-engine CUDA checkpoint; no learning."""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import torch

from export_riskfight_browser import ROOT, file_sha256, inference_fixture, parameter_sha256, schema_sha256, tensor_payload
from train_riskfight_browser_cuda import (
    HELDOUT_SCRIPTS, OBJECTIVE_VERSION, PROFILE, Schema, checked_state,
    combo_improvement_evidence, validate_combo_contract, validate_prior_seed_exposure,
)


def validate_objective_evidence(document: dict[str, Any], current_incumbent_sha256: str) -> dict[str, Any]:
    """Require stocked-combo evidence against the explicitly selected v2 reference."""
    if document.get("objective_version") != OBJECTIVE_VERSION:
        raise ValueError("export requires the stocked-combo objective, not old win-score evidence")
    validate_combo_contract(document.get("reward_contract", {}))
    validate_combo_contract(document.get("bridge_schema", {}).get("reward", {}))
    current = document.get("current_incumbent", {})
    if (current.get("checkpoint_sha256") != current_incumbent_sha256 or
            current.get("runtime_profile") != PROFILE or not current.get("parameter_sha256")):
        raise ValueError("current v2 incumbent provenance differs from the explicit reference")
    stable = document.get("stable_v1_reference", {})
    if (not stable.get("checkpoint_sha256") or stable["checkpoint_sha256"] != document.get("source_baseline_sha256") or
            stable.get("parameter_sha256") != document.get("baseline_parameter_sha256")):
        raise ValueError("stable v1 reference provenance is missing or inconsistent")
    heldout = document.get("heldout", {})
    varied = document.get("varied_opponents", {})
    stable_metrics = document.get("stable_v1_evaluation", {})
    if any(metrics.get("objective_version") != OBJECTIVE_VERSION for metrics in (heldout, varied, stable_metrics)):
        raise ValueError("all qualification comparisons must use the stocked-combo objective")
    for recorded in (heldout.get("opponent", {}), varied.get("current_incumbent", {})):
        if (not isinstance(recorded, dict) or recorded.get("checkpoint_sha256") != current_incumbent_sha256 or
                recorded.get("parameter_sha256") != current["parameter_sha256"]):
            raise ValueError("held-out evidence was measured against another incumbent")
    if stable_metrics.get("opponent", {}).get("checkpoint_sha256") != stable["checkpoint_sha256"]:
        raise ValueError("stable-v1 result does not identify its reference")
    if (heldout.get("seed_count", 0) < 2 or stable_metrics.get("seed_count", 0) < 2 or
            varied.get("used_for_selection") is not False or
            heldout.get("confidence_interval", {}).get("score_rate") is None):
        raise ValueError("qualification needs independent held-out seed clusters")
    scripts = varied.get("scripts", {})
    if set(scripts) != {script.name for script in HELDOUT_SCRIPTS}:
        raise ValueError("qualification is missing the varied held-out opponent suite")
    own_combo_deltas = []
    for name, entry in scripts.items():
        comparison = entry.get("paired_combo_difference", {})
        interval = comparison.get("confidence_interval_95")
        if (comparison.get("metric") != "combo_difference" or comparison.get("seed_count", 0) < 2 or
                interval is None or interval[1] < 0 or
                not entry.get("candidate", {}).get("no_illegal_actions") or
                not entry.get("incumbent", {}).get("no_illegal_actions")):
            raise ValueError(f"varied opponent {name} lacks non-regressing paired combo evidence")
        # Check offensive completions and ordinary fighting separately so
        # denial or suicidal offense cannot satisfy the aggregate gate alone.
        for field, metric in (("paired_own_combo_ko_rate_difference", "own_combo_ko"), ("paired_difference", "score")):
            difference = entry.get(field, {})
            interval = difference.get("confidence_interval_95")
            if (difference.get("metric") != metric or difference.get("seed_count", 0) < 2 or
                    interval is None or interval[1] < 0):
                raise ValueError(f"varied opponent {name} lacks non-regressing paired {metric} evidence")
        own_combo_deltas.append(entry["paired_own_combo_ko_rate_difference"]["mean_delta"])
    own_combo_mean = sum(own_combo_deltas) / len(own_combo_deltas)
    if not math.isfinite(own_combo_mean) or not math.isclose(own_combo_mean, varied.get("mean_own_combo_ko_rate_delta", 0), abs_tol=1.0e-12):
        raise ValueError("varied own combo-KO mean differs from the paired script results")
    evidence = combo_improvement_evidence(heldout, varied, stable_metrics)
    recorded = document.get("improvement_evidence", {})
    if (not evidence["passed"] or recorded.get("passed") is not True or
            recorded.get("objective_version") != OBJECTIVE_VERSION or recorded.get("checks") != evidence["checks"]):
        raise ValueError("candidate lacks the required current-incumbent stocked-combo improvement")
    return evidence


def validate_export_qualification(checkpoint: dict[str, Any], qualification: dict[str, Any] | None, checksum: str, incumbent_checksum: str, reference: dict[str, Any]) -> dict[str, Any]:
    if qualification is None:
        if checkpoint.get("export_ready") is not True:
            raise ValueError("candidate requires an explicit passing qualification report")
        return validate_objective_evidence(checkpoint, incumbent_checksum)
    # Original training identity remains authoritative even when its first
    # held-out comparison did not establish the required improvement.
    if checkpoint.get("objective_version") != OBJECTIVE_VERSION:
        raise ValueError("qualification cannot replace the checkpoint's trained objective")
    validate_combo_contract(checkpoint.get("reward_contract", {}))
    validate_combo_contract(checkpoint.get("bridge_schema", {}).get("reward", {}))
    if (qualification.get("mode") != "evaluate_only" or qualification.get("learned_weight_computation") is not False or
            qualification.get("candidate_sha256") != checksum or
            qualification.get("candidate_parameter_sha256") != checkpoint["parameter_sha256"] or
            qualification.get("source_baseline_sha256") != checkpoint["source_baseline_sha256"] or
            qualification.get("schema_sha256") != checkpoint["schema_sha256"]):
        raise ValueError("qualification report does not identify this unchanged checkpoint and evaluation contract")
    if (qualification["current_incumbent"] != checkpoint["current_incumbent"] or
            qualification["stable_v1_reference"] != checkpoint["stable_v1_reference"] or
            qualification["baseline_parameter_sha256"] != checkpoint["baseline_parameter_sha256"] or
            qualification["training_bridge_schema"] != checkpoint["bridge_schema"] or
            qualification["training_bridge_sha256"] != checkpoint["bridge_sha256"]):
        raise ValueError("qualification report changed original training/reference provenance")
    if (qualification["bridge_schema"]["feature_names"] != checkpoint["bridge_schema"]["feature_names"] or
            qualification["bridge_schema"]["action_heads"] != checkpoint["bridge_schema"]["action_heads"]):
        raise ValueError("qualification changed the trained feature/action contract")
    fresh_confirmation = checkpoint.get("export_ready") is not True
    if fresh_confirmation:
        stage = checkpoint.get("stage", "")
        trained = stage == "observation_script_bootstrap" or (stage.startswith("update_") and stage[7:].isdigit() and int(stage[7:]) > 0)
        selection = checkpoint.get("selection", {})
        if not trained or selection.get("stage") != stage or selection.get("heldout_used_for_selection") is not False:
            raise ValueError("fresh qualification requires fixed, validation-selected trained weights")
        source = checkpoint.get("source_requalification", {})
        if source.get("required") is True and source.get("passed") is not True:
            raise ValueError("training source requalification remains incomplete")
    evaluation_split = {"training_range_inclusive_exclusive": [0, 0], "bootstrap_range_inclusive_exclusive": [0, 0],
                        "validation": [], "heldout": qualification.get("seed_split", {}).get("heldout")}
    # Fresh confirmation cannot reuse earlier learning, selection or held-out
    # seeds. Already-qualified source rechecks retain their repeat-seed allowance.
    validate_prior_seed_exposure(evaluation_split, checkpoint, include_prior_heldout=fresh_confirmation)
    validate_prior_seed_exposure(evaluation_split, reference, include_prior_heldout=fresh_confirmation)
    seeds = evaluation_split["heldout"]
    if (len(seeds) < 2 or len(set(seeds)) != len(seeds) or
            {row["seed"] for row in qualification.get("fights", [])} != set(seeds)):
        raise ValueError("qualification seed metadata differs from completed held-out fights")
    return validate_objective_evidence(qualification, incumbent_checksum)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--checkpoint-sha256", required=True)
    parser.add_argument("--current-incumbent-sha256", required=True, help="Explicit SHA-256 of the current v2 policy used as the frozen qualification opponent")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--qualification-report", type=Path, help="Explicit current-source, no-learning evaluation of this unchanged checkpoint")
    args = parser.parse_args()
    source, output = args.checkpoint.resolve(), args.output.resolve()
    checksum = file_sha256(source)
    if checksum.lower() != args.checkpoint_sha256.lower():
        raise ValueError("selected checkpoint SHA-256 differs from the explicit selection")
    checkpoint = torch.load(source, map_location="cpu", weights_only=False)
    if (checkpoint.get("kind"), checkpoint.get("runtime_profile"), checkpoint.get("schema_version"), checkpoint.get("promoted")) != (
        "webweaver-riskfight-candidate", "risk_webweaver_v2", 2, False
    ):
        raise ValueError("expected the explicit, unpromoted browser v2 risk-fight schema")
    incumbent_checksum = args.current_incumbent_sha256.lower()
    current_reference = checkpoint["current_incumbent"]
    reference_path = Path(current_reference["checkpoint_path"])
    if file_sha256(reference_path) != incumbent_checksum:
        raise ValueError("explicit current-incumbent checkpoint file checksum changed")
    reference = torch.load(reference_path, map_location="cpu", weights_only=False)
    schema = Schema.from_bridge(checkpoint["bridge_schema"])
    if (reference.get("schema_version") != 2 or reference.get("runtime_profile") != PROFILE or
            reference.get("feature_names") != schema.feature_names or reference.get("action_heads") != schema.action_heads or
            parameter_sha256(checked_state(reference, schema)) != current_reference["parameter_sha256"] or
            reference.get("bridge_sha256") != current_reference["training_bridge_sha256"] or
            reference.get("bridge_schema", {}).get("source_sha256") != current_reference["training_source_sha256"]):
        raise ValueError("current incumbent does not match the recorded v2 parameters, schema and training provenance")
    if file_sha256(Path(checkpoint["stable_v1_reference"]["checkpoint_path"])) != checkpoint["source_baseline_sha256"]:
        raise ValueError("stable-v1 reference file checksum changed")
    qualification = json.loads(args.qualification_report.read_text(encoding="utf-8")) if args.qualification_report else None
    evidence = validate_export_qualification(checkpoint, qualification, checksum, incumbent_checksum, reference)
    qualified_schema = qualification["bridge_schema"] if qualification is not None else checkpoint["bridge_schema"]
    qualified_bridge_hash = qualification["bridge_sha256"] if qualification is not None else checkpoint["bridge_sha256"]
    for name, expected in qualified_schema["source_sha256"].items():
        if file_sha256(ROOT / name) != expected:
            raise ValueError(f"training source changed after the selected run: {name}")
    if file_sha256(ROOT / "scripts/riskfight-training-bridge.mjs") != qualified_bridge_hash:
        raise ValueError("training bridge changed after the selected run")
    state = checked_state(checkpoint, schema)
    if parameter_sha256(state) != checkpoint["parameter_sha256"]:
        raise ValueError("checkpoint parameter hash mismatch")
    payload = {
        "format": "riskfight-browser-policy-v2", "kind": "webweaver-riskfight-candidate", "schema_version": 2,
        "runtime_profile": "risk_webweaver_v2", "label": "Riskfight CUDA Candidate", "promoted": False,
        "source_checkpoint": source.relative_to(ROOT).as_posix(), "source_checkpoint_sha256": checksum,
        "parameter_sha256": parameter_sha256(state), "schema_sha256": schema_sha256(schema.feature_names, schema.action_heads),
        "feature_names": schema.feature_names, "action_heads": schema.action_heads,
        "verification": inference_fixture(state, schema.feature_names, schema.action_heads),
        "training_engine": checkpoint["bridge_schema"]["engine"], "source_sha256": qualified_schema["source_sha256"],
        "training_source_sha256": checkpoint["bridge_schema"]["source_sha256"],
        "training_bridge_sha256": checkpoint["bridge_sha256"], "qualified_bridge_sha256": qualified_bridge_hash,
        "objective_version": OBJECTIVE_VERSION, "reward_contract": checkpoint["reward_contract"],
        "current_incumbent": current_reference, "stable_v1_reference": checkpoint["stable_v1_reference"],
        "improvement_evidence": evidence, "selection": checkpoint["selection"], "learned_weight_computation": False,
        "network": {"hidden_size": 192, "layer_norm_epsilon": 1e-5, "activation": "silu",
                    "tensors": {name: tensor_payload(tensor) for name, tensor in state.items()}},
    }
    if qualification is not None:
        payload["qualification_basis"] = "explicit no-learning evaluation report"
        payload["training_run_export_ready"] = checkpoint.get("export_ready") is True
        payload["qualification_report"] = args.qualification_report.resolve().relative_to(ROOT).as_posix()
        payload["qualification_report_sha256"] = file_sha256(args.qualification_report)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({key: payload[key] for key in ("source_checkpoint", "source_checkpoint_sha256", "parameter_sha256", "schema_sha256")}, indent=2))


if __name__ == "__main__":
    main()
