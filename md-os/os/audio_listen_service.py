#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from faster_whisper import WhisperModel

ROOT = Path(
    os.environ.get("MDOS_WORKSPACE_ROOT")
    or os.environ.get("MDOS_WORKSPACE_ROOT")
    or Path(__file__).resolve().parents[2]
).resolve()
BOUNDARY_ROOT = Path(
    os.environ.get("MDOS_ROOT")
    or ROOT / "md-os"
).resolve()
OPS_DIR = BOUNDARY_ROOT / "ops"
SERVICES_DIR = OPS_DIR / "services"
HARDWARE_DIR = OPS_DIR / "local" / "hardware"
AUDIO_DIR = HARDWARE_DIR / "audio"

SERVICE_ID = "audio_listen_service"
STATUS_FILE = SERVICES_DIR / f"{SERVICE_ID}.status.json"
PID_FILE = SERVICES_DIR / f"{SERVICE_ID}.pid"
STOP_FILE = SERVICES_DIR / f"{SERVICE_ID}.stop.json"
LOG_FILE = SERVICES_DIR / f"{SERVICE_ID}.log"
LOCK_FILE = SERVICES_DIR / f"{SERVICE_ID}.lock"
LATEST_WAV = AUDIO_DIR / "audio_listen_latest.wav"
TRANSCRIPTS_FILE = AUDIO_DIR / "audio_listen_transcripts.ndjson"
ACTIONS_FILE = HARDWARE_DIR / "actions.ndjson"

DEFAULT_SOURCE = os.environ.get("MDOS_STT_SOURCE", "default")
DEFAULT_CHUNK_MS = int(os.environ.get("MDOS_LISTEN_CHUNK_MS", "3000"))
DEFAULT_PAUSE_MS = int(os.environ.get("MDOS_LISTEN_PAUSE_MS", "150"))
DEFAULT_MODEL = os.environ.get("MDOS_LISTEN_MODEL", "tiny")
DEFAULT_HF_HOME = os.environ.get("MDOS_STT_CACHE", str(ROOT / ".cache" / "mdos-stt"))
FFMPEG = os.environ.get("MDOS_FFMPEG", "ffmpeg")

stop_requested = False
lock_handle = None


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_dirs() -> None:
    SERVICES_DIR.mkdir(parents=True, exist_ok=True)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def short_text(value: object) -> str:
    return " ".join(str(value or "").split()).strip()


