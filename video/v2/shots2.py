# -*- coding: utf-8 -*-
"""«٨ دقائق» — 11 designed shots, editor-grade finishing."""
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'build'))
from engine import *  # noqa
from engine import (GX, GY, splat, splat_dot, paste_sprite, galaxy_sprite,
                    draw_line, text_w, ease_out, ease_in_out, ease_out_expo,
                    ease_out_back, smoothstep, lerp, CYAN, GOLD, SOFT, ICE)
from timeline2 import CUT2, END, FPS
import ui2, fx2

CUT = CUT2
A2 = os.path.join(HERE, '..', 'assets2')

def _plate(n): return Image.open(os.path.join(A2, n)).convert('RGB')

def grade(im, tint=(1, 1, 1), contrast=1.0, lift=0.0, sat=1.0, gamma=1.0):
    a = np.asarray(im).astype(np.float32) / 255
    g = a.mean(2, keepdims=True); a = g + (a - g) * sat
    a = np.clip((a - .5) * contrast + .5 + lift, 0, 1) ** gamma
    a *= np.array(tint, np.float32)
    return Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8), 'RGB')

PL = {
 'night':  grade(_plate('earth_night.png'), (.96, .99, 1.06), 1.10, sat=1.05),
 'frozen': grade(_plate('earth_frozen.png'), (.80, .93, 1.10), 1.12, lift=-.03, sat=.70),
 'limb':   grade(_plate('earth_limb.png'), (.98, 1.0, 1.06), 1.12),
 'sun':    grade(_plate('sun_dying.png'), (1.06, .96, .92), 1.05, sat=.92),
 'aurora': grade(_plate('aurora.png'), (.98, 1.03, 1.02), 1.10, sat=1.08),
}
PL['dark'] = grade(_plate('earth_limb.png'), (.62, .68, .80), 1.0, lift=-.09, sat=.25)

def make_stars(w, h, n, r0, r1, seed, warm=0.):
    rng = np.random.default_rng(seed); img = Image.new('RGB', (w, h), (0, 0, 0))
    d = ImageDraw.Draw(img)
    for _ in range(n):
        x = rng.uniform(0, w); y = rng.uniform(0, h); r = rng.uniform(r0, r1)
        b = rng.uniform(.2, 1.) ** 2.4
        c = (int(255 * b), int(248 * b), int(min(255, 255 * b * (1 + warm))))
        if r < 1.3: d.point((x, y), fill=c)
        else: d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    a = np.asarray(img.filter(ImageFilter.GaussianBlur(.55))).astype(np.float32)
    h2 = np.asarray(img.filter(ImageFilter.GaussianBlur(8))).astype(np.float32)
    return np.clip(a + h2 * .5, 0, 255)

SW, SH = 1500, 2650
S_FAR = make_stars(SW, SH, 1100, .5, 1.2, 15, .08)
S_MID = make_stars(SW, SH, 380, 1., 1.9, 16, .04)

def neb(w, h, seed, col=(36, 62, 120)):
    rng = np.random.default_rng(seed)
    sm = rng.normal(.5, .3, (14, 9)).astype(np.float32)
    im = Image.fromarray(np.clip(sm * 255, 0, 255).astype(np.uint8), 'L').resize((w, h), Image.BICUBIC)
    im = im.filter(ImageFilter.GaussianBlur(140))
    a = np.asarray(im).astype(np.float32) / 255
    a = np.clip((a - .37) * 2., 0, 1) ** 1.4
    return np.clip(np.stack([a * col[0], a * col[1], a * col[2]], -1), 0, 255)
NEB = neb(SW, SH, 31)

