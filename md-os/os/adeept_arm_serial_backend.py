#!/usr/bin/env python3
"""Single-transaction serial backend for the bounded Adeept arm connector."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

import serial


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", required=True)
    parser.add_argument("--baud", type=int, required=True)
    parser.add_argument("--byte-hex")
    parser.add_argument("--commands-json")
    parser.add_argument("--handshake", action="store_true")
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--interval-ms", type=int, default=250)
    parser.add_argument("--settle-ms", type=int, default=150)
    parser.add_argument("--read-ms", type=int, default=150)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not os.path.exists(args.port):
        raise RuntimeError(f"SERIAL_PORT_MISSING: {args.port}")
    command = None
    entries = None
    if args.commands_json:
        try:
            entries = json.loads(args.commands_json)
        except json.JSONDecodeError as exc:
            raise RuntimeError("COMMANDS_JSON_INVALID") from exc
        if not isinstance(entries, list) or not 1 <= len(entries) <= 20:
            raise RuntimeError("COMMAND_SEQUENCE_LENGTH_OUT_OF_RANGE")
    elif args.byte_hex:
        try:
            command = bytes.fromhex(args.byte_hex)
        except ValueError as exc:
            raise RuntimeError("COMMAND_HEX_INVALID") from exc
        if len(command) != 1:
            raise RuntimeError("EXACTLY_ONE_COMMAND_BYTE_REQUIRED")
        if args.count < 1 or args.count > 10:
            raise RuntimeError("COMMAND_COUNT_OUT_OF_RANGE")
    else:
        raise RuntimeError("COMMAND_REQUIRED")
    if args.baud not in (9600, 19200, 38400, 57600, 115200):
        raise RuntimeError("BAUD_NOT_ALLOWLISTED")

    controller = serial.Serial()
    controller.port = args.port
    controller.baudrate = args.baud
    controller.bytesize = serial.EIGHTBITS
    controller.parity = serial.PARITY_NONE
    controller.stopbits = serial.STOPBITS_ONE
    controller.timeout = max(args.read_ms, 0) / 1000
    controller.write_timeout = 1
    # Avoid an intentional DTR/RTS assertion. Some Arduino-compatible boards
    # reset when these lines transition; the residual first-open risk is
    # surfaced by the higher-level connector and never hidden.
    controller.dtr = False
    controller.rts = False

    started_at = time.time()
    response = b""
    written = 0
    try:
        controller.open()
        if args.settle_ms > 0:
            time.sleep(args.settle_ms / 1000)
        handshake_received = False
        if args.handshake:
            handshake = (json.dumps({"start": ["setup"]}, separators=(",", ":")) + "\n").encode()
            written += controller.write(handshake)
            controller.flush()
            deadline = time.monotonic() + max(args.read_ms, 500) / 1000
            while time.monotonic() < deadline:
                line = controller.readline()
                if line:
                    response += line
                    if b"succes" in line:
                        handshake_received = True
                        break
            if not handshake_received:
                raise RuntimeError("ADEEPT_BLOCK_PY_HANDSHAKE_FAILED")
        if entries is not None:
            for entry in entries:
                payload = entry.get("command", entry) if isinstance(entry, dict) else entry
                settle_ms = entry.get("settle_ms", args.interval_ms) if isinstance(entry, dict) else args.interval_ms
                encoded = (json.dumps(payload, separators=(",", ":")) + "\n").encode()
                written += controller.write(encoded)
                controller.flush()
                if settle_ms > 0:
                    time.sleep(settle_ms / 1000)
        else:
            for index in range(args.count):
                written += controller.write(command)
                controller.flush()
                if index + 1 < args.count and args.interval_ms > 0:
                    time.sleep(args.interval_ms / 1000)
        if args.read_ms > 0:
            response = controller.read(256)
    finally:
        if controller.is_open:
            controller.close()

    print(json.dumps({
        "ok": True,
        "mode": "adeept_arm_block_py_transaction" if entries is not None else "adeept_arm_bounded_transaction",
        "port": args.port,
        "baud": args.baud,
        "command_hex": args.byte_hex.lower() if args.byte_hex else None,
        "command_count": len(entries) if entries is not None else args.count,
        "bytes_written": written,
        "response_hex": response.hex(),
        "handshake_received": handshake_received if args.handshake else None,
        "duration_ms": round((time.time() - started_at) * 1000),
        "dtr_requested": False,
        "rts_requested": False,
    }))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # pragma: no cover - exercised through JS wrapper
        print(json.dumps({"ok": False, "error": str(error)}), file=sys.stderr)
        raise SystemExit(1)
