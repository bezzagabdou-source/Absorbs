# -*- coding: utf-8 -*-
"""V3 «ضخم» — cinematic trailer score + sound design, fully synthesized.
35.000 s, mixed around the Arabic VO, mastered to -14 LUFS.
"""
import os, json, sys, subprocess, numpy as np, soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SR = 48000
TL = json.load(open(os.path.join(HERE, 'timeline.json')))
END = 35.0
N = int(round(END * SR))
rng = np.random.default_rng(7)

B = {b['id']: b for b in TL['beats']}
LINES = TL['lines']
T0 = {k: v['start'] for k, v in B.items()}

def hz(m): return 440.0 * 2 ** ((m - 69) / 12.0)
def norm(x):
    m = np.abs(x).max()
    return x / m if m > 1e-9 else x
def add(buf, sig, at, g=1.0):
    i = int(round(at * SR)); sig = np.asarray(sig, dtype=np.float64)
    if i >= len(buf): return
    if i < 0: sig = sig[-i:]; i = 0
    n = min(len(sig), len(buf) - i)
    buf[i:i + n] += sig[:n] * g
def fade(x, a=0.01, r=0.05):
    n = len(x); t = np.arange(n) / SR
    e = np.clip(t / max(a, 1e-6), 0, 1) * np.clip((n / SR - t) / max(r, 1e-6), 0, 1)
    return x * e

# ---------------------------------------------------------------- space
def make_ir(dur=3.6, decay=2.4, predelay=0.02, lo=180, hi=9000):
    n = int(dur * SR); t = np.arange(n) / SR
    ir = rng.normal(0, 1, n) * np.exp(-t * decay)
    ir = signal.sosfilt(signal.butter(2, [lo, hi], btype='band', fs=SR, output='sos'), ir)
    pd = int(predelay * SR)
    ir[:pd] *= np.linspace(0, 1, pd)
    return ir / np.sqrt((ir ** 2).sum())
IR_S = make_ir(2.8, 3.2, 0.014, 220, 8000)
IR_L = make_ir(5.0, 1.9, 0.030, 120, 6500)

def verb(x, wet=0.3, ir=None):
    ir = IR_S if ir is None else ir
    w = signal.fftconvolve(x, ir, mode='full')[:len(x) + len(ir)]
    out = np.zeros(len(x) + len(ir))
    out[:len(x)] += x
    out[:len(w)] += w * wet * 2.6
    return out

def stereo(x, width=1.0, pan=0.0):
    """cheap width: decorrelated Haas delay"""
    d = int(0.006 * SR * width)
    l = x.copy(); r = x.copy()
    if d > 0:
        r[d:] += x[:-d] * 0.5 * width
        r[:d] += x[:d] * 0.2
    lg = (1 - pan) * 0.5 + 0.5; rg = (1 + pan) * 0.5 + 0.5
    return np.stack([l * lg, r * rg], axis=1)

# ---------------------------------------------------------------- instruments
def saw(f, n, det=0.005, voices=3, seed=0):
    r = np.random.default_rng(seed); t = np.arange(n) / SR
    out = np.zeros(n)
    for v in range(voices):
        fv = f * (1 + det * (v - (voices - 1) / 2))
        out += signal.sawtooth(2 * np.pi * fv * t + r.uniform(0, 6.28))
    return out / voices