def layer(src, z=1., ox=0., oy=0., alpha=1.):
    sh, sw = src.shape[:2]; cw = sw / z; ch = cw * H / W
    if ch > sh: ch = sh; cw = ch * W / H
    cx = sw / 2 + ox * sw; cy = sh / 2 + oy * sh
    x0 = np.clip(cx - cw / 2, 0, sw - cw); y0 = np.clip(cy - ch / 2, 0, sh - ch)
    im = Image.fromarray(np.clip(src, 0, 255).astype(np.uint8), 'RGB')
    im = im.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((W, H), Image.BILINEAR)
    o = np.asarray(im).astype(np.float32)
    return o * alpha if alpha != 1 else o

def stars(drift=(0, 0), zoom=1., n=.7):
    bg = layer(NEB, zoom * .8, drift[0] * .3, drift[1] * .3, n)
    bg += layer(S_FAR, zoom, drift[0], drift[1]) * .9
    bg += layer(S_MID, zoom * 1.3, drift[0] * 1.6, drift[1] * 1.6) * .7
    return bg

def plate_shot(plate, zoom=1., fx=.5, fy=.5, rot=0.):
    im = plate.rotate(rot, resample=Image.BICUBIC, expand=False) if rot else plate
    sw, sh = im.size; cw = sw / zoom; ch = cw * H / W
    if ch > sh: ch = sh; cw = ch * W / H
    x0 = np.clip(sw * fx - cw / 2, 0, sw - cw); y0 = np.clip(sh * fy - ch / 2, 0, sh - ch)
    return np.asarray(im.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((W, H), Image.BILINEAR)).astype(np.float32)

# ============================================================ 01 · cold open (night Earth)
def sh_open(t, lt, dur):
    p = min(1, lt / dur)
    img = plate_shot(PL['night'], zoom=1.02 + 0.10 * ease_in_out(p), fx=.5, fy=.47)
    img += layer(S_FAR, 1.2, alpha=.10)
    # city lights breathe
    glow = 0.5 + 0.5 * math.sin(t * 1.1)
    engine_glow = 0
    add_gauss_glow(img, W * .52, H * .43, 620, (255, 168, 80), 0.06 + 0.02 * glow)
    scrim(img, .82, 980)
    textband(img, 1320, 480, .40)
    ui2.mono_kicker(img, t, .18, 'الفضاء بالعربي', 152, color=(200, 220, 244), size=23, bar=False)
    draw_line(img, W / 2, 196, 'N E X U S', ui2.MONO, 17, fill=(150, 178, 208), alpha=0.85, align='center', tracking=5.0)
    ui2.text_stack(img, t, CUT['night'], [
        dict(text='لو انطفأت الشمس', size=86, colors={'الشمس': (255, 196, 130)}, delay=0.0),
        dict(text='في هذه اللحظة...', size=62, color=(226, 238, 250), delay=0.55),
        dict(text='لن تحسّ بشيء.', size=96, path=ui2.TAJ, color=(255, 118, 108), delay=2.0, glow=5),
    ], bottom=1500, gap=34)
    ui2.mono_kicker(img, t, CUT['night'] + 2.7, 'T + 0 ثانية', 1560, color=(255, 128, 118), size=24)
    return img

# ============================================================ 02 · countdown clock
def sh_clock(t, lt, dur):
    p = min(1, lt / dur)
    img = plate_shot(PL['limb'], zoom=1.06 + .16 * ease_in_out(p), fx=.5, fy=.44)
    img += layer(S_FAR, 1.15, alpha=.08)
    add_gauss_glow(img, W * .5, H * .30, 640, (255, 150, 70), 0.10)
    scrim(img, .88, 760)
    textband(img, 900, 320, .55, blue=False)
    textband(img, 1330, 420, .45)
    ui2.mono_kicker(img, t, CUT['clock'] + .05, 'العدّ التنازلي بدأ', 700, color=(255, 190, 140), size=26)
    ui2.counter_clock(img, t, CUT['clock'] + .18, W / 2, 764, '08:20', size=176,
                      color=(255, 240, 220), dur=.85)
    ui2.text_stack(img, t, CUT['clock'], [
        dict(text='عندك', size=54, path=ui2.FB2, color=(214, 228, 244), delay=1.10),
        dict(text='ثماني دقائق وعشرون ثانية', size=64, color=(255, 226, 196), delay=1.45, glow=4),
    ], bottom=1440, gap=22)
    ui2.stamp_icon(img, t, CUT['clock'] + 1.6, 'sun', 150, 1290, 96, (255, 176, 96), .5, .85)
    ui2.stamp_icon(img, t, CUT['clock'] + 1.7, 'arrow_down', 930, 1290, 96, (255, 176, 96), .5, .85)
    # thin countdown ring around the frame
    frac = min(1, max(0, (t - CUT['clock']) / (CUT['travel'] - CUT['clock'])))
    ov = Image.new('L', (W, H), 0)
    ImageDraw.Draw(ov).rectangle([26, H - 44, 26 + (W - 52) * frac, H - 40], fill=150)
    paste_mask(img, ov, (255, 160, 90), 1.0)
    return img

