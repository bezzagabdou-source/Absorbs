#!/usr/bin/env python3
"""APEX VELOCITY asset pipeline: AI key art, textures, icons, audio.

Every generated asset is deterministic: running this file twice produces
byte-identical output (seeded RNG), so CI can verify "generated == committed".

Sources of "AI art" (no external image APIs are reachable from the build
sandbox): seeded multi-octave noise fields, gradient-domain sky models,
procedural city/terrain silhouettes and post-processing (bloom, grain,
chromatic shift, vignette). This is documented honestly in CREDITS.md.

Usage: python3 tools/generate_assets.py [--only art|textures|icons|audio]
"""
from __future__ import annotations

import argparse
import math
import os
import struct
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

# Palette (kept in sync with scripts/autoload/UIStyle.gd)
CYAN = (34, 233, 255)
MAGENTA = (255, 46, 147)
VIOLET = (124, 77, 255)
AMBER = (255, 176, 32)
LIME = (101, 255, 170)
INK = (6, 8, 16)
STEEL = (146, 160, 196)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def ensure(path: str) -> str:
    os.makedirs(path, exist_ok=True)
    return path


def save_webp(img: Image.Image, path: str, quality: int = 88) -> None:
    ensure(os.path.dirname(path))
    img.convert("RGB").save(path, "WEBP", quality=quality, method=6)


def save_png(img: Image.Image, path: str) -> None:
    ensure(os.path.dirname(path))
    img.save(path, "PNG", optimize=True)


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def value_noise(h: int, w: int, cells: tuple[int, int], rng: np.random.Generator) -> np.ndarray:
    """Bilinear-interpolated value noise, then smoothstepped (tileable)."""
    cy, cx = cells
    grid = rng.random((cy + 1, cx + 1)).astype(np.float32)
    grid[-1, :] = grid[0, :]
    grid[:, -1] = grid[:, 0]
    ys = np.linspace(0, cy, h, endpoint=False, dtype=np.float32)
    xs = np.linspace(0, cx, w, endpoint=False, dtype=np.float32)
    y0 = np.floor(ys).astype(np.int32)
    x0 = np.floor(xs).astype(np.int32)
    fy = smoothstep(ys - y0)[:, None]
    fx = smoothstep(xs - x0)[None, :]
    y1 = (y0 + 1) % cy
    x1 = (x0 + 1) % cx
    a = grid[y0][:, x0]
    b = grid[y0][:, x1]
    c = grid[y1][:, x0]
    d = grid[y1][:, x1]
    top = a * (1 - fx) + b * fx
    bot = c * (1 - fx) + d * fx
    return top * (1 - fy) + bot * fy


def fbm(h: int, w: int, octaves: int, base_cells: tuple[int, int], rng, gain=0.5, lacunarity=2):
    out = np.zeros((h, w), dtype=np.float32)
    amp = 1.0
    total = 0.0
    cells = base_cells
    for _ in range(octaves):
        out += value_noise(h, w, cells, rng) * amp
        total += amp
        amp *= gain
        cells = (cells[0] * lacunarity, cells[1] * lacunarity)
    return out / total


def ridges(h: int, w: int, octaves: int, base_cells: tuple[int, int], rng) -> np.ndarray:
    n = fbm(h, w, octaves, base_cells, rng)
    r = 1.0 - np.abs(n * 2.0 - 1.0)
    return r ** 2.2


def colorize(field: np.ndarray, stops: list[tuple[float, tuple[int, int, int]]]) -> np.ndarray:
    """Map a 0..1 scalar field through a colour ramp -> HxWx3 float array."""
    stops = sorted(stops)
    xs = np.array([s[0] for s in stops], dtype=np.float32)
    cols = np.array([s[1] for s in stops], dtype=np.float32) / 255.0
    f = field.clip(0, 1)
    out = np.empty(field.shape + (3,), dtype=np.float32)
    for c in range(3):
        out[..., c] = np.interp(f, xs, cols[:, c])
    return out


def to_img(arr) -> Image.Image:
    a = np.asarray(arr)
    if a.dtype != np.uint8:
        a = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    if a.ndim == 2:
        return Image.fromarray(a, "L").convert("RGB")
    if a.shape[2] == 4:
        return Image.fromarray(a, "RGBA")
    return Image.fromarray(a, "RGB")


def radial_glow(h: int, w: int, cx: float, cy: float, radius: float, strength=1.0) -> np.ndarray:
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((x - cx * w) / (radius * w)) ** 2 + ((y - cy * h) / (radius * h)) ** 2)
    return (np.exp(-(d ** 2) * 2.2) * strength).astype(np.float32)


def add_bloom(img: Image.Image, threshold: int = 150, radius: int = 26, amount=0.85) -> Image.Image:
    arr = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    lum = arr.max(axis=2)
    mask = np.clip((lum - threshold / 255.0) / (1 - threshold / 255.0), 0, 1)[..., None]
    bright = Image.fromarray(((arr * mask) * 255).astype(np.uint8))
    blur = bright.filter(ImageFilter.GaussianBlur(radius))
    b = np.asarray(blur, dtype=np.float32) / 255.0
    out = 1.0 - (1.0 - arr) * (1.0 - b * amount)
    return to_img(out)


def grain(img: Image.Image, rng, amount=0.035) -> Image.Image:
    arr = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    n = rng.normal(0, amount, arr.shape[:2])[..., None]
    return to_img(np.clip(arr + n, 0, 1))


def vignette(img: Image.Image, strength=0.55, power=2.4) -> Image.Image:
    h, w = img.size[1], img.size[0]
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = (x - w / 2) / (w / 2)
    dy = (y - h / 2) / (h / 2)
    d = np.sqrt(dx ** 2 + dy ** 2) / math.sqrt(2)
    v = 1.0 - strength * (d ** power)
    arr = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    return to_img(arr * v[..., None])


def chromatic(img: Image.Image, px: int = 2) -> Image.Image:
    r, g, b = img.convert("RGB").split()
    r = r.transform(r.size, Image.AFFINE, (1, 0, px, 0, 1, px))
    b = b.transform(b.size, Image.AFFINE, (1, 0, -px, 0, 1, -px))
    return Image.merge("RGB", (r, g, b))


