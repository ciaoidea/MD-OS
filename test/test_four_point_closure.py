"""Offline failure controls for the bounded native comparison; no model calls."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "scripts/evaluate_four_point_closure.py"
spec = importlib.util.spec_from_file_location("four_point_pilot", SOURCE)
pilot = importlib.util.module_from_spec(spec)
sys.path.insert(0, str(SOURCE.parent))
try:
    spec.loader.exec_module(pilot)
finally:
    sys.path.pop(0)


class ClosurePilotTests(unittest.TestCase):
    def row(self, arm, phase, tokens):
        return {"variant": arm, "phase": phase, "error": None,
                "host": {"model": "fixture", "reasoningEffort": "low", "modelProvider": "fixture"},
                "usage": {"status": "observed", "total": {"totalTokens": tokens}},
                "independent_score": {"passed": True}}

    def test_sum_counts_aborted_cost_but_never_certifies_partial_comparison(self):
        rows = [self.row("baseline", 0, 100), self.row("current", 0, 80),
                self.row("current", 1, 70), self.row("baseline", 1, 110)]
        self.assertTrue(pilot.summarize(rows)["bounded_efficiency_criterion_met"])
        rows[-1]["error"] = "budget interrupt"
        rows[-1]["usage"]["status"] = "incomplete"
        result = pilot.summarize(rows)
        self.assertEqual(result["entire_evaluation_provider_tokens"], 360)
        self.assertIsNone(result["measured_reduction_percent"])
        self.assertFalse(result["bounded_efficiency_criterion_met"])
        self.assertTrue(result["incomplete_counter_totals_are_lower_bounds"])

    def test_worse_quality_or_different_settings_invalidates_savings(self):
        rows = [self.row(arm, phase, 100 if arm == "baseline" else 40)
                for phase in (0, 1) for arm in ("baseline", "current")]
        for altered in ("quality", "model", "rerouted", "missing"):
            variant = copy.deepcopy(rows)
            if altered == "quality":
                variant[1]["independent_score"]["passed"] = False
            elif altered == "model":
                variant[1]["host"]["model"] = "different"
            elif altered == "rerouted":
                variant[1]["host"]["rerouted"] = True
            else:
                for row in variant:
                    row["host"] = {}
            self.assertFalse(pilot.summarize(variant)["bounded_efficiency_criterion_met"])

    def test_topic_memory_and_decoy_are_independently_scored(self):
        value = {"decision": "retain_candidate", "related_problem_ids": ["task_switchgear"], "resolved": False,
            "explanation": "The rescheduled supply outage no longer intersects the acquisition window.",
            "sources": ["md-os/ops/sources/pilot/observation.json", "md-os/ops/sources/pilot/switchgear.json"],
            "secondary_problem_status": "independent", "previous_pattern_status": "stale",
            "proposed_pattern": {"principle": "Compare time windows", "prediction": "No overlap",
                                 "conditions": ["Same circuit"], "procedure": ["Check the intersection"]}}
        def score(answer):
            encoded = json.dumps(answer)
            return pilot.score({"answer": encoded, "verifier": pilot.pilot.verify(encoded, False),
                                "actions": [], "source_changes": []}, 1)
        self.assertTrue(score(value)["passed"])
        for patch in ({"resolved": True}, {"previous_pattern_status": "current"},
                      {"related_problem_ids": ["task_poster"]}, {"secondary_problem_status": "connected"}):
            self.assertFalse(score(value | patch)["passed"])


if __name__ == "__main__":
    unittest.main()
