# -*- coding: utf-8 -*-
"""Original cinematic score (synthesized) + SFX + VO -> out/mix.wav"""
import os, sys, numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from timeline import CUT, END, SR
rng = np.random.default_rng(7)
N = int(END * SR)
def hz(m): return 440.0 * 2 ** ((m - 69) / 12.0)
def norm(x): return x / (np.abs(x).max() + 1e-9)
def add(buf, sig, at, g=1.0):
    i = int(at * SR)
    if i >= len(buf): return
    n = min(len(sig), len(buf) - i); buf[i:i+n] += sig[:n] * g
def env_ad(n, a, d, curve=3.0):
    e = np.zeros(n); a = max(1, min(int(a*SR), n))
    e[:a] = np.linspace(0, 1, a) ** 0.7
    dd = min(int(d*SR), n-a)
    if dd > 0: e[a:a+dd] = np.exp(-np.linspace(0, curve, dd))
    return e

def pad(notes, dur, bright=0.5, attack=1.2, release=2.0, detune=0.12, seed=0):
    n = int((dur + release) * SR); t = np.arange(n) / SR
    out = np.zeros(n); r = np.random.default_rng(seed)
    for k, m in enumerate(notes):
        f = hz(m)
        for v, amp in ((-1, .5), (0, 1.), (1, .5)):
            fv = f * (1 + v * detune / 100); ph = r.uniform(0, 6.28); s = np.zeros(n)
            for h in range(1, 9):
                s += (1.0 / h ** (1.9 - bright * .8)) * np.sin(2*np.pi*fv*h*t + ph*h)
            out += amp * s * (0.7 if k else 1.0)
    out *= 1 + 0.04 * np.sin(2*np.pi*0.13*t + seed)
    e = env_ad(n, attack, dur + release, 2.0); tail = int(release*SR)
    if tail > 0: e[-tail:] *= np.linspace(1, 0, tail) ** 1.5
    return norm(out * e)

def sub(notes, dur):
    n = int(dur*SR); t = np.arange(n)/SR; o = np.zeros(n)
    for m in notes: o += np.sin(2*np.pi*hz(m-12)*t)
    return norm(o * env_ad(n, .4, dur, 1.2))

def pluck(m, dur=1.2, bright=1.0):
    n=int(dur*SR); t=np.arange(n)/SR; f=hz(m); s=np.zeros(n)
    for h,a in ((1,1.),(2,.5*bright),(3,.25*bright),(4,.12*bright)):
        s += a*np.sin(2*np.pi*f*h*t)*np.exp(-t*(2.2+h*1.1))
    s += .2*rng.normal(0,1,n)*np.exp(-t*40); return norm(s)

def kick(dur=.7, punch=1.):
    n=int(dur*SR); t=np.arange(n)/SR
    f=120*np.exp(-t*18)+42; s=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*5.0)
    s += .4*rng.normal(0,1,n)*np.exp(-t*90); return norm(s*punch)

def boom(dur=3.4, f0=70, f1=26):
    n=int(dur*SR); t=np.arange(n)/SR
    f=f1+(f0-f1)*np.exp(-t*3); s=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*1.15)
    y=np.zeros(n); acc=0.
    nz=norm(rng.normal(0,1,n))
    for i in range(n):
        acc += 0.02*(nz[i]-acc); y[i]=acc
    return norm(.9*s + 1.3*y)

def riser(dur=3.0, f0=170, f1=2400):
    n=int(dur*SR); t=np.arange(n)/SR; nz=rng.normal(0,1,n); out=np.zeros(n); acc=0.
    cut=f0*(f1/f0)**((t/dur)**0.6); al=np.clip(2*np.pi*cut/SR,0,.9)
    for i in range(n):
        acc += al[i]*(nz[i]-acc); out[i]=acc
    out += .35*np.sin(2*np.pi*np.cumsum(f0*(f1/f0)**((t/dur)**.6))/SR)
    return norm(out*(t/dur)**2.2)

def whoosh(dur=1.4):
    n=int(dur*SR); t=np.arange(n)/SR; nz=rng.normal(0,1,n); out=np.zeros(n); acc=0.
    f=250+1500*np.sin(np.pi*np.clip(t/dur,0,1)); al=np.clip(2*np.pi*f/SR,0,.9)
    for i in range(n):
        acc += al[i]*(nz[i]-acc); out[i]=acc
    return norm(out*np.sin(np.pi*np.clip(t/dur,0,1))**1.6)

