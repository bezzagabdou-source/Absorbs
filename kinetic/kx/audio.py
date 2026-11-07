"""kx.audio — cinematic score + SFX synthesis + pro mix (no samples needed).

* score(): dark, minimal, modern bed (sub pulse, felt piano-ish pluck, pad, kick,
  hats) generated from the BPM of the edit, auto-ducked under the voice.
* SFX: whoosh / pop / impact / riser / sparkle, all synthesised.
* final mix: sidechain-style duck, gentle bus compression, -14 LUFS target.
"""
from __future__ import annotations

import os
import subprocess
import wave

import numpy as np

SR = 44100
F32 = np.float32


# --------------------------------------------------------------------------- utils
def _env(n, a=0.01, d=0.2, s=0.6, r=0.2):
    """ADSR in samples."""
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a_n - d_n - r_n)
    e = np.concatenate([
        np.linspace(0, 1, a_n, endpoint=False) if a_n else np.array([]),
        np.linspace(1, s, d_n, endpoint=False) if d_n else np.array([]),
        np.full(s_n, s),
        np.linspace(s, 0, r_n) if r_n else np.array([]),
    ])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def _note(freq, dur, kind="pluck", amp=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    if kind == "pluck":
        sig = (np.sin(2 * np.pi * freq * t) * 1.0
               + 0.42 * np.sin(4 * np.pi * freq * t)
               + 0.18 * np.sin(6 * np.pi * freq * t)
               + 0.08 * np.sin(8 * np.pi * freq * t))
        e = np.exp(-t * 7.5) * _env(n, 0.004, 0.02, 1.0, 0.05)
    elif kind == "sub":
        sig = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * freq * 2 * t)
        e = np.exp(-t * 2.2) * _env(n, 0.01, 0.08, 0.7, dur * 0.5)
    elif kind == "pad":
        sig = (np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * freq * 1.005 * t)
               + 0.35 * np.sin(2 * np.pi * freq * 2 * t) + 0.2 * np.sin(2 * np.pi * freq * 3.01 * t))
        e = _env(n, dur * 0.35, 0.2, 0.75, dur * 0.4)
    elif kind == "bell":
        sig = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2.76 * t)
        e = np.exp(-t * 3.2) * _env(n, 0.002, 0.05, 1.0, 0.3)
    else:
        sig = np.sin(2 * np.pi * freq * t)
        e = _env(n, 0.01, 0.05, 0.8, 0.1)
    return (sig * e * amp).astype(F32)


def _place(track, sig, at):
    i = int(at * SR)
    j = min(len(track), i + len(sig))
    if i < len(track) and j > i:
        track[i:j] += sig[: j - i]


def _reverb(x, decay=0.32, mix=0.28, taps=(0.031, 0.057, 0.089, 0.131, 0.193)):
    out = x.copy()
    for k, tap in enumerate(taps):
        d = int(tap * SR)
        g = decay ** (k + 1)
        if d < len(x):
            out[d:] += x[:-d] * g
    return (x * (1 - mix) + out * mix).astype(F32)


# --------------------------------------------------------------------------- score
SCALE = [0, 3, 5, 7, 10]          # minor pentatonic
ROOT = 55.0                        # A1


