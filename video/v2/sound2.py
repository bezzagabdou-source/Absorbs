# -*- coding: utf-8 -*-
"""«٨ دقائق» — cinematic sound design, fully synthesized (no licensed samples).
Physical-modeled impacts, convolution reverb from a synthetic IR, granular clock ticks,
tape-saturated sub drops. Mixed to -14 LUFS."""
import os, sys, numpy as np, soundfile as sf
from scipy import signal
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', 'build'))
from timeline2 import CUT2, END, SR

rng = np.random.default_rng(11)
N = int(END * SR)
t_axis = np.arange(N) / SR

def hz(m): return 440.0 * 2 ** ((m - 69) / 12.0)
def norm(x): return x / (np.abs(x).max() + 1e-9)
def add(buf, sig, at, g=1.0):
    i = int(at * SR)
    if i >= len(buf) or i < 0:
        if i < 0: sig = sig[-i:]; i = 0
        else: return
    n = min(len(sig), len(buf) - i)
    buf[i:i+n] += sig[:n] * g

# ---------------------------------------------------------------- room
def make_ir(dur=2.6, decay=3.4, predelay=0.012, bright=0.55):
    n = int(dur * SR); t = np.arange(n) / SR
    ir = rng.normal(0, 1, n) * np.exp(-t * decay)
    sos = signal.butter(2, [200, 900 + 9000 * bright], btype='band', fs=SR, output='sos')
    ir = signal.sosfilt(sos, ir)
    ir[:int(predelay * SR)] *= np.linspace(0, 1, int(predelay * SR))
    return ir / np.sqrt((ir ** 2).sum())
IR = make_ir()
IR_BIG = make_ir(4.2, 2.1, 0.03, 0.75)

def verb(x, wet=0.35, ir=None):
    ir = IR if ir is None else ir
    w = signal.fftconvolve(x, ir)[:len(x)]
    return x * (1 - wet) + w * wet * 2.2

def rms(x): return float(np.sqrt((x ** 2).mean() + 1e-12))
def env_follow(x, ms=40):
    k = int(SR * ms / 1000)
    return np.convolve(np.abs(x), np.ones(k) / k, mode='same')

# ---------------------------------------------------------------- instruments
def saw_voice(f, n, detune=0.004, voices=3, seed=0):
    r = np.random.default_rng(seed); tt = np.arange(n) / SR; out = np.zeros(n)
    for v in range(voices):
        fv = f * (1 + detune * (v - (voices - 1) / 2))
        ph = r.uniform(0, 6.28)
        out += signal.sawtooth(2 * np.pi * fv * tt + ph)
    return out / voices

def strings(notes, dur, attack=0.9, release=1.6, bright=1600, seed=0, trem=0.0):
    n = int((dur + release) * SR); tt = np.arange(n) / SR
    out = np.zeros(n)
    for i, m in enumerate(notes):
        out += saw_voice(hz(m), n, 0.004, 3, seed + i) * (0.8 if i else 1.0)
    sos = signal.butter(2, [120, bright], btype='band', fs=SR, output='sos')
    out = signal.sosfilt(sos, out)
    if trem: out *= 1 - trem * 0.5 * (0.5 + 0.5 * np.sin(2 * np.pi * 5.2 * tt))
    e = np.clip(tt / attack, 0, 1) ** 1.4
    tail = np.clip((dur + release - tt) / release, 0, 1) ** 1.6
    return norm(out * e * tail)

def sub_drop(dur=2.4, f0=90, f1=26, decay=1.1):
    n = int(dur * SR); tt = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-tt * 2.2)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * decay)
    return norm(s)

def impact(dur=3.0, f0=110, body=1.0, grit=0.5, bright=0.4):
    """hybrid trailer impact: pitched sub + filtered noise body + transient click"""
    n = int(dur * SR); tt = np.arange(n) / SR
    f = 24 + f0 * np.exp(-tt * 6)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 1.3) * body
    nz = rng.normal(0, 1, n) * np.exp(-tt * 2.2)
    nz = signal.sosfilt(signal.butter(2, [90, 900 + 7000 * bright], btype='band', fs=SR, output='sos'), nz) * grit
    click = rng.normal(0, 1, int(0.02 * SR)) * np.exp(-np.arange(int(0.02 * SR)) / (0.004 * SR))
    out = sub + nz
    out[:len(click)] += click * 0.7
    return norm(out)

def whoosh(dur=1.1, f0=300, f1=2600, shape=1.0, seed=3):
    n = int(dur * SR); tt = np.arange(n) / SR
    nz = np.random.default_rng(seed).normal(0, 1, n)
    out = np.zeros(n); acc = 0.0
    cut = f0 * (f1 / f0) ** ((tt / dur) ** shape)
    al = np.clip(2 * np.pi * cut / SR, 0, .95)
    for i in range(n):
        acc += al[i] * (nz[i] - acc); out[i] = acc
    return norm(out * np.sin(np.pi * np.clip(tt / dur, 0, 1)) ** 1.4)

