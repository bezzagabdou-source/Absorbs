"""Procedural dark-trap music bed + SFX + VO mixing for the GTA VI short."""
import json
import os
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import BUILD, FF, ROOT, run, probe_dur  # noqa: E402
from script import SCENES  # noqa: E402

SR = 48000
GAP = 0.16          # breath between sentences (seconds)
RNG = np.random.default_rng(20261119)


def db(x):
    return 10 ** (x / 20.0)


# ---------------------------------------------------------------- helpers
def _lp(x, cutoff, order=2):
    """Simple cascaded one-pole lowpass (cheap, no scipy)."""
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = x.copy()
    for _ in range(order):
        out = np.empty_like(y)
        acc = 0.0
        for i in range(len(y)):  # vectorised enough for short buffers
            acc = (1 - a) * y[i] + a * acc
            out[i] = acc
        y = out
    return y


def lp_fast(x, cutoff, order=2):
    """FFT-based lowpass with smooth rolloff (fast + stable)."""
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    H = 1.0 / (1.0 + (f / max(cutoff, 20)) ** (2 * order))
    return np.fft.irfft(X * H, n)


def hp_fast(x, cutoff, order=2):
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    H = 1.0 / (1.0 + (max(cutoff, 20) / np.maximum(f, 1e-6)) ** (2 * order))
    return np.fft.irfft(X * H, n)


def bp_fast(x, lo, hi):
    return hp_fast(lp_fast(x, hi), lo)


def env_ad(n, attack, decay, curve=3.0):
    a = max(int(attack * SR), 1)
    e = np.zeros(n)
    a = min(a, n)
    e[:a] = np.linspace(0, 1, a) ** 0.6
    rest = n - a
    if rest > 0:
        e[a:] = np.exp(-np.linspace(0, curve, rest))
    return e


def saw(freq, n, phase=0.0):
    t = np.arange(n) / SR
    ph = (t * freq + phase) % 1.0
    return 2 * ph - 1


def sine(freq, n, phase=0.0):
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t + phase)


def noise(n):
    return RNG.standard_normal(n)


def place(buf, sig, at, gain=1.0, pan=0.0):
    """Add mono signal into stereo buffer at time `at` (s)."""
    i = int(at * SR)
    if i >= buf.shape[0]:
        return
    sig = sig[: buf.shape[0] - i]
    l = np.sqrt((1 - pan) / 2) * np.sqrt(2)
    r = np.sqrt((1 + pan) / 2) * np.sqrt(2)
    buf[i:i + len(sig), 0] += sig * gain * l
    buf[i:i + len(sig), 1] += sig * gain * r


# ---------------------------------------------------------------- music
def note_hz(semi_from_a4):
    return 440.0 * 2 ** (semi_from_a4 / 12.0)


# F# minor: F#1(29), A1(33), E1(28), C#2(37) as A4-relative semitone offsets
PROG = [-35, -32, -36, -29]          # f#, a, e, c#  (low octave)
CHORDS = [  # triads (relative semitones from A4)
    (-35, -23, -16, -11),            # F#m
    (-32, -20, -13, -8),             # A
    (-36, -24, -17, -12),            # E
    (-29, -17, -10, -5),             # C#m
]


