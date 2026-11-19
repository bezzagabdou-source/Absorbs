#!/usr/bin/env python3
"""Deterministic original audio generator (stdlib only). No sampled or third-party audio."""
import math, os, random, struct, wave

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'audio')
SR = 22050
os.makedirs(OUT, exist_ok=True)

def write(name, seconds, fn):
    n = int(SR * seconds)
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        frames = bytearray()
        for i in range(n):
            v = max(-1.0, min(1.0, fn(i / SR, i)))
            frames += struct.pack('<h', int(v * 32767))
        w.writeframes(frames)
    print(name, os.path.getsize(os.path.join(OUT, name)))

def env(t, length, decay=5.0):
    return math.exp(-decay * t / max(length, 1e-6))

rng = random.Random(4021)
write('engine.wav', 1.0, lambda t, i:
    0.34 * math.sin(2 * math.pi * 78 * t) + 0.18 * math.sin(2 * math.pi * 156 * t) +
    0.09 * math.sin(2 * math.pi * 312 * t) + 0.03 * (rng.random() * 2 - 1))
write('horn.wav', 0.7, lambda t, i:
    env(t, 0.7, 2.5) * (0.4 * math.sin(2 * math.pi * 370 * t) + 0.3 * math.sin(2 * math.pi * 495 * t)))
write('shoot.wav', 0.25, lambda t, i:
    env(t, 0.25, 14) * (0.55 * (rng.random() * 2 - 1) + 0.35 * math.sin(2 * math.pi * (150 - 300 * t) * t)))
write('hit.wav', 0.16, lambda t, i:
    env(t, 0.16, 20) * (0.5 * (rng.random() * 2 - 1) + 0.2 * math.sin(2 * math.pi * 240 * t)))
write('explosion.wav', 1.6, lambda t, i:
    env(t, 1.6, 3.2) * (0.65 * (rng.random() * 2 - 1) + 0.2 * math.sin(2 * math.pi * (60 - 25 * t) * t)))
write('ui.wav', 0.18, lambda t, i:
    env(t, 0.18, 6) * 0.3 * math.sin(2 * math.pi * (660 + 330 * t) * t))
write('siren.wav', 1.0, lambda t, i:
    0.24 * math.sin(2 * math.pi * (620 + 180 * math.sin(2 * math.pi * t)) * t))
write('footsteps.wav', 0.3, lambda t, i:
    env(t, 0.3, 12) * 0.3 * (rng.random() * 2 - 1))
write('ambience.wav', 2.0, lambda t, i:
    0.035 * (rng.random() * 2 - 1) + 0.02 * math.sin(2 * math.pi * 55 * t))
NOTES = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33]
def melody(seed, bpm):
    r = random.Random(seed)
    seq = [r.choice(NOTES) for _ in range(16)]
    def f(t, i):
        step = int(t / (60.0 / bpm)) % len(seq)
        f0 = seq[step]
        phase = (t / (60.0 / bpm)) % 1.0
        a = math.exp(-3.2 * phase)
        return 0.12 * math.sin(math.pi * f0 * t) + 0.20 * a * (math.sin(2 * math.pi * f0 * t) + 0.35 * math.sin(4 * math.pi * f0 * t))
    return f
write('station1.wav', 4.0, melody(11, 112))
write('station2.wav', 4.0, melody(29, 96))
write('station3.wav', 4.0, melody(47, 128))
print('Audio generation complete. All files are original synthesis.')