def riser(dur=2.6, f0=120, f1=3200, tone=0.35):
    n = int(dur * SR); tt = np.arange(n) / SR
    nz = rng.normal(0, 1, n); out = np.zeros(n); acc = 0.
    cut = f0 * (f1 / f0) ** (tt / dur)
    al = np.clip(2 * np.pi * cut / SR, 0, .95)
    for i in range(n):
        acc += al[i] * (nz[i] - acc); out[i] = acc
    sweep = np.sin(2 * np.pi * np.cumsum(f0 * (f1 / f0) ** (tt / dur)) / SR * 0.5)
    return norm((out + sweep * tone) * (tt / dur) ** 2.1)

def tick(kind='clock', dur=0.09):
    n = int(dur * SR); tt = np.arange(n) / SR
    if kind == 'clock':
        b = np.sin(2 * np.pi * 2100 * tt) * np.exp(-tt * 120) + 0.5 * np.sin(2 * np.pi * 3300 * tt) * np.exp(-tt * 200)
    else:
        b = np.sin(2 * np.pi * 900 * tt) * np.exp(-tt * 90)
    b += 0.7 * rng.normal(0, 1, n) * np.exp(-tt * 320)
    return norm(b)

def ice_crack(dur=0.5, seed=5):
    n = int(dur * SR); tt = np.arange(n) / SR
    r = np.random.default_rng(seed)
    hits = np.zeros(n)
    for _ in range(r.integers(5, 12)):
        i = r.integers(0, n - 1000); d = r.uniform(0.002, 0.02)
        L = int(0.12 * SR)
        g = np.exp(-np.arange(L) / (d * SR)) * r.uniform(0.3, 1)
        hits[i:i + L] += g[:n - i] if i + L > n else g
    nz = r.normal(0, 1, n)
    out = signal.sosfilt(signal.butter(3, [1800, 9000], btype='band', fs=SR, output='sos'), nz) * 0.6 + hits * 2
    return norm(out * np.exp(-tt * 3))

def wind(dur=6.0, seed=9):
    n = int(dur * SR); tt = np.arange(n) / SR
    nz = np.random.default_rng(seed).normal(0, 1, n)
    out = signal.sosfilt(signal.butter(2, [180, 1100], btype='band', fs=SR, output='sos'), nz)
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * 0.13 * tt + 1.2) * np.sin(2 * np.pi * 0.07 * tt)
    return norm(out * lfo * np.clip(tt / 1.5, 0, 1))

def heartbeat(dur=2.0):
    n = int(dur * SR); tt = np.arange(n) / SR; out = np.zeros(n)
    for off, g in ((0, 1.0), (0.34, 0.62)):
        i = int(off * SR); L = int(0.35 * SR)
        x = np.arange(L) / SR
        f = 60 * np.exp(-x * 12) + 34
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 9) * g
        out[i:i + L] += s[:max(0, min(L, n - i))]
    return norm(out)

def pluck(m, dur=1.4, bright=0.8):
    n = int(dur * SR); tt = np.arange(n) / SR; f = hz(m); s = np.zeros(n)
    for h, a in ((1, 1.), (2, .45 * bright), (3, .22 * bright), (4, .1 * bright), (5, .05)):
        s += a * np.sin(2 * np.pi * f * h * tt) * np.exp(-tt * (1.8 + h * .9))
    return norm(s)

def shimmer(dur=4., notes=(88, 91, 95, 98, 103)):
    n = int(dur * SR); tt = np.arange(n) / SR; o = np.zeros(n)
    for k, m in enumerate(notes):
        for d in (0, .07, .15, .24):
            s = np.sin(2 * np.pi * hz(m) * tt + k) * np.exp(-np.maximum(0, tt - d) * 1.5)
            s[:int(d * SR)] = 0; o += s * .2
    return norm(o * np.clip(tt / .05, 0, 1))

def pad_choir(notes, dur, attack=1.5, release=2.0, seed=0):
    n = int((dur + release) * SR); tt = np.arange(n) / SR; out = np.zeros(n)
    for i, m in enumerate(notes):
        for v, amp in ((0, 1.), (0.006, .6), (-0.005, .6)):
            f = hz(m) * (1 + v)
            ph = (2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * 4.8 * tt + i)
            for h, a in ((1, 1.), (2, .5), (3, .3), (4, .18), (5, .09)):
                out += amp * a * np.sin(h * ph) 
    out = signal.sosfilt(signal.butter(2, [140, 3200], btype='band', fs=SR, output='sos'), out)
    e = np.clip(tt / attack, 0, 1) ** 1.5 * np.clip((dur + release - tt) / release, 0, 1) ** 1.7
    return norm(out * e)

