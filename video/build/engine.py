# -*- coding: utf-8 -*-
"""NEXUS 'نقطة' — 39.6s vertical film engine (procedural)."""
import os, sys, math, time, argparse, ctypes
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
W, H, FPS = 1080, 1920, 30
FONTS = '/home/user/fonts'
FB  = f'{FONTS}/Almarai-ExtraBold.ttf'
FB2 = f'{FONTS}/Almarai-Bold.ttf'
FR  = f'{FONTS}/Almarai-Regular.ttf'
TAJ = f'{FONTS}/Tajawal-Black.ttf'
NUM = f'{FONTS}/Anton-Regular.ttf'
GROT = f'{FONTS}/SpaceGrotesk[wght].ttf'

# ---------------------------------------------------------------- audio anchors
SR = 48000
END = 39.60
CUT = dict(dot=0.00, earth=4.62, vanish=10.90, sun=12.55, stars=17.55,
           galaxy=21.75, many=25.40, dot2=27.85, finale=29.95)
VO = [
 ("01", 0, 0.62, "نقطة"), ("01", 1, 3.67, "هي الأرض"),
 ("01", 2, 5.74, "حروبنا"), ("01", 3, 7.08, "أحلامنا"), ("01", 4, 8.94, "من أحببناه"),
 ("01", 5, 11.29, "تضيع"),
 ("02", 0, 13.00, "تبعد"), ("02", 1, 14.98, "مليون"),
 ("02", 2, 17.95, "والشمس"), ("02", 3, 18.95, "مليار نجم"),
 ("03", 0, 22.35, "ومجرتنا"), ("03", 1, 23.55, "تريليونات"),
 ("04", 0, 27.15, "مشكلتك"), ("04", 1, 28.70, "من نقطة"),
 ("05", 0, 30.40, "السماء"), ("05", 1, 31.80, "عظيم"), ("05", 2, 33.35, "نقطة"),
]

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-9), 0, 1); return t * t * (3 - 2 * t)
def ease_out(x):
    x = np.clip(x, 0, 1); return 1 - (1 - x) ** 3
def ease_in_out(x):
    x = np.clip(x, 0, 1); return np.where(x < 0.5, 4 * x ** 3, 1 - (-2 * x + 2) ** 3 / 2)
def ease_out_expo(x):
    x = np.clip(x, 0, 1); return 1 - 2 ** (-10 * x)
def ease_out_back(x, s=1.70158):
    x = np.clip(x, 0, 1); return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2
def lerp(a, b, t): return a + (b - a) * t

_gy, _gx = np.mgrid[0:H, 0:W]
GX = _gx.astype(np.float32); GY = _gy.astype(np.float32)
del _gx, _gy
CX, CY = W / 2.0, H / 2.0

# ---------------------------------------------------------------- primitives
def add_gauss_glow(img, cx, cy, r, color, s=1.0):
    if s <= 0.002: return
    d2 = ((GX - cx) ** 2 + (GY - cy) ** 2) / (r * r + 1e-6)
    img += (np.exp(-d2 * 2.2) * s)[..., None] * np.array(color, np.float32)

def add_glow(img, cx, cy, r, color, s=1.0, p=2.4):
    if s <= 0.002: return
    d = np.sqrt((GX - cx) ** 2 + (GY - cy) ** 2) / (r + 1e-6)
    img += (np.clip(1 - d, 0, 1) ** p * s)[..., None] * np.array(color, np.float32)

def add_streak(img, cx, cy, length, thick, color, s=1.0):
    if s <= 0.002: return
    f = np.exp(-np.abs(GX - cx) / (length + 1e-6) * 2.0) * np.exp(-((GY - cy) ** 2) / (thick ** 2 + 1e-6))
    img += (f * s)[..., None] * np.array(color, np.float32)

_SPR = {}
def _sprite(radius, color, power=2.2):
    key = (int(radius), tuple(int(c) for c in color), power)
    if key in _SPR: return _SPR[key]
    r = int(max(2, radius)); n = int(r * 2.6)
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    d = np.sqrt((x - n / 2) ** 2 + (y - n / 2) ** 2) / r
    patch = (np.exp(-d * d * power)[..., None] * np.array(color, np.float32)).astype(np.float32)
    _SPR[key] = patch; return patch