# ============================================================ 03 · light travel (data motion)
MANY = None
def sh_travel(t, lt, dur):
    global MANY
    p = min(1, lt / dur)
    img = plate_shot(PL['sun'], zoom=.62 + .18 * ease_in_out(p), fx=.62, fy=.46, rot=-6) * .55
    img += stars(drift=(-.04 * p, .01 * p), zoom=1.0 + .1 * p, n=.55) * .8
    # photon streaks flying toward the lens
    if MANY is None:
        r = np.random.default_rng(5); n = 130
        MANY = dict(a=r.uniform(0, 6.28, n), r0=r.uniform(.05, .55, n),
                    sp=r.uniform(.25, 1.0, n), br=r.uniform(.35, 1, n), w=r.uniform(.3, 1, n))
    S = MANY
    head = ease_in_out(p) * 1.6
    for i in range(len(S['a'])):
        prog = (S['r0'][i] + p * S['sp'][i] * 2.4) % 1.0
        rad = (0.06 + prog * 1.25) * W
        x = W / 2 + math.cos(S['a'][i]) * rad * .62
        y = H * .55 + math.sin(S['a'][i]) * rad
        if -40 < x < W + 40 and -40 < y < H + 40:
            ln = 30 + 150 * S['w'][i]
            add_streak_local(img, x, y, math.cos(S['a'][i]), math.sin(S['a'][i]), ln, 1.4,
                             (150, 200, 255), .55 * S['br'][i] * (0.4 + prog))
    add_gauss_glow(img, W * .5, H * .55, 520, (40, 90, 180), .16)
    scrim(img, .80, 900)
    textband(img, 1170, 380, .55)
    ui2.mono_kicker(img, t, CUT['travel'] + .10, '299,792 KM/S', 700, color=(168, 208, 255), size=26)
    ui2.text_stack(img, t, CUT['travel'], [
        dict(text='الضوء يقطع', size=56, path=ui2.FB2, color=(214, 230, 248), delay=0.22),
        dict(text='150,000,000 كيلومتر', size=74, color=(238, 246, 255), delay=0.62,
             colors={'كيلومتر': (168, 210, 255)}),
        dict(text='في ثمان دقائق.', size=84, color=(255, 214, 160), delay=1.60, glow=5),
    ], bottom=1420, gap=30)
    ui2.lower_third(img, t, CUT['travel'] + 2.4, 'وحدة فلكية واحدة', '1 AU = 149,597,870 KM', y=1560)
    return img

def add_streak_local(img, x, y, dx, dy, ln, th, color, s):
    if s <= .01: return
    nx, ny = -dy, dx
    x0, x1 = x - dx * ln, x + dx * ln * .2
    y0, y1 = y - dy * ln, y + dy * ln * .2
    n = 14
    for k in range(n):
        f = k / n
        px = x0 + (x1 - x0) * f; py = y0 + (y1 - y0) * f
        splat(img, px, py, th + (1 - f) * 1.2, color, s * (1 - f) ** 1.6, 2.0)