def strings(notes, dur, attack=0.8, rel=1.4, lo=110, hi=2400, seed=0, trem=0.0):
    n = int((dur + rel) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for i, m in enumerate(notes):
        out += saw(hz(m), n, 0.006, 4, seed + i) * (1.0 if i == 0 else 0.72)
    out = signal.sosfilt(signal.butter(2, [lo, hi], btype='band', fs=SR, output='sos'), out)
    if trem: out *= 1 - trem * 0.4 * (0.5 + 0.5 * np.sin(2 * np.pi * 6.1 * t))
    e = np.clip(t / attack, 0, 1) ** 1.5 * np.clip((dur + rel - t) / rel, 0, 1) ** 1.5
    return norm(out * e)

def brass(notes, dur, attack=0.25, rel=0.9, seed=0):
    n = int((dur + rel) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for i, m in enumerate(notes):
        f = hz(m)
        vib = 1 + 0.004 * np.sin(2 * np.pi * 5.0 * t + i)
        ph = 2 * np.pi * np.cumsum(f * vib) / SR
        s = np.zeros(n)
        for h, a in ((1, 1.0), (2, 0.62), (3, 0.4), (4, 0.24), (5, 0.12), (6, 0.07)):
            s += a * np.sin(h * ph)
        out += s
    out = signal.sosfilt(signal.butter(2, [70, 4200], btype='band', fs=SR, output='sos'), out)
    e = np.clip(t / attack, 0, 1) ** 1.2 * np.clip((dur + rel - t) / rel, 0, 1) ** 1.6
    return np.tanh(norm(out) * 1.5 * e) * 0.8

def choir(notes, dur, attack=1.5, rel=1.8):
    n = int((dur + rel) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for i, m in enumerate(notes):
        for dt in (0, 0.005, -0.004):
            ph = 2 * np.pi * hz(m) * (1 + dt) * t + 0.35 * np.sin(2 * np.pi * 4.6 * t + i)
            for h, a in ((1, 1.0), (2, 0.42), (3, 0.24), (4, 0.12), (5, 0.06)):
                out += a * np.sin(h * ph)
    out = signal.sosfilt(signal.butter(2, [150, 3400], btype='band', fs=SR, output='sos'), out)
    e = np.clip(t / attack, 0, 1) ** 1.4 * np.clip((dur + rel - t) / rel, 0, 1) ** 1.6
    return norm(out * e)

def sub(dur, f0=90, f1=26, decay=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 2.0)
    return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * decay))

def impact(dur=3.2, f0=120, body=1.0, grit=0.55, bright=0.45, seed=1):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 22 + f0 * np.exp(-t * 5.5)
    sb = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.1) * body
    r = np.random.default_rng(seed)
    nz = r.normal(0, 1, n) * np.exp(-t * 2.4)
    nz = signal.sosfilt(signal.butter(2, [90, 900 + 7000 * bright], btype='band', fs=SR, output='sos'), nz) * grit
    cl = r.normal(0, 1, int(0.015 * SR)) * np.exp(-np.arange(int(0.015 * SR)) / (0.003 * SR))
    out = sb + nz
    out[:len(cl)] += cl * 0.8
    return norm(out)

def braam(dur=2.6, notes=(38, 45, 50), seed=3):
    n = int(dur * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for i, m in enumerate(notes):
        f = hz(m)
        ph = 2 * np.pi * np.cumsum(f * (1 - 0.06 * (t / dur) ** 2)) / SR
        for h, a in ((1, 1.0), (2, 0.7), (3, 0.5), (4, 0.3), (5, 0.18), (7, 0.1)):
            out += a * np.sin(h * ph + i)
    out = signal.sosfilt(signal.butter(2, [40, 2200], btype='band', fs=SR, output='sos'), out)
    e = np.clip(t / 0.06, 0, 1) * np.exp(-t * 0.85)
    return np.tanh(norm(out * e) * 2.2) * 0.85

def riser(dur=2.4, f0=120, f1=5200, tone=0.3, seed=5):
    n = int(dur * SR); t = np.arange(n) / SR
    r = np.random.default_rng(seed)
    nz = r.normal(0, 1, n)
    cut = f0 * (f1 / f0) ** (t / dur)
    al = np.clip(2 * np.pi * cut / SR, 0, .95)
    out = np.zeros(n); acc = 0.
    for i in range(n):
        acc += al[i] * (nz[i] - acc); out[i] = acc
    sw = np.sin(2 * np.pi * np.cumsum(f0 * (f1 / f0) ** (t / dur)) / SR * 0.5)
    return norm((out + sw * tone) * (t / dur) ** 2.3)

def whoosh(dur=1.0, f0=280, f1=3200, shape=1.0, seed=3):
    n = int(dur * SR); t = np.arange(n) / SR
    r = np.random.default_rng(seed)
    nz = r.normal(0, 1, n)
    cut = f0 * (f1 / f0) ** ((t / dur) ** shape)
    al = np.clip(2 * np.pi * cut / SR, 0, .95)
    out = np.zeros(n); acc = 0.
    for i in range(n):
        acc += al[i] * (nz[i] - acc); out[i] = acc
    return norm(out * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5)

def boom(dur=1.6, f0=70, f1=32):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-t * 8)) / SR) * np.exp(-t * 2.6)
    return norm(s)