def splat(img, cx, cy, radius, color=(255, 255, 255), s=1.0, power=2.2):
    if s <= 0.002: return
    patch = _sprite(radius, color, power) * s
    ph, pw = patch.shape[:2]
    x0 = int(cx - pw / 2); y0 = int(cy - ph / 2); x1, y1 = x0 + pw, y0 + ph
    Hh, Ww = img.shape[:2]
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1, sy1 = pw - max(0, x1 - Ww), ph - max(0, y1 - Hh)
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(Ww, x1), min(Hh, y1)
    if x1 <= x0 or y1 <= y0: return
    img[y0:y1, x0:x1] += patch[sy0:sy1, sx0:sx1]

def splat_dot(img, cx, cy, r, s=1.0, core=(255, 255, 255), halo=(130, 195, 255)):
    if s <= 0.002: return
    splat(img, cx, cy, max(1.6, r * 1.15), core, 0.95 * s, 2.6)
    splat(img, cx, cy, max(4.0, r * 4.0), halo, 0.33 * s, 1.7)

def paste_sprite(img, rgb, a, cx, cy, alpha=1.0, blend='normal'):
    w, h = rgb.size
    x0 = int(cx - w / 2); y0 = int(cy - h / 2); x1, y1 = x0 + w, y0 + h
    Hh, Ww = img.shape[:2]
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1, sy1 = w - max(0, x1 - Ww), h - max(0, y1 - Hh)
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(Ww, x1), min(Hh, y1)
    if x1 <= x0 or y1 <= y0: return
    sub = np.asarray(rgb.crop((sx0, sy0, sx1, sy1))).astype(np.float32)
    al = np.asarray(a.crop((sx0, sy0, sx1, sy1))).astype(np.float32) / 255 * alpha
    reg = img[y0:y1, x0:x1]
    if blend == 'add': reg += sub * al[..., None]
    else:
        reg *= (1 - al[..., None]); reg += sub * al[..., None]

def dot_sprite(size=30):
    n = int(size * 3)
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    d = np.sqrt((x - n / 2) ** 2 + (y - n / 2) ** 2) / (size * 0.55)
    core = np.clip(1 - d, 0, 1) ** 3; halo = np.exp(-d * d * 1.8)
    rgb = (core[..., None] * 255 + halo[..., None] * np.array([120, 190, 255], np.float32))
    return (Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB'),
            Image.fromarray((np.clip(core + halo * 0.5, 0, 1) * 255).astype(np.uint8), 'L'))

# ---------------------------------------------------------------- fonts / text
import uharfbuzz as hb, freetype
FT = freetype
_FC = {}
AR = __import__('re').compile(r'[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]')
WEST = __import__('re').compile(r'[A-Za-z0-9]')

def load_font(path, size):
    key = (path, int(size))
    if key in _FC: return _FC[key]
    face = FT.Face(path); face.set_pixel_sizes(0, int(size))
    font = hb.Font(hb.Face(hb.Blob.from_file_path(path)))
    font.scale = (int(size * 64), int(size * 64))
    _FC[key] = (face, font); return face, font

def _runs(text):
    cls = []
    for ch in text:
        cls.append('rtl' if AR.match(ch) else ('ltr' if WEST.match(ch) else 'n'))
    i, n = 0, len(cls)
    while i < n:
        if cls[i] == 'n':
            j = i
            while j < n and cls[j] == 'n': j += 1
            prev = cls[i - 1] if i > 0 else None
            nxt = cls[j] if j < n else None
            d = prev if prev == nxt else (prev or nxt or 'rtl')
            for k in range(i, j): cls[k] = d
            i = j
        else: i += 1
    runs = []
    for ch, c in zip(text, cls):
        if runs and runs[-1][0] == c: runs[-1][1] += ch
        else: runs.append([c, ch])
    return [(d, t) for d, t in runs]

def _shape(text, path, size, direction=None):
    face, font = load_font(path, size)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    if direction and buf.direction != direction: buf.direction = direction
    hb.shape(font, buf, {"kern": True, "liga": True, "calt": True})
    return buf.glyph_infos, buf.glyph_positions, face

