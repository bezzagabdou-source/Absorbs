"""Procedural cinematic sound design — no sample libraries, no downloads.

Everything is synthesised with numpy: four-on-the-floor trailer drums, a pad
drone, sub impacts, whooshes, risers, reverse cymbals, glitch stutters and a
sidechain-style duck. The FX are placed on the actual edit decision list, so
every cut has a corresponding sound.
"""
from __future__ import annotations

import os
from typing import TYPE_CHECKING

import numpy as np

from .ffmpeg import write_wav

if TYPE_CHECKING:
    from .analysis import EditPlan

SR = 48000


def _n(seconds: float) -> int:
    return max(1, int(seconds * SR))


def _t(n: int) -> np.ndarray:
    return np.arange(n, dtype=np.float32) / SR


def _rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def _fade(a: np.ndarray, fin: float = 0.004, fout: float = 0.02) -> np.ndarray:
    n = a.size
    i, o = min(n, _n(fin)), min(n, _n(fout))
    if i > 1:
        a[:i] *= np.linspace(0, 1, i, dtype=np.float32)
    if o > 1:
        a[-o:] *= np.linspace(1, 0, o, dtype=np.float32)
    return a


def _band_noise(n: int, lo: float, hi: float, rng: np.random.Generator) -> np.ndarray:
    """FFT band-limited white noise (used to build moving whooshes/risers)."""
    x = rng.standard_normal(n).astype(np.float32)
    X = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    mask = ((freqs >= lo) & (freqs <= hi)).astype(np.float32)
    mask[: max(1, int(lo * n / SR))] = 0.0
    y = np.fft.irfft(X * mask, n=n).astype(np.float32)
    peak = float(np.max(np.abs(y))) or 1.0
    return _fade(y / peak, 0.003, 0.02)


def _add(buf: np.ndarray, sig: np.ndarray, at: float, gain: float = 1.0, pan: float = 0.0) -> None:
    """Place a mono signal into a stereo (N,2) buffer."""
    start = int(at * SR)
    if start >= buf.shape[0] or start < 0:
        return
    end = min(buf.shape[0], start + sig.size)
    if end <= start:
        return
    s = sig[: end - start] * np.float32(gain)
    l = np.sqrt((1.0 - pan) / 2.0) * np.sqrt(2.0)
    r = np.sqrt((1.0 + pan) / 2.0) * np.sqrt(2.0)
    buf[start:end, 0] += s * l
    buf[start:end, 1] += s * r


# ---------------------------------------------------------------------------
# One-shot generators (all mono float32)
# ---------------------------------------------------------------------------

def kick(dur: float = 0.45, rng: np.random.Generator | None = None) -> np.ndarray:
    rng = rng or _rng(1)
    n, t = _n(dur), _t(_n(dur))
    f = 46.0 + 130.0 * np.exp(-t * 32.0)
    phase = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(phase) * np.exp(-t * 8.5)
    click = rng.standard_normal(n).astype(np.float32) * np.exp(-t * 190.0) * 0.55
    return _fade(np.tanh((body + click) * 1.25).astype(np.float32), 0.001, 0.01)


def snare(dur: float = 0.26, rng: np.random.Generator | None = None) -> np.ndarray:
    rng = rng or _rng(2)
    n, t = _n(dur), _t(_n(dur))
    noise = rng.standard_normal(n).astype(np.float32) * np.exp(-t * 21.0)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 30.0) * 0.6
    return _fade((noise + tone).astype(np.float32), 0.001, 0.01)


def hat(dur: float = 0.07, rng: np.random.Generator | None = None) -> np.ndarray:
    rng = rng or _rng(3)
    n, t = _n(dur), _t(_n(dur))
    x = rng.standard_normal(n + 1).astype(np.float32)
    hp = np.diff(x) * 0.5
    return _fade((hp * np.exp(-t * 62.0)).astype(np.float32), 0.001, 0.01)


def bass_note(freq: float, dur: float = 0.42) -> np.ndarray:
    n, t = _n(dur), _t(_n(dur))
    a = np.sin(2 * np.pi * freq * t) + 0.32 * np.sin(2 * np.pi * freq * 2 * t)
    env = np.minimum(1.0, t * 90.0) * np.exp(-t * 4.0)
    return _fade((a * env * 0.5).astype(np.float32), 0.002, 0.03)


def sub_impact(dur: float = 1.6, rng: np.random.Generator | None = None) -> np.ndarray:
    rng = rng or _rng(4)
    n, t = _n(dur), _t(_n(dur))
    f = 30.0 + 52.0 * np.exp(-t * 5.0)
    phase = 2 * np.pi * np.cumsum(f) / SR
    sub = np.sin(phase) * np.exp(-t * 2.4) * 0.95
    crack = rng.standard_normal(n).astype(np.float32) * np.exp(-t * 95.0) * 0.5
    metal = sum(
        np.sin(2 * np.pi * hz * t) * np.exp(-t * (9 + k * 3)) * 0.12
        for k, hz in enumerate((211, 317, 469, 733))
    )
    swell = _band_noise(n, 300, 4200, rng) * np.minimum(1.0, (t / dur) ** 3) * 0.18
    return _fade(np.tanh((sub + crack + metal + swell) * 1.05).astype(np.float32), 0.001, 0.15)