# ============================================================ 04 · the Sun (detail push)
def sh_sun(t, lt, dur):
    p = min(1, lt / dur)
    img = plate_shot(PL['sun'], zoom=1.02 + .30 * ease_in_out(p), fx=.58, fy=.44)
    dx, dy = fx2.shake_at(t, 31, 9.0, 19, .22, CUT["sun"])
    img = np.roll(img, (int(dy), int(dx)), axis=(0, 1))
    add_gauss_glow(img, W * .52, H * .40, 460, (255, 90, 40), .12)
    add_streak(img, W * .52, H * .40, 420, 22, (255, 120, 70), .22)
    img *= .95
    scrim(img, .95, 900)
    textband(img, 1120, 300, .50, blue=False)
    ui2.mono_kicker(img, t, CUT['sun'] + .10, 'النجم الذي يعطينا الحياة', 760, color=(255, 180, 124), size=24)
    ui2.text_stack(img, t, CUT['sun'], [
        dict(text='الشمس', size=112, path=ui2.TAJ, color=(255, 240, 228), delay=0.25, glow=6),
    ], bottom=960, gap=0)
    ui2.text_stack(img, t, CUT['sun'] + 1.9, [
        dict(text='بدونها...', size=76, path=ui2.FB2, color=(255, 152, 122), delay=0.0),
        dict(text='لا حياة.', size=104, color=(255, 255, 255), delay=0.45, glow=5),
    ], bottom=1560, gap=24)
    return img

# ============================================================ 05 · darkness (light dies)
def sh_dark(t, lt, dur):
    p = min(1, lt / dur)
    img = plate_shot(PL['dark'], zoom=1.10 + .10 * ease_in_out(p), fx=.5, fy=.46)
    img += stars(zoom=1.1, n=.35)
    k = 1 - smoothstep(.15, .95, p)          # the last light going out
    add_gauss_glow(img, W * .5, H * .40, 600, (255, 120, 60), .16 * k)
    add_streak(img, W * .5, H * .40, 420, 16, (255, 130, 70), .20 * k)
    img *= (0.55 + 0.45 * k)
    scrim(img, .80, 940)
    textband(img, 1300, 430, .55)
    ui2.mono_kicker(img, t, CUT['dark'] + .08, 'T + 8:20', 760, color=(255, 122, 112), size=28)
    ui2.text_stack(img, t, CUT['dark'], [
        dict(text='وبعدها...', size=66, path=ui2.FB2, color=(206, 218, 234), delay=0.28),
        dict(text='ظلام كامل.', size=126, color=(255, 255, 255), delay=0.80, glow=7),
    ], bottom=1400, gap=26)
    ui2.badge(img, t, CUT['dark'] + 1.60, 'الأرض في خطر', 1540, (198, 38, 38))
    return img

# ============================================================ 06 · freeze (ice)
def sh_freeze(t, lt, dur):
    p = min(1, lt / dur)
    img = plate_shot(PL['frozen'], zoom=1.04 + .18 * ease_in_out(p), fx=.5, fy=.47)
    img = np.roll(img, (int(2.0 * math.sin(t * 31)), 0), axis=(0, 1))
    img *= 0.86
    add_gauss_glow(img, W * .38, H * .34, 620, (90, 170, 255), .12)
    add_streak(img, W * .38, H * .34, 460, 18, (150, 200, 255), .10)
    scrim(img, .86, 860)
    textband(img, 1240, 400, .50)
    ui2.mono_kicker(img, t, CUT['freeze'] + .08, 'المرحلة الأولى', 700, color=(172, 216, 255), size=24)
    ui2.stamp_icon(img, t, CUT['freeze'] + .20, 'globe', 150, 790, 96, (150, 205, 255), .55, .8)
    ui2.text_stack(img, t, CUT['freeze'], [
        dict(text='المحيطات تتجمّد', size=78, colors={'تتجمّد': (150, 212, 255)}, delay=0.22, glow=4),
        dict(text='من السطح', size=58, path=ui2.FB2, color=(216, 236, 252), delay=1.15),
        dict(text='إلى القاع.', size=84, color=(198, 232, 255), delay=1.5, glow=4),
    ], bottom=1460, gap=26)
    return img