def shimmer(dur=4.0, notes=(88,91,95,98)):
    n=int(dur*SR); t=np.arange(n)/SR; o=np.zeros(n)
    for k,m in enumerate(notes):
        for d in (0,.09,.19):
            s=np.sin(2*np.pi*hz(m)*(1+.0008*k)*t+k)*np.exp(-np.maximum(0,t-d)*1.6)
            s[:int(d*SR)]=0; o+=s*.25
    return norm(o*env_ad(n,.05,dur,1.5))

CH = {'Am':[45,57,60,64,69,72], 'F':[41,53,57,60,65,69], 'C':[48,55,60,64,67,72],
      'G':[43,55,59,62,67,71], 'Dm':[50,57,62,65,69,74], 'Am9':[45,57,60,64,71,76]}
music = np.zeros(N); sfx = np.zeros(N)

add(music, pad([45,57,64], 3.0, .15, 2.0, 2.0, seed=1), 0.0, .55)
add(music, shimmer(2.6, (88,95)), .35, .12)
prog = [(2.30,'Am',10.4,.62),(12.55,'F',5.0,.72),(17.55,'C',4.2,.70),(21.75,'G',3.65,.72),
        (25.40,'Dm',4.55,.78),(29.95,'F',3.2,.90),(33.10,'Am9',2.6,.95),(35.55,'Am9',4.2,.80)]
for i,(t0,name,dur,g) in enumerate(prog):
    add(music, pad(CH[name], dur, .45+.1*i, .8 if i else 1.6, 1.8, seed=10+i), t0, g*.55)
    add(music, sub([CH[name][0]], dur*.96), t0, g*.5)
at=21.75; step=60/66/2; arp=[69,72,76,72,69,64,69,72]; k=0
while at < 38.6:
    m = arp[k%len(arp)] - (2 if at >= 25.40 else 0)
    add(music, pluck(m+12, 1.2, .9), at, .16+.02*(at/33)); at+=step; k+=1
b=CUT['stars']-.4
while b < 33.6:
    add(music, kick(.7), b, .5)
    if b > 27.0: add(music, kick(.55), b+.24, .22)
    b += 60/66
b=29.95
while b < 33.7:
    add(music, kick(.8), b, .62); add(music, kick(.5), b+.4545, .3); b += 60/66/2

for name,g in (('earth',.30),('sun',.30),('galaxy',.26),('dot2',.24),('finale',.34),('vanish',.26)):
    add(sfx, whoosh(1.4), CUT[name]-.7, g)
for t,g in ((4.62,.42),(12.55,.55),(21.75,.42),(25.40,.35),(29.95,.72)):
    add(sfx, boom(3.4), t, g)
for t,d_,g in ((12.55,2.6,.30),(21.75,2.2,.22),(29.95,3.0,.34),(33.10,2.6,.30),(38.3,1.3,.12)):
    add(sfx, riser(d_, 160, 2400), t-d_, g)
add(sfx, riser(2.0, 300, 900), 9.4, .18)
add(sfx, shimmer(5.0, (93,100,105)), 0.0, .24)
add(sfx, shimmer(6.0, (88,95,100,107)), 29.95, .30)
add(sfx, shimmer(5.0, (81,88,93,100)), 35.55, .34)
add(sfx, norm(np.sin(2*np.pi*np.cumsum(70*np.exp(-np.arange(int(2*SR))/SR*1.6)+24)/SR)
              * np.exp(-np.arange(int(2*SR))/SR*1.1)), 28.0, .35)

vo = np.load(os.path.join(HERE, 'vo.npy'))
env = np.convolve(np.abs(vo), np.ones(int(.12*SR))/int(.12*SR), mode='same')
duck = np.clip(env/(np.abs(vo).max()+1e-9)*8, 0, 1)
duck = np.convolve(duck, np.ones(int(.35*SR))/int(.35*SR), mode='same')
mg = 1.0 - .42*np.clip(duck, 0, 1)

music = norm(music); sfx = norm(sfx); vo = norm(vo)
L = vo + music*mg*.42 + sfx*.5
R = vo + music*np.roll(mg, 90)*.42 + sfx*.5*.96 + np.roll(music, 220)*.05
mix = np.stack([L, R], 1)
mix = np.tanh(mix*1.15)/np.tanh(1.15)
mix = mix/(np.abs(mix).max()+1e-9)*.94
fi, fo = int(.25*SR), int(1.4*SR)
mix[:fi] *= np.linspace(0,1,fi)[:,None]; mix[-fo:] *= np.linspace(1,0,fo)[:,None]**1.2
sf.write(os.path.join(HERE,'..','out','mix.wav'), mix, SR, subtype='PCM_16')
print('mix ok', mix.shape)