def score(duration: float, bpm: float = 86.0, seed: int = 5) -> np.ndarray:
    n = int(duration * SR)
    music = np.zeros(n, F32)
    rng = np.random.default_rng(seed)
    beat = 60 / bpm
    bar = beat * 4

    def freq(semi):
        return ROOT * 2 ** (semi / 12)

    # ---- pad bed (whole timeline, slowly moving)
    for i, semi in enumerate([0, 7, 12]):
        pad = _note(freq(semi + 12), duration, "pad", 0.055 if i else 0.07)
        music[:len(pad)] += pad[:n]
    music = _reverb(music, 0.35, 0.35)

    # ---- sub pulse on every beat (soft, sidechained later)
    t = 0.0
    while t < duration:
        pulse = _note(freq(0), min(0.55, duration - t), "sub", 0.20)
        _place(music, pulse, t)
        t += beat

    # ---- plucked arp: 8ths, pentatonic walk, sparse and tasteful
    t = beat * 0.5
    step = 0
    while t < duration:
        if rng.random() < 0.62:
            semi = 12 + SCALE[int(rng.integers(0, len(SCALE)))] + (12 if rng.random() < 0.25 else 0)
            _place(music, _note(freq(semi), 0.5, "pluck", 0.085), t)
        if step % 8 == 4 and rng.random() < 0.5:
            _place(music, _note(freq(24 + SCALE[int(rng.integers(0, 5))]), 0.9, "bell", 0.05), t)
        t += beat * 0.5
        step += 1

    # ---- soft kick + hats
    t = 0.0
    while t < duration:
        k = _note(52, 0.24, "sub", 0.30)
        _place(music, k, t)
        t += beat
    t = beat * 0.5
    while t < duration:
        nh = int(0.035 * SR)
        hat = rng.standard_normal(nh).astype(F32) * np.exp(-np.arange(nh) / (nh * 0.22)) * 0.05
        _place(music, hat, t)
        t += beat

    # ---- section swells (cinematic air) every bar
    t = 0.0
    while t < duration:
        sw = _note(freq(24), min(1.6, duration - t), "pad", 0.03)
        _place(music, sw, t)
        t += bar * 2

    music = np.tanh(music * 1.25) * 0.75
    return np.stack([music, np.roll(music, 220) * 0.92], -1)  # width


# --------------------------------------------------------------------------- SFX
def whoosh(dur=0.42, seed=1):
    n = int(dur * SR)
    rng = np.random.default_rng(seed)
    t = np.linspace(0, 1, n)
    noise = rng.standard_normal(n).astype(F32)
    # moving band-pass via simple one-pole sweep
    out = np.zeros(n, F32)
    y1 = y2 = 0.0
    fc = 400 + 5200 * t ** 1.6
    for i in range(n):
        f = 2 * np.sin(np.pi * fc[i] / SR)
        y1 = y1 + f * (noise[i] - y1)
        y2 = y2 + f * (y1 - y2)
        out[i] = y2
    env = np.sin(np.pi * t) ** 2.2
    return (out / (np.abs(out).max() + 1e-9) * env * 0.55).astype(F32)


def pop(freq=760.0, dur=0.13, amp=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = freq * (1 + 0.9 * np.exp(-t * 60))
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR)
    sig += 0.35 * np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR)
    e = np.exp(-t * 26) * _env(n, 0.002, 0.02, 1.0, 0.03)
    return (sig * e * amp).astype(F32)


