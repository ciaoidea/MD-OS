#!/usr/bin/env python3
import sys
from faster_whisper import WhisperModel

if len(sys.argv) != 2:
    raise SystemExit("usage: transcribe.py AUDIO.wav")

model = WhisperModel("base", device="cpu", compute_type="int8", local_files_only=True)
segments, _ = model.transcribe(sys.argv[1], language="en", vad_filter=True, beam_size=5)
print("".join(segment.text for segment in segments).strip())
