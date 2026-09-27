"""Locked, append-only storage for Cortex chronology, including sealed segments.

Record validation belongs to mdos-console. This module never rewrites a turn.
All cooperating readers and writers hold the same process lock. A manifest
atomically seals old files; the original conversation.ndjson remains in place.
"""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time

MANIFEST_NAME = "conversation.segments.json"
MAX_SEGMENTS = 4096


def _hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":")).encode()).hexdigest()


def _local(directory, relative):
    path = directory / relative
    if path.is_symlink() or not path.resolve().is_relative_to(directory.resolve()):
        raise RuntimeError("PRIVATE_CONVERSATION_PATH_ESCAPE")
    return path


@contextmanager
def file_lock(path, timeout=15.0):
    """An OS-owned lock, released on process exit; never unlink its inode."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.is_symlink():
        raise RuntimeError("PRIVATE_CONVERSATION_LOCK_PATH_ESCAPE")
    fd = os.open(path, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    acquired = False
    try:
        if os.name == "nt":
            import msvcrt
            if os.fstat(fd).st_size == 0:
                os.write(fd, b"\0")
            def acquire():
                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
            def release():
                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            def acquire():
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            def release():
                fcntl.flock(fd, fcntl.LOCK_UN)
        deadline = time.monotonic() + timeout
        while True:
            try:
                acquire()
                acquired = True
                break
            except (BlockingIOError, OSError) as error:
                if getattr(error, "errno", None) not in {11, 13, 35, 36}:
                    raise
                if time.monotonic() >= deadline:
                    raise RuntimeError("PRIVATE_CONVERSATION_LOCK_TIMEOUT") from error
                time.sleep(0.01)
        yield
    finally:
        if acquired:
            release()
        os.close(fd)


def _sync_directory(directory):
    if os.name != "nt":
        fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def _read_manifest(source):
    file = _local(source.parent, MANIFEST_NAME)
    if not file.exists():
        return None
    if file.stat().st_size > 2 * 1024 * 1024:
        raise RuntimeError("PRIVATE_CONVERSATION_MANIFEST_SIZE")
    try:
        manifest = json.loads(file.read_text(encoding="utf-8"))
        material = {k: v for k, v in manifest.items() if k != "manifest_hash"}
        if (set(manifest) != {"schema_version", "artifact_role", "sealed", "active", "manifest_hash"}
                or manifest["schema_version"] != 1
                or manifest["artifact_role"] != "private_conversation_segments"
                or manifest["manifest_hash"] != _hash(material)
                or not isinstance(manifest["sealed"], list)
                or not 1 <= len(manifest["sealed"]) < MAX_SEGMENTS):
            raise ValueError()
        for i, segment in enumerate([*manifest["sealed"], manifest["active"]]):
            expected = source.name if i == 0 else f"conversation-segments/{i:08d}.ndjson"
            keys = {"path", "record_count", "byte_count", "sha256"} if i < len(manifest["sealed"]) else {"path"}
            if set(segment) != keys or segment["path"] != expected:
                raise ValueError()
            _local(source.parent, segment["path"])
    except (OSError, ValueError, TypeError, KeyError, AttributeError) as error:
        raise RuntimeError("PRIVATE_CONVERSATION_MANIFEST_INVALID") from error
    return manifest


def read_lines(source, maximum_bytes, maximum_records):
    """Caller holds the lock; each segment stays bounded, sequence is global."""
    manifest = _read_manifest(source)
    entries = [*manifest["sealed"], manifest["active"]] if manifest else [{"path": source.name}]
    lines = []
    for entry in entries:
        path = _local(source.parent, entry["path"])
        if not path.exists() and manifest is None:
            return None
        if not path.is_file():
            raise RuntimeError("PRIVATE_CONVERSATION_SEGMENT_MISSING")
        if path.stat().st_size > maximum_bytes:
            raise RuntimeError("size_limit")
        data = path.read_bytes()
        if data and not data.endswith(b"\n"):
            raise RuntimeError("PRIVATE_CONVERSATION_PARTIAL_RECORD")
        rows = data.decode("utf-8").splitlines()
        if len(rows) > maximum_records:
            raise RuntimeError("record_limit")
        if "sha256" in entry and (entry["sha256"] != hashlib.sha256(data).hexdigest()
                or entry["byte_count"] != len(data) or entry["record_count"] != len(rows)):
            raise RuntimeError("PRIVATE_CONVERSATION_SEALED_SEGMENT_MISMATCH")
        lines.extend(rows)
    return lines


def append_line(source, serialized, maximum_bytes, maximum_records):
    """Caller validated the complete chain under lock. Seal before overflowing."""
    data = serialized.encode("utf-8")
    if len(data) > maximum_bytes:
        raise RuntimeError("PRIVATE_CONVERSATION_TURN_EXCEEDS_SEGMENT_BOUND")
    source.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    source.parent.chmod(0o700)
    manifest = _read_manifest(source)
    active = _local(source.parent, manifest["active"]["path"]) if manifest else source
    current = active.read_bytes() if active.exists() else b""
    if len(current) + len(data) > maximum_bytes or len(current.splitlines()) >= maximum_records:
        sealed = list(manifest["sealed"]) if manifest else []
        sealed.append({"path": str(active.relative_to(source.parent)).replace("\\", "/"),
                       "byte_count": len(current), "record_count": len(current.splitlines()),
                       "sha256": hashlib.sha256(current).hexdigest()})
        if len(sealed) >= MAX_SEGMENTS:
            raise RuntimeError("PRIVATE_CONVERSATION_SEGMENT_LIMIT")
        relative = f"conversation-segments/{len(sealed):08d}.ndjson"
        active = _local(source.parent, relative)
        active.parent.mkdir(mode=0o700, exist_ok=True)
        # An empty orphan may remain after an interrupted manifest publication.
        if active.exists() and active.stat().st_size:
            raise RuntimeError("PRIVATE_CONVERSATION_ORPHAN_SEGMENT")
        fd = os.open(active, os.O_CREAT | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0), 0o600)
        os.fsync(fd)
        os.close(fd)
        _sync_directory(active.parent)
        manifest = {"schema_version": 1, "artifact_role": "private_conversation_segments",
                    "sealed": sealed, "active": {"path": relative}}
        manifest["manifest_hash"] = _hash(manifest)
        fd, name = tempfile.mkstemp(prefix=".conversation-manifest-", dir=source.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(manifest, stream, ensure_ascii=False, sort_keys=True)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, _local(source.parent, MANIFEST_NAME))
            _sync_directory(source.parent)
        finally:
            if os.path.exists(name):
                os.unlink(name)
    fd = os.open(active, os.O_APPEND | os.O_CREAT | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        with os.fdopen(fd, "ab") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        active.chmod(0o600)
        _sync_directory(active.parent)
    except BaseException:
        # Never silently truncate/repair an interrupted append.
        raise