def impact(dur=0.9, amp=0.55, seed=3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    low = np.sin(2 * np.pi * 44 * np.exp(-t * 2.4) * t) * np.exp(-t * 3.4)
    click = rng.standard_normal(n).astype(F32) * np.exp(-t * 60) * 0.4
    sig = low * 1.1 + click
    return (sig * amp).astype(F32)


def riser(dur=1.8, amp=0.4, seed=9):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal(n).astype(F32)
    out = np.zeros(n, F32)
    y = 0.0
    for i in range(n):
        f = 2 * np.sin(np.pi * (300 + 6000 * t[i] ** 1.7) / SR)
        y = y + f * (noise[i] - y)
        out[i] = y
    tone = np.sin(2 * np.pi * np.cumsum(180 + 900 * t ** 2) / SR) * 0.35
    env = t ** 2.2
    sig = (out * 0.6 + tone) * env
    return (sig / (np.abs(sig).max() + 1e-9) * amp).astype(F32)


def sparkle(dur=0.5, amp=0.28):
    n = int(dur * SR)
    out = np.zeros(n, F32)
    for i, f in enumerate([1568, 2093, 2637, 3136]):
        s = _note(f, dur * (0.8 - i * 0.12), "bell", amp * (1 - i * 0.18))
        _place(out, s, 0.02 * i)
    return out


# --------------------------------------------------------------------------- mix
def _read_audio(path: str) -> np.ndarray:
    ff = os.environ.get("FFMPEG") or _ffmpeg()
    raw = subprocess.run([ff, "-v", "quiet", "-i", path, "-ac", "2", "-ar", str(SR),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)
    return a.copy()


def _ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def _write_wav(path: str, data: np.ndarray):
    d = np.clip(data, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((d * 32767).astype(np.int16).tobytes())


def build_mix(vo_path: str, out_wav: str, timeline: dict, bpm: float = 86.0,
              music_gain: float = 0.55, sfx_gain: float = 0.9) -> str:
    vo = _read_audio(vo_path)
    dur = timeline["duration"]
    n = int(dur * SR)
    if len(vo) < n:
        vo = np.pad(vo, ((0, n - len(vo)), (0, 0)))
    vo = vo[:n]

    music = score(dur, bpm)
    music = music[:n]

    # ---- duck music under the voice (soft knee envelope follower)
    mono = np.abs(vo).mean(axis=1)
    win = int(0.06 * SR)
    env = np.convolve(mono, np.ones(win) / win, mode="same")
    env = env / (np.percentile(env, 97) + 1e-9)
    duck = np.clip(1.0 - 0.82 * np.clip(env * 1.6, 0, 1) ** 0.7, 0.16, 1.0)
    # smooth the duck curve
    k = int(0.05 * SR)
    duck = np.convolve(duck, np.ones(k) / k, mode="same")
    music = music * (duck[..., None] * music_gain)

    # ---- SFX layer
    sfx = np.zeros((n, 2), F32)

    def place(sig, at, gain=1.0, pan=0.0):
        i = int(at * SR)
        j = min(n, i + len(sig))
        if i >= n or j <= i:
            return
        pan = max(-1.0, min(1.0, pan))
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        seg = sig[: j - i] * gain
        sfx[i:j, 0] += seg * l
        sfx[i:j, 1] += seg * r

    for gi, g in enumerate(timeline["groups"]):
        if gi % 2 == 0 or gi < 3:
            place(whoosh(0.4, seed=gi), max(0.0, g["start"] - 0.22), 0.55,
                  pan=(-0.25 if gi % 4 else 0.25))
    for i, w in enumerate(timeline["words"]):
        if w["hero"]:
            place(pop(700 + 90 * (i % 4), 0.12, 0.42), max(0.0, w["start"] - 0.01), sfx_gain,
                  pan=0.18 * ((i % 3) - 1))
    for s in timeline.get("sections", []):
        place(impact(0.8, 0.34), max(0.0, s["t"] - 0.05), 0.7)
    for b in timeline["icons"]:
        place(sparkle(0.45, 0.18), b["t"] + 0.02, 0.8, pan=-0.2)
    # intro hit + final riser into the outro
    place(impact(1.2, 0.5), 0.02, 0.9)
    place(riser(1.6, 0.32), max(0.0, dur - 2.0), 0.9)
    place(impact(1.0, 0.42), max(0.0, dur - 0.45), 0.8)

    # ---- bus
    mix = music + sfx
    # gentle glue + soft clip
    mix = np.tanh(mix * 1.15) * 0.92
    peak = np.abs(mix).max() + 1e-9
    mix = mix / peak * 0.88

    # ---- loudness target (-14 LUFS-ish via simple RMS approach, then ffmpeg loudnorm)
    _write_wav(out_wav, mix)
    return out_wav


def master(in_wav: str, out_wav: str, video: bool = False):
    ff = os.environ.get("FFMPEG") or _ffmpeg()
    cmd = [ff, "-y", "-v", "error", "-i", in_wav,
           "-af", "loudnorm=I=-14:TP=-1.2:LRA=9,alimiter=limit=0.97",
           "-ar", "44100", "-ac", "2", out_wav]
    subprocess.run(cmd, check=True)
    return out_wav


if __name__ == "__main__":
    print("score test")
    s = score(4.0)
    _write_wav("/tmp/score.wav", s)
    print(s.shape, s.max())