def boom(dur: float = 1.15, rng: np.random.Generator | None = None) -> np.ndarray:
    rng = rng or _rng(5)
    n, t = _n(dur), _t(_n(dur))
    f = 33.0 + 40.0 * np.exp(-t * 7.0)
    low = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.1)
    air = _band_noise(n, 60, 900, rng) * np.exp(-t * 5.0) * 0.45
    return _fade((low * 0.9 + air).astype(np.float32), 0.001, 0.1)


def whoosh(dur: float = 0.55, rng: np.random.Generator | None = None) -> np.ndarray:
    rng = rng or _rng(6)
    n, t = _n(dur), _t(_n(dur))
    u = t / dur
    low = _band_noise(n, 90, 700, rng)
    mid = _band_noise(n, 600, 2600, rng)
    high = _band_noise(n, 2200, 9000, rng)
    wlo = np.exp(-((u - 0.25) / 0.22) ** 2)
    wmid = np.exp(-((u - 0.55) / 0.25) ** 2)
    whi = np.exp(-((u - 0.78) / 0.22) ** 2)
    env = np.sin(np.pi * np.clip(u, 0, 1)) ** 1.3
    doppler = np.sin(2 * np.pi * (120 + 260 * u) * t) * 0.06
    return _fade(((low * wlo * 0.6 + mid * wmid * 0.55 + high * whi * 0.4) * env + doppler).astype(np.float32), 0.01, 0.08)


def riser(dur: float = 1.4, rng: np.random.Generator | None = None) -> np.ndarray:
    rng = rng or _rng(7)
    n, t = _n(dur), _t(_n(dur))
    u = t / dur
    low = _band_noise(n, 100, 800, rng)
    mid = _band_noise(n, 700, 3200, rng)
    high = _band_noise(n, 2800, 12000, rng)
    trem = 0.75 + 0.25 * np.sin(2 * np.pi * (3 + 20 * u) * t)
    chirp = np.sin(2 * np.pi * (170 * t + 700 * u * u * dur)) * 0.16
    body = (low * (1 - u) ** 2 + mid * np.sin(np.pi * u) + high * u ** 3) * (u ** 1.7)
    return _fade(((body * 0.8 + chirp) * trem).astype(np.float32), 0.02, 0.05)


def reverse_cymbal(dur: float = 0.9, rng: np.random.Generator | None = None) -> np.ndarray:
    rng = rng or _rng(8)
    n, t = _n(dur), _t(_n(dur))
    air = _band_noise(n, 3500, 14000, rng)
    shimmer = sum(np.sin(2 * np.pi * hz * t) * 0.04 for hz in (1240, 1860, 2790, 4180))
    return _fade(((air + shimmer) * (t / dur) ** 2.6).astype(np.float32), 0.005, 0.02)