# ---------------------------------------------------------------------------
# KEY ART
# ---------------------------------------------------------------------------
def skyline_layer(w, h, rng, base_y, density, height_scale, color, lights_color,
                   window_light=0.5, blur=0.0):
    """Procedural city skyline painted on a transparent RGBA layer."""
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x = -20
    while x < w + 20:
        bw = int(rng.integers(24, 110) * density)
        gap = int(rng.integers(2, 14))
        bh = int(abs(rng.normal(height_scale, height_scale * 0.45)) + 18)
        top = int(base_y - bh)
        alpha = int(rng.integers(200, 256))
        d.rectangle([x, top, x + bw, h], fill=color + (alpha,))
        # rooftop details
        if rng.random() < 0.35:
            aw = max(3, bw // 6)
            d.rectangle([x + bw // 2 - aw // 2, top - int(bh * 0.18), x + bw // 2 + aw // 2, top],
                        fill=color + (alpha,))
        if rng.random() < 0.22:
            d.line([x + bw // 2, top, x + bw // 2, top - int(rng.integers(18, 70))],
                   fill=color + (alpha,), width=2)
        # windows
        for wy in range(top + 8, h, 9):
            for wx in range(x + 5, min(x + bw - 4, w), 7):
                if rng.random() < window_light * 0.35:
                    c = lights_color if rng.random() < 0.85 else (255, 240, 210)
                    a = int(rng.integers(70, 190))
                    d.rectangle([wx, wy, wx + 3, wy + 4], fill=c + (a,))
        x += bw + gap
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return layer


class Canvas:
    """Small drawing helper over a supersampled RGBA image."""

    def __init__(self, w, h, ss=2):
        self.ss = ss
        self.img = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
        self.w, self.h = w, h

    def d(self):
        return ImageDraw.Draw(self.img)

    def grad_poly(self, pts, col_a, col_b, alpha=255):
        d = self.d()
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        x0, x1 = int(min(xs)), int(max(xs)) + 1
        y0, y1 = int(min(ys)), int(max(ys)) + 1
        x0c, x1c = max(0, x0), min(self.img.width, x1)
        y0c, y1c = max(0, y0), min(self.img.height, y1)
        gw, gh = x1c - x0c, y1c - y0c
        if gw < 2 or gh < 2:
            d.polygon(pts, fill=col_a + (alpha,))
            return
        mix = np.linspace(0, 1, gw, dtype=np.float32)[None, :, None]
        a = np.array(col_a + (alpha,), dtype=np.float32)[None, None, :]
        b = np.array(col_b + (alpha,), dtype=np.float32)[None, None, :]
        grad = (a * (1 - mix) + b * mix).repeat(gh, axis=0)
        grad_img = Image.fromarray(np.clip(grad, 0, 255).astype(np.uint8), "RGBA")
        mask = Image.new("L", (gw, gh), 0)
        ImageDraw.Draw(mask).polygon([(p[0] - x0c, p[1] - y0c) for p in pts], fill=alpha)
        self.img.paste(grad_img, (x0c, y0c), mask)

    def poly(self, pts, col, alpha=255):
        self.d().polygon(pts, fill=tuple(col) + (alpha,))

    def line(self, pts, col, width, alpha=255):
        self.d().line(pts, fill=tuple(col) + (alpha,), width=width, joint="curve")

    def ellipse(self, box, col, alpha=255):
        self.d().ellipse(box, fill=tuple(col) + (alpha,))

    def glow(self, cx, cy, r, col, strength=1.0):
        r = max(2.0, r)
        size = int(r * 2)
        if size <= 0:
            return
        y, x = np.mgrid[0:size, 0:size].astype(np.float32)
        dd = np.sqrt((x - size / 2) ** 2 + (y - size / 2) ** 2) / (size / 2)
        v = np.exp(-(dd ** 2) * 2.6) * strength
        arr = np.stack([v * col[0] / 255.0, v * col[1] / 255.0, v * col[2] / 255.0, v], axis=2)
        gl = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGBA")
        self.img.alpha_composite(gl, (int(cx - size / 2), int(cy - size / 2)))

    def result(self, target_size):
        return self.img.resize(target_size, Image.LANCZOS)


def draw_car(cx, cy, scale, angle_deg, body, accent, rng, brake=False,
             headlights=True, size=(1920, 1080), ss=2):
    """Hero-quality side-profile hypercar in car units (-10..10 x, -3..1.3 y)."""
    W, H = size
    cv = Canvas(W, H, ss=ss)
    a = math.radians(angle_deg)
    cos_a, sin_a = math.cos(a), math.sin(a)
    s = scale * cv.ss

    def P(pts):
        return [(cx * cv.ss + (px * cos_a - py * sin_a) * s,
                 cy * cv.ss + (px * sin_a + py * cos_a) * s) for (px, py) in pts]

    base = tuple(body)
    dark = tuple(max(0, int(c * 0.30)) for c in base)
    deep = tuple(max(0, int(c * 0.17)) for c in base)
    mid = tuple(min(255, int(c * 1.55) + 8) for c in base)
    lite = tuple(min(255, int(c * 2.25) + 22) for c in base)
    hi = tuple(min(255, int(c * 3.0) + 58) for c in base)

    GROUND = 1.30
    wheel_y = 0.42
    wheel_r = 1.66
    wheel_x = (-5.95, 5.95)

    # ---- contact shadow + underglow ------------------------------------
    shadow = Image.new("RGBA", cv.img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([(cx - 10.3 * scale) * cv.ss, (cy + 1.05 * scale) * cv.ss,
                                    (cx + 10.3 * scale) * cv.ss, (cy + 1.62 * scale) * cv.ss],
                                   fill=(0, 0, 0, 210))
    cv.img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(5 * cv.ss)))
    cv.glow(cx * cv.ss, (cy + 1.20 * scale) * cv.ss, 7.6 * scale * cv.ss, accent, 0.42)

    # ---- glasshouse (roof above the beltline) --------------------------
    cv.grad_poly(P([(-3.55, -1.05), (-2.70, -2.02), (-1.25, -2.45), (0.85, -2.47), (2.55, -2.02),
                    (3.30, -1.02)]), lite, mid)
    cv.line(P([(-2.70, -2.04), (-1.25, -2.47), (0.85, -2.49), (2.55, -2.04)]), hi, int(0.10 * s), 220)

    # ---- main body ------------------------------------------------------
    body_pts = [(-9.50, 0.98), (-9.80, 0.10), (-9.45, -0.72), (-7.60, -0.95), (-5.40, -1.08),
                (-3.90, -1.18), (-2.60, -1.22), (0.40, -1.18), (3.40, -1.12), (5.20, -1.24),
                (6.90, -1.24), (8.80, -1.00), (9.70, -0.36), (9.72, 0.20), (9.00, 0.78),
                (7.20, 0.94), (2.00, 0.90), (-2.00, 0.86), (-6.40, 0.98), (-8.80, 0.96)]
    cv.grad_poly(P(body_pts), deep, mid)
    cv.line(P([(-9.30, -0.74), (-7.50, -0.95), (-5.20, -1.06), (-3.20, -1.16)]), hi, int(0.09 * s), 190)
    cv.line(P([(3.60, -1.12), (5.40, -1.22), (7.40, -1.22), (8.70, -1.00)]), hi, int(0.09 * s), 175)
    cv.line(P([(5.90, -1.20), (5.60, -0.20)]), (0, 0, 0), int(0.05 * s), 80)
    # lower body shading + sills + accent blade (drawn before wheels)
    cv.grad_poly(P([(-9.2, 0.34), (9.3, 0.30), (9.0, 0.86), (-9.0, 0.92)]), (6, 7, 10), (22, 24, 30), 150)
    cv.grad_poly(P([(-7.40, 0.62), (6.20, 0.55), (6.00, 0.94), (-7.20, 0.98)]), (8, 9, 13), (26, 28, 35))
    cv.line(P([(-8.20, 0.60), (-4.00, 0.42), (1.50, 0.45), (8.50, 0.52)]), accent, int(0.14 * s), 245)
    cv.line(P([(-8.20, 0.60), (-4.00, 0.42), (0.00, 0.43)]), hi, int(0.045 * s), 140)
    cv.line(P([(-3.35, -1.42), (-3.15, -0.20), (-2.95, 0.70)]), (0, 0, 0), int(0.06 * s), 100)
    cv.line(P([(-2.50, -0.96), (-2.00, -0.92)]), hi, int(0.09 * s), 130)

    # ---- wheel wells + wheels (drawn over the body for crisp arches) ---
    for wx in wheel_x:
        cxp, cyp = P([(wx, wheel_y)])[0]
        # dark well, slightly larger than the tyre
        well = 1.86 * s
        cv.d().pieslice([cxp - well, cyp - well, cxp + well, cyp + well], 180, 360,
                        fill=(6, 7, 10, 255))
        r = wheel_r * s
        cv.ellipse([cxp - r * 1.02, cyp - r * 1.02, cxp + r * 1.02, cyp + r * 1.02], (5, 6, 8))
        cv.ellipse([cxp - r, cyp - r, cxp + r, cyp + r], (17, 18, 22))          # tyre
        cv.ellipse([cxp - r * 0.88, cyp - r * 0.88, cxp + r * 0.88, cyp + r * 0.88], (30, 32, 38))
        cv.ellipse([cxp - r * 0.68, cyp - r * 0.68, cxp + r * 0.68, cyp + r * 0.68], (16, 17, 21))
        cv.ellipse([cxp - r * 0.64, cyp - r * 0.64, cxp + r * 0.64, cyp + r * 0.64], (52, 55, 64))  # disc
        for k in range(16):
            ang = k * math.pi / 8
            cv.poly([(cxp + math.cos(ang) * r * 0.52, cyp + math.sin(ang) * r * 0.52),
                     (cxp + math.cos(ang + 0.1) * r * 0.64, cyp + math.sin(ang + 0.1) * r * 0.64),
                     (cxp + math.cos(ang + 0.16) * r * 0.52, cyp + math.sin(ang + 0.16) * r * 0.52)],
                    (34, 36, 42))
        cv.ellipse([cxp - r * 0.46, cyp - r * 0.46, cxp + r * 0.46, cyp + r * 0.46], (46, 49, 58))
        for k in range(5):
            ang = k * 2 * math.pi / 5 + 0.35
            cv.poly([(cxp + math.cos(ang) * r * 0.12, cyp + math.sin(ang) * r * 0.12),
                     (cxp + math.cos(ang + 0.26) * r * 0.44, cyp + math.sin(ang + 0.26) * r * 0.44),
                     (cxp + math.cos(ang + 0.42) * r * 0.44, cyp + math.sin(ang + 0.42) * r * 0.44),
                     (cxp + math.cos(ang + 0.30) * r * 0.12, cyp + math.sin(ang + 0.30) * r * 0.12)],
                    (78, 82, 94))
        cv.ellipse([cxp - r * 0.16, cyp - r * 0.16, cxp + r * 0.16, cyp + r * 0.16], accent)
        cv.ellipse([cxp - r * 0.06, cyp - r * 0.06, cxp + r * 0.06, cyp + r * 0.06], (18, 19, 24))
        cv.glow(cxp, cyp, r * 1.3, accent, 0.22)
        # fender lip: thin specular arc following the arch
        cv.d().arc([cxp - well, cyp - well, cxp + well, cyp + well], 196, 344,
                   fill=hi + (165,), width=max(1, int(0.085 * s)))

    # ---- rear wing + supports ------------------------------------------
    cv.grad_poly(P([(-10.00, -1.72), (-7.35, -1.90), (-7.30, -1.60), (-9.95, -1.42)]),
                 (12, 13, 18), (52, 56, 68))
    cv.line(P([(-9.95, -1.70), (-7.40, -1.88)]), (150, 158, 175), int(0.05 * s), 190)
    cv.poly(P([(-9.55, -1.42), (-9.38, -1.42), (-9.42, -0.9), (-9.6, -0.9)]), (16, 17, 22))
    cv.poly(P([(-7.85, -1.60), (-7.68, -1.60), (-7.72, -1.05), (-7.9, -1.05)]), (16, 17, 22))

    # ---- details ---------------------------------------------------------
    cv.grad_poly(P([(7.60, 0.78), (10.10, 0.42), (10.20, 0.76), (7.90, 1.08)]), (9, 10, 14), (40, 43, 52))
    cv.line(P([(7.80, 0.76), (10.05, 0.40)]), (130, 138, 154), int(0.05 * s), 180)
    cv.poly(P([(8.60, -0.78), (9.90, -0.50), (9.90, -0.34), (8.60, -0.62)]), dark)
    cv.grad_poly(P([(7.95, -1.06), (9.50, -0.86), (9.60, -0.48), (8.10, -0.56)]),
                 (255, 252, 240), (168, 210, 255))
    cv.line(P([(8.00, -1.04), (9.45, -0.84)]), (255, 255, 255), int(0.05 * s), 220)
    if headlights:
        cxp, cyp = P([(9.05, -0.76)])[0]
        cv.glow(cxp, cyp, 1.5 * scale * cv.ss, (220, 240, 255), 0.85)
        cv.glow(cxp + 2 * scale * cv.ss, cyp + 0.2 * scale * cv.ss, 3.2 * scale * cv.ss,
                (120, 190, 255), 0.35)
    tl = (255, 48, 72) if brake else (214, 44, 60)
    cv.line(P([(-9.55, -0.46), (-9.05, -0.72), (-8.65, -0.50)]), tl, int(0.18 * s))
    cxp, cyp = P([(-9.1, -0.60)])[0]
    cv.glow(cxp, cyp, 1.9 * scale * cv.ss, tl, 0.8 if brake else 0.5)
    for k in range(4):
        cv.poly(P([(-9.45 + k * 0.4, 0.40), (-9.25 + k * 0.4, 0.40),
                   (-9.15 + k * 0.4, 0.86), (-9.35 + k * 0.4, 0.86)]), (20, 22, 28))
    cxp, cyp = P([(-9.78, 0.62)])[0]
    cv.glow(cxp, cyp, 0.9 * scale * cv.ss, (255, 120, 60), 0.35)
    # windows
    cv.grad_poly(P([(-3.00, -1.35), (-2.35, -2.02), (-1.05, -2.32), (0.70, -2.34), (2.10, -2.00),
                    (2.70, -1.36)]), (64, 96, 128), (10, 15, 26))
    cv.line(P([(-0.35, -2.36), (-0.25, -1.50)]), (14, 16, 22), int(0.20 * s))
    cv.line(P([(-2.25, -2.08), (1.30, -2.20)]), (150, 205, 240), int(0.07 * s), 150)
    cv.line(P([(-1.75, -2.20), (0.70, -2.28)]), (196, 228, 252), int(0.045 * s), 120)
    cv.line(P([(1.10, -2.06), (2.05, -1.50)]), (90, 140, 180), int(0.05 * s), 90)
    # mirror
    cv.poly(P([(-2.35, -1.98), (-2.05, -2.10), (-1.90, -1.84), (-2.22, -1.82)]), (24, 26, 32))
    cv.poly(P([(-2.28, -1.99), (-2.10, -2.06), (-2.00, -1.90), (-2.20, -1.88)]), accent)
    return cv.result((W, H))


def add_reflection(img, car_layer, y_axis, strength=0.5, blur=6):
    """Wet-asphalt mirrored reflection of the car."""
    if car_layer.size != img.size:
        car_layer = car_layer.resize(img.size, Image.LANCZOS)
    refl = car_layer.transpose(Image.FLIP_TOP_BOTTOM)
    alpha = refl.split()[3].point(lambda v: int(v * strength))
    refl.putalpha(alpha)
    refl = refl.filter(ImageFilter.GaussianBlur(blur))
    y, x = np.mgrid[0:img.height, 0:img.width].astype(np.float32)
    fade = np.clip(1.0 - (y - y_axis) / (img.height - y_axis + 1), 0, 1)[..., None]
    a = np.asarray(refl.split()[3], dtype=np.float32) * fade[..., 0]
    refl.putalpha(Image.fromarray(a.astype(np.uint8)))
    img.alpha_composite(refl, (0, int(2 * y_axis - img.height)))
    return img


def art_menu_hero() -> None:
    rng = np.random.default_rng(20261119)
    w, h = 1920, 1080
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    sky = colorize(np.repeat(y, w, axis=1), [
        (0.00, (8, 10, 34)), (0.22, (22, 20, 62)), (0.42, (58, 30, 92)),
        (0.55, (120, 44, 104)), (0.64, (206, 72, 104)), (0.70, (255, 132, 96)),
        (0.75, (255, 196, 140)), (0.80, (255, 226, 180))])
    stars = np.zeros((h, w, 3), dtype=np.float32)
    for _ in range(560):
        sx, sy = int(rng.integers(0, w)), int(rng.integers(0, int(h * 0.42)))
        b = rng.random() ** 2 * 1.1
        stars[sy, sx] = (b, b, b * 1.15)
    sky = np.clip(sky + stars, 0, 1)
    img = to_img(sky).convert("RGBA")
    g = radial_glow(h, w, 0.70, 0.22, 0.16, 1.0)
    arr = np.asarray(img, dtype=np.float32)[..., :3] / 255.0
    arr = np.clip(arr + np.stack([g * 0.25, g * 0.30, g * 0.55], axis=2), 0, 1)
    img = to_img(arr).convert("RGBA")
    d = ImageDraw.Draw(img)
    d.ellipse([0.70 * w - 52, 0.22 * h - 52, 0.70 * w + 52, 0.22 * h + 52], fill=(242, 246, 255, 255))
    d.ellipse([0.70 * w - 36, 0.22 * h - 56, 0.70 * w + 30, 0.22 * h + 18], fill=(228, 236, 252, 255))
    # clouds
    cloud = fbm(h, w, 5, (3, 7), rng)
    band = np.exp(-((y - 0.40) ** 2) / 0.006)
    cb = np.clip((cloud - 0.42) * 2.2, 0, 1) * band * 0.5
    arr = np.asarray(img, dtype=np.float32)[..., :3] / 255.0
    arr = np.clip(arr + np.stack([cb * 2.2, cb * 1.2, cb * 1.9], axis=2), 0, 1)
    img = to_img(arr).convert("RGBA")
    # city: two layers, brighter windows
    img.alpha_composite(skyline_layer(w, h, rng, 0.72 * h, 0.5, 230, (16, 18, 38), (170, 230, 255), 0.75, 2.2))
    img.alpha_composite(skyline_layer(w, h, rng, 0.79 * h, 0.75, 180, (10, 12, 26), (150, 220, 255), 0.85, 1.0))
    # horizon haze
    arr = np.asarray(img, dtype=np.float32)[..., :3] / 255.0
    haze = np.exp(-((y - 0.74) ** 2) / 0.0012) * 0.65
    arr = np.clip(arr + np.stack([haze * 1.0, haze * 0.45, haze * 0.62], axis=2), 0, 1)
    img = to_img(arr).convert("RGBA")
    # ground
    ground = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(ground)
    gd.rectangle([0, 0.80 * h, w, h], fill=(14, 15, 24, 255))
    gr = np.asarray(ground, dtype=np.float32) / 255.0
    tex = fbm(h, w, 6, (26, 60), rng, gain=0.55)
    gr[..., :3] = np.clip(gr[..., :3] * (0.5 + 0.9 * tex[..., None]), 0, 1)
    y2, x2 = np.mgrid[0:h, 0:w].astype(np.float32)
    gm = (y2 / h > 0.795)
    for (rx, col, spread, inten) in [(0.16, MAGENTA, 0.05, 0.55), (0.44, CYAN, 0.07, 0.65),
                                     (0.66, VIOLET, 0.06, 0.5), (0.88, AMBER, 0.045, 0.5)]:
        m = gm * np.exp(-((x2 / w - rx) ** 2) / (spread ** 2) * 0.5) * ((y2 / h - 0.79) * 5.0)
        m = np.clip(m, 0, 1) * inten
        for c in range(3):
            gr[..., c] = np.clip(gr[..., c] + m * col[c] / 255.0, 0, 1)
    ground = to_img(gr).convert("RGBA")
    img.alpha_composite(ground)
    d = ImageDraw.Draw(img, "RGBA")
    # lane markings on the wet ground
    for lx in (0.22, 0.36, 0.52, 0.68, 0.82):
        d.line([(lx * w, 0.815 * h), (lx * w + (0.5 - lx) * 0.5 * w, h)], fill=(230, 236, 250, 90), width=4)
    # hero car
    car = draw_car(int(w * 0.52), int(h * 0.70), 74, -2.5, (34, 38, 54), CYAN, rng, brake=True, size=(w, h))
    img = add_reflection(img, car, int(h * 0.90), 0.55, 7)
    img.alpha_composite(car)
    # speed streaks behind car
    d = ImageDraw.Draw(img, "RGBA")
    for k in range(28):
        yy = rng.uniform(0.78, 0.99) * h
        x0 = rng.uniform(0.05, 0.35) * w
        ln = rng.uniform(0.05, 0.3) * w
        col = [CYAN, MAGENTA, (255, 255, 255)][int(rng.integers(0, 3))]
        d.line([(x0, yy), (x0 + ln, yy - ln * 0.04)], fill=col + (int(rng.uniform(25, 90)),), width=int(rng.uniform(1, 3)))
    out = add_bloom(img, 140, 30, 1.0)
    out = chromatic(out, 2)
    out = grain(out, rng, 0.025)
    out = vignette(out, 0.55, 2.1)
    save_webp(out, os.path.join(ASSETS, "art", "menu_hero.webp"), 90)


def art_track(name, palette, seed, features) -> None:
    rng = np.random.default_rng(seed)
    w, h = 1600, 900
    horizon_y = palette.get("horizon", 0.6)
    y = np.clip(np.linspace(0, 1, h, dtype=np.float32)[:, None] / horizon_y, 0, 1)
    sky = colorize(np.repeat(y, w, axis=1), palette["sky"])
    img = to_img(sky).convert("RGBA")
    if palette.get("stars"):
        arr = np.asarray(img, dtype=np.float32).copy()
        for _ in range(420):
            sx, sy = int(rng.integers(0, w)), int(rng.integers(0, int(h * 0.55)))
            arr[sy, sx] = np.clip(arr[sy, sx] + rng.uniform(110, 255), 0, 255)
        img = to_img(arr / 255.0).convert("RGBA")
    if palette.get("sun"):
        sx, sy, r = palette["sun"]
        g = radial_glow(h, w, sx, sy, r * 3.0, 1.0)
        col = palette["sun_color"]
        arr = np.asarray(img, dtype=np.float32)[..., :3] / 255.0
        arr = np.clip(arr + g[..., None] * np.array(col) / 255.0, 0, 1)
        img = to_img(arr).convert("RGBA")
        d = ImageDraw.Draw(img)
        rr = r * h
        d.ellipse([sx * w - rr, sy * h - rr, sx * w + rr, sy * h + rr], fill=col + (255,))
    # ridges
    arr = np.asarray(img, dtype=np.float32)[..., :3] / 255.0
    rows = np.arange(h)[:, None].astype(np.float32)
    for ridge_cfg in palette.get("ridges", []):
        r = ridges(h, w, 5, ridge_cfg["cells"], rng)
        base = ridge_cfg["base"] * h
        amp = ridge_cfg["amp"] * h
        col = np.array(ridge_cfg["color"], dtype=np.float32) / 255.0
        m = smoothstep((rows - (base - r * amp)) / 1.5)
        arr = arr * (1 - m[..., None]) + col[None, None, :] * m[..., None]
    img = to_img(np.clip(arr, 0, 1)).convert("RGBA")
    if features.get("city"):
        img.alpha_composite(skyline_layer(w, h, rng, palette["horizon"] * h + 8, 0.55, 250,
                                          palette["city_dark"], palette["city_lights"], 1.0, 1.1))
    if features.get("sea"):
        arr = np.asarray(img, dtype=np.float32)[..., :3] / 255.0
        sea = fbm(h, w, 4, (10, 40), rng)
        band = np.clip((rows / h - palette["horizon"]) * 55, 0, 1)
        sea_col = np.array(palette["sea"], dtype=np.float32) / 255.0
        shimmer = (0.7 + 0.6 * sea[..., None])
        arr = arr * (1 - band[..., None] * 0.95) + (sea_col[None, None, :] * shimmer) * band[..., None]
        img = to_img(np.clip(arr, 0, 1)).convert("RGBA")
    if features.get("desert_dunes"):
        arr = np.asarray(img, dtype=np.float32)[..., :3] / 255.0
        for k, dc in enumerate(palette["dune_colors"]):
            dn = fbm(h, w, 3, (3 + k, 9 + k * 2), rng)
            line = palette["horizon"] + (dn - 0.5) * 0.06 * (k + 1)
            m = smoothstep((rows / h - line) * 55)
            arr = arr * (1 - m[..., None]) + (np.array(dc, dtype=np.float32) / 255.0) * m[..., None]
        img = to_img(np.clip(arr, 0, 1)).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    if features.get("pine_trees"):
        horizon = int(palette["horizon"] * h)
        for tx in range(-60, w + 60, 34):
            th = int(rng.integers(60, 200))
            bw = int(rng.integers(20, 44))
            d.polygon([(tx, horizon - th), (tx - bw, horizon + 8), (tx + bw, horizon + 8)], fill=palette["pine"])
            d.rectangle([tx - 3, horizon - 4, tx + 3, horizon + 30], fill=palette["trunk"])
    # glowing guardrail
    if features.get("neon_strips") or features.get("guardrail"):
        guard = palette.get("neon", (200, 220, 255))
        for sx in (0.33, 0.67):
            pts = [(sx * w, palette["road_top"] * h), ((0.5 + (sx - 0.5) * 3.2) * w, h)]
            d.line(pts, fill=guard[:3] + (190,), width=3)
        for sx in (0.33, 0.67):
            pts = [(sx * w, palette["road_top"] * h), ((0.5 + (sx - 0.5) * 3.2) * w, h)]
            gimg = img.filter(ImageFilter.GaussianBlur(8))
            img = Image.blend(img, gimg, 0.25)
            d = ImageDraw.Draw(img, "RGBA")
    # road
    road_top = palette["road_top"] * h
    d.polygon([(0.30 * w, road_top), (0.70 * w, road_top), (1.22 * w, h), (-0.22 * w, h)], fill=palette["road"])
    arr = np.asarray(img, dtype=np.float32) / 255.0
    tex = fbm(h, w, 6, (30, 50), rng, gain=0.6)
    arr[..., :3] = np.clip(arr[..., :3] * (0.72 + 0.55 * tex[..., None]), 0, 1)
    img = to_img(arr).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    # kerbs
    d.polygon([(0.285 * w, road_top), (0.31 * w, road_top), (-0.24 * w, h), (-0.30 * w, h)], fill=palette["kerb"] + (255,))
    d.polygon([(0.69 * w, road_top), (0.715 * w, road_top), (1.30 * w, h), (1.24 * w, h)], fill=palette["kerb"] + (255,))
    # centre dashed lines (all lanes)
    for i in range(20):
        t0 = (i / 20.0) ** 1.6
        t1 = ((i + 0.5) / 20.0) ** 1.6
        for lane in (0.30, 0.40, 0.60, 0.70):
            x0 = (0.5 + (lane - 0.5) * (0.36 + t0 * 2.9)) * w
            x1 = (0.5 + (lane - 0.5) * (0.36 + t1 * 2.9)) * w
            y0 = road_top + (h - road_top) * t0
            y1 = road_top + (h - road_top) * t1
            d.line([x0, y0, x1, y1], fill=palette["marking"], width=max(1, int(1 + t0 * 10)))
    if features.get("neon_strips"):
        for sx in (0.30, 0.70):
            for i in range(22):
                t0 = (i / 22.0) ** 1.6
                t1 = ((i + 0.55) / 22.0) ** 1.6
                x0 = (0.5 + (sx - 0.5) * (0.36 + t0 * 2.9)) * w
                x1 = (0.5 + (sx - 0.5) * (0.36 + t1 * 2.9)) * w
                y0 = road_top + (h - road_top) * t0
                y1 = road_top + (h - road_top) * t1
                d.line([x0, y0, x1, y1], fill=palette["neon"], width=max(2, int(1 + t0 * 8)))
    if features.get("rain"):
        d = ImageDraw.Draw(img, "RGBA")
        for _ in range(2200):
            rx = rng.uniform(0, w)
            ry = rng.uniform(0, h)
            ln = rng.uniform(14, 60)
            d.line([rx, ry, rx - ln * 0.22, ry + ln], fill=(200, 220, 255, 55), width=1)
    if features.get("car"):
        cscale = 50
        ccy = int(0.885 * h - cscale * 1.30)
        cv = draw_car(790, ccy, cscale, -2.5, palette.get("car_body", (34, 38, 52)),
                      palette.get("car_accent", CYAN), rng, brake=True, size=(w, h))
        img = add_reflection(img, cv, int(h * 0.93), 0.45, 5)
        img.alpha_composite(cv)
    out = add_bloom(img, 160, 20, 0.6)
    out = grain(out, rng, 0.018)
    out = vignette(out, 0.38, 2.4)
    save_webp(out, os.path.join(ASSETS, "art", f"track_{name}.webp"), 88)


def art_garage_bg() -> None:
    rng = np.random.default_rng(777)
    w, h = 1600, 900
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    base = colorize(np.repeat(y, w, axis=1), [
        (0.0, (5, 7, 14)), (0.45, (10, 13, 24)), (0.7, (16, 20, 34)), (1.0, (4, 5, 10))])
    img = to_img(base).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    # light bars on ceiling
    for i, x in enumerate(np.linspace(0.1, 0.9, 6)):
        col = CYAN if i % 2 == 0 else MAGENTA
        d.polygon([(x * w - 8, 0.0), (x * w + 8, 0.0), (x * w + 130, 0.34 * h), (x * w - 130, 0.34 * h)],
                  fill=col + (22,))
        d.rectangle([x * w - 60, 0.0, x * w + 60, 0.012 * h], fill=col + (200,))
    # floor grid perspective
    for i in range(-14, 15):
        d.line([0.5 * w + i * 0.02 * w, 0.62 * h, 0.5 * w + i * 0.16 * w, h], fill=(40, 220, 255, 26), width=2)
    for k in range(1, 12):
        yy = 0.62 * h + (h - 0.62 * h) * (k / 12.0) ** 1.7
        d.line([0, yy, w, yy], fill=(40, 220, 255, 22), width=2)
    arr = np.asarray(img, dtype=np.float32) / 255.0
    g = radial_glow(h, w, 0.5, 0.72, 0.32, 0.5)
    arr[..., 1] = np.clip(arr[..., 1] + g * 0.5, 0, 1)
    arr[..., 2] = np.clip(arr[..., 2] + g * 0.8, 0, 1)
    img = to_img(arr).convert("RGBA")
    out = add_bloom(img, 120, 24, 0.9)
    out = vignette(out, 0.7, 1.8)
    save_webp(out, os.path.join(ASSETS, "art", "garage_bg.webp"), 88)


def art_abstract(name: str, stops, seed: int, cells=(4, 7)) -> None:
    rng = np.random.default_rng(seed)
    w, h = 1600, 900
    f = fbm(h, w, 6, cells, rng)
    img = to_img(colorize(f, stops))
    glow = np.zeros((h, w, 3), dtype=np.float32)
    for i in range(3):
        g = radial_glow(h, w, rng.uniform(0.1, 0.9), rng.uniform(0.1, 0.9), rng.uniform(0.15, 0.4), 0.65)
        glow += g[..., None] * (np.array([CYAN, MAGENTA, VIOLET][i], dtype=np.float32) / 255.0)
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = np.clip(arr * 0.55 + glow * 0.55, 0, 1)
    out = add_bloom(to_img(arr), 120, 40, 1.0)
    out = vignette(grain(out, rng, 0.02), 0.6, 2.0)
    save_webp(out, os.path.join(ASSETS, "art", f"{name}.webp"), 86)


def build_art() -> None:
    art_menu_hero()
    art_garage_bg()
    art_abstract("results_bg", [(0, (6, 8, 20)), (0.5, (24, 18, 60)), (0.8, (86, 24, 92)), (1, (255, 72, 130))], 4242)
    art_abstract("daily_bg", [(0, (8, 6, 18)), (0.45, (40, 18, 40)), (0.75, (128, 60, 20)), (1, (255, 200, 90))], 5353)
    art_abstract("tuning_bg", [(0, (4, 8, 14)), (0.5, (10, 40, 46)), (0.8, (30, 120, 130)), (1, (140, 255, 240))], 6464)
    art_track("city_night", {
        "sky": [(0, (6, 7, 22)), (0.35, (24, 18, 56)), (0.62, (86, 32, 104)), (0.85, (178, 64, 116)), (1, (255, 140, 120))],
        "stars": True, "horizon": 0.60, "city_dark": (10, 11, 26), "city_lights": (170, 235, 255),
        "road": (13, 14, 22), "kerb": (40, 42, 56), "marking": (210, 220, 240, 120),
        "neon": CYAN + (200,), "road_top": 0.60,
    }, 1101, {"city": True, "neon_strips": True, "car": True})
    art_track("desert", {
        "sky": [(0, (22, 48, 130)), (0.4, (92, 130, 200)), (0.7, (244, 164, 104)), (1, (255, 226, 166))],
        "sun": (0.74, 0.40, 0.055), "sun_color": (255, 244, 214), "horizon": 0.58,
        "dune_colors": [(214, 156, 96), (190, 128, 78), (166, 106, 64)],
        "road": (36, 32, 34), "kerb": (200, 180, 140), "marking": (255, 255, 255, 170),
        "road_top": 0.58,
    }, 1202, {"desert_dunes": True, "car": True})
    art_track("mountain", {
        "sky": [(0, (14, 32, 62)), (0.45, (62, 100, 138)), (0.8, (166, 188, 202)), (1, (236, 240, 246))],
        "horizon": 0.55,
        "ridges": [{"cells": (3, 6), "base": 0.55, "amp": 0.22, "color": (58, 72, 92)},
                   {"cells": (4, 9), "base": 0.60, "amp": 0.16, "color": (38, 50, 66)}],
        "pine": (18, 30, 28), "trunk": (30, 22, 18),
        "road": (44, 46, 50), "kerb": (220, 220, 224), "marking": (255, 255, 255, 170),
        "road_top": 0.55,
    }, 1303, {"pine_trees": True, "car": True})
    art_track("coast", {
        "sky": [(0, (12, 26, 66)), (0.35, (44, 84, 148)), (0.65, (255, 150, 126)), (1, (255, 224, 178))],
        "sun": (0.28, 0.52, 0.04), "sun_color": (255, 210, 160), "horizon": 0.56,
        "sea": (16, 48, 78), "road": (40, 42, 46), "kerb": (230, 230, 226),
        "marking": (255, 255, 255, 160), "road_top": 0.56,
    }, 1404, {"sea": True, "car": True})
    art_track("city_rain", {
        "sky": [(0, (4, 6, 16)), (0.4, (14, 20, 40)), (0.7, (46, 34, 74)), (1, (120, 70, 130))],
        "stars": False, "horizon": 0.58, "city_dark": (8, 9, 20), "city_lights": (150, 215, 255),
        "road": (10, 11, 18), "kerb": (34, 36, 48), "marking": (200, 210, 240, 90),
        "neon": MAGENTA + (200,), "road_top": 0.58,
    }, 1505, {"city": True, "neon_strips": True, "rain": True, "car": True})
    art_track("canyon", {
        "sky": [(0, (26, 14, 38)), (0.4, (112, 38, 70)), (0.72, (232, 104, 78)), (1, (255, 186, 120))],
        "horizon": 0.60,
        "ridges": [{"cells": (3, 5), "base": 0.58, "amp": 0.26, "color": (96, 40, 52)},
                   {"cells": (5, 8), "base": 0.64, "amp": 0.18, "color": (58, 26, 38)}],
        "road": (28, 22, 24), "kerb": (150, 96, 80), "marking": (255, 220, 180, 150),
        "road_top": 0.60,
    }, 1606, {"car": True})
    art_track("snow", {
        "sky": [(0, (10, 20, 44)), (0.45, (58, 84, 126)), (0.8, (168, 194, 224)), (1, (238, 244, 252))],
        "horizon": 0.56,
        "ridges": [{"cells": (3, 6), "base": 0.55, "amp": 0.24, "color": (96, 112, 140)},
                   {"cells": (5, 9), "base": 0.60, "amp": 0.16, "color": (60, 74, 96)}],
        "pine": (24, 40, 44), "trunk": (28, 26, 28),
        "road": (52, 56, 64), "kerb": (240, 244, 250), "marking": (255, 255, 255, 160),
        "road_top": 0.56,
    }, 1707, {"pine_trees": True, "rain": True, "car": True})


# ---------------------------------------------------------------------------
# TEXTURES
# ---------------------------------------------------------------------------
def tex_asphalt() -> None:
    rng = np.random.default_rng(9001)
    size = 1024
    base = fbm(size, size, 8, (8, 8), rng, gain=0.62)
    fine = fbm(size, size, 3, (128, 128), rng)
    spec = (rng.random((size, size)) * 0.35).astype(np.float32)
    v = 0.28 + base * 0.30 + fine * 0.10 + spec * 0.06
    damage = np.clip((fbm(size, size, 3, (3, 3), rng) - 0.55) * 3.0, 0, 1) * 0.35
    v = np.clip(v - damage, 0, 1)
    arr = np.stack([v * 0.97, v * 1.0, v * 1.06], axis=2)
    img = to_img(np.clip(arr, 0, 1))
    save_png(img, os.path.join(ASSETS, "textures", "asphalt_albedo.png"))
    rough = to_img(np.clip(np.stack([base * 0.25 + 0.35] * 3, axis=2), 0, 1))
    save_png(rough, os.path.join(ASSETS, "textures", "asphalt_rough.png"))


def tex_concrete() -> None:
    rng = np.random.default_rng(9002)
    size = 512
    base = fbm(size, size, 6, (6, 6), rng)
    fine = fbm(size, size, 2, (200, 200), rng)
    v = 0.55 + base * 0.18 + fine * 0.06
    arr = np.stack([v, v * 0.99, v * 0.96], axis=2)
    save_png(to_img(np.clip(arr, 0, 1)), os.path.join(ASSETS, "textures", "concrete_albedo.png"))


def tex_tread() -> None:
    """Tyres: diagonal chevron tread, tileable, used by the wheel material."""
    size = 256
    img = Image.new("RGB", (size, size), (26, 26, 30))
    d = ImageDraw.Draw(img)
    for i in range(-size, size * 2, 32):
        d.line([i, 0, i + size, size], fill=(14, 14, 17), width=12)
        d.line([i + 16, 0, i + 16 + size, size], fill=(40, 40, 46), width=3)
    save_png(img, os.path.join(ASSETS, "textures", "tyre_tread.png"))


def tex_light_cookie() -> None:
    """Soft radial light cookie for headlights (additive)."""
    size = 256
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.sqrt((x - size / 2) ** 2 + (y - size / 2) ** 2) / (size / 2)
    v = np.exp(-(d ** 2) * 2.4)
    arr = np.stack([v, v * 0.98, v * 0.9], axis=2)
    save_png(to_img(np.clip(arr, 0, 1)), os.path.join(ASSETS, "textures", "light_cookie.png"))


def tex_smoke() -> None:
    rng = np.random.default_rng(9004)
    size = 256
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.sqrt((x - size / 2) ** 2 + (y - size / 2) ** 2) / (size / 2)
    n = fbm(size, size, 4, (4, 4), rng)
    v = np.exp(-(d ** 2) * 1.8) * (0.55 + n * 0.75)
    img = Image.fromarray((np.clip(v, 0, 1) * 255).astype(np.uint8), "L").convert("RGB")
    save_png(img, os.path.join(ASSETS, "textures", "smoke.png"))


def tex_carbon() -> None:
    size = 256
    img = Image.new("RGB", (size, size), (18, 19, 24))
    d = ImageDraw.Draw(img)
    for y in range(0, size, 16):
        for x in range(0, size, 16):
            shade = 30 if ((x // 16) + (y // 16)) % 2 == 0 else 22
            d.rectangle([x, y, x + 14, y + 14], fill=(shade, shade, shade + 5))
            d.line([x, y + 14, x + 14, y], fill=(44, 46, 54), width=1)
    save_png(img, os.path.join(ASSETS, "textures", "carbon_weave.png"))


def build_textures() -> None:
    tex_asphalt()
    tex_concrete()
    tex_tread()
    tex_light_cookie()
    tex_smoke()
    tex_carbon()


# ---------------------------------------------------------------------------
# ICONS (game-icons.net style: filled silhouettes, 512 px, white)
# ---------------------------------------------------------------------------
def icon(path: str, draw_fn) -> None:
    ss = 2
    size = 512
    img = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_fn(d, size * ss)
    img = img.resize((size, size), Image.LANCZOS)
    save_png(img, path)


def _wheel(d, S):
    c = S / 2
    r = S * 0.44
    d.ellipse([c - r, c - r, c + r, c + r], outline=(255, 255, 255, 255), width=int(S * 0.075))
    d.ellipse([c - r * 0.62, c - r * 0.62, c + r * 0.62, c + r * 0.62], fill=(255, 255, 255, 255))
    for k in range(5):
        a = k * 2 * math.pi / 5
        d.polygon([(c + math.cos(a) * r * 0.95, c + math.sin(a) * r * 0.95),
                   (c + math.cos(a + 0.35) * r * 0.55, c + math.sin(a + 0.35) * r * 0.55),
                   (c + math.cos(a + 0.55) * r * 0.99, c + math.sin(a + 0.55) * r * 0.99)],
                  fill=(255, 255, 255, 255))


def _engine(d, S):
    c = S / 2
    d.polygon([(S * 0.18, S * 0.38), (S * 0.82, S * 0.38), (S * 0.72, S * 0.62), (S * 0.28, S * 0.62)],
              fill=(255, 255, 255, 255))
    for i in range(4):
        x = S * (0.26 + i * 0.14)
        d.rectangle([x, S * 0.24, x + S * 0.07, S * 0.38], fill=(255, 255, 255, 255))
    d.rectangle([S * 0.42, S * 0.62, S * 0.58, S * 0.76], fill=(255, 255, 255, 255))
    d.polygon([(S * 0.18, S * 0.46), (S * 0.06, S * 0.52), (S * 0.18, S * 0.56)], fill=(255, 255, 255, 255))


def _turbo(d, S):
    c = S / 2
    d.ellipse([S * 0.2, S * 0.3, S * 0.62, S * 0.72], outline=(255, 255, 255, 255), width=int(S * 0.07))
    for k in range(6):
        a = k * math.pi / 3
        d.line([c - S * 0.06, c, c - S * 0.06 + math.cos(a) * S * 0.15,
                c + math.sin(a) * S * 0.15], fill=(255, 255, 255, 255), width=int(S * 0.035))
    d.polygon([(S * 0.62, S * 0.36), (S * 0.9, S * 0.42), (S * 0.9, S * 0.6), (S * 0.62, S * 0.66)],
              fill=(255, 255, 255, 255))


def _nitro(d, S):
    d.polygon([(S * 0.5, S * 0.08), (S * 0.72, S * 0.42), (S * 0.58, S * 0.42), (S * 0.78, S * 0.92),
               (S * 0.66, S * 0.6), (S * 0.34, S * 0.6), (S * 0.42, S * 0.42), (S * 0.28, S * 0.42)],
              fill=(255, 255, 255, 255))


def _gear(d, S):
    c = S / 2
    for k in range(8):
        a = k * math.pi / 4
        x0 = c + math.cos(a) * S * 0.28
        y0 = c + math.sin(a) * S * 0.28
        d.line([x0, y0, c + math.cos(a) * S * 0.45, c + math.sin(a) * S * 0.45],
               fill=(255, 255, 255, 255), width=int(S * 0.11))
    d.ellipse([c - S * 0.3, c - S * 0.3, c + S * 0.3, c + S * 0.3], fill=(255, 255, 255, 255))
    d.ellipse([c - S * 0.12, c - S * 0.12, c + S * 0.12, c + S * 0.12], fill=(0, 0, 0, 255))


def _coin(d, S):
    c = S / 2
    d.ellipse([c - S * 0.4, c - S * 0.4, c + S * 0.4, c + S * 0.4], fill=(255, 255, 255, 255))
    d.ellipse([c - S * 0.3, c - S * 0.3, c + S * 0.3, c + S * 0.3], outline=(0, 0, 0, 255), width=int(S * 0.04))
    d.polygon([(c, c - S * 0.18), (c + S * 0.12, c - S * 0.02), (c + S * 0.06, c + S * 0.16),
               (c - S * 0.06, c + S * 0.16), (c - S * 0.12, c - S * 0.02)], fill=(0, 0, 0, 255))


def _trophy(d, S):
    d.polygon([(S * 0.32, S * 0.16), (S * 0.68, S * 0.16), (S * 0.66, S * 0.44),
               (S * 0.5, S * 0.56), (S * 0.34, S * 0.44)], fill=(255, 255, 255, 255))
    d.arc([S * 0.12, S * 0.14, S * 0.34, S * 0.4], 90, 270, fill=(255, 255, 255, 255), width=int(S * 0.05))
    d.arc([S * 0.66, S * 0.14, S * 0.88, S * 0.4], -90, 90, fill=(255, 255, 255, 255), width=int(S * 0.05))
    d.rectangle([S * 0.46, S * 0.54, S * 0.54, S * 0.74], fill=(255, 255, 255, 255))
    d.rectangle([S * 0.3, S * 0.74, S * 0.7, S * 0.82], fill=(255, 255, 255, 255))


def _flag(d, S):
    d.rectangle([S * 0.22, S * 0.1, S * 0.3, S * 0.9], fill=(255, 255, 255, 255))
    for y in range(4):
        for x in range(4):
            if (x + y) % 2 == 0:
                d.rectangle([S * (0.3 + x * 0.15), S * (0.12 + y * 0.15),
                             S * (0.44 + x * 0.15), S * (0.26 + y * 0.15)], fill=(255, 255, 255, 255))


def _home(d, S):
    d.polygon([(S * 0.5, S * 0.12), (S * 0.9, S * 0.48), (S * 0.82, S * 0.48), (S * 0.82, S * 0.86),
               (S * 0.58, S * 0.86), (S * 0.58, S * 0.6), (S * 0.42, S * 0.6), (S * 0.42, S * 0.86),
               (S * 0.18, S * 0.86), (S * 0.18, S * 0.48), (S * 0.1, S * 0.48)], fill=(255, 255, 255, 255))


def _settings(d, S):
    c = S / 2
    for k in range(6):
        a = k * math.pi / 3
        d.line([c + math.cos(a) * S * 0.18, c + math.sin(a) * S * 0.18,
                c + math.cos(a) * S * 0.42, c + math.sin(a) * S * 0.42],
               fill=(255, 255, 255, 255), width=int(S * 0.09))
    d.ellipse([c - S * 0.34, c - S * 0.34, c + S * 0.34, c + S * 0.34], fill=(255, 255, 255, 255))
    d.ellipse([c - S * 0.13, c - S * 0.13, c + S * 0.13, c + S * 0.13], fill=(0, 0, 0, 255))


def _garage(d, S):
    d.rectangle([S * 0.1, S * 0.42, S * 0.9, S * 0.9], fill=(255, 255, 255, 255))
    d.polygon([(S * 0.5, S * 0.16), (S * 0.94, S * 0.42), (S * 0.06, S * 0.42)], fill=(255, 255, 255, 255))
    for x in range(4):
        d.rectangle([S * (0.16 + x * 0.18), S * 0.5, S * (0.28 + x * 0.18), S * 0.86], fill=(0, 0, 0, 255))


def _play(d, S):
    d.polygon([(S * 0.3, S * 0.16), (S * 0.84, S * 0.5), (S * 0.3, S * 0.84)], fill=(255, 255, 255, 255))


def _pause(d, S):
    d.rectangle([S * 0.24, S * 0.18, S * 0.42, S * 0.82], fill=(255, 255, 255, 255))
    d.rectangle([S * 0.58, S * 0.18, S * 0.76, S * 0.82], fill=(255, 255, 255, 255))


def _back(d, S):
    d.polygon([(S * 0.62, S * 0.14), (S * 0.28, S * 0.5), (S * 0.62, S * 0.86),
               (S * 0.72, S * 0.76), (S * 0.48, S * 0.5), (S * 0.72, S * 0.24)],
              fill=(255, 255, 255, 255))


def _close(d, S):
    d.line([S * 0.22, S * 0.22, S * 0.78, S * 0.78], fill=(255, 255, 255, 255), width=int(S * 0.11))
    d.line([S * 0.78, S * 0.22, S * 0.22, S * 0.78], fill=(255, 255, 255, 255), width=int(S * 0.11))


def _paint(d, S):
    d.ellipse([S * 0.16, S * 0.3, S * 0.64, S * 0.78], fill=(255, 255, 255, 255))
    d.ellipse([S * 0.4, S * 0.18, S * 0.6, S * 0.34], fill=(255, 255, 255, 255))
    d.ellipse([S * 0.6, S * 0.4, S * 0.78, S * 0.58], fill=(255, 255, 255, 255))
    d.ellipse([S * 0.6, S * 0.62, S * 0.74, S * 0.76], fill=(255, 255, 255, 255))


def _bolt(d, S):
    d.polygon([(S * 0.56, S * 0.06), (S * 0.28, S * 0.54), (S * 0.48, S * 0.54), (S * 0.42, S * 0.94),
               (S * 0.74, S * 0.42), (S * 0.54, S * 0.42)], fill=(255, 255, 255, 255))


def _star(d, S):
    pts = []
    c = S / 2
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 5
        r = S * 0.42 if k % 2 == 0 else S * 0.18
        pts.append((c + math.cos(a) * r, c + math.sin(a) * r))
    d.polygon(pts, fill=(255, 255, 255, 255))


def _clock(d, S):
    c = S / 2
    d.ellipse([c - S * 0.4, c - S * 0.4, c + S * 0.4, c + S * 0.4],
              outline=(255, 255, 255, 255), width=int(S * 0.08))
    d.line([c, c, c, c - S * 0.26], fill=(255, 255, 255, 255), width=int(S * 0.07))
    d.line([c, c, c + S * 0.2, c + S * 0.1], fill=(255, 255, 255, 255), width=int(S * 0.07))


def _diamond(d, S):
    c = S / 2
    d.polygon([(c, S * 0.08), (S * 0.92, c), (c, S * 0.92), (S * 0.08, c)], fill=(255, 255, 255, 255))
    d.polygon([(c, S * 0.24), (S * 0.76, c), (c, S * 0.76), (S * 0.24, c)], fill=(0, 0, 0, 255))


def _spray(d, S):
    d.rectangle([S * 0.18, S * 0.36, S * 0.46, S * 0.9], fill=(255, 255, 255, 255))
    d.rectangle([S * 0.24, S * 0.24, S * 0.4, S * 0.36], fill=(255, 255, 255, 255))
    for k, r in enumerate((0.05, 0.09, 0.13)):
        d.ellipse([S * 0.58 - S * r, S * (0.42 + k * 0.1) - S * r,
                   S * 0.58 + S * r, S * (0.42 + k * 0.1) + S * r], fill=(255, 255, 255, 255))


def _volume(d, S):
    d.polygon([(S * 0.14, S * 0.38), (S * 0.34, S * 0.38), (S * 0.56, S * 0.2),
               (S * 0.56, S * 0.8), (S * 0.34, S * 0.62), (S * 0.14, S * 0.62)],
              fill=(255, 255, 255, 255))
    for k, r in enumerate((0.06, 0.12, 0.18)):
        d.arc([S * (0.5 - r), S * (0.5 - r), S * (0.5 + r * 2), S * (0.5 + r * 2)],
              300, 60, fill=(255, 255, 255, 255), width=int(S * 0.045))


def _mobile(d, S):
    d.rounded_rectangle([S * 0.28, S * 0.08, S * 0.72, S * 0.92], radius=S * 0.09,
                        outline=(255, 255, 255, 255), width=int(S * 0.06))
    d.rectangle([S * 0.44, S * 0.14, S * 0.56, S * 0.17], fill=(255, 255, 255, 255))
    d.ellipse([S * 0.44, S * 0.82, S * 0.56, S * 0.88], fill=(255, 255, 255, 255))


def _wheel_icon(d, S):
    _wheel(d, S)


def _gauge(d, S):
    c = S / 2
    d.arc([S * 0.08, S * 0.12, S * 0.92, S * 0.96], 180, 360, fill=(255, 255, 255, 255), width=int(S * 0.07))
    d.line([c, c + S * 0.16, c + S * 0.3, S * 0.22], fill=(255, 255, 255, 255), width=int(S * 0.05))
    d.ellipse([c - S * 0.05, c + S * 0.11, c + S * 0.05, c + S * 0.21], fill=(255, 255, 255, 255))
    for k in range(5):
        a = math.pi + k * math.pi / 4
        d.line([c + math.cos(a) * S * 0.32, c + S * 0.16 + math.sin(a) * S * 0.32,
                c + math.cos(a) * S * 0.38, c + S * 0.16 + math.sin(a) * S * 0.38],
               fill=(255, 255, 255, 255), width=int(S * 0.03))


def _lock(d, S):
    d.rounded_rectangle([S * 0.2, S * 0.44, S * 0.8, S * 0.9], radius=S * 0.06, fill=(255, 255, 255, 255))
    d.arc([S * 0.3, S * 0.12, S * 0.7, S * 0.6], 180, 360, fill=(255, 255, 255, 255), width=int(S * 0.09))
    d.ellipse([S * 0.46, S * 0.6, S * 0.54, S * 0.68], fill=(0, 0, 0, 255))
    d.rectangle([S * 0.48, S * 0.64, S * 0.52, S * 0.78], fill=(0, 0, 0, 255))


def _check(d, S):
    d.line([S * 0.16, S * 0.52, S * 0.42, S * 0.76, S * 0.86, S * 0.24],
           fill=(255, 255, 255, 255), width=int(S * 0.11), joint="curve")


def _rain(d, S):
    for k, x in enumerate((0.24, 0.44, 0.64, 0.84)):
        d.line([S * x, S * (0.12 + k * 0.04), S * (x - 0.1), S * (0.5 + k * 0.04)],
               fill=(255, 255, 255, 255), width=int(S * 0.06))
    d.ellipse([S * 0.2, S * 0.7, S * 0.9, S * 0.86], outline=(255, 255, 255, 255), width=int(S * 0.04))


def _sun(d, S):
    c = S / 2
    for k in range(8):
        a = k * math.pi / 4
        d.line([c + math.cos(a) * S * 0.3, c + math.sin(a) * S * 0.3,
                c + math.cos(a) * S * 0.44, c + math.sin(a) * S * 0.44],
               fill=(255, 255, 255, 255), width=int(S * 0.06))
    d.ellipse([c - S * 0.24, c - S * 0.24, c + S * 0.24, c + S * 0.24], fill=(255, 255, 255, 255))


def _moon(d, S):
    d.ellipse([S * 0.14, S * 0.14, S * 0.86, S * 0.86], fill=(255, 255, 255, 255))
    d.ellipse([S * 0.36, S * 0.08, S * 1.02, S * 0.74], fill=(0, 0, 0, 255))


def _signal(d, S):
    for k, y in enumerate((0.16, 0.42, 0.68)):
        d.rounded_rectangle([S * 0.34, S * y, S * 0.66, S * (y + 0.18)], radius=S * 0.03,
                            fill=(255, 255, 255, 255) if k == 0 else (255, 255, 255, 90))


def _heart(d, S):
    c = S / 2
    d.ellipse([S * 0.16, S * 0.2, S * 0.52, S * 0.56], fill=(255, 255, 255, 255))
    d.ellipse([S * 0.48, S * 0.2, S * 0.84, S * 0.56], fill=(255, 255, 255, 255))
    d.polygon([(S * 0.16, S * 0.4), (S * 0.84, S * 0.4), (c, S * 0.9)], fill=(255, 255, 255, 255))


def build_icons() -> None:
    icons = {
        "wheel": _wheel_icon, "engine": _engine, "turbo": _turbo, "nitro": _nitro, "gear": _gear,
        "coin": _coin, "trophy": _trophy, "flag": _flag, "home": _home, "settings": _settings,
        "garage": _garage, "play": _play, "pause": _pause, "back": _back, "close": _close,
        "paint": _paint, "bolt": _bolt, "star": _star, "clock": _clock, "diamond": _diamond,
        "spray": _spray, "volume": _volume, "mobile": _mobile, "gauge": _gauge, "lock": _lock,
        "check": _check, "rain": _rain, "sun": _sun, "moon": _moon, "signal": _signal, "heart": _heart,
    }
    for name, fn in icons.items():
        icon(os.path.join(ASSETS, "icon", f"{name}.png"), fn)


# ---------------------------------------------------------------------------
# APP ICON
# ---------------------------------------------------------------------------
def build_app_icon() -> None:
    size = 1024
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.sqrt((x - size / 2) ** 2 + (y - size * 0.42) ** 2) / size
    bg = np.zeros((size, size, 3), dtype=np.float32)
    ang = np.arctan2(y - size / 2, x - size / 2)
    rad = np.sqrt((x - size / 2) ** 2 + (y - size / 2) ** 2) / (size / 2)
    bg[..., 0] = 0.02 + 0.32 * rad * (0.5 + 0.5 * np.sin(ang + 1.0))
    bg[..., 1] = 0.03 + 0.18 * rad
    bg[..., 2] = 0.08 + 0.55 * rad * (0.5 + 0.5 * np.cos(ang - 0.6))
    for (cx, cy, col) in [(0.24, 0.2, MAGENTA), (0.82, 0.72, CYAN), (0.6, 0.1, VIOLET)]:
        g = radial_glow(size, size, cx, cy, 0.35, 0.9)
        for c in range(3):
            bg[..., c] += g * col[c] / 255.0 * 0.5
    img = to_img(np.clip(bg, 0, 1)).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    # speed chevrons
    for k in range(3):
        a = 0.55 + k * 0.18
        d.polygon([(size * (0.30 + 0.1 * k), size * a), (size * 0.66, size * a),
                   (size * 0.56, size * (a + 0.07)), (size * (0.30 + 0.1 * k) - size * 0.02, size * (a + 0.07))],
                  fill=(255, 255, 255, 70 + k * 60))
    # "A" mark
    d.polygon([(size * 0.5, size * 0.18), (size * 0.80, size * 0.82), (size * 0.64, size * 0.82),
               (size * 0.5, size * 0.44), (size * 0.36, size * 0.82), (size * 0.20, size * 0.82)],
              fill=(255, 255, 255, 255))
    d.polygon([(size * 0.42, size * 0.58), (size * 0.58, size * 0.58), (size * 0.62, size * 0.7),
               (size * 0.38, size * 0.7)], fill=CYAN + (255,))
    img = add_bloom(img, 180, 18, 0.7)
    img.convert("RGB").resize((512, 512), Image.LANCZOS).save(
        os.path.join(ASSETS, "icon", "app_icon.png"), "PNG", optimize=True)


# ---------------------------------------------------------------------------
# AUDIO
# ---------------------------------------------------------------------------
SR = 44100


def write_ogg_via_wav(name: str, samples: np.ndarray, out_dir: str) -> None:
    """Write a mono WAV; CI converts to OGG (see tools/build_audio.sh)."""
    ensure(out_dir)
    samples = np.clip(samples, -1.0, 1.0)
    data = (samples * 32767).astype(np.int16)
    path = os.path.join(out_dir, f"{name}.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def env_ad(n, attack=0.01, decay=1.0, power=2.0):
    a = int(SR * attack)
    e = np.ones(n)
    if a > 0:
        e[:a] = np.linspace(0, 1, a)
    dpart = np.linspace(0, 1, n)
    e *= (1 - dpart) ** power
    return e


def t_axis(seconds: float) -> np.ndarray:
    return np.arange(int(SR * seconds)) / SR


def sfx_ui_click():
    t = t_axis(0.09)
    s = np.sin(2 * np.pi * 1800 * t) * env_ad(len(t), 0.001, 1, 3.0)
    s += np.sin(2 * np.pi * 2600 * t) * env_ad(len(t), 0.001, 1, 5.0) * 0.4
    return s * 0.5


def sfx_ui_hover():
    t = t_axis(0.06)
    s = np.sin(2 * np.pi * 3200 * t) * env_ad(len(t), 0.002, 1, 4.0)
    return s * 0.18


def sfx_ui_confirm():
    t = t_axis(0.22)
    s = np.sin(2 * np.pi * 880 * t) * env_ad(len(t), 0.004, 1, 2.2)
    s[len(s) // 3:] += np.sin(2 * np.pi * 1320 * t[: len(s) - len(s) // 3]) * env_ad(
        len(s) - len(s) // 3, 0.004, 1, 2.0) * 0.8
    return s * 0.35


def sfx_back():
    t = t_axis(0.18)
    f = np.linspace(900, 420, len(t))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(len(t), 0.004, 1, 2.0)
    return s * 0.3


def sfx_engine_loop():
    """Seamless 4 s engine loop: harmonic stack with firing-order pulses."""
    dur = 4.0
    t = t_axis(dur)
    f0 = 55.0
    s = np.zeros(len(t))
    for h, a in [(1, 1.0), (2, 0.55), (3, 0.36), (4, 0.24), (5, 0.16), (6, 0.12), (8, 0.08), (10, 0.05)]:
        s += a * np.sin(2 * np.pi * f0 * h * t + 0.3 * np.sin(2 * np.pi * 2 * t * h / dur))
    pulse = (np.sin(2 * np.pi * 18 * t) * 0.5 + 0.5) ** 3
    s *= 0.55 + 0.45 * pulse
    noise = np.random.default_rng(31).normal(0, 1, len(t))
    b = np.convolve(noise, np.ones(24) / 24, mode="same")
    s += b * 0.35
    # remove DC and seam match
    s -= s.mean()
    fade = int(SR * 0.05)
    s[:fade] *= np.linspace(0, 1, fade)
    s[-fade:] *= np.linspace(1, 0, fade)
    return s / np.max(np.abs(s)) * 0.8


def sfx_tyre_screech():
    rng = np.random.default_rng(77)
    t = t_axis(1.2)
    n = rng.normal(0, 1, len(t))
    k = np.exp(-((np.arange(len(t)) - len(t) * 0.35) ** 2) / (2 * (len(t) * 0.25) ** 2))
    s = n * k
    # resonant filter at ~1.1 kHz via simple biquad
    b, a = _biquad_bandpass(1150, 1.2)
    s = _lfilter(b, a, s)
    s += 0.35 * np.sin(2 * np.pi * 620 * t) * k
    return s / np.max(np.abs(s)) * 0.6


def sfx_nitro():
    rng = np.random.default_rng(88)
    t = t_axis(1.6)
    s = rng.normal(0, 1, len(t))
    s = _lfilter(*_biquad_bandpass(2400, 0.7), s) * 0.6
    sweep = np.sin(2 * np.pi * np.cumsum(np.linspace(180, 720, len(t))) / SR) * 0.4
    e = np.clip(t / 0.5, 0, 1) * np.exp(-np.clip(t - 0.8, 0, None) * 2.5)
    return (s + sweep) * e / np.max(np.abs((s + sweep) * e)) * 0.55


def sfx_crash():
    rng = np.random.default_rng(99)
    t = t_axis(1.4)
    n = rng.normal(0, 1, len(t))
    s = _lfilter(*_biquad_lowpass(900, 0.9), n) * env_ad(len(t), 0.002, 1, 2.4)
    thump = np.sin(2 * np.pi * np.linspace(120, 45, len(t)) * t) * env_ad(len(t), 0.001, 1, 6)
    metal = np.sin(2 * np.pi * 2400 * t) * env_ad(len(t), 0.001, 1, 8) * 0.3
    out = s * 0.9 + thump * 0.9 + metal
    return out / np.max(np.abs(out)) * 0.85


def sfx_countdown_beep():
    t = t_axis(0.25)
    s = np.sin(2 * np.pi * 660 * t) * env_ad(len(t), 0.005, 1, 1.4)
    s += np.sin(2 * np.pi * 1320 * t) * env_ad(len(t), 0.005, 1, 3.0) * 0.3
    return s * 0.4


def sfx_countdown_go():
    t = t_axis(0.7)
    s = np.sin(2 * np.pi * 990 * t) * env_ad(len(t), 0.004, 1, 1.6)
    s += np.sin(2 * np.pi * 1980 * t) * env_ad(len(t), 0.004, 1, 2.5) * 0.4
    s += np.sin(2 * np.pi * 495 * t) * env_ad(len(t), 0.004, 1, 1.2) * 0.5
    return s * 0.45


def sfx_purchase():
    t = t_axis(0.6)
    s = np.zeros(len(t))
    for i, f in enumerate((1318, 1568, 2093)):
        st = int(len(t) * i / 3.6)
        seg = np.sin(2 * np.pi * f * t[st:]) * env_ad(len(t) - st, 0.003, 1, 3.0)
        s[st:] += seg
    return s * 0.32


def sfx_level_up():
    t = t_axis(1.4)
    s = np.zeros(len(t))
    for i, f in enumerate((523, 659, 784, 1046, 1318)):
        st = int(len(t) * i / 7.0)
        seg = np.sin(2 * np.pi * f * t[st:]) * env_ad(len(t) - st, 0.01, 1, 2.2)
        seg += np.sin(2 * np.pi * f * 2 * t[st:]) * env_ad(len(t) - st, 0.01, 1, 3.0) * 0.25
        s[st:] += seg
    return s / np.max(np.abs(s)) * 0.45


def sfx_achievement():
    t = t_axis(1.0)
    s = np.zeros(len(t))
    for i, (f, d) in enumerate(((880, 0.0), (1174, 0.12), (1568, 0.24))):
        st = int(SR * d)
        s[st:] += np.sin(2 * np.pi * f * t[st:]) * env_ad(len(t) - st, 0.01, 1, 2.5)
    return s * 0.3


def sfx_wind():
    rng = np.random.default_rng(123)
    t = t_axis(3.0)
    n = rng.normal(0, 1, len(t))
    s = _lfilter(*_biquad_bandpass(700, 0.5), n)
    s *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.3 * t)
    return s / np.max(np.abs(s)) * 0.25


def sfx_gear_shift():
    t = t_axis(0.12)
    s = np.sin(2 * np.pi * np.linspace(300, 90, len(t)) * t) * env_ad(len(t), 0.001, 1, 3.0)
    s += np.random.default_rng(5).normal(0, 1, len(t)) * 0.2 * env_ad(len(t), 0.001, 1, 6.0)
    return s * 0.5


def _biquad_lowpass(fc, q):
    w0 = 2 * math.pi * fc / SR
    alpha = math.sin(w0) / (2 * q)
    b0 = (1 - math.cos(w0)) / 2
    b1 = 1 - math.cos(w0)
    b2 = b0
    a0 = 1 + alpha
    a1 = -2 * math.cos(w0)
    a2 = 1 - alpha
    return np.array([b0, b1, b2]) / a0, np.array([1.0, a1 / a0, a2 / a0])


def _biquad_bandpass(fc, q):
    w0 = 2 * math.pi * fc / SR
    alpha = math.sin(w0) / (2 * q)
    b0 = alpha
    b2 = -alpha
    a0 = 1 + alpha
    return np.array([b0, 0.0, b2]) / a0, np.array([1.0, -2 * math.cos(w0) / a0, (1 - alpha) / a0])


def _lfilter(b, a, x):
    y = np.zeros_like(x)
    for n in range(len(x)):
        x1 = x[n - 1] if n >= 1 else 0.0
        x2 = x[n - 2] if n >= 2 else 0.0
        y1 = y[n - 1] if n >= 1 else 0.0
        y2 = y[n - 2] if n >= 2 else 0.0
        y[n] = b[0] * x[n] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
    return y


def music_track(name: str, bpm: float, root: int, seed: int, style: str, seconds=64.0):
    """Procedural synthwave loop: pad chords, arpeggio, bass, kick, hats, snare."""
    rng = np.random.default_rng(seed)
    beat = 60.0 / bpm
    n = int(SR * seconds)
    t = np.arange(n) / SR
    out = np.zeros(n)

    def note_hz(midi):
        return 440.0 * 2 ** ((midi - 69) / 12.0)

    # chord progression (minor: i - VI - III - VII)
    prog = [0, 8, 3, 10]
    bar = beat * 4
    def chord_at(tt):
        idx = int((tt % (bar * 4)) / bar)
        return prog[idx % 4]

    # pad
    for ch_i in range(int(seconds / bar) + 1):
        st = int(ch_i * bar * SR)
        if st >= n:
            break
        en = min(n, st + int(bar * SR))
        ln = en - st
        tt = np.arange(ln) / SR
        semi = chord_at(ch_i * bar)
        chord = [root, root + 3, root + 7, root + 12]
        pad = np.zeros(ln)
        for k, m in enumerate(chord):
            f = note_hz(m + semi)
            for det in (-0.12, 0.12):
                pad += np.sin(2 * np.pi * (f + det) * tt) * (0.18 / (k + 1))
        env = np.minimum(tt / (0.25 * bar), 1.0) * np.minimum((bar - tt) / (0.35 * bar), 1.0)
        out[st:en] += pad * np.clip(env, 0, 1) * 0.5
    # arpeggio (16ths)
    step = beat / 4
    nsteps = int(seconds / step)
    for s_i in range(nsteps):
        st = int(s_i * step * SR)
        if st >= n:
            break
        ln = min(int(step * SR * 0.9), n - st)
        tt = np.arange(ln) / SR
        semi = chord_at(s_i * step)
        arp = [0, 3, 7, 12, 7, 3]
        m = root + 12 + arp[s_i % 6] + semi
        f = note_hz(m)
        v = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * f * 2 * tt))
        v *= np.exp(-tt * 9) * 0.14
        out[st:st + ln] += v
    # bass (8ths)
    for s_i in range(int(seconds / (beat / 2))):
        st = int(s_i * (beat / 2) * SR)
        if st >= n:
            break
        ln = min(int(beat / 2 * SR), n - st)
        tt = np.arange(ln) / SR
        semi = chord_at(s_i * beat / 2)
        f = note_hz(root - 12 + semi + (0 if s_i % 2 == 0 else 7))
        v = np.sin(2 * np.pi * f * tt) * 0.22 + np.sin(2 * np.pi * f * 2 * tt) * 0.05
        v *= np.exp(-tt * 5)
        out[st:st + ln] += v
    # drums
    kick_step = beat
    for s_i in range(int(seconds / kick_step)):
        st = int(s_i * kick_step * SR)
        if st >= n:
            break
        ln = min(int(0.18 * SR), n - st)
        tt = np.arange(ln) / SR
        f = np.linspace(120, 45, ln)
        v = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 12) * 0.5
        out[st:st + ln] += v
    for s_i in range(int(seconds / (beat / 2))):
        st = int(s_i * (beat / 2) * SR)
        if st >= n:
            break
        ln = min(int(0.05 * SR), n - st)
        noise = rng.normal(0, 1, ln)
        v = _lfilter(*_biquad_bandpass(8000, 0.8), noise) * np.exp(-np.arange(ln) / (0.012 * SR)) * 0.16
        out[st:st + ln] += v
    for s_i in range(int(seconds / beat)):
        if s_i % 2 == 1:
            st = int(s_i * beat * SR)
            if st >= n:
                break
            ln = min(int(0.16 * SR), n - st)
            noise = rng.normal(0, 1, ln)
            v = _lfilter(*_biquad_bandpass(1800, 0.6), noise) * np.exp(-np.arange(ln) / (0.05 * SR)) * 0.22
            out[st:st + ln] += v
    if style == "dark":
        out = _lfilter(*_biquad_lowpass(3200, 0.7), out)
    elif style == "bright":
        out = _lfilter(*_biquad_lowpass(12000, 0.7), out)
    out /= max(1e-6, np.max(np.abs(out)))
    # loop-safe fades
    fade = int(0.02 * SR)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    write_ogg_via_wav(name, out * 0.85, os.path.join(ASSETS, "audio", "music", "_wav"))


def sfx_ui_error():
    """Short two-tone descending buzz for a refused action."""
    t = t_axis(0.38)
    s = np.sin(2 * np.pi * 320 * t) * env_ad(len(t), 0.004, 1, 2.6)
    s += np.sin(2 * np.pi * 214 * t) * env_ad(len(t), 0.004, 1, 2.2) * 0.7
    s += np.sin(2 * np.pi * 640 * t) * env_ad(len(t), 0.002, 1, 6.0) * 0.18
    return s * 0.32


def sfx_ui_alert():
    """Police siren chirp: a fast two-note wail that cuts through the engine."""
    t = t_axis(1.6)
    # two-tone European siren: 960 Hz and 770 Hz alternating at 3.2 Hz
    toggle = (np.sin(2 * np.pi * 1.6 * t) > 0)
    f = np.where(toggle, 960.0, 770.0)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR)
    s += 0.3 * np.sin(2 * np.pi * np.cumsum(f * 2.0) / SR)
    e = np.clip(t / 0.12, 0, 1) * np.clip((1.6 - t) / 0.3, 0, 1)
    return s * e / np.max(np.abs(s * e)) * 0.42


def sfx_horn():
    """Dual-tone car horn, the one thing every driver presses when annoyed."""
    t = t_axis(0.55)
    s = np.sin(2 * np.pi * 415 * t) + np.sin(2 * np.pi * 523 * t) * 0.9
    s += np.sin(2 * np.pi * 830 * t) * 0.25 + np.sin(2 * np.pi * 1046 * t) * 0.18
    e = np.clip(t / 0.015, 0, 1) * np.clip((0.55 - t) / 0.06, 0, 1)
    return s * e / np.max(np.abs(s * e)) * 0.38


def sfx_fuel_pump():
    """Mechanical clunk plus a rising fill tone, for the refuel beat."""
    t = t_axis(1.1)
    rng = np.random.default_rng(414)
    clunk = np.zeros(len(t))
    n = int(SR * 0.05)
    clunk[:n] = rng.normal(0, 1, n) * np.exp(-np.arange(n) / (n * 0.25))
    clunk = _lfilter(*_biquad_lowpass(420, 0.9), clunk)
    whine = np.sin(2 * np.pi * np.cumsum(np.linspace(220, 660, len(t))) / SR) * 0.22
    whine *= np.clip(t / 0.15, 0, 1) * np.clip((1.1 - t) / 0.2, 0, 1)
    out = clunk * 0.9 + whine
    return out / max(1e-6, np.max(np.abs(out))) * 0.45


def sfx_police_radio():
    """Clip of radio chatter: squelch burst plus band-limited noise formants."""
    t = t_axis(0.9)
    rng = np.random.default_rng(515)
    n = rng.normal(0, 1, len(t))
    voice = _lfilter(*_biquad_bandpass(1350, 1.7), n)
    voice *= (np.sin(2 * np.pi * 4.5 * t) * 0.4 + 0.6)
    squelch = np.zeros(len(t))
    m = int(SR * 0.08)
    squelch[:m] = rng.normal(0, 1, m) * 0.5
    out = voice * 0.55 + squelch
    out *= np.clip((0.9 - t) / 0.15, 0, 1)
    return out / max(1e-6, np.max(np.abs(out))) * 0.30


def build_audio() -> None:
    sfx = {
        "ui_click": sfx_ui_click(), "ui_hover": sfx_ui_hover(), "ui_confirm": sfx_ui_confirm(),
        "ui_back": sfx_back(), "engine_loop": sfx_engine_loop(), "tyre_screech": sfx_tyre_screech(),
        "nitro": sfx_nitro(), "crash": sfx_crash(), "countdown_beep": sfx_countdown_beep(),
        "countdown_go": sfx_countdown_go(), "purchase": sfx_purchase(), "level_up": sfx_level_up(),
        "achievement": sfx_achievement(), "wind": sfx_wind(), "gear_shift": sfx_gear_shift(),
        "ui_error": sfx_ui_error(), "ui_alert": sfx_ui_alert(), "horn": sfx_horn(),
        "fuel_pump": sfx_fuel_pump(), "police_radio": sfx_police_radio(),
    }
    out = os.path.join(ASSETS, "audio", "sfx", "_wav")
    for name, s in sfx.items():
        write_ogg_via_wav(name, s, out)
    music_track("menu_theme", 96, 45, 11, "bright", 64.0)
    music_track("race_theme", 128, 41, 12, "dark", 64.0)
    music_track("garage_theme", 100, 43, 13, "bright", 64.0)
    music_track("results_theme", 110, 48, 14, "bright", 40.0)


def encode_audio(sfx_bitrate="64k", music_bitrate="96k") -> None:
    """Convert WAV masters to OGG Vorbis with ffmpeg, then drop the masters."""
    import shutil
    import subprocess
    ff = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ff:
        raise SystemExit("ffmpeg not found (set FFMPEG_BIN)")
    jobs = []
    sfx_dir = os.path.join(ASSETS, "audio", "sfx", "_wav")
    for f in sorted(os.listdir(sfx_dir)) if os.path.isdir(sfx_dir) else []:
        jobs.append((os.path.join(sfx_dir, f), os.path.join(ASSETS, "audio", "sfx", f[:-4] + ".ogg"), sfx_bitrate))
    music_dir = os.path.join(ASSETS, "audio", "music", "_wav")
    for f in sorted(os.listdir(music_dir)) if os.path.isdir(music_dir) else []:
        jobs.append((os.path.join(music_dir, f), os.path.join(ASSETS, "audio", "music", f[:-4] + ".ogg"), music_bitrate))
    for src, dst, br in jobs:
        subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-i", src,
                        "-c:a", "libvorbis", "-b:a", br, "-ar", "44100", "-ac", "1", dst], check=True)
    for d in (sfx_dir, music_dir):
        if os.path.isdir(d):
            shutil.rmtree(d)
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(os.path.join(ASSETS, "audio")) for f in fs)
    print(f"encoded {len(jobs)} clips -> {total / 1024:.0f} KiB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["art", "textures", "icons", "audio", "encode", "all"], default="all")
    args = ap.parse_args()
    if args.only in ("art", "all"):
        build_art()
    if args.only in ("textures", "all"):
        build_textures()
    if args.only in ("icons", "all"):
        build_icons()
    build_app_icon() if args.only in ("icons", "all") else None
    if args.only in ("audio", "all"):
        build_audio()
    if args.only in ("encode", "all"):
        encode_audio()
    print("assets generated OK")


if __name__ == "__main__":
    main()
