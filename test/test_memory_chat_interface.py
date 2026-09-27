"""Regression coverage for memory discovery and the quiet shell/chat boundary.

All memories are synthetic and temporary. Provider events are simulated locally.
"""
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from test_mdos_shell import ENGINE, ENGINE_PATH, LAUNCHER_PATH, FakeCodex, run_console


class MemoryChatInterfaceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.workspace = Path(self.directory.name)
        (self.workspace / "md-os").mkdir()

    def seed(self):
        ENGINE.append_private_conversation_turn(
            self.workspace, ["For cobalt scheduler, postpone restart until inspection."],
            "The restart decision remains pending inspection.",
        )
        return self.workspace / ENGINE.PRIVATE_CONVERSATION_PATH

    def cli(self, args, cwd=None):
        environment = os.environ.copy()
        environment["MDOS_PRIVATE_CONVERSATION"] = "on"
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        return subprocess.run(
            [sys.executable, str(LAUNCHER_PATH), "memory", "search", *args],
            cwd=cwd or self.workspace, env=environment, text=True,
            capture_output=True, timeout=15,
        )

    def test_memory_help_never_reads_or_builds_memory(self):
        with mock.patch.object(ENGINE, "read_private_conversation_history") as history, \
                mock.patch.object(ENGINE, "build_apfc_cognitive_memory_context") as index:
            for args in (["--help"], ["-h"]):
                with self.subTest(args=args), contextlib.redirect_stdout(io.StringIO()) as out:
                    self.assertEqual(ENGINE.run_memory_search_command(args), 0)
                    self.assertIn('memory search "query"', out.getvalue())
                    self.assertIn("--query-file", out.getvalue())
            history.assert_not_called()
            index.assert_not_called()
        result = self.cli(["--help"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.workspace / "md-os/ops").exists())

    def test_memory_text_and_legacy_file_find_same_persisted_evidence(self):
        history = self.seed()
        before = history.read_bytes()
        query = "cobalt scheduler"
        (self.workspace / "query.txt").write_text(query, encoding="utf-8")
        direct = self.cli([query])
        legacy = self.cli(["--query-file", "query.txt", "--json"])
        for result in (direct, legacy):
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["selected_nodes"])
            self.assertFalse(payload["mutation_authority"])
            self.assertLessEqual(len(result.stdout.rstrip("\n")), 4096)
            self.assertLessEqual(len(payload["selected_nodes"]), 3)
        self.assertEqual(json.loads(direct.stdout)["selected_nodes"], json.loads(legacy.stdout)["selected_nodes"])
        self.assertEqual(history.read_bytes(), before)

    def test_memory_words_and_option_separator_are_supported(self):
        self.seed()
        for args in (["cobalt", "scheduler", "--limit", "1", "--json"], ["--", "--help"]):
            result = self.cli(args)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("selected_nodes", json.loads(result.stdout))

    def test_memory_empty_results_do_not_cross_workspace_boundaries(self):
        history = self.seed()
        before = history.read_bytes()
        with tempfile.TemporaryDirectory() as other:
            (Path(other) / "md-os").mkdir()
            result = self.cli(["cobalt scheduler"], cwd=other)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["selected_nodes"], [])
        self.assertEqual(history.read_bytes(), before)

    def test_memory_invalid_arguments_fail_before_reading_history(self):
        invalid = [[], [" "], ["q", "--limit", "4"], ["q", "--max-chars", "9000"],
                   ["q", "--limit", "many"], ["q", "--bogus"], ["--query-file"],
                   ["q", "--query-file", "unused"], ["--query-file", "a", "--query-file", "b"],
                   ["q" * (512 * 1024 + 1)]]
        with mock.patch.object(ENGINE, "read_private_conversation_history") as history:
            for args in invalid:
                with self.subTest(kind=args[0][:40] if args else "empty"), contextlib.redirect_stderr(io.StringIO()):
                    with self.assertRaises(SystemExit) as raised:
                        ENGINE.run_memory_search_command(args)
                    self.assertEqual(raised.exception.code, 64)
            history.assert_not_called()

    def test_memory_file_cannot_escape_the_workspace(self):
        with tempfile.TemporaryDirectory() as other:
            source = Path(other) / "query.txt"
            source.write_text("cobalt", encoding="utf-8")
            result = self.cli(["--query-file", str(source)])
            self.assertEqual(result.returncode, 64)
            self.assertIn("CONTEXT_TOOL_INPUT_OUTSIDE_WORKSPACE", result.stderr)
        self.assertFalse((self.workspace / "md-os/ops").exists())

    def test_memory_corrupt_history_still_fails_closed(self):
        history = self.seed()
        history.write_text(history.read_text().replace("postpone restart", "perform restart"), encoding="utf-8")
        before = history.read_bytes()
        result = self.cli(["cobalt scheduler"])
        self.assertEqual(result.returncode, 65)
        self.assertIn("PRIVATE_CONVERSATION_REJECTED", result.stderr)
        self.assertEqual(history.read_bytes(), before)

    def test_memory_bootstrap_contains_executable_syntax_and_new_binding_version(self):
        _, text, material = ENGINE.build_thread_bootstrap(self.workspace)
        self.assertIn('./cortex memory search "relevant terms" --json', text)
        self.assertIn("./cortex memory search --help", text)
        self.assertEqual(material["memory_interface_version"], 4)
        self.assertLessEqual(len(text.encode()), ENGINE.MAX_THREAD_BOOTSTRAP_CHARS)

    def test_quiet_chat_hides_command_delta_fallback_and_diagnostics(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("MDOS_CODEX_TRACE", None)
            self.assertEqual(ENGINE.effective_trace_level(), "quiet")
            with FakeCodex("Inspection complete.", command_event=("synthetic-tool", "internal-output\n"), trace_events=True) as fake:
                result = run_console(["inspect this synthetic task"], fake, self.workspace)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout, "Inspection complete.\n")
                self.assertNotIn("internal-output", result.stderr)
                for label in ("CODEX COMMAND", "CODEX TOOL", "CODEX REASONING", "CODEX PLAN", "CODEX DIFF"):
                    self.assertNotIn(label, result.stderr)
                self.assertEqual(fake.requests()[0]["params"]["summary"], "none")

    def test_quiet_chat_preserves_each_text_delta(self):
        with FakeCodex("Streamed response.", command_event=("synthetic-tool", "hidden\n")) as fake, \
                mock.patch.dict(os.environ, {"MDOS_CODEX_BIN": str(fake.executable), "MDOS_CODEX_TRACE": "quiet"}), \
                contextlib.chdir(self.workspace), contextlib.redirect_stdout(io.StringIO()) as out:
            client = ENGINE.CodexAppServerClient(ENGINE.load_runtime())
            chunks = []
            try:
                result = client.run_turn("inspect fixture", on_agent_delta=chunks.append, render_tool_events=True)
            finally:
                client.close()
            self.assertGreater(len(chunks), 1)
            self.assertEqual("".join(chunks), "Streamed response.")
            self.assertEqual(result.text, "Streamed response.")
            self.assertNotIn("hidden", out.getvalue())

    def test_quiet_does_not_hide_explicit_native_shell_output(self):
        with FakeCodex() as fake, mock.patch.dict(os.environ, {"MDOS_CODEX_TRACE": "quiet"}):
            result = run_console(["printf native-visible"], fake, self.workspace)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("native-visible", result.stdout)
            self.assertEqual(fake.requests(), [])

    def test_quiet_keeps_actionable_protocol_errors_visible(self):
        client = object.__new__(ENGINE.CodexAppServerClient)
        with mock.patch.dict(os.environ, {"MDOS_CODEX_TRACE": "quiet"}), contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertTrue(client._render_protocol_notice("error", {"error": {"message": "Connection unavailable"}}))
            self.assertIn("Connection unavailable", err.getvalue())


if __name__ == "__main__":
    unittest.main()
