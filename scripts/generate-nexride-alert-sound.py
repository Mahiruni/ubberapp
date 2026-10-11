#!/usr/bin/env python3
"""Generate NexRide's original, compact Driver request notification chime.

PCM mono WAV ships as a native Android raw resource. The melodic sequence
has short fades to avoid clicks; its fixed length is intentionally modest.
Do not embed external copyrighted sounds or depend on network downloads.
"""
from math import cos, pi, sin
from pathlib import Path
import struct
import wave

RATE = 22050
NOTES = (
    (0.00, 0.17, 587.33),  # D5
    (0.22, 0.17, 739.99),  # F#5
    (0.44, 0.26, 987.77),  # B5
)
DURATION = 0.76
DEST = Path("android/app/src/main/res/raw/nexride_ride_request.wav")
DEST.parent.mkdir(parents=True, exist_ok=True)

with wave.open(str(DEST), "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    samples = []
    for i in range(round(DURATION * RATE)):
        t = i / RATE
        amplitude = 0.0
        for start, duration, freq in NOTES:
            local = t - start
            if 0 <= local < duration:
                envelope = sin(pi * local / duration) ** 1.5
                wave1 = 0.75 * sin(2 * pi * freq * local)
                wave2 = 0.25 * sin(2 * pi * freq * 2 * local)
                amplitude += 0.32 * envelope * (wave1 + wave2)
        amplitude = max(-1.0, min(1.0, amplitude))
        samples.append(struct.pack("<h", round(32767 * amplitude)))
    wav.writeframes(b"".join(samples))
print(f"Generated NexRide Driver request chime: {DEST} ({DEST.stat().st_size} bytes)")