def build_music(total):
    n = int(total * SR) + SR
    buf = np.zeros((n, 2))
    bpm = 140.0
    beat = 60.0 / bpm
    bar = beat * 4
    n_bars = int(np.ceil(total / bar)) + 1

    for b in range(n_bars):
        t0 = b * bar
        ci = b % 4

        # --- 808 sub bass: root with glide, long decay
        for hit, k in ((0.0, 0), (beat * 2.5, 0)):
            nn = int(beat * 2.2 * SR)
            f = note_hz(PROG[ci]) * 2
            sig = sine(f, nn) + 0.35 * sine(f * 2, nn)
            sig *= env_ad(nn, 0.008, 1.0, 2.2)
            sig = np.tanh(sig * 1.5) * 0.55
            place(buf, sig, t0 + hit, db(-6))

        # --- kick (punchy, layered)
        for hit in (0.0, beat * 2, beat * 3.5):
            nn = int(0.22 * SR)
            t = np.arange(nn) / SR
            f = 150 * np.exp(-t * 26) + 48
            sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 13)
            sig += 0.4 * np.exp(-t * 220) * noise(nn)
            place(buf, sig * 0.8, t0 + hit, db(-4.5))

        # --- clap / snare on 2 & 4
        for hit in (beat, beat * 3):
            nn = int(0.18 * SR)
            sig = bp_fast(noise(nn), 900, 5200) * env_ad(nn, 0.004, 1.0, 3.4)
            sig += 0.5 * sine(190, nn) * env_ad(nn, 0.002, 1.0, 6)
            place(buf, sig * 0.5, t0 + hit, db(-12), pan=0.05)

        # --- hats: 16ths with accents + trap rolls
        for s in range(16):
            tt = t0 + s * beat / 4
            if s % 4 == 2:
                continue
            nn = int(0.055 * SR)
            sig = hp_fast(noise(nn), 7000) * env_ad(nn, 0.001, 1.0, 5.0)
            g = db(-17 if s % 2 else -14)
            place(buf, sig * 0.5, tt, g, pan=-0.18 if s % 2 else 0.18)
        # triplet roll at the end of each 2nd bar
        if b % 2 == 1:
            for s in range(6):
                tt = t0 + beat * 3 + s * beat / 6
                nn = int(0.035 * SR)
                sig = hp_fast(noise(nn), 8200) * env_ad(nn, 0.001, 1.0, 5.0)
                place(buf, sig * 0.32, tt, db(-19), pan=(s % 2) * 0.4 - 0.2)

        # --- dark detuned pad (adds width / tension)
        nn = int(bar * 1.03 * SR)
        chord = CHORDS[ci]
        pad = np.zeros(nn)
        for semi in chord:
            f = note_hz(semi) * 2
            for det in (-0.6, 0.0, 0.7):
                pad += saw(f * 2 ** (det / 1200), nn, phase=RNG.random())
        pad = lp_fast(pad / (len(chord) * 3), 1500, 2)
        pad = hp_fast(pad, 180)
        pad *= env_ad(nn, 0.35, 1.0, 1.0)
        place(buf, pad, t0, db(-23), pan=0.0)

        # --- pluck arp (cyber motif)
        steps = [0, 3, 2, 3, 1, 3, 2, 4]
        for s in range(8):
            tt = t0 + s * beat / 2
            semi = chord[steps[s] % len(chord)] + 12
            nn = int(0.16 * SR)
            t = np.arange(nn) / SR
            f = note_hz(semi)
            sig = (np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + 0.5 * sine(f * 2, nn))
            sig *= np.exp(-t * 22)
            sig = lp_fast(sig, 4200)
            place(buf, sig * 0.5, tt, db(-24), pan=0.28 if s % 2 else -0.28)

    buf = buf[: int(total * SR)]
    buf *= db(-9)
    return buf


# ---------------------------------------------------------------- SFX
def sfx_whoosh(dur=0.42):
    n = int(dur * SR)
    sig = noise(n)
    # sweeping band emphasis via time-varying mix of filtered copies
    out = np.zeros(n)
    for k in range(6):
        lo = 300 * (2 ** (k * 0.85))
        hi = lo * 4
        seg = bp_fast(sig, lo, hi)
        w = np.exp(-((np.linspace(0, 1, n) - k / 5.5) ** 2) / 0.05)
        out += seg * w
    e = np.linspace(0, 1, n) ** 1.6 * np.exp(-np.linspace(0, 2.2, n))
    return out * e * 0.9


def sfx_impact(dur=0.75):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 130 * np.exp(-t * 9) + 38
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5.2)
    sig += 0.5 * bp_fast(noise(n), 120, 2200) * np.exp(-t * 16)
    tail = lp_fast(noise(n), 3000) * np.exp(-t * 3.0) * 0.12
    return np.tanh((sig + tail) * 1.3)


def sfx_riser(dur=1.9):
    n = int(dur * SR)
    sig = noise(n)
    out = np.zeros(n)
    for k in range(8):
        lo = 200 * (2 ** (k * 0.8))
        seg = bp_fast(sig, lo, lo * 3)
        w = np.exp(-((np.linspace(0, 1, n) - k / 7.6) ** 2) / 0.035)
        out += seg * w
    e = (np.linspace(0, 1, n) ** 2.0)
    return out * e * 0.75


def sfx_pop(freq=1350, dur=0.09):
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = sine(freq, n) * np.exp(-t * 55) + 0.5 * noise(n) * np.exp(-t * 240)
    return sig * 0.7