# ============================================================ 07 · one month
def sh_month(t, lt, dur):
    p = min(1, lt / dur)
    img = plate_shot(PL['frozen'], zoom=1.62 - .30 * ease_in_out(p), fx=.42, fy=.56)
    img *= .70
    img += stars(zoom=1.2, n=.30)
    scrim(img, .92, 820)
    textband(img, 1180, 380, .52)
    ui2.mono_kicker(img, t, CUT['month'] + .06, 'بعد شهر', 700, color=(172, 216, 255), size=27)
    ui2.text_stack(img, t, CUT['month'], [
        dict(text='درجة الحرارة', size=68, path=ui2.FB2, color=(232, 242, 252), delay=0.2),
        dict(text='تحت الصفر.', size=110, colors={'الصفر.': (140, 200, 255)}, delay=0.75, glow=5),
    ], bottom=1290, gap=26)
    # thermometric bar falling
    frac = lerp(1.0, .12, ease_in_out(min(1, p * 1.2)))
    ov = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(ov)
    d.rounded_rectangle([W / 2 - 150, 1400, W / 2 + 150, 1428], radius=14, outline=90, width=2)
    d.rounded_rectangle([W / 2 - 144, 1406, W / 2 - 144 + 288 * frac, 1422], radius=8, fill=230)
    paste_mask(img, ov, (150, 210, 255), 1.0)
    ui2.mono_kicker(img, t, CUT['month'] + 1.3, '−40°C', 1480, color=(140, 200, 255), size=32, bar=False)
    return img

# ============================================================ 08 · one year (silence)
def sh_year(t, lt, dur):
    p = min(1, lt / dur)
    img = stars(drift=(.006 * p, .004 * p), zoom=1.25 - .12 * p, n=1.05) * 0.95
    img += plate_shot(PL['frozen'], zoom=2.2, fx=.55, fy=.42) * .22
    add_gauss_glow(img, W * .5, H * .40, 620, (70, 120, 190), .16)
    add_streak(img, W * .5, H * .40, 380, 14, (120, 170, 235), .10)
    scrim(img, .52, 760)
    textband(img, 1080, 430, .50)
    ui2.mono_kicker(img, t, CUT['year'] + .06, 'بعد سنة', 680, color=(186, 202, 222), size=27)
    ui2.text_stack(img, t, CUT['year'], [
        dict(text='لا شيء', size=122, path=ui2.TAJ, color=(246, 250, 255), delay=0.2, glow=7),
        dict(text='يتحرك.', size=122, path=ui2.TAJ, color=(255, 255, 255), delay=0.72, glow=7),
    ], bottom=1320, gap=18)
    ui2.mono_kicker(img, t, CUT['year'] + 1.6, 'SILENCE', 1420, color=(118, 142, 172), size=24, bar=False)
    return img

# ============================================================ 09 · the question (aurora)
def sh_question(t, lt, dur):
    p = min(1, lt / dur)
    img = plate_shot(PL['aurora'], zoom=1.06 + .20 * ease_in_out(p), fx=.5, fy=.45)
    img += layer(S_FAR, 1.2, alpha=.10)
    add_gauss_glow(img, W * .5, H * .22, 560, (60, 220, 150), .10)
    scrim(img, .86, 820)
    textband(img, 1230, 460, .58)
    ui2.mono_kicker(img, t, CUT['question'] + .08, 'السؤال الحقيقي', 680, color=(140, 245, 200), size=24)
    ui2.text_stack(img, t, CUT['question'], [
        dict(text='واش نحنا آخر من', size=64, path=ui2.FB2, color=(228, 242, 248), delay=0.25),
        dict(text='يطفئ الضوء...', size=86, color=(255, 150, 130), delay=0.72, glow=4),
        dict(text='ولا آخر من', size=62, path=ui2.FB2, color=(228, 242, 248), delay=2.05),
        dict(text='يشعله؟', size=110, path=ui2.TAJ, color=(160, 255, 205), delay=2.5, glow=7),
    ], bottom=1560, gap=22)
    return img

