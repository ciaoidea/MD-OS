#!/usr/bin/env python3
"""Bounded native-host development pilot. No oracle is copied into the workspace.

This measures discovery and optional matched implementation comparisons,
not general savings or Unity Tensor verification.
Token counters come from app-server events, never from prompt byte estimates.
See https://learn.chatgpt.com/docs/app-server#turn-events .
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
TREES = ("md-os/os", "md-os/kernel", "md-os/apfc", "md-os/modules", "md-os/schemas", "md-os/shell", "md-os/kb")
FILES = ("AGENTS.md", "ME.md", "README.md", "package.json", "cortex", "docs/FILESYSTEM_CONTRACT.md",
         "md-os/ops/core/agentic_core.md", "md-os/ops/core/agentic_core.json",
         "md-os/ops/summary/conceptual_boot_summary.md", "md-os/ops/summary/conceptual_boot_summary.json",
         "md-os/ops/summary/active_work_items.md", "md-os/ops/summary/active_work_items.json",
         "md-os/ops/health_classification.md", "md-os/ops/health_classification.json")
FIELDS = ("inputTokens", "cachedInputTokens", "cacheWriteInputTokens", "outputTokens", "reasoningOutputTokens", "totalTokens")


def quota_requires_interrupt(observed_total, limit, completed_final_answer):
    # The final token update can precede turn/completed. Discarding an already
    # produced final answer wastes its cost and destroys the comparison.
    return bool(observed_total and observed_total["totalTokens"] > limit and not completed_final_answer)


BASELINE_FILES = ("md-os/os/problem_context.js", "md-os/os/apfc_runtime.js",
                  "md-os/shell/bin/mdos-console", "md-os/kb/PERSISTENT_PROBLEM_NETWORK_MODEL.md")
REQUEST = (
    "Read-only planning review of this isolated fictional workspace. Inspect only files inside it. "
    "Do not change files, run builds, install anything, use network services, or spawn other agents. "
    "Assess the current plan for task_observation. Should it be revised, and why? "
    "Return only JSON with: decision (revise, retain_candidate, or insufficient_evidence), "
    "related_problem_ids (array of other problem IDs), resolved (boolean), explanation (string), "
    "sources (array of workspace-relative paths for underlying evidence used). "
    "A justified plan is not evidence that its intended outcome has already happened."
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def dump(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    temporary.replace(path)


def load_engine(workspace: Path):
    name = "mdos_problem_pilot_engine"
    loader = importlib.machinery.SourceFileLoader(name, str(workspace / "md-os/shell/bin/mdos-console"))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    loader.exec_module(module)
    return module


def snapshot(destination: Path) -> dict:
    """Copy an allowlist, excluding private chronology, test oracles and instances."""
    sources = {ROOT / relative for relative in FILES}
    for relative in TREES:
        base = ROOT / relative
        if base.is_symlink():
            raise ValueError("SNAPSHOT_SYMLINK")
        for current, directories, names in os.walk(base, followlinks=False):
            directories[:] = [name for name in directories if not name.startswith('.') and name not in
                               {"__pycache__", "node_modules", "imports"} and not (Path(current) / name).is_symlink()]
            sources.update(Path(current) / name for name in names if not name.startswith('.'))
    manifest, total = {}, 0
    for source in sorted(sources):
        if not source.is_file() or source.is_symlink():
            continue
        relative = source.relative_to(ROOT).as_posix()
        if any(parent.is_symlink() for parent in source.parents):
            raise ValueError("SNAPSHOT_PARENT_SYMLINK")
        data = source.read_bytes()
        total += len(data)
        if len(manifest) >= 4096 or total > 64 * 1024 * 1024:
            raise ValueError("SNAPSHOT_BUDGET")
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        manifest[relative] = digest(data)
    return manifest


def prepare_case(workspace: Path, overlapping: bool) -> dict:
    specifications = [
        ("observation", "Deliver a continuous three-hour astronomical brightness record.", [
            "The acquisition is planned for 21:30 to 00:30 UTC on the night of October 5 into October 6, 2026.",
            "The instrument has no buffer or battery. Its only electrical input is circuit L4.",
            "Acceptance requires an uninterrupted record; a restarted acquisition is a different attempt."],
         "Run the instrument in the planned window and submit the acquired data."),
        ("switchgear", "Replace a worn distribution-panel isolator.", [
            "The approved work order de-energizes circuit L4 on October 5, 2026.",
            ("The scheduled interruption is 22:15 to 22:40 UTC." if overlapping else
             "The revised scheduled interruption is 10:00 to 10:25 UTC; the previous evening slot is cancelled."),
            "The order authorizes work but is not evidence that work has occurred."],
         "Isolate the circuit during the authorized window."),
        ("poster", "Finish the exhibition poster entitled Night Power for gallery L4.", [
            "L4 is the gallery name in this design brief, not an electrical circuit identifier.",
            "The poster is edited offline on a battery-powered laptop in another building."],
         "Finish the typography review."),
    ]
    manifest = {}
    for name, goal, statements, candidate in specifications:
        evidence = f"md-os/ops/sources/pilot/{name}.json"
        dump(workspace / evidence, {"fixture": "fictional", "statements": statements})
        task = {"schema_version": 1, "task_spec_id": f"task_{name}", "created_at": "2026-09-12T00:00:00Z",
                "goal": goal, "constraints": [], "acceptance_tests": [], "required_evidence": [],
                "unknowns": ["No actual execution result has been observed."], "actions": [], "observation_targets": [],
                "problem_core": {"state": "candidate", "premises": [
                    {"statement": statement, "epistemic_status": "observed", "source_refs": [evidence]}
                    for statement in statements], "candidate_solution": candidate, "next_question": "Is this plan still justified?", "relations": []}}
        path = f"md-os/ops/tasks/task_{name}.json"
        dump(workspace / path, task)
        for relative in (path, evidence):
            manifest[relative] = digest((workspace / relative).read_bytes())
    return manifest


def apply_baseline(workspace: Path, source_directory: Path, manifest: dict) -> dict:
    """Override only frozen implementation inputs, never tasks, oracles or host state."""
    candidates = []
    for relative in BASELINE_FILES:
        source, target = source_directory / relative, workspace / relative
        for file in (source, target):
            if not file.is_file() or any(parent.is_symlink() for parent in (file, *file.parents)):
                raise ValueError("BASELINE_SOURCE_INVALID")
        if relative not in manifest or source.stat().st_size > 4 * 1024 * 1024:
            raise ValueError("BASELINE_SOURCE_INVALID")
        candidates.append((relative, source, target, digest(source.read_bytes())))
    updated = dict(manifest)
    for relative, source, target, source_hash in candidates:
        shutil.copy2(source, target)
        updated[relative] = source_hash
    return updated


class UsageMeter:
    """Fresh-thread cumulative totals; duplicates and last-inference samples are not added."""
    def __init__(self):
        self.thread_id = None
        self.turn_id = None
        self.total = None
        self.last = None
        self.terminal = False
        self.invalid = False
        self.updates = 0

    @staticmethod
    def counters(value):
        if not isinstance(value, dict):
            return None
        result = {key: value.get(key, 0 if key == "cacheWriteInputTokens" else None) for key in FIELDS}
        return result if all(type(n) is int and n >= 0 for n in result.values()) else None

    def observe(self, message):
        params = message.get("params", {})
        if not isinstance(params, dict) or not self.thread_id or params.get("threadId") != self.thread_id:
            return
        method = message.get("method")
        if method == "turn/completed":
            turn = params.get("turn", {})
            if self.turn_id and turn.get("id") != self.turn_id:
                self.invalid = True
            self.turn_id = turn.get("id")
            self.terminal = turn.get("status") == "completed"
        if method != "thread/tokenUsage/updated":
            return
        turn_id = params.get("turnId")
        if not isinstance(turn_id, str) or not turn_id:
            self.invalid = True
            return
        if self.turn_id and turn_id != self.turn_id:
            self.invalid = True
            return
        self.turn_id = turn_id
        usage = params.get("tokenUsage", {})
        if not isinstance(usage, dict):
            self.invalid = True
            return
        total, last = self.counters(usage.get("total")), self.counters(usage.get("last"))
        if total is None or last is None:
            self.invalid = True
            return
        if self.total and any(total[key] < self.total[key] for key in FIELDS):
            self.invalid = True
        self.updates += int(total != self.total)
        self.total, self.last = total, last

    def report(self):
        return {"status": "invalid" if self.invalid else "observed" if self.terminal and self.total else "incomplete",
                "fresh_thread": True, "counts_are_estimates": False, "total": self.total,
                "last_inference": self.last, "distinct_updates": self.updates}


def verify(answer: str, overlapping: bool) -> dict:
    try:
        value = json.loads(answer)
    except (TypeError, ValueError):
        return {"passed": False, "false_resolution": None, "reason": "invalid_json"}
    if not isinstance(value, dict):
        return {"passed": False, "false_resolution": None, "reason": "not_object"}
    expected_sources = {f"md-os/ops/sources/pilot/{name}.json" for name in ("observation", "switchgear")}
    sources = value.get("sources")
    sources_ok = isinstance(sources, list) and all(isinstance(s, str) for s in sources) and expected_sources <= set(sources)
    related = value.get("related_problem_ids")
    relation_ok = isinstance(related, list) and all(isinstance(s, str) for s in related) and set(related) == {"task_switchgear"}
    checks = {"decision": value.get("decision") == ("revise" if overlapping else "retain_candidate"),
              "relation_and_decoy": relation_ok, "not_resolved": value.get("resolved") is False,
              "provenance": sources_ok, "explanation_present": isinstance(value.get("explanation"), str) and len(value["explanation"]) >= 40}
    # This is an independently specified finite oracle, not a semantic judge of the explanation.
    return {"passed": all(checks.values()), "false_resolution": value.get("resolved") is True, "checks": checks,
            "explanation_requires_review": True}


def run_case(workspace: Path, overlapping: bool, timeout: int, token_limit: int, manifest: dict, context_mode: str = "on-demand", checkpoint_path: Path | None = None, request_text: str = REQUEST) -> dict:
    engine = load_engine(workspace)
    runtime = engine.load_runtime()
    meter, actions, host = UsageMeter(), [], {}
    client = None
    result = None
    error = None
    prompt = None
    final_answers = []
    started = time.monotonic()
    def expire(_number, _frame):
        raise TimeoutError("PILOT_WALL_TIME_LIMIT")
    previous = signal.signal(signal.SIGALRM, expire)
    previous_context_mode = os.environ.get("MDOS_PROBLEM_CONTEXT_MODE")
    os.environ["MDOS_PROBLEM_CONTEXT_MODE"] = context_mode
    def checkpoint(stage):
        if checkpoint_path:
            dump(checkpoint_path, {"stage": stage, "usage": meter.report(), "host": host,
                                   "actions": actions, "elapsed_seconds": round(time.monotonic() - started, 3)})
    try:
        checkpoint("starting")
        signal.alarm(timeout)
        client = engine.CodexAppServerClient(runtime)
        request = client._request
        def capture_request(method, params, *args, **kwargs):
            response = request(method, params, *args, **kwargs)
            if method == "thread/start":
                meter.thread_id = response["thread"]["id"]
                host.update({key: response.get(key) for key in ("model", "reasoningEffort", "modelProvider", "approvalPolicy")})
                checkpoint("thread_started")
            return response
        client._request = capture_request
        receive = client._receive
        def capture_receive(*args, **kwargs):
            message = receive(*args, **kwargs)
            if not isinstance(message, dict):
                return message
            meter.observe(message)
            params = message.get("params", {})
            if message.get("method") == "model/rerouted":
                host["rerouted"] = True
            if message.get("method") == "item/completed":
                item = params.get("item", {})
                if item.get("type") == "agentMessage" and item.get("phase") == "final_answer" and isinstance(item.get("text"), str):
                    final_answers.append(item["text"])
                if item.get("type") in {"commandExecution", "fileChange", "mcpToolCall", "webSearch", "collabToolCall", "dynamicToolCall"}:
                    actions.append({key: item[key] for key in ("type", "command", "cwd", "status", "exitCode", "server", "tool") if key in item})
                    if item.get("type") == "dynamicToolCall" and item.get("tool") == "mdos_context":
                        # Public tool inputs only; never store hidden reasoning.
                        actions[-1]["arguments"] = item.get("arguments")
                        actions[-1]["success"] = item.get("success")
            if message.get("method") in {"thread/tokenUsage/updated", "item/completed", "turn/completed"}:
                checkpoint("turn_completed" if meter.terminal else "running")
            if quota_requires_interrupt(meter.total, token_limit, bool(final_answers)):
                raise RuntimeError("PILOT_OBSERVED_TOKEN_LIMIT")
            return message
        client._receive = capture_receive
        context = engine.build_apfc_input_context(request_text, workspace)
        prompt, context_metrics = engine.build_native_codex_input(request_text, None, apfc_context=context, workspace=workspace, return_metrics=True)
        context = engine.bind_problem_projection(context, context_metrics)
        result = client.run_turn(prompt, cwd=workspace, resume_existing=False, ephemeral=True,
                                 human_request=request_text, apfc_context=context, render_tool_events=False)
    except (Exception, SystemExit) as caught:
        error = f"{type(caught).__name__}: {caught}"
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)
        if client is not None:
            client.close()
        if previous_context_mode is None:
            os.environ.pop("MDOS_PROBLEM_CONTEXT_MODE", None)
        else:
            os.environ["MDOS_PROBLEM_CONTEXT_MODE"] = previous_context_mode
    changed = [relative for relative, expected in manifest.items() if
               not (workspace / relative).is_file() or (workspace / relative).is_symlink() or digest((workspace / relative).read_bytes()) != expected]
    answer = result.text if result else "\n".join(final_answers)
    return {"condition": "overlap" if overlapping else "rescheduled", "context_mode": context_mode, "elapsed_seconds": round(time.monotonic() - started, 3),
            "host": host, "configured_model": engine.effective_model(runtime), "configured_effort": engine.effective_reasoning_effort(runtime),
            "error": error, "answer": answer, "verifier": verify(answer, overlapping), "usage": meter.report(),
            "prompt_bytes": len(prompt.encode()) if prompt else None, "actions": actions, "source_changes": changed,
            "native_output_gate": result.output_gate_verdict if result else None,
            "isolation": "Workspace-scoped instruction and trace audit; host read access is not OS-confined to the snapshot."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Run the bounded native schedule; otherwise prepare only.")
    parser.add_argument("--condition", choices=("both", "overlap", "rescheduled"), default="both")
    parser.add_argument("--context-mode", choices=("on-demand", "projected", "compare"), default="on-demand")
    parser.add_argument("--treatment-first", action="store_true")
    parser.add_argument("--baseline-source-directory", type=Path,
                        help="Compare a frozen allowlisted before-image with current sources, both on-demand.")
    parser.add_argument("--timeout-seconds", type=int, default=120)
    parser.add_argument("--token-limit", type=int, default=80000, help="Observed-counter stop threshold, not a strict provider spending cap.")
    args = parser.parse_args()
    if not 30 <= args.timeout_seconds <= 180 or not 10000 <= args.token_limit <= 150000:
        parser.error("Invalid bounded pilot limits")
    if args.baseline_source_directory and args.context_mode != "on-demand":
        parser.error("Implementation comparison requires the same on-demand context mode in both arms")
    run_root = Path(tempfile.mkdtemp(prefix="mdos-problem-discovery-"))
    shutil.copy2(Path(__file__), run_root / "evaluator.py")
    conditions = (True, False) if args.condition == "both" else (args.condition == "overlap",)
    modes = ["on-demand", "projected"] if args.context_mode == "compare" else [args.context_mode]
    variants = [("baseline", "on-demand"), ("current", "on-demand")] if args.baseline_source_directory else [("current", mode) for mode in modes]
    if args.treatment_first:
        variants.reverse()
    schedule = [(condition, variant, mode) for condition in conditions for variant, mode in variants]
    protocol = {"schema_version": 1, "split": "development_pilot", "request": REQUEST,
                "evaluator_sha256": digest(Path(__file__).read_bytes()), "maximum_turns": len(schedule),
                "timeout_per_turn_seconds": args.timeout_seconds, "observed_token_threshold_per_turn": args.token_limit,
                "relations_supplied": False, "baseline_present": bool(args.baseline_source_directory) or args.context_mode == "compare", "savings_claim_supported": False,
                "code_variants": [variant for variant, _ in variants],
                "baseline_override_paths": list(BASELINE_FILES) if args.baseline_source_directory else [],
                "snapshot_limitation": "The allowlisted fixture snapshot omits runtime catalog and private continuity; it is not a full instance clone.",
                "context_modes": modes,
                "conditions": ["overlap" if value else "rescheduled" for value in conditions], "fresh_process_and_thread_each_condition": True,
                "scope": "Native discovery and correction pilot, not a longitudinal learning or held-out generality claim."}
    dump(run_root / "protocol.json", protocol)
    print(json.dumps({"run_root": str(run_root), "live": args.live}), flush=True)
    rows = []
    prepared = []
    for index, (overlapping, variant, mode) in enumerate(schedule):
        workspace = run_root / f"workspace_{index}"
        manifest = snapshot(workspace)
        if variant == "baseline":
            manifest = apply_baseline(workspace, args.baseline_source_directory, manifest)
        manifest.update(prepare_case(workspace, overlapping))
        dump(run_root / f"manifest_{index}.json", manifest)
        prepared.append((workspace, overlapping, variant, mode, manifest))
    for workspace, overlapping, variant, mode, manifest in prepared if args.live else []:
        row = run_case(workspace, overlapping, args.timeout_seconds, args.token_limit, manifest, mode,
                       run_root / f"checkpoint_{workspace.name}.json")
        row["code_variant"] = variant
        rows.append(row)
        dump(run_root / "results.json", {"protocol": protocol, "rows": rows})
        print(json.dumps({"condition": row["condition"], "code_variant": variant, "context_mode": mode, "error": row["error"], "verifier": row["verifier"], "usage": row["usage"]}), flush=True)
        if row["error"] or not row["verifier"]["passed"] or row["source_changes"] or row["usage"]["status"] != "observed":
            break  # Inspect a failing first condition before spending on another.
    print(json.dumps({"run_root": str(run_root), "attempted_turns": len(rows),
                      "completed_turns": sum(row["usage"]["status"] == "observed" and not row["error"] for row in rows),
                      "savings_claim_supported": False}), flush=True)


if __name__ == "__main__":
    main()