def sfx_glitch(dur=0.14):
    n = int(dur * SR)
    sig = noise(n)
    sig = np.round(sig * 6) / 6           # bitcrush
    gate = (np.arange(n) // 480) % 2
    sig = sig * gate
    return sig * np.exp(-np.linspace(0, 2.4, n)) * 0.55


def sfx_coin():
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    sig = (sine(1568, n) * np.exp(-t * 14) + 0.7 * sine(2093, n) * np.exp(-t * 18))
    sig += 0.3 * sine(3136, n) * np.exp(-t * 26)
    return sig * 0.45


# ---------------------------------------------------------------- assembly
def main():
    timing = {d["seg"]: d["dur"] for d in
              json.load(open(os.path.join(BUILD, "vo_proc", "timing.json")))}

    scene_starts, t = [], 0.0
    for i in range(len(SCENES)):
        scene_starts.append(t)
        t += timing[i + 1] + GAP
    total = t
    print(f"scenes={len(SCENES)} total={total:.2f}s")

    # ---- VO track
    vo = np.zeros((int(total * SR) + SR, 2))
    for i in range(len(SCENES)):
        seg = os.path.join(BUILD, "vo_proc", f"seg{i + 1:02d}.wav")
        raw = __import__("wave").open(seg, "rb")
        data = np.frombuffer(raw.readframes(raw.getnframes()), dtype=np.int16)
        data = data.astype(np.float32) / 32768.0
        if raw.getnchannels() == 2:
            data = data.reshape(-1, 2)
        else:
            data = np.stack([data, data], 1)
        i0 = int(scene_starts[i] * SR)
        vo[i0:i0 + len(data)] += data
    vo = vo[: int(total * SR)]

    # ---- music bed with intro build
    music = build_music(total)
    # duck music slightly in the first second then open up (hook drama)
    music[: int(0.9 * SR)] *= np.linspace(0.25, 1.0, int(0.9 * SR))[:, None]
    # fade out at the tail
    tail = int(1.1 * SR)
    music[-tail:] *= np.linspace(1.0, 0.0, tail)[:, None]

    # ---- SFX
    sfx = np.zeros((int(total * SR), 2))
    place(sfx, sfx_riser(2.2), 0.02, db(-3.5))
    place(sfx, sfx_impact(0.9), 0.0, db(-1.5))
    for i, st in enumerate(scene_starts):
        if i == 0:
            continue
        kind = SCENES[i]["name"]
        place(sfx, sfx_whoosh(0.4), st - 0.20, db(-4.0), pan=-0.35)
        place(sfx, sfx_whoosh(0.4), st - 0.20, db(-4.0), pan=0.35)
        if kind in ("money", "cta"):
            place(sfx, sfx_impact(0.8), st, db(-5.0))
        if i % 2 == 0:
            place(sfx, sfx_glitch(0.14), st - 0.05, db(-8.0))
        # subtle UI pops on strong words
        n_words = len(SCENES[i]["words"])
        for w in range(n_words):
            if w % 3 == 1:
                place(sfx, sfx_pop(1250 + 90 * (w % 4)),
                      st + 0.02 + w * (timing[i + 1] / n_words), db(-16))
    place(sfx, sfx_coin(), scene_starts[8] + 1.0, db(-6.0), pan=-0.2)
    place(sfx, sfx_coin(), scene_starts[8] + 1.35, db(-9.0), pan=0.3)

    # ---- mix: duck music under VO (numpy sidechain)
    env = np.abs(vo).max(axis=1)
    win = int(0.09 * SR)
    kern = np.ones(win) / win
    env = np.convolve(env, kern, mode="same")
    env = np.clip(env / (np.percentile(env, 99) + 1e-9), 0, 1)
    duck = 1.0 - 0.62 * env
    music *= duck[:, None]

    mix = vo * db(0.5) + music + sfx
    mix = np.tanh(mix * 0.95)
    peak = np.abs(mix).max()
    mix = mix / peak * db(-1.0)

    out = os.path.join(BUILD, "mix_pre.wav")
    import wave
    w = wave.open(out, "wb")
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    w.close()
    print("wrote", out, f"{probe_dur(out):.2f}s")

    # ---- master chain (EBU R128 + limiter + tail fade)
    final = os.path.join(BUILD, "audio_master.wav")
    run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", out,
         "-af",
         "loudnorm=I=-14:TP=-1.0:LRA=7,"
         "alimiter=limit=0.94:attack=4:release=60:level=disabled,"
         f"afade=t=out:st={max(total - 0.55, 0):.2f}:d=0.55,"
         "aresample=48000",
         "-c:a", "pcm_s16le", final])
    print("mastered", final, f"{probe_dur(final):.2f}s")

    json.dump({"total": round(total, 3),
               "scene_starts": [round(s, 3) for s in scene_starts],
               "timing": timing},
              open(os.path.join(BUILD, "timeline.json"), "w"), indent=1)
    print("timeline written")


if __name__ == "__main__":
    main()
