# -*- coding: utf-8 -*-
"""Editor-grade VFX: camera shake, chromatic aberration, light leaks, anamorphic flare,
particles, text reveal masks and the kinetic countdown clock."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'build'))
from engine import W, H, GX, GY, ease_out, ease_in_out, ease_out_expo, smoothstep, lerp, splat, splat_dot

def shake_at(t, seed, amp=12.0, freq=17.0, decay=0.30, t0=0.0):
    """decaying camera shake, returns (dx, dy)"""
    d = t - t0
    if d < 0 or d > decay * 5: return 0, 0
    k = math.exp(-d / decay)
    r = np.random.default_rng((seed * 7919 + int(t * 30)) % 99991)
    return r.normal(0, amp * k), r.normal(0, amp * .75 * k)

def ca(img, amount=1.0):
    """chromatic aberration, radial (scales with distance from centre)"""
    if amount < 0.02: return img
    out = img.copy()
    s = int(round(2.4 * amount))
    if s < 1: return img
    out[..., 0] = np.roll(img[..., 0], s, axis=1)
    out[..., 2] = np.roll(img[..., 2], -s, axis=1)
    return out

def light_leak(img, t, t0, dur=0.9, side='left', strength=0.55, color=(255, 150, 70)):
    p = (t - t0) / dur
    if p < 0 or p > 1: return img
    k = math.sin(math.pi * min(1, p)) ** 0.7 * strength
    d = ((GX - (0 if side == 'left' else W)) / (W * .75)) ** 2 + ((GY - H * .5) / (H * .95)) ** 2
    img += (np.exp(-d * 1.6) * k)[..., None] * np.array(color, np.float32)
    return img

def flare(img, cx, cy, t, strength=1.0, color=(120, 190, 255), n_ghosts=5):
    """anamorphic streak + lens ghosts"""
    if strength <= 0.01: return img
    d2 = ((GX - cx) ** 2 + (GY - cy) ** 2)
    img += (np.exp(-d2 / (700 ** 2)) * 0.35 * strength)[..., None] * np.array(color, np.float32)
    sx = np.exp(-np.abs(GX - cx) / 420) * np.exp(-((GY - cy) ** 2) / (16 ** 2))
    img += (sx * 0.55 * strength)[..., None] * np.array(color, np.float32)
    for i in range(1, n_ghosts + 1):
        f = -0.42 * i / n_ghosts
        gx = cx + (W / 2 - cx) * f * 2.1
        gy = cy + (H / 2 - cy) * f * 2.1
        r = 26 + i * 16
        g2 = ((GX - gx) ** 2 + (GY - gy) ** 2) / (r * r)
        img += (np.exp(-g2 * 2.0) * 0.10 * strength)[..., None] * np.array(color, np.float32)
    return img

def dust(img, t, count=70, seed=4, bright=0.5, size=1.6):
    """floating dust motes with parallax + twinkle"""
    r = np.random.default_rng(seed)
    for i in range(count):
        ph = r.uniform(0, 6.28)
        x0 = r.uniform(0, W); y0 = r.uniform(0, H); sp = r.uniform(6, 26)
        y = (y0 - t * sp) % H
        x = x0 + math.sin(t * 0.5 + ph) * 22
        tw = 0.45 + 0.55 * abs(math.sin(t * 1.7 + ph))
        splat(img, x, y, size * r.uniform(1.5, 3.2), (210, 225, 245), bright * tw * 0.5)
    return img

# ---------------------------------------------------------------- text reveal masks
def reveal_band(img, t, t0, y, band=1.55, dur=0.62, mode='wipe', easing=ease_out_expo):
    """animate a horizontal wipe/band reveal around a text row using a noise-free mask"""
    p = (t - t0) / dur
    if p <= 0: return img, 0.0
    return img, min(1.0, p)

def rack_focus(img, amount=1.0):
    """cheap defocus: downsample/upsample blur"""
    if amount < 0.05: return img
    k = int(6 * amount)
    if k < 2: return img
    small = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((W // k, H // k), Image.BILINEAR)
    small = small.filter(ImageFilter.GaussianBlur(1.2))
    return np.asarray(small.resize((W, H), Image.BILINEAR)).astype(np.float32)

def grain_plate(img, seed, amount=5.0):
    g = np.random.default_rng(seed).normal(0, 1, (H, W)).astype(np.float32)
    return img + (g * amount)[..., None]

def scan_flicker(img, t, amp=0.035):
    k = 1 + amp * math.sin(t * 47.0) * math.sin(t * 11.0)
    return img * k
