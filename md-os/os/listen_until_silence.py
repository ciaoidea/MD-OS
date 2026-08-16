#!/usr/bin/env python3
from __future__ import annotations

import argparse
import collections
import math
import os
import sys
import wave
from pathlib import Path

import pyaudio


def rms16le(frame: bytes) -> float:
    if not frame:
        return 0.0
    count = len(frame) // 2
    if count <= 0:
        return 0.0
    total = 0
    for i in range(0, len(frame) - 1, 2):
        sample = int.from_bytes(frame[i : i + 2], byteorder="little", signed=True)
        total += sample * sample
    return math.sqrt(total / count)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="listen_until_silence.py")
    parser.add_argument("--out", required=True)
    parser.add_argument("--max-seconds", type=float, default=float(os.environ.get("MDOS_LISTEN_MAX_SECONDS", "15")))
    parser.add_argument("--silence-ms", type=int, default=int(os.environ.get("MDOS_LISTEN_SILENCE_MS", "850")))
    parser.add_argument("--preroll-ms", type=int, default=int(os.environ.get("MDOS_LISTEN_PREROLL_MS", "500")))
    parser.add_argument("--frame-ms", type=int, default=int(os.environ.get("MDOS_LISTEN_FRAME_MS", "30")))
    parser.add_argument("--sample-rate", type=int, default=int(os.environ.get("MDOS_LISTEN_SAMPLE_RATE", "44100")))
    parser.add_argument("--channels", type=int, default=1)
    return parser.parse_args()


def open_stream(pa: pyaudio.PyAudio, sample_rate: int, channels: int):
    formats = [
        (sample_rate, channels),
        (44100, 1),
        (44100, 2),
        (48000, 1),
        (16000, 1),
    ]
    last_error = None
    for rate, ch in formats:
        try:
            stream = pa.open(
                format=pyaudio.paInt16,
                channels=ch,
                rate=rate,
                input=True,
                frames_per_buffer=max(1, int(rate * 0.03)),
            )
            return stream, rate, ch
        except Exception as exc:  # noqa: BLE001
            last_error = exc
    raise RuntimeError(f"MICROPHONE_OPEN_FAILED: {last_error}")


def main() -> int:
    args = parse_args()
    out_path = Path(args.out).expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    pa = pyaudio.PyAudio()
    stream = None
    try:
        stream, rate, channels = open_stream(pa, args.sample_rate, args.channels)
        frame_samples = max(1, int(rate * args.frame_ms / 1000.0))
        frame_bytes = frame_samples * channels * 2
        prereoll_frames = max(1, int(args.preroll_ms / args.frame_ms))
        silence_frames = max(1, int(args.silence_ms / args.frame_ms))
        max_frames = max(1, int(args.max_seconds * 1000 / args.frame_ms))
        pre = collections.deque(maxlen=prereoll_frames)
        frames: list[bytes] = []
        started = False
        silent_run = 0
        baseline_total = 0.0
        baseline_count = 0
        speech_threshold = None

        for _ in range(max_frames):
            chunk = stream.read(frame_samples, exception_on_overflow=False)
            energy = rms16le(chunk)

            if speech_threshold is None:
                baseline_total += energy
                baseline_count += 1
                baseline = baseline_total / baseline_count
                speech_threshold = max(450.0, baseline * 3.0)

            if not started:
                pre.append(chunk)
                if energy >= speech_threshold:
                    started = True
                    frames.extend(pre)
                    frames.append(chunk)
                    silent_run = 0
                continue

            frames.append(chunk)
            if energy >= speech_threshold:
                silent_run = 0
            else:
                silent_run += 1
                if silent_run >= silence_frames:
                    break

        if not frames and pre:
            frames.extend(pre)

        with wave.open(str(out_path), "wb") as wav:
            wav.setnchannels(channels)
            wav.setsampwidth(pa.get_sample_size(pyaudio.paInt16))
            wav.setframerate(rate)
            wav.writeframes(b"".join(frames))

        print(str(out_path))
        return 0
    finally:
        if stream is not None:
            try:
                stream.stop_stream()
            except Exception:
                pass
            try:
                stream.close()
            except Exception:
                pass
        pa.terminate()


if __name__ == "__main__":
    raise SystemExit(main())