def tick(dur=0.09, kind='hi'):
    n = int(dur * SR); t = np.arange(n) / SR
    b = np.sin(2 * np.pi * (2400 if kind == 'hi' else 1600) * t) * np.exp(-t * 130)
    b += 0.55 * rng.normal(0, 1, n) * np.exp(-t * 320)
    return norm(b)

def shimmer(dur=5.0, notes=(86, 93, 98, 100, 105), seed=0):
    n = int(dur * SR); t = np.arange(n) / SR; o = np.zeros(n)
    for k, m in enumerate(notes):
        for d in (0, .08, .17, .29, .4):
            s = np.sin(2 * np.pi * hz(m) * t + k * 1.3) * np.exp(-np.maximum(0, t - d) * 1.2)
            s[:int(d * SR)] = 0
            o += s * .18
    return norm(o * np.clip(t / .04, 0, 1) * np.clip((dur - t) / 1.2, 0, 1))

def rumble(dur, seed=11, lo=28, hi=140):
    n = int(dur * SR); t = np.arange(n) / SR
    r = np.random.default_rng(seed)
    x = signal.sosfilt(signal.butter(2, [lo, hi], btype='band', fs=SR, output='sos'), r.normal(0, 1, n))
    lfo = 0.55 + 0.45 * np.sin(2 * np.pi * 0.17 * t) ** 2
    e = np.clip(t / 1.2, 0, 1) * np.clip((dur - t) / 1.4, 0, 1)
    return norm(x * lfo * e)

def timpani(dur=1.5, f0=62):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * np.cumsum(f0 * (1 + 0.06 * np.exp(-t * 22))) / SR) * np.exp(-t * 3.4)
    s += 0.35 * rng.normal(0, 1, n) * np.exp(-t * 30)
    return norm(s)

def pad_plate(dur, notes, seed=0):
    n = int(dur * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for i, m in enumerate(notes):
        for k, det in enumerate((-0.004, 0, 0.004)):
            f = hz(m) * (1 + det)
            out += np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * 0.21 * t + k) * 0.9)
    out = signal.sosfilt(signal.butter(2, [180, 5200], btype='band', fs=SR, output='sos'), out)
    e = np.clip(t / 1.6, 0, 1) * np.clip((dur - t) / 1.8, 0, 1)
    return norm(out * e)

# ================================================================ SCORE
music = np.zeros((N, 2)); sfx = np.zeros((N, 2)); amb = np.zeros((N, 2))
def A(bus, sig, at, g=1.0, width=1.0, pan=0.0, wet=0.0):
    s = stereo(sig, width, pan)
    if wet > 0:
        s = s + stereo(verb(sig, wet, IR_L)[:len(sig)], 0.6) * 0.5
    add(bus, s, at, g)

# --- global space ambience
A(amb, rumble(36, 11, 26, 120), 0.0, 0.30, 1.2)
A(amb, pad_plate(35.6, [26, 38, 45], 1), 0.0, 0.26, 1.3, wet=0.3)

