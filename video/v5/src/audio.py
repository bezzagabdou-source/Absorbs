# -*- coding: utf-8 -*-
"""V5 «هل وصل الإنسان للقمر؟» — documentary score + sound design, fully synthesized.
120.000 s, mixed around the Arabic VO, mastered to -14 LUFS.
"""
import os, json, sys, subprocess, numpy as np, soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SR = 48000
TL = json.load(open(os.path.join(HERE, 'timeline.json')))
END = 120.0
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

def pluck_note(m, dur=1.2, bright=0.9):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(m); s = np.zeros(n)
    for h, a in ((1, 1.), (2, .5 * bright), (3, .26 * bright), (4, .12 * bright), (5, .06)):
        s += a * np.sin(2 * np.pi * f * h * t) * np.exp(-t * (2.2 + h * 1.0))
    return norm(s)

def zap(dur=1.4, f0=2400, f1=180, seed=9):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 7.0)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 3.2) + 0.35 * np.sin(2 * ph) * np.exp(-t * 5.0)
    s += rng.normal(0, 1, n) * np.exp(-t * 40) * 0.25
    return norm(s)

def ping(f=1650, dur=2.6, seed=4):
    n = int(dur * SR); t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.01 * t)) * np.exp(-t * 2.4)
    return norm(s)

def static_burst(dur=1.6, seed=5):
    n = int(dur * SR); t = np.arange(n) / SR
    s = rng.normal(0, 1, n)
    s = signal.sosfilt(signal.butter(3, [420, 5200], btype='band', fs=SR, output='sos'), s)
    env = (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 7.5 * t))) * np.exp(-t * 1.4)
    return norm(s * env)

def tick(seed=1):
    n = int(0.09 * SR); t = np.arange(n) / SR
    s = rng.normal(0, 1, n) * np.exp(-t * 120)
    s = signal.sosfilt(signal.butter(4, [1800, 7200], btype='band', fs=SR, output='sos'), s)
    return norm(s)

def taiko(dur=0.9, f0=64, seed=2):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f0 * (1 + 0.6 * np.exp(-t * 18))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)
    s += rng.normal(0, 1, n) * np.exp(-t * 60) * 0.2
    return norm(s)

# ---------------- continuous floor: deep space room tone + slow pad
A(amb, rumble(120, 7, 24, 105), 0.0, 0.30, 1.4)
A(amb, pad_plate(64, [26, 33, 38], 1), 0.0, 0.26, 1.4, wet=0.32)
A(amb, pad_plate(62, [31, 38, 45], 2), 58.0, 0.24, 1.4, wet=0.32)

CHORDS = {'Dm': [50, 53, 57, 62], 'Bb': [46, 50, 53, 58], 'F': [53, 57, 60, 65],
          'Gm': [43, 50, 55, 58], 'A': [45, 52, 57, 61], 'Cm': [48, 51, 55, 60]}
roots = {'Dm': 38, 'Bb': 34, 'F': 41, 'Gm': 31, 'A': 33, 'Cm': 36}
ORDER = ['hook', 'rocks', 'laser', 'lro', 'myths', 'signal', 'witness', 'cta']
CHMAP = {'hook': 'Dm', 'rocks': 'Bb', 'laser': 'F', 'lro': 'Gm', 'myths': 'A', 'signal': 'Dm', 'witness': 'Bb', 'cta': 'F'}
for i, bid in enumerate(ORDER):
    b = B[bid]; t0, t1 = b['start'], b['end']
    dur = t1 - t0 + 0.6
    ch = CHMAP[bid]
    g = 0.42 + 0.05 * i
    A(music, strings(CHORDS[ch], dur, 1.0, 1.6, 110, 2000 + 120 * i, seed=60 + i, trem=0.10), t0, g * 0.62, 1.15, wet=0.24)
    A(music, choir(CHORDS[ch][:3], dur, 1.2, 1.4), t0, g * 0.22, 1.25, wet=0.30)
    nb = int(dur * SR); tb = np.arange(nb) / SR
    sb = np.sin(2 * np.pi * hz(roots[ch] - 12) * tb) * np.clip(tb / .6, 0, 1) * np.clip((dur - tb) / .8, 0, 1)
    A(music, np.tanh(sb * 2.0) * 0.95, t0, g * 0.40, 0.4)

# ---------------- clock: from the rocks chapter on, a tick that keeps time
tk = B['rocks']['start']
k = 0
while tk < 104.0:
    prog = np.clip((tk - 12) / 92.0, 0, 1)
    A(sfx, tick(seed=k), tk, 0.055 + 0.035 * prog, 0.5, pan=(0.5 if k % 2 else -0.5), wet=0.10)
    tk += 1.0; k += 1