# ============================================================ 10 · the call
def sh_call(t, lt, dur):
    p = min(1, lt / dur)
    img = plate_shot(PL['aurora'], zoom=1.45 - .22 * ease_in_out(p), fx=.52, fy=.42)
    img *= .86
    img += stars(zoom=1.15, n=.45)
    add_gauss_glow(img, W * .5, H * .30, 520, (70, 230, 170), .14)
    add_streak(img, W * .5, H * .30, 520, 20, (150, 255, 210), .18)
    scrim(img, .90, 760)
    textband(img, 1130, 420, .55)
    ui2.text_stack(img, t, CUT['call'], [
        dict(text='النور...', size=96, color=(238, 248, 255), delay=0.18, glow=4),
        dict(text='ما كيدومش.', size=88, path=ui2.FB2, color=(255, 190, 140), delay=0.70),
        dict(text='اشعلو اليوم.', size=126, path=ui2.TAJ, color=(255, 232, 170), delay=1.7, glow=8),
    ], bottom=1420, gap=26)
    ui2.mono_kicker(img, t, CUT['call'] + 2.35, 'SHARE THE LIGHT', 1470, color=(255, 222, 172), size=24)
    return img

# ============================================================ 11 · end card
def sh_end(t, lt, dur):
    img = stars(drift=(0, -.006 * lt), zoom=.9, n=.9)
    cx, cy = W / 2, H * .30
    add_gauss_glow(img, cx, cy, 360, (60, 130, 220), .20)
    add_streak(img, cx, cy, 460, 18, (150, 205, 255), .22)
    splat_dot(img, cx, cy, 12, 1.1)
    a1, dy1 = ui2_a(t, .10, .8, 26)
    draw_line(img, cx, cy + 150 + dy1, 'NEXUS', ui2.MONO, 122, fill=(252, 253, 255), alpha=a1,
              align='center', tracking=17, glow=16, shadow=(18, .95), glow_fill=(70, 130, 210))
    a2, dy2 = ui2_a(t, .45, .7, 20)
    draw_line(img, cx, cy + 318 + dy2, 'الفضاء بالعربي', ui2.TAJ, 52, fill=(150, 216, 255),
              alpha=a2 * .96, align='center', glow=8)
    a3, dy3 = ui2_a(t, 1.05, .6, 18)
    draw_line(img, cx, cy + 430 + dy3, '«٨ دقائق» — حلقة كاملة الأسبوع الجاي', ui2.FB2, 38,
              fill=(206, 222, 240), alpha=a3 * .92, align='center')
    ui2.endcard_cta(img, t, 1.65, 'تابِع  NEXUS', cy + 560)
    a5, dy5 = ui2_a(t, 2.25, .6, 16)
    draw_line(img, cx, cy + 790 + dy5, 'حلقة جديدة كل يوم', ui2.FB2, 34,
              fill=(184, 204, 226), alpha=a5 * .85, align='center')
    ui2.stamp_icon(img, t, 2.5, 'arrow_up', cx, cy + 870, 62, (150, 200, 255), .5, .8)
    return img

def ui2_a(t, t0, dur, rise):
    p = (t - t0) / dur
    if p <= 0: return 0.0, rise
    p = min(1, p); e = ease_out(p)
    return e, rise * (1 - e)