def write_json(path: Path, payload: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def append_line(path: Path, payload: dict) -> None:
    with path.open("a", encoding="utf-8") as handle:
      handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def log(event: str, **details: object) -> None:
    ensure_dirs()
    payload = {
        "ts": now_iso(),
        "service_id": SERVICE_ID,
        "event": event,
        **details,
    }
    append_line(LOG_FILE, payload)
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def read_pid() -> int | None:
    try:
        return int(PID_FILE.read_text(encoding="utf-8").strip())
    except Exception:
        return None


def is_pid_alive(pid: int | None) -> bool:
    if not pid or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def is_service_process(pid: int | None) -> bool:
    if not is_pid_alive(pid):
        return False
    try:
        cmdline = Path(f"/proc/{pid}/cmdline").read_text(encoding="utf-8", errors="ignore").replace("\x00", " ")
        return "audio_listen_service.py" in cmdline
    except Exception:
        return True


def read_status() -> dict:
    status = {
        "schema_version": 1,
        "service_id": SERVICE_ID,
        "status": "stopped",
        "desired_state": "stopped",
        "pid": None,
        "started_at": None,
        "heartbeat_at": None,
        "chunk_ms": None,
        "pause_ms": None,
        "model": None,
        "source": None,
        "last_capture_at": None,
        "last_transcript_at": None,
        "last_transcript": None,
        "transcript_count": 0,
    }
    if STATUS_FILE.exists():
        try:
            status.update(json.loads(STATUS_FILE.read_text(encoding="utf-8")))
        except Exception:
            pass
    pid = read_pid()
    pid_alive = is_pid_alive(pid)
    pid_matches = is_service_process(pid)
    status.update(
        {
            "pid": pid,
            "pid_alive": pid_alive,
            "pid_matches_service": pid_matches,
            "stop_requested": STOP_FILE.exists(),
            "observed_status": "running" if pid_matches else short_text(status.get("status")) or "stopped",
        }
    )
    return status


def write_status(payload: dict) -> None:
    ensure_dirs()
    base = read_status()
    base.update(payload)
    base["schema_version"] = 1
    base["service_id"] = SERVICE_ID
    base["updated_at"] = now_iso()
    write_json(STATUS_FILE, base)


def acquire_lock() -> None:
    global lock_handle
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    lock_handle = LOCK_FILE.open("w", encoding="utf-8")
    try:
        fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        raise SystemExit("SERVICE_ALREADY_RUNNING") from exc


def release_lock() -> None:
    global lock_handle
    if lock_handle is not None:
        try:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
        except Exception:
            pass
        try:
            lock_handle.close()
        except Exception:
            pass
        lock_handle = None


def write_pid() -> None:
    PID_FILE.write_text(f"{os.getpid()}\n", encoding="utf-8")


def remove_file(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def sleep_interruptible(ms: int) -> None:
    deadline = time.time() + (ms / 1000.0)
    while time.time() < deadline and not stop_requested and not STOP_FILE.exists():
        time.sleep(min(0.25, max(0.0, deadline - time.time())))


def capture_chunk(source: str, chunk_ms: int) -> Path:
    ensure_dirs()
    temp = AUDIO_DIR / "audio_listen_latest.tmp.wav"
    cmd = [
        FFMPEG,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "pulse",
        "-i",
        source,
        "-t",
        f"{chunk_ms / 1000.0:.3f}",
        "-ac",
        "1",
        "-ar",
        "16000",
        str(temp),
    ]
    env = os.environ.copy()
    env.setdefault("HF_HOME", DEFAULT_HF_HOME)
    result = subprocess.run(
        cmd,
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "ffmpeg capture failed").strip())
    temp.replace(LATEST_WAV)
    return LATEST_WAV


def transcribe(model: WhisperModel, audio_path: Path) -> tuple[str, str, float]:
    segments, info = model.transcribe(
        str(audio_path),
        language="it",
        vad_filter=False,
        beam_size=1,
    )
    text = "".join(segment.text for segment in segments).strip()
    return text, short_text(info.language), float(getattr(info, "language_probability", 0.0) or 0.0)


def append_transcript_record(record: dict) -> None:
    append_line(TRANSCRIPTS_FILE, record)
    append_line(ACTIONS_FILE, record)


def run_service(chunk_ms: int, pause_ms: int, source: str, model_name: str, once: bool = False) -> dict:
    global stop_requested
    stop_requested = False
    ensure_dirs()
    remove_file(STOP_FILE)
    acquire_lock()
    write_pid()
    start_at = now_iso()
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    transcript_count = 0
    last_record = None

    def handle_signal(signum, _frame) -> None:
        nonlocal start_at
        _ = signum
        global stop_requested
        stop_requested = True
        write_status(
            {
                "status": "stopping",
                "desired_state": "stopped",
                "stop_requested_at": now_iso(),
            }
        )

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    log("started", pid=os.getpid(), chunk_ms=chunk_ms, pause_ms=pause_ms, source=source, model=model_name)
    write_status(
        {
            "status": "running",
            "desired_state": "running",
            "pid": os.getpid(),
            "started_at": start_at,
            "heartbeat_at": now_iso(),
            "chunk_ms": chunk_ms,
            "pause_ms": pause_ms,
            "model": model_name,
            "source": source,
            "last_capture_at": None,
            "last_transcript_at": None,
            "last_transcript": None,
            "last_error": None,
            "stop_requested_at": None,
            "stopped_at": None,
            "stop_reason": None,
            "last_language": None,
            "last_language_probability": None,
            "transcript_count": 0,
        }
    )

    try:
        while not stop_requested and not STOP_FILE.exists():
            chunk_started = now_iso()
            try:
                audio_path = capture_chunk(source, chunk_ms)
                transcript, language, probability = transcribe(model, audio_path)
                transcript_count += 1
                last_record = {
                    "schema_version": 1,
                    "acted_at": now_iso(),
                    "connector_id": "audio_listen_service",
                    "category": "audio",
                    "action": "microphone_listen_chunk",
                    "requested_intent": "listen audio service",
                    "policy": "explicit_consent_audio_capture",
                    "selected_backend": "pulse+ffmpeg+faster-whisper",
                    "selected_source": source,
                    "chunk_ms": chunk_ms,
                    "model": model_name,
                    "language": language or "it",
                    "language_probability": round(probability, 3),
                    "transcript": transcript,
                    "audio_file": str(audio_path.relative_to(ROOT)),
                    "ok": True,
                }
                append_transcript_record(last_record)
                log("chunk_completed", transcript=transcript, chunk_ms=chunk_ms, language=language, language_probability=round(probability, 3))
                write_status(
                    {
                        "status": "running",
                        "desired_state": "running",
                        "pid": os.getpid(),
                        "started_at": start_at,
                        "heartbeat_at": now_iso(),
                        "chunk_ms": chunk_ms,
                        "pause_ms": pause_ms,
                        "model": model_name,
                        "source": source,
                        "last_capture_at": chunk_started,
                        "last_transcript_at": now_iso(),
                        "last_transcript": transcript,
                        "last_error": None,
                        "transcript_count": transcript_count,
                        "last_language": language,
                        "last_language_probability": round(probability, 3),
                    }
                )
            except Exception as exc:  # noqa: BLE001
                last_record = {
                    "schema_version": 1,
                    "acted_at": now_iso(),
                    "connector_id": "audio_listen_service",
                    "category": "audio",
                    "action": "microphone_listen_chunk",
                    "requested_intent": "listen audio service",
                    "policy": "explicit_consent_audio_capture",
                    "selected_backend": "pulse+ffmpeg+faster-whisper",
                    "selected_source": source,
                    "chunk_ms": chunk_ms,
                    "model": model_name,
                    "ok": False,
                    "error": short_text(exc),
                }
                append_transcript_record(last_record)
                log("chunk_failed", error=short_text(exc), chunk_ms=chunk_ms)
                write_status(
                    {
                        "status": "running",
                        "desired_state": "running",
                        "pid": os.getpid(),
                        "started_at": start_at,
                        "heartbeat_at": now_iso(),
                        "chunk_ms": chunk_ms,
                        "pause_ms": pause_ms,
                        "model": model_name,
                        "source": source,
                        "last_error": short_text(exc),
                        "transcript_count": transcript_count,
                    }
                )

            if once:
                break
            sleep_interruptible(pause_ms)
    finally:
        stop_reason = "stop_file" if STOP_FILE.exists() else "completed"
        log("stopped", pid=os.getpid(), reason=stop_reason)
        remove_file(PID_FILE)
        remove_file(STOP_FILE)
        write_status(
            {
                "status": "stopped",
                "desired_state": "stopped",
                "pid": None,
                "stopped_at": now_iso(),
                "stop_reason": stop_reason,
                "last_transcript": (last_record or {}).get("transcript"),
                "transcript_count": transcript_count,
            }
        )
        release_lock()

    return {
        "ok": True,
        "mode": "audio_listen_service_run_once" if once else "audio_listen_service_run",
        "service_id": SERVICE_ID,
        "status": read_status(),
        "last_record": last_record,
    }


def start_service(args: argparse.Namespace) -> None:
    current = read_status()
    if current.get("pid_matches_service"):
        print(json.dumps({"ok": True, "mode": "audio_listen_service_start", "already_running": True, "status": current}, ensure_ascii=False))
        return

    ensure_dirs()
    remove_file(STOP_FILE)
    log_file = LOG_FILE.open("a", encoding="utf-8")
    env = os.environ.copy()
    env.setdefault("HF_HOME", DEFAULT_HF_HOME)
    child = subprocess.Popen(
        [
            sys.executable,
            str(Path(__file__).resolve()),
            "run",
            "--chunk-ms",
            str(args.chunk_ms),
            "--pause-ms",
            str(args.pause_ms),
            "--source",
            args.source,
            "--model",
            args.model,
        ],
        cwd=str(ROOT),
        stdin=subprocess.DEVNULL,
        stdout=log_file,
        stderr=log_file,
        start_new_session=True,
        env=env,
    )
    log_file.close()
    PID_FILE.write_text(f"{child.pid}\n", encoding="utf-8")
    write_status(
        {
            "status": "starting",
            "desired_state": "running",
            "pid": child.pid,
            "started_at": now_iso(),
            "heartbeat_at": None,
            "chunk_ms": args.chunk_ms,
            "pause_ms": args.pause_ms,
            "model": args.model,
            "source": args.source,
            "last_capture_at": None,
            "last_transcript_at": None,
            "last_transcript": None,
            "last_error": None,
            "stop_requested_at": None,
            "stopped_at": None,
            "stop_reason": None,
            "last_language": None,
            "last_language_probability": None,
            "transcript_count": 0,
        }
    )
    log("start_requested", pid=child.pid, chunk_ms=args.chunk_ms, pause_ms=args.pause_ms, source=args.source, model=args.model)
    print(json.dumps(
        {
            "ok": True,
            "mode": "audio_listen_service_start",
            "service_id": SERVICE_ID,
            "pid": child.pid,
            "status_file": str(STATUS_FILE.relative_to(ROOT)),
            "log_file": str(LOG_FILE.relative_to(ROOT)),
        },
        ensure_ascii=False,
    ))


def stop_service() -> None:
    current = read_status()
    STOP_FILE.write_text(json.dumps({"schema_version": 1, "service_id": SERVICE_ID, "requested_at": now_iso()}, ensure_ascii=False) + "\n", encoding="utf-8")
    pid = current.get("pid")
    signaled = False
    if current.get("pid_matches_service"):
        try:
            os.kill(int(pid), signal.SIGTERM)
            signaled = True
        except Exception:
            signaled = False
    print(json.dumps(
        {
            "ok": True,
            "mode": "audio_listen_service_stop",
            "service_id": SERVICE_ID,
            "signaled": signaled,
            "status": read_status(),
        },
        ensure_ascii=False,
    ))


def print_status() -> None:
    print(json.dumps({"ok": True, "mode": "audio_listen_service_status", "service_id": SERVICE_ID, "status": read_status()}, ensure_ascii=False))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="audio_listen_service.py")
    sub = parser.add_subparsers(dest="command", required=True)

    start = sub.add_parser("start")
    start.add_argument("--chunk-ms", type=int, default=DEFAULT_CHUNK_MS)
    start.add_argument("--pause-ms", type=int, default=DEFAULT_PAUSE_MS)
    start.add_argument("--source", default=DEFAULT_SOURCE)
    start.add_argument("--model", default=DEFAULT_MODEL)

    stop = sub.add_parser("stop")
    sub.add_parser("status")

    run = sub.add_parser("run")
    run.add_argument("--chunk-ms", type=int, default=DEFAULT_CHUNK_MS)
    run.add_argument("--pause-ms", type=int, default=DEFAULT_PAUSE_MS)
    run.add_argument("--source", default=DEFAULT_SOURCE)
    run.add_argument("--model", default=DEFAULT_MODEL)
    run.add_argument("--once", action="store_true")

    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "start":
        start_service(args)
        return
    if args.command == "stop":
        stop_service()
        return
    if args.command == "status":
        print_status()
        return
    if args.command == "run":
        result = run_service(args.chunk_ms, args.pause_ms, args.source, args.model, once=args.once)
        print(json.dumps(result, ensure_ascii=False))
        return


if __name__ == "__main__":
    main()