def _measure(text, path, size, tracking=0.0):
    out, total = [], 0.0
    for d, t in _runs(text):
        infos, poss, face = _shape(t, path, size, 'rtl' if d == 'rtl' else 'ltr')
        w = sum(p.x_advance for p in poss) / 64 + tracking * max(0, len(poss) - 1)
        out.append((d, t, w, infos, poss, face)); total += w
    return out, total

def text_w(text, path, size, tracking=0.0):
    return _measure(text, path, size, tracking)[1]

SHADOW = (10, 0.78)

def draw_line(img, ax, y, text, path, size, fill=(255, 255, 255), alpha=1.0,
              align='right', tracking=0.0, glow=0.0, shadow=SHADOW, glow_fill=None):
    runs, total = _measure(text, path, size, tracking)
    if align == 'right': xr = ax
    elif align == 'center': xr = ax + total / 2
    else: xr = ax + total
    pad = int(max(12, size * 0.8 + glow * 2.4 + (shadow[0] * 2.4 if shadow else 0)))
    x0 = max(0, int(xr - total) - pad); y0 = max(0, int(y) - pad)
    x1 = min(W, int(xr) + pad + 2); y1 = min(H, int(y + size * 1.9) + pad)
    if x1 <= x0 or y1 <= y0: return total
    pw, ph = x1 - x0, y1 - y0
    layer = Image.new('L', (pw, ph), 0)
    for d, t, w, infos, poss, face in runs:
        penx = (xr - w) * 64; peny = y * 64
        for info, pos in zip(infos, poss):
            face.load_glyph(info.codepoint, FT.FT_LOAD_RENDER | FT.FT_LOAD_TARGET_NORMAL)
            g = face.glyph; bm = g.bitmap
            if bm.width and bm.rows:
                arr = np.array(bm.buffer, dtype=np.uint8); stride = bm.pitch
                if bm.pixel_mode == FT.FT_PIXEL_MODE_GRAY:
                    arr = arr.reshape(bm.rows, stride)[:, :bm.width]
                else:
                    arr = arr.reshape(bm.rows, stride)[:, :bm.width * 4].reshape(bm.rows, bm.width, 4)[:, :, 3]
                bx = int((penx + pos.x_offset) // 64) + g.bitmap_left - x0
                by = int((peny - pos.y_offset) // 64) - g.bitmap_top - y0
                ax0, ay0 = max(0, bx), max(0, by)
                ax1, ay1 = min(pw, bx + bm.width), min(ph, by + bm.rows)
                if ax1 > ax0 and ay1 > ay0:
                    sub = arr[ay0 - by:ay1 - by, ax0 - bx:ax1 - bx]
                    reg = np.asarray(layer.crop((ax0, ay0, ax1, ay1)))
                    layer.paste(Image.fromarray(np.maximum(reg, sub), 'L'), (ax0, ay0))
            penx += pos.x_advance + int(tracking * 64)
        xr -= w + tracking
    cv = img[y0:y1, x0:x1]
    la = np.asarray(layer).astype(np.float32) / 255.0
    if shadow:
        rad, sa = shadow
        sh = np.asarray(layer.filter(ImageFilter.GaussianBlur(rad))).astype(np.float32) / 255.0
        m = np.roll(sh, 4, axis=0) * sa
        cv *= (1 - np.clip(m, 0, 1)[..., None] * 0.92)
    if glow > 0:
        g = np.asarray(layer.filter(ImageFilter.GaussianBlur(glow))).astype(np.float32) / 255.0
        g = np.maximum(g, la * 0.35)
        cv += (g * alpha * 0.5)[..., None] * np.array(glow_fill or fill, np.float32)
    m = la * alpha
    cv *= (1 - m[..., None]); cv += m[..., None] * np.array(fill, np.float32)
    return total

WHITE=(255,255,255); CYAN=(150,216,255); GOLD=(255,205,130); SOFT=(210,224,240); ICE=(226,242,255)

def add_mask(img, mask, color, alpha=1.0):
    a = np.asarray(mask).astype(np.float32) / 255.0 * alpha
    img += a[..., None] * np.array(color, np.float32)

def paste_mask(img, mask, color, alpha=1.0):
    a = np.asarray(mask).astype(np.float32) / 255.0 * alpha
    img *= (1 - a[..., None]); img += a[..., None] * np.array(color, np.float32)

def draw_words(img, words, anchor, y, path, size, tr=0.0, align='center', shadow=SHADOW):
    sp = text_w(' ', path, size) * 1.15
    ws = [(text_w(t, path, size * s, tr) if a > 0.004 else sp) for t, c, a, d, s in words]
    total = sum(ws) + sp * max(0, len(words) - 1)
    xr = anchor + total / 2 if align == 'center' else anchor
    for (t, col, a, dy, s), w in zip(words, ws):
        if a <= 0.004 or not t: xr -= sp; continue
        draw_line(img, xr, y + dy, t, path, size * s, fill=col or WHITE, alpha=a,
                  align='right', tracking=tr, glow=size * 0.05, shadow=shadow)
        xr -= w + sp

def fadein(t, t0, dur=0.5, rise=30.0):
    p = (t - t0) / dur
    if p <= 0: return 0.0, rise
    p = min(1.0, p); e = ease_out(p)
    return e, rise * (1 - e)

def stack(img, t, beats, y=1300, anchor=W / 2, prev_dim=0.42, align='center'):
    live = -1
    for i, b in enumerate(beats):
        if t >= b['t']: live = i
    if live < 0: return
    ypos = y
    for i, b in enumerate(beats[:live + 1]):
        b = dict(b); b.setdefault('path', FB); b.setdefault('size', 68)
        old = i < live
        a0, dy0 = fadein(t, b['t'], 0.45, 26 if not old else 0)
        if old: a0 = min(a0, prev_dim)
        if live - i > 1: a0 *= 0.25
        sc = 1.0
        if not old:
            p = min(1.0, (t - b['t']) / 0.55); sc = 0.94 + 0.06 * ease_out_back(p, 2.0)
        if a0 > 0.004:
            cols = b.get('colors', {}); wl = []
            for k, w in enumerate(b['text'].split(' ')):
                wa = a0
                if not old:
                    wp = (t - b['t'] - k * 0.035) / 0.4
                    wa = a0 * (0.0 if wp <= 0 else min(1.0, wp * 2.0))
                wl.append((w, cols.get(w, b.get('color', WHITE)), wa, dy0, sc))
            draw_words(img, wl, anchor, ypos, b['path'], b['size'],
                       tr=b.get('tracking', 0.0), align=align)
        ypos += b.get('lh', int(b['size'] * 1.40))

def kicker(img, t, t0, text, y=1120, size=32, color=CYAN, anchor=W / 2):
    a, dy = fadein(t, t0, 0.45, 16)
    if a <= 0.004: return
    draw_line(img, anchor, y + dy, text, TAJ, size, fill=color, alpha=a * 0.95,
              align='center', tracking=0.4, glow=size * 0.3, glow_fill=(40, 90, 150), shadow=(9, 0.85))

def bignum(img, t, t0, value, unit='', label='', y=770, size=200, color=WHITE,
           count_dur=1.15, t1=None, glow_col=(255, 225, 180), maxw=880):
    if t < t0: return
    p = min(1.0, (t - t0) / count_dur); e = ease_out_expo(p)
    txt = f'{int(value * e):,}'
    a, dy = fadein(t, t0, 0.55, 24)
    if t1: a *= 1 - smoothstep(t1, t1 + 0.30, t)
    if a <= 0.004: return
    sz = size * min(1.0, maxw / max(1.0, text_w(f'{int(value):,}', NUM, size, -3))) * (0.985 + 0.015 * e)
    add_gauss_glow(img, W / 2, y + sz * 0.55, sz * 0.52, glow_col, 0.15 * a * (0.55 + 0.45 * e))
    if label:
        draw_line(img, W / 2, y - sz * 0.60 + dy * 0.6, label, FB2, int(sz * 0.18),
                  fill=(200, 218, 240), alpha=a * 0.9, align='center', tracking=2.0)
    draw_line(img, W / 2, y + dy, txt, NUM, sz, fill=color, alpha=a, align='center',
              tracking=-3, shadow=(12, 0.8))
    if unit:
        draw_line(img, W / 2, y + sz * 1.02 + dy * 0.5, unit, FB2, int(sz * 0.19),
                  fill=color, alpha=a * 0.9, align='center')

def hairline(img, t, t0, cx, cy, width, color=CYAN, dur=0.7, thick=3, alpha=1.0):
    p = (t - t0) / dur
    if p <= 0: return
    p = min(1.0, p); w = width * ease_out_expo(p)
    ov = Image.new('L', (W, H), 0)
    ImageDraw.Draw(ov).rectangle([cx - w / 2, cy - thick / 2, cx + w / 2, cy + thick / 2],
                                 fill=int(255 * min(1, p * 3) * alpha))
    paste_mask(img, ov.filter(ImageFilter.GaussianBlur(0.7)), color)

def chip(img, t, t0, text, y=1500, color=GOLD, size=38):
    a, dy = fadein(t, t0, 0.5, 18)
    if a <= 0.004: return
    w = text_w(text, FB2, size) + size * 1.9
    ov = Image.new('L', (W, H), 0)
    ImageDraw.Draw(ov).rounded_rectangle([W / 2 - w / 2, y + dy, W / 2 + w / 2, y + dy + size * 1.75],
                                         radius=size * 0.9, outline=int(190 * a), width=2)
    paste_mask(img, ov, color, 0.55)
    draw_line(img, W / 2, y + dy + size * 1.24, text, FB2, size, fill=color, alpha=a, align='center')

def scrim(img, strength=0.62, top=980):
    g = np.clip((GY - top) / (H - top), 0, 1) ** 1.35
    img *= (1 - strength * g)[..., None]
    g2 = np.clip((190 - GY) / 190, 0, 1) ** 1.5
    img *= (1 - 0.35 * g2)[..., None]

def textband(img, cy=1400, ry=470, strength=0.42, blue=True):
    d = ((GX - W / 2) / (W * 0.80)) ** 2 + ((GY - cy) / ry) ** 2
    m = (np.clip(1 - d, 0, 1) ** 0.9)[..., None]
    mul = 1 - strength * m
    if blue:
        img *= mul * 0.94 + np.array([0.10, 0.16, 0.26], np.float32) * m * strength * 0.35
    else:
        img *= mul

def brand(img, alpha=1.0):
    if alpha <= 0.01: return
    draw_line(img, W / 2 + 30, 118, 'NEXUS', GROT, 29, fill=(240, 247, 255), alpha=alpha * 0.95,
              align='center', tracking=9.0, shadow=(6, 0.55))
    ov = Image.new('L', (W, H), 0)
    ImageDraw.Draw(ov).ellipse([W / 2 - 96, 128, W / 2 - 87, 137], fill=int(235 * alpha))
    add_mask(img, ov, CYAN, 0.95)

def shake(img, d, amp=10.0, decay=0.22):
    if d < 0 or d > decay * 6: return img
    k = math.exp(-d / decay)
    rng = np.random.default_rng(int(d * 240) % 9999)
    return np.roll(img, (int(rng.normal(0, amp * 0.8) * k), int(rng.normal(0, amp) * k)), axis=(0, 1))

_GAL = {}
def galaxy_sprite(size=24, color=(190, 214, 255), core=(255, 236, 205), seed=0, tilt=0.35, squash=0.5):
    key = (size, color, core, seed, round(tilt, 2))
    if key in _GAL: return _GAL[key]
    n = max(9, int(size))
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = cy = (n - 1) / 2.0
    dx = x - cx; dy = y - cy
    ca, sa = np.cos(tilt), np.sin(tilt)
    u = dx * ca + dy * sa; v = (-dx * sa + dy * ca) / squash
    r = np.sqrt(u * u + v * v) / (n * 0.5)
    nucleus = np.exp(-(r * 3.4) ** 2); halo = np.exp(-(r * 1.5) ** 2) * 0.45
    rgb = (halo[..., None] * np.array(color, np.float32)
           + nucleus[..., None] * np.array(core, np.float32) * 0.95)
    a = np.clip(nucleus + halo, 0, 1) * 0.9
    _GAL[key] = (Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB'),
                 Image.fromarray((a * 255).astype(np.uint8), 'L'))
    return _GAL[key]