def tape_sat(x, drive=1.4):
    return np.tanh(x * drive) / np.tanh(drive)


# ================================================================ SCORE
CUT = CUT2
music = np.zeros(N); sfx = np.zeros(N); amb = np.zeros(N)

# ---- 0.0–4.6  cold open: one held, detuning drone + distant heartbeat
add(amb, strings([38, 45, 50], 5.0, attack=1.6, release=1.2, bright=700, seed=1), 0.0, 0.30)
add(amb, pad_choir([45, 52, 57], 4.6, attack=2.2, release=1.2), 0.1, 0.20)
add(amb, shimmer(4.2, (88, 95, 100)), 0.25, 0.16)
hb = 0.0
while hb < 8.4:
    add(music, heartbeat(0.6), hb, 0.16 + 0.18 * min(1, hb / 8))
    hb += 0.92

# ---- 4.6 clock: tick every second, tightening into the reveal
tk = CUT['clock']
while tk < CUT['travel'] - 0.2:
    k = 'clock' if int((tk - CUT['clock']) * 2) % 2 == 0 else 'tock'
    add(sfx, tick(k), tk, 0.34)
    tk += 0.5
# accelerating ticks (last two seconds)
tk = CUT['travel'] - 2.0; gap = 0.5
while tk < CUT['travel']:
    add(sfx, tick('clock'), tk, 0.36)
    tk += gap; gap = max(0.055, gap * 0.86)

# ---- chord bed (Dm – Bb – F – Gm – A) tension arc
PROG = [(0.0,   'Dm', 4.6, 0.55), (4.6,  'Dm', 4.0, 0.62), (8.5,  'Bb', 4.5, 0.70),
        (13.0,  'F',  3.4, 0.78), (16.4,  'Gm', 1.2, 0.85), (17.6, 'Gm', 2.5, 0.80),
        (20.08, 'Dm', 3.6, 0.78), (23.75, 'Bb', 3.3, 0.80), (27.10, 'F', 5.0, 0.86),
        (32.10, 'Dm', 3.8, 0.95), (35.90, 'Dm', 3.5, 0.80)]
CH = {'Dm': [38, 50, 53, 57, 62, 65], 'Bb': [34, 46, 50, 53, 58, 62],
      'F': [41, 53, 57, 60, 65, 69], 'Gm': [31, 43, 46, 50, 55, 58]}
for i, (t0, ch, dur, g) in enumerate(PROG):
    add(music, strings(CH[ch][1:], dur, 0.8 if i else 2.0, 1.8, 1200 + 90 * i, seed=20 + i), t0, g * 0.5)
    add(music, pad_choir(CH[ch][2:5], dur, 1.4, 1.8), t0, g * 0.26)
    # sub bass root
    nb = int(dur * SR); tb = np.arange(nb) / SR
    sb = np.sin(2 * np.pi * hz(CH[ch][0] - 12) * tb) * np.clip(tb / .5, 0, 1) * np.clip((dur - tb) / .8, 0, 1)
    add(music, np.tanh(sb * 1.6) * .8, t0, g * 0.42)

# ---- pulsing 8th-note engine from the travel section onward
p = CUT['travel']; bpm = 63
while p < 34.6:
    k = int((p - CUT['travel']) / (60 / bpm / 2))
    g = 0.16 + 0.13 * min(1, (p - CUT['travel']) / 20)
    if p >= CUT['call']: g += 0.06
    add(music, pluck(45 + (0, 7, 5, 3)[k % 4], 0.5, .9), p, g)
    if p >= CUT['sun']:
        add(music, pluck(69 + (0, 3, 7, 10)[k % 4], 0.35, 1.0), p, g * 0.55)
    p += 60 / bpm / 2

# ---- drum / pulse hits on the beat after the reveal
bd = CUT['sun']
while bd < 34.8:
    add(music, impact(0.5, 80, 0.55, 0.25, 0.6)[:int(.5 * SR)], bd, 0.30)
    bd += 60 / bpm
bd = CUT['call']
while bd < 34.9:
    add(music, impact(0.6, 95, 0.6, 0.35, 0.7)[:int(.6 * SR)], bd, 0.34)
    add(music, impact(0.4, 70, 0.4, 0.2, 0.5)[:int(.4 * SR)], bd + 0.476, 0.18)
    bd += 60 / bpm / 2

