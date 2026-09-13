"""Offline checks for the native pilot oracle and fresh-thread usage accounting."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "scripts/evaluate_problem_discovery.py"
SPEC = importlib.util.spec_from_file_location("problem_pilot", SOURCE)
pilot = importlib.util.module_from_spec(SPEC)
previous_bytecode_setting = sys.dont_write_bytecode
try:
    sys.dont_write_bytecode = True
    SPEC.loader.exec_module(pilot)
finally:
    sys.dont_write_bytecode = previous_bytecode_setting


def event(total, last=10, thread="t"):
    def counts(number):
        return dict(inputTokens=number - 2, cachedInputTokens=0, outputTokens=2, reasoningOutputTokens=1, totalTokens=number)
    return {"method": "thread/tokenUsage/updated", "params": {"threadId": thread, "turnId": "u", "tokenUsage": {"total": counts(total), "last": counts(last)}}}


class PilotTests(unittest.TestCase):
    def test_final_usage_over_threshold_preserves_already_completed_answer(self):
        self.assertTrue(pilot.quota_requires_interrupt({"totalTokens": 20045}, 19841, False))
        self.assertFalse(pilot.quota_requires_interrupt({"totalTokens": 20045}, 19841, True))
        self.assertFalse(pilot.quota_requires_interrupt(None, 19841, False))

    def test_cumulative_usage_does_not_sum_duplicates_or_last(self):
        meter = pilot.UsageMeter()
        meter.thread_id = "t"
        for notification in (event(30), event(30), event(70), event(10000, thread="other")):
            meter.observe(notification)
        self.assertEqual(meter.report()["status"], "incomplete")
        meter.observe({"method": "turn/completed", "params": {"threadId": "t", "turn": {"id": "u", "status": "completed"}}})
        self.assertEqual(meter.report()["status"], "observed")
        self.assertEqual(meter.report()["total"]["totalTokens"], 70)
        self.assertEqual(meter.report()["distinct_updates"], 2)

    def test_regression_and_missing_counters_fail_closed(self):
        meter = pilot.UsageMeter()
        meter.thread_id = "t"
        meter.observe(event(70))
        meter.observe(event(30))
        self.assertEqual(meter.report()["status"], "invalid")
        self.assertIsNone(meter.counters({"inputTokens": True}))
        self.assertEqual(pilot.UsageMeter().report()["status"], "incomplete")

    def test_oracle_rejects_false_resolution_decoy_and_wrong_condition(self):
        answer = {"decision": "revise", "related_problem_ids": ["task_switchgear"], "resolved": False,
                  "explanation": "The planned loss of supply overlaps an uninterrupted acquisition.",
                  "sources": ["md-os/ops/sources/pilot/observation.json", "md-os/ops/sources/pilot/switchgear.json"]}
        self.assertTrue(pilot.verify(json.dumps(answer), True)["passed"])
        self.assertFalse(pilot.verify(json.dumps(answer), False)["passed"])
        for patch in ({"resolved": True}, {"related_problem_ids": ["task_poster"]}, {"sources": []}, {"related_problem_ids": [{}]}):
            self.assertFalse(pilot.verify(json.dumps(answer | patch), True)["passed"])

    def test_mismatched_terminal_turn_and_null_usage_are_invalid(self):
        meter = pilot.UsageMeter()
        meter.thread_id = "t"
        meter.observe(event(30))
        meter.observe({"method": "turn/completed", "params": {"threadId": "t", "turn": {"id": "wrong", "status": "completed"}}})
        self.assertEqual(meter.report()["status"], "invalid")
        meter = pilot.UsageMeter()
        meter.thread_id = "t"
        notification = event(30)
        notification["params"]["tokenUsage"] = None
        meter.observe(notification)
        self.assertEqual(meter.report()["status"], "invalid")

    def test_fixtures_have_no_edges_and_correction_preserves_ids(self):
        with tempfile.TemporaryDirectory(prefix="mdos-problem-pilot-test-") as directory:
            root = Path(directory)
            a = pilot.prepare_case(root / "a", True)
            b = pilot.prepare_case(root / "b", False)
            self.assertEqual(set(a), set(b))
            for path in a:
                if "/tasks/" in path:
                    self.assertEqual(json.loads((root / "a" / path).read_text())["problem_core"]["relations"], [])
            self.assertEqual(sum(a[path] != b[path] for path in a), 2)

    def test_baseline_override_is_allowlisted_and_leaves_fixture_unchanged(self):
        with tempfile.TemporaryDirectory(prefix="mdos-baseline-test-") as directory:
            root = Path(directory)
            workspace, baseline = root / "workspace", root / "baseline"
            manifest = pilot.prepare_case(workspace, True)
            fixtures = dict(manifest)
            for relative in pilot.BASELINE_FILES:
                for base, value in ((workspace, "current"), (baseline, "before")):
                    target = base / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(value)
                manifest[relative] = pilot.digest(b"current")
            (baseline / "ME.md").write_text("must not transfer")
            updated = pilot.apply_baseline(workspace, baseline, manifest)
            self.assertFalse((workspace / "ME.md").exists())
            self.assertEqual({path: updated[path] for path in fixtures}, fixtures)
            self.assertEqual({path for path in manifest if updated[path] != manifest[path]}, set(pilot.BASELINE_FILES))

    def test_invalid_baseline_is_rejected_before_any_copy(self):
        with tempfile.TemporaryDirectory(prefix="mdos-baseline-test-") as directory:
            root = Path(directory)
            workspace, baseline = root / "workspace", root / "baseline"
            manifest = {}
            for relative in pilot.BASELINE_FILES:
                for base in (workspace, baseline):
                    target = base / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text("original")
                manifest[relative] = pilot.digest(b"original")
            missing = baseline / pilot.BASELINE_FILES[-1]
            missing.unlink()
            for symlink in (False, True):
                if symlink:
                    missing.symlink_to(baseline / pilot.BASELINE_FILES[0])
                with self.assertRaisesRegex(ValueError, "BASELINE_SOURCE_INVALID"):
                    pilot.apply_baseline(workspace, baseline, manifest)
                self.assertTrue(all((workspace / path).read_text() == "original" for path in manifest))


if __name__ == "__main__":
    unittest.main()