# ============================================================ finishing
def bloom(img, thresh=198, radius=26, strength=.62):
    small = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((W // 4, H // 4), Image.BILINEAR)
    a = np.asarray(small).astype(np.float32)
    m = np.clip((a.max(2, keepdims=True) - thresh) / (255 - thresh + 1e-6), 0, 1)
    b = Image.fromarray(np.clip(a * m, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius // 2))
    return img + np.asarray(b.resize((W, H), Image.BILINEAR)).astype(np.float32) * strength

_VIG = None
def vignette(img, s=.62):
    global _VIG
    if _VIG is None:
        d = np.sqrt(((GX - CX) / CX) ** 2 + ((GY - CY) / CY) ** 2) / 1.414
        _VIG = np.clip(1 - d, 0, 1) ** .78
    img *= np.clip(1 - s * (1 - _VIG), 0, 1)[..., None]

LIST = [(CUT['open'], 'open'), (CUT['night'], 'open'), (CUT['clock'], 'clock'),
        (CUT['travel'], 'travel'), (CUT['sun'], 'sun'), (CUT['dark'], 'dark'),
        (CUT['freeze'], 'freeze'), (CUT['month'], 'month'), (CUT['year'], 'year'),
        (CUT['question'], 'question'), (CUT['call'], 'call'), (CUT['endcard'], 'end')]
FUNCS = dict(open=sh_open, clock=sh_clock, travel=sh_travel, sun=sh_sun, dark=sh_dark,
             freeze=sh_freeze, month=sh_month, year=sh_year, question=sh_question,
             call=sh_call, end=sh_end)
FLASH = [(CUT['clock'], .40), (CUT['travel'], .55), (CUT['dark'], .70), (CUT['call'], .62)]
SHAKE = [(CUT['travel'], 16), (CUT['dark'], 14), (CUT['year'], 8), (CUT['call'], 18)]

def shot_at(t):
    for i in range(len(LIST) - 1):
        a, n = LIST[i]; b = LIST[i + 1][0]
        if a <= t < b: return n, t - a, b - a
    return LIST[-1][1], t - CUT['endcard'], END - CUT['endcard']

def render_frame(t):
    name, lt, dur = shot_at(t)
    img = FUNCS[name](t, lt, dur).astype(np.float32)
    # camera shake on impacts
    for st, amp in SHAKE:
        dx, dy = fx2.shake_at(t, int(st * 10), amp, 19, .20, st)
        if dx or dy:
            img = np.roll(img, (int(dy), int(dx)), axis=(0, 1))
    img = np.clip(img, 0, 255)
    lum = img.mean(2, keepdims=True) / 255
    img = img * (np.array([.96, 1, 1.06], np.float32) * (1 - lum)
                 + np.array([1.03, 1, .975], np.float32) * lum)
    # light leaks at the transitions
    img = fx2.light_leak(img, t, CUT['clock'] - .35, .9, 'left', .42, (255, 150, 70))
    img = fx2.light_leak(img, t, CUT['dark'] - .30, .8, 'right', .34, (255, 90, 60))
    img = fx2.light_leak(img, t, CUT['call'] - .30, .8, 'left', .40, (120, 255, 190))
    # anamorphic flare on the two hero beats
    img = fx2.flare(img, W * .5, H * .40, t, 0.9 * math.exp(-((t - CUT['dark']) ** 2) / .18), (150, 190, 255))
    img = fx2.flare(img, W * .5, H * .34, t, 0.8 * math.exp(-((t - CUT['call']) ** 2) / .2), (200, 255, 220))
    # cut flashes
    for ft, pk in FLASH:
        d = abs(t - ft)
        if d < .085:
            img = img * (1 - (1 - d / .085) * pk) + 255 * (1 - d / .085) * pk
    # chromatic aberration on transitions
    amp = 0.0
    for ft, pk in ((CUT['travel'], 2.2), (CUT['dark'], 2.6), (CUT['call'], 2.4)):
        d = abs(t - ft)
        if d < .28: amp = max(amp, pk * (1 - d / .28))
    img = fx2.ca(img, amp)
    img = fx2.dust(img, t, 54, 7, .45, 1.5)
    img = bloom(img)
    vignette(img)
    img = fx2.grain_plate(img, int(t * 60) % 1000, 5.2)
    img = np.tanh(np.clip(img, 0, 255) / 255 * 1.04) * 255
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB')
