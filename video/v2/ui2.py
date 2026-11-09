# -*- coding: utf-8 -*-
"""Editorial UI over the film: kinetic captions with mask reveals, mono kickers,
a big countdown clock, stamp badges, lower-thirds and the end card CTA."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'build'))
from engine import (W, H, GX, GY, draw_line, draw_words, text_w, ease_out, ease_in_out,
                    ease_out_expo, ease_out_back, smoothstep, lerp, add_gauss_glow,
                    paste_mask, add_mask, CYAN, GOLD, SOFT, ICE, WHITE)
import icons

MONO = '/home/user/fonts/SpaceGrotesk[wght].ttf'   # only Latin/mono-ish labels
FB   = '/home/user/fonts/Almarai-ExtraBold.ttf'
FB2  = '/home/user/fonts/Almarai-Bold.ttf'
FR   = '/home/user/fonts/Almarai-Regular.ttf'
TAJ  = '/home/user/fonts/Tajawal-Black.ttf'
NUMB = '/home/user/fonts/Anton-Regular.ttf'

WARM = (255, 176, 96)
COLD = (150, 200, 255)
DANGER = (255, 96, 90)

# ---------------------------------------------------------------- reveal primitives
def mask_rise(img, t, t0, x0, y0, x1, y1, dur=0.5, mode='up'):
    """reveal the pixels already in img inside a rect, by scaling a soft mask"""
    p = (t - t0) / dur
    if p >= 1: return
    p = max(0.0, p)
    if p == 0: return
    e = ease_out_expo(p)
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    if mode == 'up':
        yy = y1 - (y1 - y0) * e
        d.rectangle([x0, yy, x1, y1], fill=255)
    elif mode == 'down':
        yy = y0 + (y1 - y0) * e
        d.rectangle([x0, y0, x1, yy], fill=255)
    elif mode == 'thick':
        d.rectangle([x0, y0, x1, y1], fill=int(255 * min(1, p * 3)))
    m = m.filter(ImageFilter.GaussianBlur(2))
    a = np.asarray(m).astype(np.float32) / 255
    black = np.zeros_like(img)
    canvas = img * a[..., None] + black * (1 - a[..., None])
    img *= 0
    img += canvas

def word_pop(img, t, t0, text, y, size=74, path=FB, color=WHITE, colors=None,
             anchor=W / 2, stagger=0.052, dur=0.42, glow=3.0, rise=26, tracking=0.0):
    """word-by-word rise + slight scale pop (the modern CapCut/After Effects look)"""
    if t < t0: return
    words = text.split(' ')
    cols = colors or {}
    sp = text_w(' ', path, size) * 1.15
    widths = [text_w(w, path, size, tracking) for w in words]
    total = sum(widths) + sp * (len(words) - 1)
    xr = anchor + total / 2
    for i, w in enumerate(words):
        p = (t - t0 - i * stagger) / dur
        if p <= 0:
            xr -= widths[i] + sp; continue
        p = min(1.0, p)
        a = min(1.0, p * 2.6)
        dy = rise * (1 - ease_out(p))
        sc = float(0.94 + 0.06 * ease_out_back(p, 1.9))
        draw_line(img, xr, y + dy, w, path, size * sc, fill=cols.get(w, color), alpha=a,
                  align='right', tracking=tracking, glow=size * 0.055 * glow,
                  glow_fill=(30, 60, 110))
        xr -= widths[i] + sp

def _has_ar(s):
    return any('\u0600' <= ch <= '\u06ff' for ch in s)

def mono_kicker(img, t, t0, text, y, color=COLD, size=26, x=W / 2, align='center', bar=True):
    """small tracked label + a hairline that draws in (Arabic or Latin font picked by script)"""
    a, dy = 0.0, 0.0
    p = (t - t0) / 0.45
    if p <= 0: return
    p = min(1.0, p); a = ease_out(p); dy = 14 * (1 - a)
    ar = _has_ar(text)
    draw_line(img, x, y + dy, text, FB2 if ar else MONO, size, fill=color, alpha=a * 0.95,
              align=align, tracking=0.6 if ar else 3.2, shadow=(8, .8))
    if bar:
        bw = float(46 * ease_out_expo(min(1, p * 1.3)))
        ov = Image.new('L', (W, H), 0)
        bx = x - bw if align == 'center' else x
        ImageDraw.Draw(ov).rectangle([bx, y + dy + size * 1.5, bx + bw * 2 if align == 'center' else bx + bw * 2,
                                      y + dy + size * 1.5 + 2], fill=int(170 * a))
        paste_mask(img, ov.filter(ImageFilter.GaussianBlur(.6)), color, .85)

def badge(img, t, t0, label, y=1330, color=DANGER, dur=0.45):
    """stamp-style badge: filled pill, pops with overshoot"""
    p = (t - t0) / dur
    if p <= 0: return
    p = min(1.0, p)
    sc = float(0.7 + 0.3 * ease_out_back(p, 2.6))
    a = min(1, p * 3)
    size = 30
    w = (text_w(label, TAJ, size) + size * 2.0) * sc
    h = size * 2.1 * sc
    ov = Image.new('L', (W, H), 0)
    ImageDraw.Draw(ov).rounded_rectangle([W / 2 - w / 2, y - h / 2, W / 2 + w / 2, y + h / 2],
                                         radius=h / 2, fill=int(235 * a))
    paste_mask(img, ov, color, 1.0)
    draw_line(img, W / 2, y - size * 0.62 * sc, label, TAJ, size * sc, fill=(12, 6, 6),
              alpha=a, align='center')

def counter_clock(img, t, t0, x, y, mono='08:20', size=150, color=(255, 236, 214),
                  dur=1.0, glow=1.0):
    """big stopwatch typography: mono digits with a pulsing colon and a thin ring"""
    p = (t - t0) / dur
    if p <= 0: return
    p = min(1.0, p)
    a = ease_out(p)
    sc = float(0.9 + 0.1 * ease_out_back(p, 1.6))
    colon = 1.0 if (t % 1.0) < 0.5 else 0.35
    s = float(size * sc)
    w = text_w(mono, NUMB, s, 2)
    add_gauss_glow(img, x, y + s * .5, s * .9, color, 0.12 * a * glow)
    draw_line(img, x, y, mono, NUMB, s, fill=color, alpha=a, align='center', tracking=2,
              glow=s * 0.03, shadow=(14, .85))
    # thin progressive ring
    if glow > 0.2:
        r = s * 1.25
        ov = Image.new('L', (W, H), 0)
        d = ImageDraw.Draw(ov)
        d.arc([x - r, y + s * .5 - r, x + r, y + s * .5 + r], -90, -90 + 360 * ease_in_out(min(1, p)), fill=int(120 * a), width=3)
        paste_mask(img, ov.filter(ImageFilter.GaussianBlur(1.2)), color, .5)

def stamp_icon(img, t, t0, name, cx, cy, size=120, color=COLD, dur=0.5, alpha=1.0):
    p = (t - t0) / dur
    if p <= 0: return
    p = min(1.0, p)
    sc = float(0.55 + 0.45 * ease_out_back(p, 2.5))
    a = min(1.0, p * 2.8) * alpha
    rgb, al = icons.icon(name, size=int(size * sc / 10) * 10, stroke=7, glow=8, color=color)
    from engine import paste_sprite
    paste_sprite(img, rgb, al, cx, cy, a, 'add')

def lower_third(img, t, t0, title, sub, y=1560, dur=0.55, accent=COLD):
    """broadcast lower-third: accent bar slides, text clips up behind it"""
    p = (t - t0) / dur
    if p <= 0: return
    p = min(1.0, p)
    e = ease_out_expo(p)
    bar_w = float(300 * e)
    ov = Image.new('L', (W, H), 0)
    ImageDraw.Draw(ov).rectangle([120, y + 8, 120 + bar_w, y + 12], fill=int(220 * p))
    paste_mask(img, ov, accent, 1.0)
    a = min(1, p * 2.2)
    draw_line(img, 120, y, title, FB2, 42, fill=WHITE, alpha=a, align='left',
              glow=2.0, shadow=(10, .8))
    draw_line(img, 120, y + 58, sub, MONO, 24, fill=accent, alpha=a * .9, align='left',
              tracking=2.4, shadow=(8, .7))

def endcard_cta(img, t, t0, label='تابِع  NEXUS', y=1280, dur=0.65):
    p = (t - t0) / dur
    if p <= 0: return
    p = min(1.0, p)
    sc = float(0.82 + 0.18 * ease_out_back(p, 2.2))
    a = min(1, p * 2.4)
    tw = text_w(label, TAJ, 50 * sc)
    w, h = float(tw + 150 * sc), float(116 * sc)
    ov = Image.new('L', (W, H), 0)
    ImageDraw.Draw(ov).rounded_rectangle([W / 2 - w / 2, y, W / 2 + w / 2, y + h],
                                         radius=h / 2, fill=int(255 * a))
    paste_mask(img, ov, (255, 255, 255), 1.0)
    draw_line(img, W / 2, y + h * 0.28, label, TAJ, 50 * sc, fill=(8, 10, 18), alpha=a, align='center')
    # pulse ring
    if p > 0.6:
        k = (t - t0 - 0.6) % 1.6 / 1.6
        rr = w * (0.5 + 0.16 * k)
        ov2 = Image.new('L', (W, H), 0)
        ImageDraw.Draw(ov2).rounded_rectangle([W / 2 - rr, y + h / 2 - rr * 0.28,
                                               W / 2 + rr, y + h / 2 + rr * 0.28],
                                              radius=rr * .28, outline=int(70 * (1 - k)), width=2)
        paste_mask(img, ov2, (200, 230, 255), 1.0)


def text_stack(img, t, t0, lines, bottom, anchor=W / 2, gap=26, stagger=0.34,
               align='center', glow=3.0):
    """lines: list of dict(text,size,path,color,colors,delay,stagger)
    Lays out from a fixed bottom edge so blocks can never collide."""
    heights = [ln['size'] * 1.20 for ln in lines]
    total = sum(heights) + gap * (len(lines) - 1)
    y = bottom - total
    for i, ln in enumerate(lines):
        d = t0 + ln.get('delay', i * stagger)
        word_pop(img, t, d, ln['text'], y, size=ln['size'],
                 path=ln.get('path', FB), color=ln.get('color', WHITE),
                 colors=ln.get('colors'), anchor=anchor,
                 stagger=ln.get('wstagger', 0.05), glow=ln.get('glow', glow),
                 tracking=ln.get('tracking', 0.0))
        y += heights[i] + gap