CHORDS = {
 'Dm': [50, 53, 57, 62], 'Bb': [46, 50, 53, 58], 'F': [53, 57, 60, 65],
 'Gm': [43, 50, 55, 58], 'A': [45, 52, 57, 61],
}
# harmony bed: warm, evolving, one chord per beat (with a shift mid-beat)
BED = [
  (0.00, 'Dm', 3.30, 0.36), (3.71, 'Bb', 3.76, 0.40), (7.47, 'F', 2.55, 0.44),
  (10.02, 'Gm', 2.48, 0.46), (12.50, 'Dm', 2.60, 0.50), (15.10, 'Bb', 2.52, 0.52),
  (17.62, 'F', 1.90, 0.54), (19.53, 'Gm', 1.92, 0.52), (21.45, 'Bb', 3.05, 0.50),
  (24.50, 'F', 3.05, 0.52), (27.55, 'Dm', 2.50, 0.56), (30.05, 'Bb', 2.00, 0.58),
  (32.04, 'F', 1.60, 0.62), (33.64, 'Dm', 1.36, 0.66),
]
roots = {'Dm': 38, 'Bb': 34, 'F': 41, 'Gm': 31, 'A': 33}
for i, (t0, ch, dur, g) in enumerate(BED):
    A(music, strings(CHORDS[ch], dur, 0.9, 1.5, 110, 2200 + 120 * i, seed=30 + i), t0, g * 0.62, 1.1, wet=0.22)
    A(music, choir(CHORDS[ch][:3], dur, 1.3, 1.4), t0, g * 0.30, 1.2, wet=0.3)
    nb = int((dur + 0.5) * SR); tb = np.arange(nb) / SR
    sb = np.sin(2 * np.pi * hz(roots[ch] - 12) * tb) * np.clip(tb / .35, 0, 1) * np.clip((dur + .5 - tb) / .6, 0, 1)
    A(music, np.tanh(sb * 2.0) * 0.9, t0, g * 0.40, 0.4)

# --- pulse engine (the "engine" of the trailer), builds across the film
def pulse_from(t_start, t_end, bpm, level, inst='pluck'):
    step = 60 / bpm
    t = t_start; k = 0
    while t < t_end:
        prog = np.clip((t - 3.0) / 26.0, 0, 1)
        g = level * (0.55 + 0.75 * prog)
        if inst == 'pluck':
            A(music, pluck_note((45, 52, 50, 48)[k % 4], 0.45), t, g * 0.55, 0.7, pan=(-0.35 if k % 2 else 0.35), wet=0.18)
        t += step; k += 1

def pluck_note(m, dur=1.2, bright=0.9):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(m); s = np.zeros(n)
    for h, a in ((1, 1.), (2, .5 * bright), (3, .26 * bright), (4, .12 * bright), (5, .06)):
        s += a * np.sin(2 * np.pi * f * h * t) * np.exp(-t * (2.2 + h * 1.0))
    return norm(s)

pulse_from(0.43, 33.9, 66, 0.30)
pulse_from(12.5, 33.9, 132, 0.16)

# --- percussion: timpani / hits on structural beats
HITS = [
 (0.43, 0.34, 44), (3.72, 0.55, 50), (7.47, 0.72, 55), (12.50, 0.60, 48),
 (17.63, 0.80, 44), (21.45, 0.66, 50), (27.55, 0.86, 44), (32.04, 1.00, 40),
]
for t0, g, note in HITS:
    A(sfx, impact(2.6, 110 + note, 1.0, 0.5, 0.5, seed=int(t0 * 10)), t0, g * 0.85, 0.5, wet=0.25)
    A(sfx, sub(1.9, 96, 24, 1.0), t0, g * 0.55, 0.2)
    A(music, timpani(1.3, hz(note) * 0.55), t0, g * 0.42, 0.6, wet=0.3)

# --- braams at the two "epic" moments
A(sfx, braam(2.8, (38, 45, 50), 4), T0['sun'], 0.62, 1.0, wet=0.3)
A(sfx, braam(3.0, (34, 41, 46, 50), 5), T0['web'], 0.66, 1.0, wet=0.35)
A(sfx, braam(3.4, (26, 38, 45, 50), 6), 32.04, 0.86, 1.1, wet=0.4)

# --- transitions
trans = [3.715, 7.471, 12.504, 17.626, 21.448, 27.553, 32.035]
for i, tc in enumerate(trans):
    A(sfx, whoosh(1.15, 260, 3400 + 300 * i, 1.0, seed=40 + i), tc - 0.72, 0.40, 1.3, pan=(0.4 if i % 2 else -0.4), wet=0.35)
    A(sfx, riser(1.05, 180, 6200, 0.22, seed=50 + i), tc - 1.05, 0.24, 0.9, wet=0.3)
    A(sfx, boom(1.4, 80, 30), tc, 0.42, 0.3)
    A(sfx, impact(1.2, 150, 0.5, 0.3, 0.8, seed=60 + i), tc, 0.26, 0.7, wet=0.2)

