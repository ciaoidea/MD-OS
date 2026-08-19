from __future__ import annotations

from importlib.machinery import SourceFileLoader
from importlib.util import module_from_spec, spec_from_loader
import contextlib
import io
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile
import textwrap
import unittest
from unittest import mock


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENGINE_PATH = PROJECT_ROOT / "md-os" / "shell" / "bin" / "mdos-console"
LAUNCHER_PATH = PROJECT_ROOT / "md-os" / "shell" / "bin" / "cortex"
COMPATIBILITY_LAUNCHER_PATH = PROJECT_ROOT / "md-os" / "shell" / "bin" / "mdos"
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


def load_launcher_module():
    loader = SourceFileLoader("mdos_cortex_launcher_test", str(LAUNCHER_PATH))
    spec = spec_from_loader(loader.name, loader)
    if spec is None:
        raise RuntimeError("cannot create Cortex launcher module specification")
    module = module_from_spec(spec)
    sys.modules[loader.name] = module
    loader.exec_module(module)
    return module


LAUNCHER = load_launcher_module()


class FakeCodex:
    THREAD_ID = "01900000-0000-7000-8000-000000000001"

    def __init__(
        self,
        response: str | list[str] = "runtime-ok",
        existing_threads: dict[str, str] | None = None,
        command_event: tuple[str, str] | None = None,
        trace_events: bool = False,
        busy_threads: set[str] | None = None,
    ) -> None:
        self.responses = [response] if isinstance(response, str) else response
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.executable = self.root / "codex"
        self.calls = self.root / "calls.ndjson"
        self.starts = self.root / "starts.ndjson"
        self.protocol = self.root / "protocol.ndjson"
        source = textwrap.dedent(
            f"""\
            #!/usr/bin/env python3
            import json
            from pathlib import Path
            import sys

            arguments = sys.argv[1:]
            calls_path = Path({str(self.calls)!r})
            starts_path = Path({str(self.starts)!r})
            protocol_path = Path({str(self.protocol)!r})
            responses = {self.responses!r}
            existing_threads = {existing_threads or {}!r}
            command_event = {command_event!r}
            trace_events = {trace_events!r}
            busy_threads = set({sorted(busy_threads or set())!r})
            if arguments and arguments[0] == "app-server":
                with starts_path.open("a", encoding="utf-8") as stream:
                    stream.write(json.dumps({{"arguments": arguments}}) + "\\n")
                turn_index = 0
                for line in sys.stdin:
                    if not line.strip():
                        continue
                    message = json.loads(line)
                    method = message.get("method")
                    request_id = message.get("id")
                    with protocol_path.open("a", encoding="utf-8") as stream:
                        stream.write(json.dumps(message) + "\\n")
                    if method == "initialize":
                        print(
                            json.dumps(
                                {{"id": request_id, "result": {{"userAgent": "fake"}}}}
                            ),
                            flush=True,
                        )
                    elif method == "initialized":
                        continue
                    elif method == "thread/list":
                        cwd_filter = message["params"].get("cwd", [])
                        if isinstance(cwd_filter, str):
                            cwd_filter = [cwd_filter]
                        data = [
                            {{
                                "id": thread_id,
                                "cwd": cwd,
                                "parentThreadId": None,
                            }}
                            for cwd, thread_id in existing_threads.items()
                            if cwd in cwd_filter
                        ]
                        print(json.dumps({{
                            "id": request_id,
                            "result": {{"data": data, "nextCursor": None}},
                        }}), flush=True)
                    elif method == "thread/resume":
                        thread_id = message["params"]["threadId"]
                        if thread_id in busy_threads:
                            print(json.dumps({{
                                "id": request_id,
                                "error": {{
                                    "code": -32000,
                                    "message": (
                                        f"thread {{thread_id}} already has an "
                                        "active writer"
                                    ),
                                }},
                            }}), flush=True)
                            continue
                        print(json.dumps({{
                            "id": request_id,
                            "result": {{
                                "thread": {{"id": thread_id}},
                                "instructionSources": ["AGENTS.md"],
                            }},
                        }}), flush=True)
                    elif method == "thread/start":
                        print(json.dumps({{
                            "id": request_id,
                            "result": {{
                                "thread": {{"id": {self.THREAD_ID!r}}},
                                "instructionSources": ["AGENTS.md"],
                            }},
                        }}), flush=True)
                    elif method == "turn/start":
                        params = message["params"]
                        thread_id = params["threadId"]
                        prompt = params["input"][0]["text"]
                        with calls_path.open("a", encoding="utf-8") as stream:
                            stream.write(json.dumps({{
                                "arguments": arguments,
                                "prompt": prompt,
                                "params": params,
                            }}) + "\\n")
                        response = responses[min(turn_index, len(responses) - 1)]
                        turn_id = f"turn-{{turn_index + 1}}"
                        print(json.dumps({{
                            "id": request_id,
                            "result": {{
                                "turn": {{
                                    "id": turn_id,
                                    "status": "inProgress",
                                    "items": [],
                                }}
                            }},
                        }}), flush=True)
                        if command_event is not None:
                            command, command_output = command_event
                            command_item = {{
                                "id": f"command-{{turn_index + 1}}",
                                "type": "commandExecution",
                                "command": command,
                                "commandActions": [],
                                "cwd": params.get("cwd", ""),
                                "status": "inProgress",
                            }}
                            print(json.dumps({{
                                "method": "item/started",
                                "params": {{
                                    "threadId": thread_id,
                                    "turnId": turn_id,
                                    "startedAtMs": 1,
                                    "item": command_item,
                                }},
                            }}), flush=True)
                            print(json.dumps({{
                                "method": "item/commandExecution/outputDelta",
                                "params": {{
                                    "threadId": thread_id,
                                    "turnId": turn_id,
                                    "itemId": command_item["id"],
                                    "delta": command_output,
                                }},
                            }}), flush=True)
                            command_item["status"] = "completed"
                            command_item["aggregatedOutput"] = command_output
                            command_item["exitCode"] = 0
                            print(json.dumps({{
                                "method": "item/completed",
                                "params": {{
                                    "threadId": thread_id,
                                    "turnId": turn_id,
                                    "completedAtMs": 1,
                                    "item": command_item,
                                }},
                            }}), flush=True)
                        if trace_events:
                            print(json.dumps({{
                                "method": "item/reasoning/summaryTextDelta",
                                "params": {{
                                    "threadId": thread_id,
                                    "turnId": turn_id,
                                    "itemId": f"reasoning-{{turn_index + 1}}",
                                    "summaryIndex": 0,
                                    "delta": "Inspecting the workspace.\\n",
                                }},
                            }}), flush=True)
                            print(json.dumps({{
                                "method": "turn/plan/updated",
                                "params": {{
                                    "threadId": thread_id,
                                    "turnId": turn_id,
                                    "explanation": "Verify before answering.",
                                    "plan": [{{
                                        "step": "Run focused checks",
                                        "status": "inProgress",
                                    }}],
                                }},
                            }}), flush=True)
                            print(json.dumps({{
                                "method": "turn/diff/updated",
                                "params": {{
                                    "threadId": thread_id,
                                    "turnId": turn_id,
                                    "diff": "diff --git a/a b/a\\n",
                                }},
                            }}), flush=True)
                        split_at = max(1, len(response) // 3)
                        for delta in (
                            response[:split_at],
                            response[split_at:split_at * 2],
                            response[split_at * 2:],
                        ):
                            if not delta:
                                continue
                            print(json.dumps({{
                                "method": "item/agentMessage/delta",
                                "params": {{
                                    "threadId": thread_id,
                                    "turnId": turn_id,
                                    "itemId": f"message-{{turn_index + 1}}",
                                    "delta": delta,
                                }},
                            }}), flush=True)
                        print(json.dumps({{
                            "method": "item/completed",
                            "params": {{
                                "threadId": thread_id,
                                "turnId": turn_id,
                                "completedAtMs": 1,
                                "item": {{
                                    "id": f"message-{{turn_index + 1}}",
                                    "type": "agentMessage",
                                    "text": response,
                                    "phase": "final_answer",
                                }},
                            }},
                        }}), flush=True)
                        print(json.dumps({{
                            "method": "turn/completed",
                            "params": {{
                            "threadId": thread_id,
                                "turn": {{
                                    "id": turn_id,
                                    "status": "completed",
                                    "items": [],
                                    "error": None,
                                }},
                            }},
                        }}), flush=True)
                        turn_index += 1
                    elif method == "turn/steer":
                        print(json.dumps({{
                            "id": request_id,
                            "result": {{"turnId": message["params"]["expectedTurnId"]}},
                        }}), flush=True)
                    elif method == "turn/interrupt":
                        print(json.dumps({{"id": request_id, "result": {{}}}}), flush=True)
                    elif method == "thread/goal/get":
                        print(json.dumps({{"id": request_id, "result": {{"goal": None}}}}), flush=True)
                    elif method == "thread/goal/set":
                        print(json.dumps({{
                            "id": request_id,
                            "result": {{"goal": {{
                                "threadId": message["params"]["threadId"],
                                "objective": message["params"].get("objective", ""),
                                "status": message["params"].get("status", "active"),
                            }}}},
                        }}), flush=True)
                raise SystemExit(0)

            output_index = arguments.index("--output-last-message") + 1
            output_path = Path(arguments[output_index])
            prompt = sys.stdin.read()
            call_index = 0
            if calls_path.exists():
                call_index = len(
                    [
                        line
                        for line in calls_path.read_text(
                            encoding="utf-8"
                        ).splitlines()
                        if line
                    ]
                )
            with calls_path.open("a", encoding="utf-8") as stream:
                stream.write(
                    json.dumps({{"arguments": arguments, "prompt": prompt}})
                    + "\\n"
                )
            response = responses[min(call_index, len(responses) - 1)]
            output_path.write_text(response, encoding="utf-8")
            if "--json" in arguments:
                print(
                    json.dumps(
                        {{
                            "type": "thread.started",
                            "thread_id": {self.THREAD_ID!r},
                        }}
                    )
                )
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

    def process_starts(self) -> list[dict[str, object]]:
        if not self.starts.exists():
            return []
        return [
            __import__("json").loads(line)
            for line in self.starts.read_text(encoding="utf-8").splitlines()
            if line
        ]

    def protocol_requests(self) -> list[dict[str, object]]:
        if not self.protocol.exists():
            return []
        return [
            __import__("json").loads(line)
            for line in self.protocol.read_text(encoding="utf-8").splitlines()
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
    def setUp(self):
        ENGINE.reset_inline_paste_state()

    def test_ordinary_turn_receives_live_legibility_without_a_second_call(self):
        session = ENGINE.ShellSession()
        prompt = ENGINE.build_native_codex_input(
            "Inspect the runtime and explain the failure.", session
        )
        self.assertIn("CORTEX LIVE LEGIBILITY CONTRACT", prompt)
        self.assertIn("before the first tool call", prompt)
        self.assertIn("do not start an autonomous reflection", prompt)
        self.assertIn("ask the critical question internally", prompt)
        self.assertIn("test the hidden premise or failure case", prompt)
        self.assertIn("Do not manufacture a ritual for a simple direct answer", prompt)
        self.assertIn(
            "CURRENT HUMAN REQUEST\nInspect the runtime and explain the failure.",
            prompt,
        )

    def test_inline_paste_placeholder_expands_inside_surrounding_text(self):
        label = ENGINE.register_inline_paste("riga uno\nriga due")
        self.assertEqual(label, "[PASTED BLOCK 1]")
        self.assertEqual(
            ENGINE.expand_inline_pastes(f"qui ti incollo {label} capito?"),
            "qui ti incollo riga uno\nriga due capito?",
        )
        self.assertEqual(ENGINE.INLINE_PASTE_BLOCKS, {})

    def test_inline_paste_labels_are_numbered(self):
        self.assertEqual(ENGINE.register_inline_paste("uno"), "[PASTED BLOCK 1]")
        self.assertEqual(ENGINE.register_inline_paste("due"), "[PASTED BLOCK 2]")

    def test_multiline_block_preserves_every_pasted_line(self):
        lines = iter(["prima riga", "seconda riga", "terza riga", ".end"])
        with contextlib.redirect_stdout(io.StringIO()):
            message = ENGINE.read_multiline_block(3, lambda _prompt: next(lines))
        self.assertEqual(
            message,
            "prima riga\nseconda riga\nterza riga",
        )

    def test_automatic_multiline_paste_preserves_content_without_markers(self):
        self.assertEqual(
            ENGINE.normalize_pasted_text("prima\r\nseconda\n"),
            "prima\nseconda",
        )

    def test_automatic_multiline_paste_compacts_only_terminal_display(self):
        output = io.StringIO()
        compacted = ENGINE.compact_multiline_echo(
            "prima riga\nseconda riga",
            "cortex$ ",
            "[PASTED BLOCK 4]",
            output=output,
            columns=80,
            enabled=True,
        )
        rendered = output.getvalue()
        self.assertTrue(compacted)
        self.assertIn("cortex$ [PASTED BLOCK 4]", rendered)
        self.assertNotIn("prima riga", rendered)
        self.assertNotIn("seconda riga", rendered)

    def test_gnu_readline_enables_bracketed_paste(self):
        class FakeReadline:
            __doc__ = "GNU readline"

            def __init__(self):
                self.bindings = []

            def set_completer(self, _value):
                pass

            def set_completer_delims(self, _value):
                pass

            def parse_and_bind(self, value):
                self.bindings.append(value)

        fake_readline = FakeReadline()
        with mock.patch.object(ENGINE, "readline", fake_readline):
            ENGINE.configure_line_editor()
        self.assertIn("set enable-bracketed-paste on", fake_readline.bindings)

    def test_paste_command_submits_one_complete_multiline_turn(self):
        with FakeCodex("received") as fake:
            environment = os.environ.copy()
            environment["MDOS_CODEX_BIN"] = str(fake.executable)
            environment["MDOS_PROMPT_COLOR"] = "never"
            result = subprocess.run(
                [sys.executable, str(ENGINE_PATH)],
                input="/paste\nprima riga\nseconda riga\n.end\nexit\n",
                cwd=PROJECT_ROOT,
                env=environment,
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            requests = fake.requests()
            self.assertEqual(len(requests), 1)
            self.assertIn("CORTEX LIVE LEGIBILITY CONTRACT", requests[0]["prompt"])
            self.assertTrue(
                requests[0]["prompt"].endswith(
                    "CURRENT HUMAN REQUEST\nprima riga\nseconda riga"
                )
            )

    def test_default_program_uses_codex_native_agents_discovery_without_duplication(
        self,
    ):
        runtime = ENGINE.load_runtime()
        program = ENGINE.load_program(ENGINE.DEFAULT_AGENT_REFERENCE, runtime)
        self.assertEqual(runtime.provider, "codex")
        self.assertEqual(program.program_id, "md-os")
        self.assertEqual(program.kind, "agent-dispatch")
        self.assertIn("Route to `answer`", program.instructions)
        self.assertNotIn("Stable repository purpose", program.instructions)

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
        with FakeCodex(answer) as fake:
            result = run_console(["che cosa è un tensore?"], fake)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, f"{answer}\n")
            requests = fake.requests()
            self.assertEqual(len(requests), 1)
            self.assertEqual(requests[0]["arguments"][:2], ["app-server", "--listen"])
            self.assertNotIn("effort", requests[0]["params"])
            self.assertNotIn("model", requests[0]["params"])
            self.assertEqual(
                requests[0]["params"]["approvalPolicy"], "never"
            )
            self.assertEqual(
                requests[0]["params"]["sandboxPolicy"]["type"],
                "dangerFullAccess",
            )
            thread_start = next(
                message
                for message in fake.protocol_requests()
                if message.get("method") == "thread/start"
            )
            self.assertEqual(
                thread_start["params"]["approvalPolicy"], "never"
            )
            self.assertEqual(
                thread_start["params"]["sandbox"], "danger-full-access"
            )
            self.assertEqual(len(fake.process_starts()), 1)
            self.assertEqual(requests[0]["prompt"], "che cosa è un tensore?")
            self.assertNotIn("MANDATORY RUNTIME OUTPUT CONTRACT", requests[0]["prompt"])
            self.assertNotIn("Stable repository purpose", requests[0]["prompt"])

    def test_active_turn_accepts_intermediate_steering_message(self):
        with FakeCodex("Updated result.") as fake, mock.patch.dict(
            os.environ,
            {"MDOS_CODEX_BIN": str(fake.executable)},
        ):
            client = ENGINE.CodexAppServerClient(ENGINE.load_runtime())
            steering = iter(["aggiungi anche i test", None])
            try:
                result = client.run_turn(
                    "implementa la modifica",
                    steering_reader=lambda: next(steering, None),
                )
                self.assertEqual(result.text, "Updated result.")
                for _ in range(20):
                    messages = fake.protocol_requests()
                    if any(item.get("method") == "turn/steer" for item in messages):
                        break
                    __import__("time").sleep(0.01)
            finally:
                client.close()
            steer = next(
                item
                for item in fake.protocol_requests()
                if item.get("method") == "turn/steer"
            )
            self.assertEqual(steer["params"]["expectedTurnId"], "turn-1")
            self.assertEqual(
                steer["params"]["input"],
                [{"type": "text", "text": "aggiungi anche i test"}],
            )

    def test_goal_slash_command_uses_app_server_goal_protocol(self):
        with FakeCodex() as fake:
            environment = os.environ.copy()
            environment["MDOS_CODEX_BIN"] = str(fake.executable)
            environment["MDOS_PROMPT_COLOR"] = "never"
            result = subprocess.run(
                [sys.executable, str(ENGINE_PATH)],
                input="/goal Keep tests green\nexit\n",
                cwd=PROJECT_ROOT,
                env=environment,
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            goal = next(
                item
                for item in fake.protocol_requests()
                if item.get("method") == "thread/goal/set"
            )
            self.assertEqual(goal["params"]["objective"], "Keep tests green")
            self.assertEqual(goal["params"]["status"], "active")

    def test_escape_requests_active_turn_interrupt(self):
        with FakeCodex("Stopped.") as fake, mock.patch.dict(
            os.environ, {"MDOS_CODEX_BIN": str(fake.executable)}
        ):
            client = ENGINE.CodexAppServerClient(ENGINE.load_runtime())
            keys = iter([ENGINE.STEERING_INTERRUPT, None])
            try:
                client.run_turn("long task", steering_reader=lambda: next(keys, None))
                for _ in range(20):
                    if any(item.get("method") == "turn/interrupt" for item in fake.protocol_requests()):
                        break
                    __import__("time").sleep(0.01)
            finally:
                client.close()
            interrupt = next(item for item in fake.protocol_requests() if item.get("method") == "turn/interrupt")
            self.assertEqual(interrupt["params"]["turnId"], "turn-1")

    def test_native_codex_answer_is_not_reexecuted_by_the_outer_shell(self):
        with FakeCodex("AGENT: os\nprintf semantic-ok") as fake:
            result = run_console(["produce the semantic marker"], fake)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, "AGENT: os\nprintf semantic-ok\n")
            self.assertNotIn("COMMAND:", result.stderr)

    def test_codex_tool_output_preserves_terminal_line_breaks(self):
        with FakeCodex(
            "Process inspection complete.",
            command_event=("ps -eo pid,comm", "PID COMMAND\n1 init\n2 worker\n"),
        ) as fake:
            result = run_console(["show the processes"], fake)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("PID COMMAND\n1 init\n2 worker\n", result.stdout)
            self.assertIn("Process inspection complete.\n", result.stdout)
            self.assertIn("CODEX COMMAND: ps -eo pid,comm", result.stderr)

    def test_full_trace_renders_reasoning_plan_and_diff_readback(self):
        with FakeCodex("Verified.", trace_events=True) as fake:
            result = run_console(["inspect and verify"], fake)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("CODEX REASONING:\nInspecting the workspace.", result.stderr)
            self.assertIn("CODEX PLAN STATUS:", result.stderr)
            self.assertIn("[inProgress] Run focused checks", result.stderr)
            self.assertIn("CODEX DIFF:\ndiff --git a/a b/a", result.stderr)
            self.assertEqual(fake.requests()[0]["params"]["summary"], "auto")

    def test_repl_preserves_codex_thread_and_observes_native_shell_events(self):
        responses = [
            "Hai eseguito printf shell-memory-ok.",
            "L'ultimo comando nativo è printf shell-memory-ok.",
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
            self.assertEqual(first_arguments[:2], ["app-server", "--listen"])
            self.assertEqual(second_arguments, first_arguments)
            self.assertEqual(len(fake.process_starts()), 1)
            self.assertNotIn("effort", requests[0]["params"])
            self.assertNotIn("effort", requests[1]["params"])
            self.assertEqual(requests[0]["params"]["summary"], "auto")
            self.assertEqual(
                requests[0]["params"]["threadId"], FakeCodex.THREAD_ID
            )
            self.assertEqual(
                requests[1]["params"]["threadId"], FakeCodex.THREAD_ID
            )
            self.assertIn('"origin":"native-input"', requests[0]["prompt"])
            self.assertIn('"command":"printf shell-memory-ok"', requests[0]["prompt"])
            self.assertIn('"output":"shell-memory-ok"', requests[0]["prompt"])
            self.assertIn("che cosa ho appena fatto?", requests[0]["prompt"])
            self.assertIn("qual è l'ultimo comando nativo?", requests[1]["prompt"])
            self.assertNotIn("MD-OS SHELL OBSERVATIONS", requests[1]["prompt"])
            self.assertIn(
                "CORTEX LIVE LEGIBILITY CONTRACT", requests[1]["prompt"]
            )
            self.assertTrue(
                requests[1]["prompt"].endswith(
                    "CURRENT HUMAN REQUEST\nqual è l'ultimo comando nativo?"
                )
            )
            self.assertNotIn("Stable repository purpose", requests[1]["prompt"])
            methods = [
                message.get("method") for message in fake.protocol_requests()
            ]
            self.assertEqual(methods.count("thread/list"), 1)
            self.assertEqual(methods.count("thread/start"), 1)

    def test_repl_resumes_the_latest_thread_for_each_current_workspace(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            first = root / "first"
            second = root / "second"
            first.mkdir()
            second.mkdir()
            first_thread = "01900000-0000-7000-8000-000000000011"
            second_thread = "01900000-0000-7000-8000-000000000022"
            with FakeCodex(
                ["first answer", "second answer", "first again"],
                existing_threads={
                    str(first): first_thread,
                    str(second): second_thread,
                },
            ) as fake:
                environment = os.environ.copy()
                environment["MDOS_CODEX_BIN"] = str(fake.executable)
                environment["MDOS_PROMPT_COLOR"] = "never"
                result = subprocess.run(
                    [sys.executable, str(ENGINE_PATH)],
                    input=(
                        f"cd {first}\nwhat happened here?\n"
                        f"cd {second}\nwhat happened there?\n"
                        f"cd {first}\ncontinue the first workspace\nexit\n"
                    ),
                    cwd=root,
                    env=environment,
                    check=False,
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=30,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                requests = fake.requests()
                self.assertEqual(
                    [request["params"]["threadId"] for request in requests],
                    [first_thread, second_thread, first_thread],
                )
                methods = [
                    message.get("method") for message in fake.protocol_requests()
                ]
                self.assertEqual(methods.count("thread/list"), 2)
                self.assertEqual(methods.count("thread/resume"), 2)
                self.assertEqual(methods.count("thread/start"), 0)

    def test_busy_existing_thread_reports_conflict_without_forking_history(self):
        with tempfile.TemporaryDirectory() as temporary:
            cwd = str(Path(temporary).resolve())
            busy = "01900000-0000-7000-8000-000000000099"
            with FakeCodex(
                "fallback works",
                existing_threads={cwd: busy},
                busy_threads={busy},
            ) as fake:
                environment = os.environ.copy()
                environment["MDOS_CODEX_BIN"] = str(fake.executable)
                environment["MDOS_PROMPT_COLOR"] = "never"
                result = subprocess.run(
                    [sys.executable, str(ENGINE_PATH)],
                    input="continue here\nexit\n",
                    cwd=cwd,
                    env=environment,
                    check=False,
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=30,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("Attach to the shared Cortex session", result.stderr)
                methods = [
                    message.get("method") for message in fake.protocol_requests()
                ]
                self.assertEqual(methods.count("thread/resume"), 1)
                self.assertEqual(methods.count("thread/start"), 0)

    def test_shared_session_name_is_stable_and_workspace_specific(self):
        first = LAUNCHER.shared_session_name(Path("/tmp/project-a"))
        second = LAUNCHER.shared_session_name(Path("/tmp/project-b"))
        self.assertEqual(first, LAUNCHER.shared_session_name(Path("/tmp/project-a")))
        self.assertRegex(first, r"^cortex-project-a-[0-9a-f]{12}$")
        self.assertNotEqual(first, second)

    def test_interactive_launcher_uses_tmux_unless_already_in_shared_session(self):
        with mock.patch.dict(os.environ, {}, clear=False), mock.patch.object(
            LAUNCHER.shutil, "which", return_value="/usr/bin/tmux"
        ), mock.patch.object(LAUNCHER.sys.stdin, "isatty", return_value=True), mock.patch.object(
            LAUNCHER.sys.stdout, "isatty", return_value=True
        ):
            os.environ.pop("MDOS_SHARED_SESSION_ACTIVE", None)
            os.environ.pop("MDOS_SHARED_SESSION", None)
            self.assertTrue(LAUNCHER.should_share_interactive_shell([]))
            os.environ["MDOS_SHARED_SESSION_ACTIVE"] = "1"
            self.assertFalse(LAUNCHER.should_share_interactive_shell([]))

    def test_shared_session_can_be_disabled_explicitly(self):
        with mock.patch.dict(os.environ, {"MDOS_SHARED_SESSION": "never"}):
            self.assertFalse(LAUNCHER.should_share_interactive_shell([]))

    def test_exec_backend_remains_an_explicit_compatibility_path(self):
        responses = [
            "AGENT: answer\nprima",
            "AGENT: answer\nseconda",
        ]
        with FakeCodex(responses) as fake:
            environment = os.environ.copy()
            environment["MDOS_CODEX_BIN"] = str(fake.executable)
            environment["MDOS_CODEX_BACKEND"] = "exec"
            environment["MDOS_REASONING_EFFORT"] = "low"
            environment["MDOS_PROMPT_COLOR"] = "never"
            result = subprocess.run(
                [sys.executable, str(ENGINE_PATH)],
                input="prima domanda?\nseconda domanda?\nexit\n",
                cwd=PROJECT_ROOT,
                env=environment,
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            requests = fake.requests()
            self.assertEqual(len(requests), 2)
            self.assertEqual(requests[0]["arguments"][0], "exec")
            self.assertIn("resume", requests[1]["arguments"])
            self.assertIn(
                'model_reasoning_effort="low"', requests[1]["arguments"]
            )
            self.assertEqual(fake.process_starts(), [])

    def test_inspect_reports_persistent_fast_codex_backend(self):
        with FakeCodex() as fake:
            result = run_console(["--inspect"], fake)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("codex_backend=app-server", result.stdout)
            self.assertIn("codex_reasoning_effort=default", result.stdout)
            self.assertEqual(fake.process_starts(), [])

    def test_prompt_matches_native_shape_and_completion(self):
        plain = ENGINE.native_fallback_prompt(use_color=False)
        colored = ENGINE.native_fallback_prompt(use_color=True)
        self.assertNotIn("\x1b[", plain)
        self.assertIn("\x01\x1b[01;32m\x02", colored)
        visible = re.sub(r"\x01\x1b\[[0-9;]*m\x02", "", colored)
        self.assertEqual(visible, plain)
        commands = ENGINE.completion_candidates("pyth", True)
        self.assertTrue(any(candidate.startswith("python") for candidate in commands))

    def test_codex_color_policy_and_diff_rendering(self):
        with mock.patch.dict(
            os.environ,
            {"MDOS_CODEX_COLOR": "always"},
            clear=False,
        ):
            styled = ENGINE.codex_styled(
                "CODEX COMMAND: npm test", ENGINE.ANSI_YELLOW, io.StringIO()
            )
            self.assertEqual(
                styled,
                "\033[33mCODEX COMMAND: npm test\033[0m",
            )
            diff = ENGINE.render_colored_diff(
                "@@ -1 +1 @@\n-old\n+new\n", io.StringIO()
            )
            self.assertIn("\033[36m@@ -1 +1 @@\033[0m", diff)
            self.assertIn("\033[31m-old\033[0m", diff)
            self.assertIn("\033[32m+new\033[0m", diff)

        with mock.patch.dict(
            os.environ,
            {"MDOS_CODEX_COLOR": "never"},
            clear=False,
        ):
            self.assertEqual(
                ENGINE.codex_styled("plain", ENGINE.ANSI_RED, io.StringIO()),
                "plain",
            )

        with mock.patch.dict(
            os.environ,
            {"MDOS_CODEX_COLOR": "auto", "NO_COLOR": "1"},
            clear=False,
        ):
            self.assertFalse(ENGINE.codex_color_enabled(io.StringIO()))

    def test_noninteractive_codex_approval_fails_closed(self):
        client = object.__new__(ENGINE.CodexAppServerClient)
        replies: list[dict[str, object]] = []
        client._send = replies.append
        with contextlib.redirect_stderr(io.StringIO()):
            client._handle_server_request(
                {
                    "id": 77,
                    "method": "item/commandExecution/requestApproval",
                    "params": {
                        "threadId": FakeCodex.THREAD_ID,
                        "turnId": "turn-1",
                        "itemId": "command-1",
                        "startedAtMs": 1,
                        "command": "touch outside",
                        "cwd": "/tmp",
                    },
                }
            )
        self.assertEqual(
            replies,
            [{"id": 77, "result": {"decision": "decline"}}],
        )

    def test_codex_protocol_errors_are_visible(self):
        client = object.__new__(ENGINE.CodexAppServerClient)
        output = io.StringIO()
        with contextlib.redirect_stderr(output):
            handled = client._render_protocol_notice(
                "error",
                {
                    "error": {"message": "sandbox setup failed"},
                    "willRetry": False,
                },
            )
        self.assertTrue(handled)
        self.assertEqual(output.getvalue(), "CODEX ERROR: sandbox setup failed\n")

    def test_answer_stream_hides_routing_header_and_preserves_lines(self):
        streamer = ENGINE.DispatchAnswerStreamer()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            streamer.feed("AGENT:")
            self.assertEqual(output.getvalue(), "")
            streamer.feed(" answer\nprima riga\n")
            streamer.feed("seconda riga")
            streamed = streamer.finish(
                "AGENT: answer\nprima riga\nseconda riga"
            )
        self.assertTrue(streamed)
        self.assertEqual(output.getvalue(), "prima riga\nseconda riga\n")

        command_streamer = ENGINE.DispatchAnswerStreamer()
        command_output = io.StringIO()
        with contextlib.redirect_stdout(command_output):
            command_streamer.feed("AGENT: os\nprintf ok")
            streamed = command_streamer.finish("AGENT: os\nprintf ok")
        self.assertFalse(streamed)
        self.assertEqual(command_output.getvalue(), "")

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

    def test_codex_text_cannot_silently_change_the_parent_shell_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary).resolve()
            child = parent / "semantic child"
            child.mkdir()
            response = f"cd {shlex.quote(str(child))}"
            with FakeCodex(response) as fake:
                environment = os.environ.copy()
                environment["MDOS_CODEX_BIN"] = str(fake.executable)
                environment["MDOS_PROMPT_COLOR"] = "never"
                result = subprocess.run(
                    [sys.executable, str(ENGINE_PATH)],
                    input="vai nella cartella indicata\npwd\nexit\n",
                    cwd=parent,
                    env=environment,
                    check=False,
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=30,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(response, result.stdout)
                self.assertIn(str(parent), result.stdout)
                self.assertNotIn(f"COMMAND: {response}", result.stderr)
                self.assertEqual(len(fake.requests()), 1)

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
            self.assertIn("MD-OS cortex agentic shell", result.stdout)
            self.assertIn(
                "MD-OS cortex agentic shell\n"
                "Native commands run directly; natural language enters the full Codex loop.\n"
                "Use exit or Ctrl-D to leave.\n",
                result.stdout,
            )
            self.assertNotIn("Codex uses full host access", result.stdout)
            self.assertNotIn("While Codex is working", result.stdout)
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
            self.assertIn("universal_command=cortex", result.stdout)
            self.assertIn("compatibility_alias=mdos", result.stdout)

    def test_public_cortex_command_opens_the_agentic_shell(self):
        with FakeCodex() as fake, tempfile.TemporaryDirectory() as temporary:
            environment = os.environ.copy()
            environment["MDOS_CODEX_BIN"] = str(fake.executable)
            environment["MDOS_PROMPT_COLOR"] = "never"
            result = subprocess.run(
                [sys.executable, str(LAUNCHER_PATH)],
                input="pwd\nexit\n",
                cwd=temporary,
                env=environment,
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("MD-OS cortex agentic shell", result.stdout)
            self.assertIn(str(Path(temporary)), result.stdout)

    def test_mdos_compatibility_alias_opens_the_agentic_shell(self):
        with FakeCodex() as fake, tempfile.TemporaryDirectory() as temporary:
            environment = os.environ.copy()
            environment["MDOS_CODEX_BIN"] = str(fake.executable)
            environment["MDOS_PROMPT_COLOR"] = "never"
            result = subprocess.run(
                [sys.executable, str(COMPATIBILITY_LAUNCHER_PATH)],
                input="pwd\nexit\n",
                cwd=temporary,
                env=environment,
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("MD-OS cortex agentic shell", result.stdout)


if __name__ == "__main__":
    unittest.main()