def glitch(dur: float = 0.24, rng: np.random.Generator | None = None) -> np.ndarray:
    rng = rng or _rng(9)
    n = _n(dur)
    x = rng.standard_normal(n).astype(np.float32)
    gate = (rng.random(n // 256 + 2) > 0.42).astype(np.float32)
    gate = np.repeat(gate, 256)[:n]
    hold = np.repeat(x[::64], 64)[:n]  # sample-and-hold / bitcrush feel
    y = (x * 0.55 + hold * 0.45) * gate
    return _fade((y * 0.5).astype(np.float32), 0.001, 0.02)


# ---------------------------------------------------------------------------
# Full sound track
# ---------------------------------------------------------------------------

_CHORDS = [55.00, 43.65, 65.41, 49.00]  # A1 · F1 · C2 · G1 — minor trailer cadence


def music_bed(duration: float, bpm: float = 128.0, seed: int = 7, preset: str = "epic") -> np.ndarray:
    """Authoritative music-bed generator (stereo float32)."""
    rng = _rng(seed)
    n = _n(duration) + SR
    buf = np.zeros((n, 2), dtype=np.float32)
    t = _t(n)
    beat = 60.0 / bpm

    root = _CHORDS[0]
    # Loop short tone/noise beds instead of doing an FFT over the whole reel.
    loop_n = min(n, _n(4.0))
    tl = _t(loop_n)
    pad_l = np.zeros(loop_n, dtype=np.float32)
    for mult, amp in ((1.0, 0.10), (1.5, 0.055), (2.0, 0.045), (2.9966, 0.03), (4.0, 0.02)):
        pad_l += np.sin(2 * np.pi * root * mult * tl + 0.4 * mult).astype(np.float32) * amp
    pad_l *= (0.72 + 0.28 * np.sin(2 * np.pi * 0.13 * tl))
    air_l = _band_noise(loop_n, 1800, 9000, rng) * 0.012
    reps = int(np.ceil(n / loop_n))
    pad = np.tile(pad_l, reps)[:n]
    air = np.tile(air_l, reps)[:n]
    intensity = np.clip(0.55 + 0.6 * t / max(duration * 0.85, 0.5), 0, 1.6).astype(np.float32)
    buf[:, 0] += (pad + air) * intensity
    buf[:, 1] += (np.roll(pad, 220) * 0.96 + np.roll(air, 97)) * intensity

    hat_level = 0.075 if preset != "clean" else 0.045
    kick_level = 0.62 if preset in ("epic", "fantasy") else 0.52
    k = 0
    while k * beat < duration:
        at = k * beat
        bar = int(k // 4) % 4
        root = _CHORDS[bar]
        _add(buf, kick(0.42, rng), at, kick_level if k % 4 == 0 else kick_level * 0.72)
        if k % 2 == 1:
            _add(buf, snare(0.24, rng), at, 0.30, pan=0.06)
        for h in (0.0, 0.5, 0.75):
            _add(buf, hat(0.055, rng), at + h * beat, hat_level, pan=-0.25 if h == 0 else 0.25)
        _add(buf, bass_note(root, beat * 0.9), at, 0.34)
        k += 1
    # final build drum roll
    roll_start = max(0.0, duration - 1.6)
    steps = 16
    for i in range(steps):
        _add(buf, hat(0.05, rng), roll_start + i * 1.6 / steps, 0.05 + 0.12 * i / steps, pan=0.1 * (-1) ** i)
    return buf


def build_soundtrack(
    plan: "EditPlan",
    out_path: str,
    *,
    preset: str = "epic",
    seed: int = 7,
    stems: bool = False,
    sfx_gain: float = 1.0,
) -> str:
    """Render the full cinematic mix, aligned to the edit decision list."""
    rng = _rng(seed + 101)
    duration = plan.duration
    n = _n(duration) + SR
    music = music_bed(duration, plan.bpm, seed, preset)
    fx = np.zeros((n, 2), dtype=np.float32)

    segs = plan.segments
    big = {max(1, len(segs) // 2), max(1, len(segs) - 1)}
    for i, seg in enumerate(segs):
        at = seg.start
        if seg.cut:
            _add(fx, whoosh(0.5, rng), max(0.0, at - 0.32), 0.52, pan=-0.25 if i % 2 else 0.25)
            hit = sub_impact(1.5, rng) if i % 3 else boom(1.1, rng)
            _add(fx, hit, at, 0.55 + 0.25 * seg.intensity)
            if i in big:
                _add(fx, reverse_cymbal(0.9, rng), max(0.0, at - 0.9), 0.34, pan=-0.15)
        if seg.style == "glitch":
            for g in range(3):
                _add(fx, glitch(0.18, rng), at + 0.08 + g * 0.16, 0.24, pan=0.4 * (-1) ** g)
        if seg.style == "slow":
            _add(fx, reverse_cymbal(0.7, rng), max(0.0, at - 0.7), 0.22, pan=0.2)
        if i in big or i == len(segs) - 1:
            _add(fx, riser(1.25, rng), max(0.0, at - 1.25), 0.42, pan=0.0)
    # final slam
    _add(fx, sub_impact(1.8, rng), max(0.0, duration - 0.18), 0.85)
    _add(fx, reverse_cymbal(1.0, rng), max(0.0, duration - 1.0), 0.30)

    # sidechain-style duck: the music breathes under every impact
    hop = 256
    m = (np.max(np.abs(fx), axis=1)[: n // hop * hop].reshape(-1, hop).max(axis=1))
    duck = np.repeat(np.clip(m * 3.0, 0, 1), hop)[:n]
    if duck.size < n:
        duck = np.pad(duck, (0, n - duck.size))
    duck = np.convolve(duck, np.ones(32) / 32, mode="same").astype(np.float32)
    music *= (1.0 - 0.55 * duck)[:, None]

    master = music * 0.80 + fx * 0.95 * sfx_gain
    master = np.tanh(master * 1.15).astype(np.float32) / np.tanh(np.float32(1.15))
    peak = float(np.max(np.abs(master))) or 1.0
    master *= 0.93 / peak
    fin, fout = min(n, _n(0.12)), min(n, _n(min(0.7, duration * 0.12)))
    master[:fin] *= np.linspace(0, 1, fin, dtype=np.float32)[:, None]
    master[-fout:] *= np.linspace(1, 0, fout, dtype=np.float32)[:, None]

    write_wav(out_path, master, SR)
    if stems:
        base = os.path.dirname(os.path.abspath(out_path))
        write_wav(os.path.join(base, "stem_music.wav"), music, SR)
        write_wav(os.path.join(base, "stem_fx.wav"), fx, SR)
    return out_path
