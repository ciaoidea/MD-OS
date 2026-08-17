from __future__ import annotations

from importlib.machinery import SourceFileLoader
from importlib.util import module_from_spec, spec_from_loader
import contextlib
import io
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import textwrap
import unittest


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENGINE_PATH = PROJECT_ROOT / "md-os" / "shell" / "bin" / "mdos-console"
INSTALLER_PATH = PROJECT_ROOT / "md-os" / "shell" / "install.py"


def load_engine_module():
    loader = SourceFileLoader("mdos_shell_engine_test", str(ENGINE_PATH))
    spec = spec_from_loader(loader.name, loader)
    if spec is None:
        raise RuntimeError("cannot create MD-OS shell module specification")
    module = module_from_spec(spec)
    sys.modules[loader.name] = module
    loader.exec_module(module)
    return module


ENGINE = load_engine_module()


class FakeCodex:
    THREAD_ID = "01900000-0000-7000-8000-000000000001"

    def __init__(
        self,
        response: str | list[str] = "AGENT: os\nprintf runtime-ok",
    ) -> None:
        self.responses = [response] if isinstance(response, str) else response
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.executable = self.root / "codex"
        self.calls = self.root / "calls.ndjson"
        source = textwrap.dedent(
            f"""\
            #!/usr/bin/env python3
            import json
            from pathlib import Path
            import sys

            arguments = sys.argv[1:]
            output_index = arguments.index("--output-last-message") + 1
            output_path = Path(arguments[output_index])
            prompt = sys.stdin.read()
            calls_path = Path({str(self.calls)!r})
            call_index = 0
            if calls_path.exists():
                call_index = len([line for line in calls_path.read_text(encoding="utf-8").splitlines() if line])
            with calls_path.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps({{"arguments": arguments, "prompt": prompt}}) + "\\n")
            responses = {self.responses!r}
            response = responses[min(call_index, len(responses) - 1)]
            output_path.write_text(response, encoding="utf-8")
            if "--json" in arguments:
                print(json.dumps({{"type": "thread.started", "thread_id": {self.THREAD_ID!r}}}))
            """
        )
        self.executable.write_text(source, encoding="utf-8")
        self.executable.chmod(0o755)

    def requests(self) -> list[dict[str, object]]:
        if not self.calls.exists():
            return []
        return [
            __import__("json").loads(line)
            for line in self.calls.read_text(encoding="utf-8").splitlines()
            if line
        ]

    def close(self) -> None:
        self.temporary.cleanup()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        self.close()


def run_console(arguments: list[str], fake: FakeCodex, cwd: Path = PROJECT_ROOT):
    environment = os.environ.copy()
    environment["MDOS_CODEX_BIN"] = str(fake.executable)
    environment["MDOS_PROMPT_COLOR"] = "never"
    return subprocess.run(
        [sys.executable, str(ENGINE_PATH), *arguments],
        cwd=cwd,
        env=environment,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )


