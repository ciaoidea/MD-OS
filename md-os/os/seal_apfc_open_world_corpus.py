#!/usr/bin/env python3
"""Seal a temporally separated real-repository corpus for APFC meta-transfer.

The learner-visible manifest contains issue text and immutable repository
coordinates only. Reference patches, evaluator tests, commands, and expected
test identifiers are written to a separate verifier vault. Selection is
deterministic and does not rank tasks by gold-patch content.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, Iterable

from datasets import load_dataset
from huggingface_hub import HfApi


DATASET_ID = "nebius/SWE-rebench-leaderboard"
DATASET_REVISION = "34d5a58864acf91613740a09ec5d205228dcfa39"
DEVELOPMENT_SPLIT = "2026_02"
HOLDOUT_SPLIT = "2026_03"
DEFAULT_DEVELOPMENT_COUNT = 12
DEFAULT_HOLDOUT_COUNT = 30
SELECTION_SEED = "mdos-apfc-open-world-meta-transfer-v1"
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def write_json(path: Path, value: Any, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    temporary.write_text(f"{json.dumps(value, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
    os.chmod(temporary, mode)
    temporary.replace(path)


def assert_empty_or_missing(path: Path, label: str) -> None:
    if path.exists() and (not path.is_dir() or any(path.iterdir())):
        raise RuntimeError(f"{label}_NOT_EMPTY")


def eligible(row: dict[str, Any]) -> bool:
    meta = row.get("meta") or {}
    return (
        bool(row.get("instance_id"))
        and bool(row.get("repo"))
        and bool(row.get("base_commit"))
        and bool(row.get("image_name"))
        and bool(row.get("patch"))
        and bool(row.get("test_patch"))
        and bool((row.get("install_config") or {}).get("test_cmd"))
        and bool(meta.get("has_test_patch"))
        and not (meta.get("failed_lite_validators") or [])
        and 300 <= len(str(row.get("problem_statement") or "")) <= 12_000
        and 1 <= len(row.get("FAIL_TO_PASS") or []) <= 10
    )


def public_task(row: dict[str, Any], split: str) -> dict[str, Any]:
    content = {
        "instance_id": row["instance_id"],
        "repository": row["repo"],
        "base_commit": row["base_commit"],
        "created_at": row["created_at"],
        "problem_statement": row["problem_statement"],
    }
    return {
        "task_id": row["instance_id"],
        "source_split": split,
        **content,
        "image_name": row["image_name"],
        "public_task_hash": sha256_json(content),
    }


def hidden_task(row: dict[str, Any], split: str) -> dict[str, Any]:
    payload = {
        "task_id": row["instance_id"],
        "source_split": split,
        "repository": row["repo"],
        "base_commit": row["base_commit"],
        "image_name": row["image_name"],
        "gold_patch": row["patch"],
        "test_patch": row["test_patch"],
        "fail_to_pass": list(row.get("FAIL_TO_PASS") or []),
        "pass_to_pass": list(row.get("PASS_TO_PASS") or []),
        "test_command": (row.get("install_config") or {})["test_cmd"],
    }
    payload["hidden_task_hash"] = sha256_json(payload)
    return payload


def select_distinct_repositories(
    rows: Iterable[dict[str, Any]],
    split: str,
    count: int,
    excluded_repositories: set[str] | None = None,
    excluded_task_ids: set[str] | None = None,
    selection_seed: str = SELECTION_SEED,
) -> list[dict[str, Any]]:
    excluded = excluded_repositories or set()
    excluded_ids = excluded_task_ids or set()
    ranked = sorted(
        (
            row for row in rows
            if eligible(row)
            and row["repo"] not in excluded
            and row["instance_id"] not in excluded_ids
        ),
        key=lambda row: hashlib.sha256(
            f"{selection_seed}:{split}:{row['instance_id']}".encode("utf-8")
        ).hexdigest(),
    )
    selected: list[dict[str, Any]] = []
    seen = set(excluded)
    for row in ranked:
        if row["repo"] in seen:
            continue
        selected.append(row)
        seen.add(row["repo"])
        if len(selected) == count:
            break
    if len(selected) != count:
        raise RuntimeError(f"APFC_OPEN_WORLD_INSUFFICIENT_DISTINCT_REPOSITORIES:{split}:{len(selected)}:{count}")
    return selected


def load_sealed_pair(public_dir: Path, vault_dir: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    public = json.loads((public_dir / "public_corpus.json").read_text(encoding="utf-8"))
    public_seal = json.loads((public_dir / "sealed_manifest.json").read_text(encoding="utf-8"))
    hidden = json.loads((vault_dir / "verifier_vault.json").read_text(encoding="utf-8"))
    vault_seal = json.loads((vault_dir / "sealed_manifest.json").read_text(encoding="utf-8"))
    if public_seal != vault_seal:
        raise RuntimeError("APFC_OPEN_WORLD_REUSED_SEAL_COPIES_MISMATCH")
    if sha256_json(public) != public_seal["public_manifest_digest"]:
        raise RuntimeError("APFC_OPEN_WORLD_REUSED_PUBLIC_DIGEST_MISMATCH")
    if sha256_json(hidden) != public_seal["hidden_manifest_digest"]:
        raise RuntimeError("APFC_OPEN_WORLD_REUSED_HIDDEN_DIGEST_MISMATCH")
    return public, hidden, public_seal


def seal_online(args: argparse.Namespace) -> dict[str, Any]:
    """Reseal a new prospective holdout while preserving verified development evidence."""
    if not SAFE_ID.match(args.experiment_id):
        raise RuntimeError("APFC_OPEN_WORLD_EXPERIMENT_ID_INVALID")
    public_dir = Path(args.public_dir).resolve()
    vault_dir = Path(args.vault_dir).resolve()
    source_public_dir = Path(args.source_public_dir).resolve()
    source_vault_dir = Path(args.source_vault_dir).resolve()
    if public_dir == vault_dir:
        raise RuntimeError("APFC_OPEN_WORLD_PUBLIC_AND_VAULT_MUST_DIFFER")
    assert_empty_or_missing(public_dir, "APFC_OPEN_WORLD_PUBLIC_DIR")
    assert_empty_or_missing(vault_dir, "APFC_OPEN_WORLD_VAULT_DIR")
    source_public, source_hidden, source_seal = load_sealed_pair(source_public_dir, source_vault_dir)

    excluded_ids: set[str] = set()
    excluded_repositories: set[str] = set()
    exclusion_digests: list[str] = []
    for directory in args.exclude_public_dir:
        manifest_path = Path(directory).resolve() / "public_corpus.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        exclusion_digests.append(sha256_json(manifest))
        for task in manifest.get("holdout_tasks") or []:
            excluded_ids.add(task["task_id"])
            excluded_repositories.add(task["repository"])

    development_public = list(source_public["development_tasks"])
    development_hidden = list(source_hidden["development_tasks"])
    if [task["task_id"] for task in development_public] != [task["task_id"] for task in development_hidden]:
        raise RuntimeError("APFC_OPEN_WORLD_REUSED_DEVELOPMENT_BINDING_MISMATCH")
    development_repositories = {task["repository"] for task in development_public}
    excluded_repositories.update(development_repositories)

    resolved_revision = HfApi().dataset_info(DATASET_ID, revision=DATASET_REVISION).sha
    if resolved_revision != DATASET_REVISION:
        raise RuntimeError("APFC_OPEN_WORLD_DATASET_REVISION_MISMATCH")
    holdout_rows = list(load_dataset(DATASET_ID, revision=DATASET_REVISION, split=HOLDOUT_SPLIT))
    holdout = select_distinct_repositories(
        holdout_rows,
        HOLDOUT_SPLIT,
        args.holdout_count,
        excluded_repositories=excluded_repositories,
        excluded_task_ids=excluded_ids,
        selection_seed=args.selection_seed,
    )

    public_manifest = {
        "schema_version": 1,
        "manifest_type": "apfc_open_world_public_corpus",
        "experiment_id": args.experiment_id,
        "dataset": {
            "dataset_id": DATASET_ID,
            "revision": DATASET_REVISION,
            "development_split": DEVELOPMENT_SPLIT,
            "holdout_split": HOLDOUT_SPLIT,
        },
        "selection_policy": {
            "policy_id": "prospective_reused_development_excluded_holdout_hash_selection_v2",
            "seed_digest": hashlib.sha256(args.selection_seed.encode("utf-8")).hexdigest(),
            "development_count": len(development_public),
            "holdout_count": args.holdout_count,
            "reused_development_source_seal_digest": source_seal["seal_digest"],
            "excluded_prior_public_manifest_digests": sorted(exclusion_digests),
            "excluded_prior_holdout_task_count": len(excluded_ids),
            "excluded_prior_holdout_repository_count": len(excluded_repositories - development_repositories),
            "prior_holdout_tasks_and_repositories_excluded": True,
            "distinct_repositories_within_each_cohort": True,
            "development_holdout_repository_overlap_allowed": False,
            "gold_patch_content_used_for_ranking": False,
            "requires_official_image_and_test_patch": True,
            "problem_statement_length_range": [300, 12_000],
            "fail_to_pass_count_range": [1, 10],
        },
        "development_tasks": development_public,
        "holdout_tasks": [public_task(row, HOLDOUT_SPLIT) for row in holdout],
    }
    hidden_manifest = {
        "schema_version": 1,
        "manifest_type": "apfc_open_world_verifier_vault",
        "experiment_id": args.experiment_id,
        "dataset_id": DATASET_ID,
        "dataset_revision": DATASET_REVISION,
        "development_tasks": development_hidden,
        "holdout_tasks": [hidden_task(row, HOLDOUT_SPLIT) for row in holdout],
    }
    public_digest = sha256_json(public_manifest)
    hidden_digest = sha256_json(hidden_manifest)
    holdout_repositories = {row["repo"] for row in holdout}
    seal_manifest = {
        "schema_version": 1,
        "manifest_type": "apfc_open_world_seal",
        "experiment_id": args.experiment_id,
        "dataset_id": DATASET_ID,
        "dataset_revision": DATASET_REVISION,
        "public_manifest_file": "public_corpus.json",
        "public_manifest_digest": public_digest,
        "hidden_manifest_file": "verifier_vault.json",
        "hidden_manifest_digest": hidden_digest,
        "development_task_count": len(development_public),
        "holdout_task_count": len(holdout),
        "development_repository_count": len(development_repositories),
        "holdout_repository_count": len(holdout_repositories),
        "repository_overlap_count": len(development_repositories & holdout_repositories),
        "temporal_development_split_precedes_holdout_split": True,
        "sealed_before_learning": True,
        "evaluator_answers_excluded_from_learner_manifest": True,
    }
    seal_manifest["seal_digest"] = sha256_json(seal_manifest)

    candidate = json.loads(Path(args.candidate_file).resolve().read_text(encoding="utf-8"))
    stored_candidate_hash = candidate.get("skill_hash")
    candidate_core = {key: value for key, value in candidate.items() if key != "skill_hash"}
    if stored_candidate_hash != sha256_json(candidate_core):
        raise RuntimeError("APFC_OPEN_WORLD_REUSED_CANDIDATE_HASH_MISMATCH")

    write_json(public_dir / "public_corpus.json", public_manifest)
    write_json(public_dir / "sealed_manifest.json", seal_manifest)
    write_json(public_dir / "candidate_meta_skill.json", candidate)
    write_json(vault_dir / "verifier_vault.json", hidden_manifest, 0o600)
    write_json(vault_dir / "sealed_manifest.json", seal_manifest, 0o600)
    return {
        "ok": True,
        "mode": "apfc_open_world_online_corpus_reseal",
        "experiment_id": args.experiment_id,
        "public_dir": str(public_dir),
        "vault_dir": str(vault_dir),
        "source_seal_digest": source_seal["seal_digest"],
        "candidate_skill_hash": stored_candidate_hash,
        "public_manifest_digest": public_digest,
        "hidden_manifest_digest": hidden_digest,
        "seal_digest": seal_manifest["seal_digest"],
        "development_task_count": len(development_public),
        "holdout_task_count": len(holdout),
        "excluded_prior_holdout_task_count": len(excluded_ids),
        "repository_overlap_count": seal_manifest["repository_overlap_count"],
    }


def seal(args: argparse.Namespace) -> dict[str, Any]:
    if not SAFE_ID.match(args.experiment_id):
        raise RuntimeError("APFC_OPEN_WORLD_EXPERIMENT_ID_INVALID")
    public_dir = Path(args.public_dir).resolve()
    vault_dir = Path(args.vault_dir).resolve()
    if public_dir == vault_dir:
        raise RuntimeError("APFC_OPEN_WORLD_PUBLIC_AND_VAULT_MUST_DIFFER")
    assert_empty_or_missing(public_dir, "APFC_OPEN_WORLD_PUBLIC_DIR")
    assert_empty_or_missing(vault_dir, "APFC_OPEN_WORLD_VAULT_DIR")

    resolved_revision = HfApi().dataset_info(DATASET_ID, revision=DATASET_REVISION).sha
    if resolved_revision != DATASET_REVISION:
        raise RuntimeError("APFC_OPEN_WORLD_DATASET_REVISION_MISMATCH")
    development_rows = list(load_dataset(DATASET_ID, revision=DATASET_REVISION, split=DEVELOPMENT_SPLIT))
    holdout_rows = list(load_dataset(DATASET_ID, revision=DATASET_REVISION, split=HOLDOUT_SPLIT))
    development = select_distinct_repositories(
        development_rows, DEVELOPMENT_SPLIT, args.development_count
    )
    development_repositories = {row["repo"] for row in development}
    holdout = select_distinct_repositories(
        holdout_rows, HOLDOUT_SPLIT, args.holdout_count, development_repositories
    )

    public_manifest = {
        "schema_version": 1,
        "manifest_type": "apfc_open_world_public_corpus",
        "experiment_id": args.experiment_id,
        "dataset": {
            "dataset_id": DATASET_ID,
            "revision": DATASET_REVISION,
            "development_split": DEVELOPMENT_SPLIT,
            "holdout_split": HOLDOUT_SPLIT,
        },
        "selection_policy": {
            "policy_id": "temporal_distinct_repository_hash_selection_v1",
            "seed_digest": hashlib.sha256(SELECTION_SEED.encode("utf-8")).hexdigest(),
            "development_count": args.development_count,
            "holdout_count": args.holdout_count,
            "distinct_repositories_within_each_cohort": True,
            "development_holdout_repository_overlap_allowed": False,
            "gold_patch_content_used_for_ranking": False,
            "requires_official_image_and_test_patch": True,
            "problem_statement_length_range": [300, 12_000],
            "fail_to_pass_count_range": [1, 10],
        },
        "development_tasks": [public_task(row, DEVELOPMENT_SPLIT) for row in development],
        "holdout_tasks": [public_task(row, HOLDOUT_SPLIT) for row in holdout],
    }
    hidden_manifest = {
        "schema_version": 1,
        "manifest_type": "apfc_open_world_verifier_vault",
        "experiment_id": args.experiment_id,
        "dataset_id": DATASET_ID,
        "dataset_revision": DATASET_REVISION,
        "development_tasks": [hidden_task(row, DEVELOPMENT_SPLIT) for row in development],
        "holdout_tasks": [hidden_task(row, HOLDOUT_SPLIT) for row in holdout],
    }
    public_digest = sha256_json(public_manifest)
    hidden_digest = sha256_json(hidden_manifest)
    seal_manifest = {
        "schema_version": 1,
        "manifest_type": "apfc_open_world_seal",
        "experiment_id": args.experiment_id,
        "dataset_id": DATASET_ID,
        "dataset_revision": DATASET_REVISION,
        "public_manifest_file": "public_corpus.json",
        "public_manifest_digest": public_digest,
        "hidden_manifest_file": "verifier_vault.json",
        "hidden_manifest_digest": hidden_digest,
        "development_task_count": len(development),
        "holdout_task_count": len(holdout),
        "development_repository_count": len(development_repositories),
        "holdout_repository_count": len({row["repo"] for row in holdout}),
        "repository_overlap_count": len(development_repositories & {row["repo"] for row in holdout}),
        "temporal_development_split_precedes_holdout_split": True,
        "sealed_before_learning": True,
        "evaluator_answers_excluded_from_learner_manifest": True,
    }
    seal_manifest["seal_digest"] = sha256_json(seal_manifest)

    write_json(public_dir / "public_corpus.json", public_manifest)
    write_json(public_dir / "sealed_manifest.json", seal_manifest)
    write_json(vault_dir / "verifier_vault.json", hidden_manifest, 0o600)
    write_json(vault_dir / "sealed_manifest.json", seal_manifest, 0o600)
    return {
        "ok": True,
        "mode": "apfc_open_world_corpus_seal",
        "experiment_id": args.experiment_id,
        "public_dir": str(public_dir),
        "vault_dir": str(vault_dir),
        "public_manifest_digest": public_digest,
        "hidden_manifest_digest": hidden_digest,
        "seal_digest": seal_manifest["seal_digest"],
        "development_task_count": len(development),
        "holdout_task_count": len(holdout),
        "repository_overlap_count": seal_manifest["repository_overlap_count"],
    }


def verify(args: argparse.Namespace) -> dict[str, Any]:
    public_dir = Path(args.public_dir).resolve()
    vault_dir = Path(args.vault_dir).resolve()
    public = json.loads((public_dir / "public_corpus.json").read_text(encoding="utf-8"))
    public_seal = json.loads((public_dir / "sealed_manifest.json").read_text(encoding="utf-8"))
    hidden = json.loads((vault_dir / "verifier_vault.json").read_text(encoding="utf-8"))
    vault_seal = json.loads((vault_dir / "sealed_manifest.json").read_text(encoding="utf-8"))
    learner_tasks = public["development_tasks"] + public["holdout_tasks"]
    development_ids = [task["task_id"] for task in public["development_tasks"]]
    holdout_ids = [task["task_id"] for task in public["holdout_tasks"]]
    development_repositories = [task["repository"] for task in public["development_tasks"]]
    holdout_repositories = [task["repository"] for task in public["holdout_tasks"]]
    excluded_ids: set[str] = set()
    excluded_repositories: set[str] = set()
    for directory in getattr(args, "exclude_public_dir", []) or []:
        excluded = json.loads((Path(directory).resolve() / "public_corpus.json").read_text(encoding="utf-8"))
        for task in excluded.get("holdout_tasks") or []:
            excluded_ids.add(task["task_id"])
            excluded_repositories.add(task["repository"])
    source_development_matches = True
    if getattr(args, "source_public_dir", None):
        source = json.loads(
            (Path(args.source_public_dir).resolve() / "public_corpus.json").read_text(encoding="utf-8")
        )
        source_development_matches = (
            public["development_tasks"] == source["development_tasks"]
        )
    candidate_file = public_dir / "candidate_meta_skill.json"
    candidate_hash_valid = True
    if candidate_file.exists():
        candidate = json.loads(candidate_file.read_text(encoding="utf-8"))
        stored_candidate_hash = candidate.get("skill_hash")
        candidate_hash_valid = stored_candidate_hash == sha256_json({
            key: value for key, value in candidate.items() if key != "skill_hash"
        })
    forbidden_answer_keys = {"gold_patch", "test_patch", "FAIL_TO_PASS", "PASS_TO_PASS", "test_command"}
    checks = {
        "seal_copies_match": public_seal == vault_seal,
        "public_digest_matches": sha256_json(public) == public_seal["public_manifest_digest"],
        "hidden_digest_matches": sha256_json(hidden) == public_seal["hidden_manifest_digest"],
        "seal_digest_matches": sha256_json({
            key: value for key, value in public_seal.items() if key != "seal_digest"
        }) == public_seal["seal_digest"],
        "development_count_matches": len(public["development_tasks"]) == public_seal["development_task_count"],
        "holdout_count_matches": len(public["holdout_tasks"]) == public_seal["holdout_task_count"],
        "public_hidden_ids_match": (
            [task["task_id"] for task in public["development_tasks"]]
            == [task["task_id"] for task in hidden["development_tasks"]]
            and [task["task_id"] for task in public["holdout_tasks"]]
            == [task["task_id"] for task in hidden["holdout_tasks"]]
        ),
        "no_repository_overlap": not (
            {task["repository"] for task in public["development_tasks"]}
            & {task["repository"] for task in public["holdout_tasks"]}
        ),
        "learner_manifest_has_no_answers": all(
            forbidden_answer_keys.isdisjoint(task.keys()) for task in learner_tasks
        ),
        "dataset_revision_pinned": public["dataset"]["revision"] == DATASET_REVISION,
        "development_task_ids_unique": len(development_ids) == len(set(development_ids)),
        "holdout_task_ids_unique": len(holdout_ids) == len(set(holdout_ids)),
        "development_repositories_unique": len(development_repositories) == len(set(development_repositories)),
        "holdout_repositories_unique": len(holdout_repositories) == len(set(holdout_repositories)),
        "excluded_prior_task_ids_absent": not (set(holdout_ids) & excluded_ids),
        "excluded_prior_repositories_absent": not (set(holdout_repositories) & excluded_repositories),
        "source_development_reused_exactly": source_development_matches,
        "candidate_hash_valid_when_present": candidate_hash_valid,
    }
    failed = [name for name, passed in checks.items() if not passed]
    return {
        "schema_version": 1,
        "verification_type": "apfc_open_world_corpus_verification",
        "ok": not failed,
        "mode": "apfc_open_world_corpus_verify",
        "checks": checks,
        "failed_checks": failed,
        "public_manifest_digest": sha256_json(public),
        "hidden_manifest_digest": sha256_json(hidden),
        "seal_digest": public_seal.get("seal_digest"),
        "development_task_count": len(development_ids),
        "holdout_task_count": len(holdout_ids),
        "excluded_prior_task_count": len(excluded_ids),
        "excluded_prior_repository_count": len(excluded_repositories),
    }


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    sub = root.add_subparsers(dest="command", required=True)
    seal_command = sub.add_parser("seal")
    seal_command.add_argument("--experiment-id", required=True)
    seal_command.add_argument("--public-dir", required=True)
    seal_command.add_argument("--vault-dir", required=True)
    seal_command.add_argument("--development-count", type=int, default=DEFAULT_DEVELOPMENT_COUNT)
    seal_command.add_argument("--holdout-count", type=int, default=DEFAULT_HOLDOUT_COUNT)
    online_command = sub.add_parser("reseal-online")
    online_command.add_argument("--experiment-id", required=True)
    online_command.add_argument("--public-dir", required=True)
    online_command.add_argument("--vault-dir", required=True)
    online_command.add_argument("--source-public-dir", required=True)
    online_command.add_argument("--source-vault-dir", required=True)
    online_command.add_argument("--candidate-file", required=True)
    online_command.add_argument("--exclude-public-dir", action="append", default=[])
    online_command.add_argument("--selection-seed", required=True)
    online_command.add_argument("--holdout-count", type=int, default=DEFAULT_HOLDOUT_COUNT)
    verify_command = sub.add_parser("verify")
    verify_command.add_argument("--public-dir", required=True)
    verify_command.add_argument("--vault-dir", required=True)
    verify_command.add_argument("--source-public-dir")
    verify_command.add_argument("--exclude-public-dir", action="append", default=[])
    verify_command.add_argument("--output")
    return root


def main() -> None:
    args = parser().parse_args()
    if args.command == "seal":
        result = seal(args)
    elif args.command == "reseal-online":
        result = seal_online(args)
    else:
        result = verify(args)
    if getattr(args, "output", None):
        write_json(Path(args.output).resolve(), result)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    if not result["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