# ================================================================ SFX / TRANSITIONS
# sub drops into the two reveals
add(sfx, sub_drop(2.6, 95, 24), CUT['travel'] - 1.9, 0.55)
add(sfx, sub_drop(3.0, 110, 22), CUT['dark'] - 1.7, 0.62)
add(sfx, sub_drop(2.4, 100, 26), CUT['year'] - 1.5, 0.42)
add(sfx, sub_drop(3.2, 120, 20), CUT['call'] - 2.0, 0.70)

# impacts on every hard cut
for name, g, br in (('clock', 0.34, .3), ('travel', 0.55, .5), ('dark', 0.75, .7),
                    ('freeze', 0.42, .4), ('month', 0.34, .35), ('year', 0.50, .5),
                    ('question', 0.44, .45), ('call', 0.86, .8)):
    add(sfx, verb(impact(3.2, 120, 1.0, 0.5, br), 0.30, IR_BIG), CUT[name], g)

# whooshes into cuts
for name, g in (('clock', .26), ('travel', .34), ('sun', .26), ('freeze', .30),
                ('month', .24), ('year', .30), ('question', .34), ('call', .40), ('endcard', .22)):
    add(sfx, whoosh(1.0, 250, 2800, 1.0, seed=hash(name) % 999), CUT[name] - 0.55, g)

# risers into the biggest moments
for name, dur, g in (('travel', 2.2, .34), ('dark', 1.6, .30), ('year', 2.4, .30),
                     ('call', 2.6, .40), ('endcard', 1.8, .22)):
    add(sfx, riser(dur, 110, 3400), CUT[name] - dur, g)

# clock ticks as a motif inside the countdown shot (a real "8:20" clock)
tk = CUT['clock'] + 0.25
while tk < CUT['travel'] - 0.1:
    add(sfx, tick('clock'), tk, 0.22); tk += 1.0
# heartbeat under the frozen-earth beats
hb = CUT['freeze']
while hb < CUT['question']:
    add(sfx, heartbeat(0.5), hb, 0.22); hb += 1.65

# ice cracks
for tt in (CUT['freeze'] + 0.4, CUT['freeze'] + 1.9, CUT['month'] + 0.6,
           CUT['month'] + 2.4, CUT['year'] - 0.4):
    add(sfx, verb(ice_crack(0.6, seed=int(tt * 10)), 0.25), tt, 0.30)

# wind bed across the desolate middle
add(amb, wind(11.0, 9), CUT['freeze'] - 0.3, 0.26)
add(amb, wind(9.0, 12), CUT['question'] - 0.5, 0.22)

# cold silence gap: one high shimmer when the light dies
add(sfx, shimmer(3.2, (100, 105, 108)), CUT['dark'], 0.22)
add(sfx, shimmer(2.6, (93, 100, 105)), CUT['call'], 0.30)
add(sfx, shimmer(4.0, (88, 95, 100, 107)), CUT['endcard'], 0.26)

# ================================================================ VOICE
vo = np.load(os.path.join(HERE, '..', 'build', 'vo2.npy'))
vo = norm(vo)
# presence EQ: de-mud + air, gentle compression
sos_hp = signal.butter(2, 95, btype='high', fs=SR, output='sos')
vo = signal.sosfilt(sos_hp, vo)
vo = tape_sat(vo * 1.15, 1.2)
fo = env_follow(vo, 25)
thr = np.percentile(fo[fo > 1e-4], 62) if (fo > 1e-4).any() else 0.1
gain = np.clip(np.power(np.maximum(fo, 1e-6) / (thr + 1e-9), -0.32), 0.65, 2.4)
vo = vo * gain
vo = norm(vo) * 0.95

# ducking
duck = np.clip(env_follow(vo, 90) / (vo.max() + 1e-9) * 9, 0, 1)
duck = np.convolve(duck, np.ones(int(.34 * SR)) / int(.34 * SR), mode='same')
mg = 1 - .5 * np.clip(duck, 0, 1)

# ================================================================ MIX
music = tape_sat(norm(music) * 1.1, 1.15)
sfx = norm(sfx); amb = norm(amb)
L = (vo * 1.0 + music * mg * 0.40 + sfx * 0.52 + amb * 0.34)
R = (vo * 1.0 + music * np.roll(mg, 110) * 0.40 + sfx * 0.52 * 0.95
     + amb * 0.34 + np.roll(music, 260) * 0.045)
mix = np.stack([L, R], 1)
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
mix = mix / (np.abs(mix).max() + 1e-9) * 0.89
fi, fo_ = int(.18 * SR), int(1.6 * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]
mix[-fo_:] *= np.linspace(1, 0, fo_)[:, None] ** 1.3
sf.write(os.path.join(HERE, '..', 'out', 'mix2.wav'), mix, SR, subtype='PCM_16')
print('MIX2 ok', mix.shape, 'rms', round(rms(mix), 3))