# opening air + light switch-on
A(sfx, whoosh(2.6, 90, 1500, 2.2, seed=70), -0.3, 0.26, 1.3, wet=0.4)
A(sfx, shimmer(6.0, (86, 93, 98, 105)), 0.30, 0.20, 1.2, wet=0.45)

# galaxy: bells
A(sfx, shimmer(5.0, (91, 98, 103, 110)), 17.7, 0.22, 1.2, wet=0.4)
# cosmic web: airy cluster
A(sfx, whoosh(2.2, 400, 9000, 0.7, 81), 21.5, 0.18, 1.4, wet=0.5)
# "you are here" heartbeat
hb = 27.6
while hb < 32.0:
    A(sfx, boom(0.5, 62, 34), hb, 0.22, 0.2)
    A(sfx, boom(0.4, 58, 32), hb + 0.31, 0.13, 0.2)
    hb += 0.86
# end card sparkle
A(sfx, shimmer(3.6, (93, 100, 105, 110, 117)), 32.1, 0.28, 1.3, wet=0.5)

# ================================================================ VOICE
vo = np.zeros((N, 2))
VO_DIR = os.path.join(ROOT, 'vo')
for ln in LINES:
    f = os.path.join(VO_DIR, f"{ln['i']:02d}.wav")
    x, sr = sf.read(f)
    if x.ndim > 1: x = x.mean(1)
    x = x.astype(np.float64)
    if sr != SR:
        x = signal.resample_poly(x, SR, sr)
    x = x / (np.abs(x).max() + 1e-9)
    # broadcast chain: HPF, presence, de-ess-ish, gentle compression, saturation
    x = signal.sosfilt(signal.butter(2, 92, btype='high', fs=SR, output='sos'), x)
    x = signal.sosfilt(signal.butter(2, [1600, 7800], btype='band', fs=SR, output='sos'), x) * 0.32 + x * 0.82
    x = signal.sosfilt(signal.butter(2, 11000, btype='low', fs=SR, output='sos'), x)
    # compressor
    env = np.abs(signal.hilbert(x)) if len(x) < SR * 12 else np.abs(x)
    k = int(0.012 * SR)
    env = np.convolve(env, np.ones(k) / k, 'same')
    thr = np.percentile(env, 72) + 1e-6
    gain = np.where(env > thr, (thr / (env + 1e-9)) ** 0.55, 1.0)
    x = x * gain
    x = np.tanh(x * 1.35) * 0.78
    x = fade(x, 0.01, 0.03)
    add(vo, stereo(x, 0.15) * 0.92, ln['start'], 1.0)
    # a touch of plate for space
    add(vo, stereo(verb(x, 0.16, IR_L)[:len(x)] * 0.5, 0.6), ln['start'], 0.16)

# ---------------------------------------------------------------- ducking
envv = np.abs(vo).mean(1)
k = int(0.09 * SR)
duck = np.convolve(envv, np.ones(k) / k, 'same')
duck = np.clip(duck / (duck.max() + 1e-9) * 3.0, 0, 1)
duck_s = 1.0 - 0.42 * duck
music *= duck_s[:, None]
amb *= (1.0 - 0.30 * duck)[:, None]

# ---------------------------------------------------------------- master
mix = music * 0.92 + sfx * 0.86 + amb * 0.80 + vo * 1.02
mix = np.stack([verb(mix[:, 0], 0.10, IR_L)[:N], verb(mix[:, 1], 0.10, IR_L)[:N]], axis=1)
# gentle bus glue + soft clip
mix = np.tanh(mix * 1.15) * 0.94
# fades
n = N; t = np.arange(n) / SR
fo = np.clip(t / 0.35, 0, 1)
mix *= fo[:, None]
mix *= np.clip((END - t) / 0.55, 0, 1)[:, None]
# normalise
pk = np.abs(mix).max()
mix = mix / pk * 0.92
out = os.path.join(ROOT, 'out', 'mix3.wav')
os.makedirs(os.path.dirname(out), exist_ok=True)
sf.write(out, mix, SR, subtype='FLOAT')
print('wrote', out, mix.shape, 'peak', np.abs(mix).max())