# ---------------- low pulse (heart of the doc), every 2s, denser later
tp = 12.2
while tp < 104.5:
    prog = np.clip((tp - 12) / 92.0, 0, 1)
    A(music, pluck_note((45, 43, 41, 43)[int(tp) % 4], 0.5, 0.8), tp, 0.10 + 0.10 * prog, 0.8, pan=0.1, wet=0.16)
    tp += 2.0

# ---------------- structural hits on every chapter cut
CUTS = [B[b]['start'] for b in ORDER]
for i, tc in enumerate(CUTS):
    big = i in (0, 4, 7)
    A(sfx, whoosh(1.1, 260, 3800 + 200 * i, 1.0, seed=70 + i), tc - 0.75, 0.30 + (0.06 if big else 0), 1.3, pan=(0.4 if i % 2 else -0.4), wet=0.30)
    A(sfx, riser(0.9, 180, 6200, 0.22, seed=80 + i), tc - 0.9, 0.16, 0.95, wet=0.28)
    A(sfx, impact(2.2, 96, 1.0, 0.45, 0.5, seed=int(tc)), tc, (0.55 if big else 0.34), 0.5, wet=0.24)
    A(sfx, sub(1.8, 96, 26, 1.1), tc, 0.42, 0.2)
    A(music, timpani(1.4, hz(38) * 0.6), tc, 0.26, 0.6, wet=0.28)

# braams at the three act turns
A(sfx, braam(2.8, (34, 41, 46, 50), 4), B['hook']['start'], 0.52, 1.05, wet=0.30)
A(sfx, braam(3.0, (36, 43, 48), 5), B['myths']['start'], 0.62, 1.05, wet=0.32)
A(sfx, braam(3.4, (26, 38, 45, 50), 6), B['cta']['start'], 0.66, 1.1, wet=0.36)

# ---------------- chapter colour
# rocks: slow metallic clangs (moon rock, lab)
for n_, at in enumerate([15.0, 22.5, 27.0]):
    A(sfx, ping(940 + 220 * n_, 3.0, seed=90 + n_), at, 0.10, 1.1, pan=(-0.3 + 0.3 * n_), wet=0.5)
# laser: the zap + return ping
A(sfx, zap(1.6, 2600, 170), B['laser']['start'] + 12.4, 0.42, 0.9, wet=0.35)
A(sfx, zap(1.2, 1800, 140), B['laser']['start'] + 17.2, 0.30, 0.9, pan=0.35, wet=0.35)
A(sfx, ping(1750, 3.2), B['laser']['start'] + 19.0, 0.20, 1.2, wet=0.55)
A(sfx, ping(1240, 2.8), B['laser']['start'] + 23.5, 0.14, 1.2, wet=0.55)
# lro: scanning beeps + soft static
for n_ in range(6):
    A(sfx, ping(2400, 0.5), B['lro']['start'] + 2.0 + n_ * 1.9, 0.09, 0.7, pan=(-0.5 + 0.2 * n_), wet=0.4)
# myths: rapid taiko + glitch stabs, one per card
for n_, off in enumerate([0.6, 4.0, 8.0]):
    A(sfx, taiko(0.9, 62 - 4 * n_, seed=n_), B['myths']['start'] + off, 0.40, 0.7, wet=0.20)
    A(sfx, boom(0.9, 90, 34), B['myths']['start'] + off + 0.06, 0.26, 0.2)
    A(sfx, static_burst(0.8, seed=n_), B['myths']['start'] + off + 0.42, 0.12, 1.1, pan=0.4, wet=0.2)
# signal: radio static + morse pips
A(sfx, static_burst(3.4), B['signal']['start'] + 1.0, 0.20, 1.2, wet=0.3)
for n_ in range(10):
    A(sfx, ping(900 + 40 * (n_ % 3), 0.28), B['signal']['start'] + 5.0 + n_ * 0.42, 0.06, 0.6, pan=(-0.6 if n_ % 2 else 0.6), wet=0.2)
# witness: heartbeat under the reveal
hb = B['witness']['start'] + 1.0
while hb < B['witness']['end'] - 1.0:
    A(sfx, boom(0.5, 58, 30), hb, 0.16, 0.2)
    A(sfx, boom(0.4, 54, 28), hb + 0.34, 0.10, 0.2)
    hb += 1.5
# cta: shimmer rise + final hit
A(sfx, shimmer(6.0, (86, 93, 98, 105)), B['cta']['start'] + 2.0, 0.22, 1.3, wet=0.5)
A(sfx, shimmer(5.0, (81, 88, 93, 100, 105)), B['cta']['start'] + 45.0, 0.16, 1.0, wet=0.5)
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
mix *= np.clip((END - t) / 1.6, 0, 1)[:, None]
# normalise
pk = np.abs(mix).max()
mix = mix / pk * 0.92
out = os.path.join(ROOT, 'out', 'mix5.wav')
os.makedirs(os.path.dirname(out), exist_ok=True)
sf.write(out, mix, SR, subtype='FLOAT')
print('wrote', out, mix.shape, 'peak', np.abs(mix).max())