class SemanticShellParityTests(unittest.TestCase):
    def test_default_program_loads_md_os_and_repository_instructions(self):
        runtime = ENGINE.load_runtime()
        program = ENGINE.load_program(ENGINE.DEFAULT_AGENT_REFERENCE, runtime)
        self.assertEqual(runtime.provider, "codex")
        self.assertEqual(program.program_id, "md-os")
        self.assertEqual(program.kind, "agent-dispatch")
        self.assertIn("Stable repository purpose", program.instructions)
        self.assertIn("Route to `answer`", program.instructions)

    def test_explicit_native_command_bypasses_codex(self):
        with FakeCodex() as fake:
            result = run_console(["printf direct-ok"], fake)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, "direct-ok")
            self.assertEqual(result.stderr, "COMMAND: printf direct-ok\n")
            self.assertEqual(fake.requests(), [])

    def test_normal_shell_syntax_executes_without_codex(self):
        with FakeCodex() as fake:
            result = run_console(["printf 'one\\ntwo\\n' | tail -n 1"], fake)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, "two\n")
            self.assertEqual(fake.requests(), [])

    def test_natural_language_uses_codex_and_returns_answer(self):
        answer = "Un tensore generalizza scalari, vettori e matrici."
        with FakeCodex(f"AGENT: answer\n{answer}") as fake:
            result = run_console(["che cosa è un tensore?"], fake)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, f"{answer}\n")
            requests = fake.requests()
            self.assertEqual(len(requests), 1)
            self.assertIn("--ephemeral", requests[0]["arguments"])
            self.assertIn("read-only", requests[0]["arguments"])
            self.assertIn("che cosa è un tensore?", requests[0]["prompt"])
            self.assertIn("MANDATORY RUNTIME OUTPUT CONTRACT", requests[0]["prompt"])

    def test_codex_generated_os_command_executes_in_real_shell(self):
        with FakeCodex("AGENT: os\nprintf semantic-ok") as fake:
            result = run_console(["produce the semantic marker"], fake)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, "semantic-ok")
            self.assertEqual(result.stderr, "COMMAND: printf semantic-ok\n")

    def test_repl_preserves_codex_thread_and_observes_native_shell_events(self):
        responses = [
            "AGENT: answer\nHai eseguito printf shell-memory-ok.",
            "AGENT: answer\nL'ultimo comando nativo è printf shell-memory-ok.",
        ]
        with FakeCodex(responses) as fake, tempfile.TemporaryDirectory() as temporary:
            environment = os.environ.copy()
            environment["MDOS_CODEX_BIN"] = str(fake.executable)
            environment["MDOS_PROMPT_COLOR"] = "never"
            result = subprocess.run(
                [sys.executable, str(ENGINE_PATH)],
                input=(
                    "printf shell-memory-ok\n"
                    "che cosa ho appena fatto?\n"
                    "qual è l'ultimo comando nativo?\n"
                    "exit\n"
                ),
                cwd=temporary,
                env=environment,
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("shell-memory-ok", result.stdout)
            requests = fake.requests()
            self.assertEqual(len(requests), 2)
            first_arguments = requests[0]["arguments"]
            second_arguments = requests[1]["arguments"]
            self.assertIn("--json", first_arguments)
            self.assertNotIn("--ephemeral", first_arguments)
            self.assertNotIn("resume", first_arguments)
            self.assertIn("resume", second_arguments)
            self.assertIn(FakeCodex.THREAD_ID, second_arguments)
            self.assertIn('"origin":"native-input"', requests[0]["prompt"])
            self.assertIn('"command":"printf shell-memory-ok"', requests[0]["prompt"])
            self.assertIn('"output":"shell-memory-ok"', requests[0]["prompt"])
            self.assertIn("che cosa ho appena fatto?", requests[0]["prompt"])
            self.assertIn("qual è l'ultimo comando nativo?", requests[1]["prompt"])
            self.assertIn("MD-OS SEMANTIC SHELL CONTINUATION", requests[1]["prompt"])
            self.assertRegex(
                requests[1]["prompt"],
                r"previous_codex_turn_duration_ms=\d+",
            )
            self.assertNotIn("Stable repository purpose", requests[1]["prompt"])

    def test_prompt_matches_native_shape_and_completion(self):
        plain = ENGINE.native_fallback_prompt(use_color=False)
        colored = ENGINE.native_fallback_prompt(use_color=True)
        self.assertNotIn("\x1b[", plain)
        self.assertIn("\x01\x1b[01;32m\x02", colored)
        visible = re.sub(r"\x01\x1b\[[0-9;]*m\x02", "", colored)
        self.assertEqual(visible, plain)
        commands = ENGINE.completion_candidates("pyth", True)
        self.assertTrue(any(candidate.startswith("python") for candidate in commands))

    def test_cd_persists_inside_repl_process(self):
        previous_directory = Path.cwd()
        previous_pwd = os.environ.get("PWD")
        previous_oldpwd = os.environ.get("OLDPWD")
        try:
            with tempfile.TemporaryDirectory() as temporary:
                parent = Path(temporary).resolve()
                child = parent / "child directory"
                child.mkdir()
                session = ENGINE.ShellSession()
                os.chdir(child)
                os.environ["PWD"] = str(child)
                os.environ.pop("OLDPWD", None)
                self.assertTrue(ENGINE.handle_repl_builtin("cd ..", session))
                self.assertEqual(Path.cwd(), parent)
                self.assertEqual(os.environ["OLDPWD"], str(child))
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    self.assertTrue(ENGINE.handle_repl_builtin("cd -", session))
                self.assertEqual(Path.cwd(), child)
                self.assertEqual(output.getvalue(), f"{child}\n")
                self.assertFalse(ENGINE.handle_repl_builtin("ls -l"))
                self.assertEqual(
                    [event.command for event in session.pending_events],
                    ["cd ..", "cd -"],
                )
                self.assertEqual(session.pending_events[-1].cwd_after, str(child))
        finally:
            os.chdir(previous_directory)
            if previous_pwd is None:
                os.environ.pop("PWD", None)
            else:
                os.environ["PWD"] = previous_pwd
            if previous_oldpwd is None:
                os.environ.pop("OLDPWD", None)
            else:
                os.environ["OLDPWD"] = previous_oldpwd

    def test_no_arguments_opens_shell_and_pwd_runs_natively(self):
        with FakeCodex() as fake, tempfile.TemporaryDirectory() as temporary:
            cwd = Path(temporary)
            environment = os.environ.copy()
            environment["MDOS_CODEX_BIN"] = str(fake.executable)
            environment["MDOS_PROMPT_COLOR"] = "never"
            result = subprocess.run(
                [sys.executable, str(ENGINE_PATH)],
                input="pwd\nexit\n",
                cwd=cwd,
                env=environment,
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("MD-OS semantic shell", result.stdout)
            self.assertIn(str(cwd), result.stdout)
            self.assertEqual(fake.requests(), [])

    def test_installer_dry_run_selects_original_shell_adapter_flow(self):
        with tempfile.TemporaryDirectory() as temporary:
            environment = os.environ.copy()
            environment["HOME"] = temporary
            result = subprocess.run(
                [sys.executable, str(INSTALLER_PATH), "--shell", "bash", "--dry-run"],
                cwd=PROJECT_ROOT,
                env=environment,
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("shell=bash", result.stdout)
            self.assertIn("installation_status=ready", result.stdout)
            self.assertIn("universal_fallback=mdos-console", result.stdout)


if __name__ == "__main__":
    unittest.main()
