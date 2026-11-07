"""kx.fx — the compositor primitives (all numpy, no GPU)."""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter

F32 = np.float32


# --------------------------------------------------------------------------- math
def clamp(x, a=0.0, b=1.0):
    return np.clip(x, a, b)


def smoothstep(a, b, x):
    t = clamp((x - a) / (b - a + 1e-9))
    return t * t * (3 - 2 * t)


def ease_out_cubic(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_in_out(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def spring(t, freq=7.0, damp=7.5):
    """0 -> 1 with overshoot."""
    t = clamp(t)
    return 1 - np.exp(-damp * t) * np.cos(freq * t * np.pi)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c0, c1, t):
    return tuple(c0[i] + (c1[i] - c0[i]) * t for i in range(3))


# --------------------------------------------------------------------------- resize
def warp_alpha(a: np.ndarray, s: float) -> np.ndarray:
    if abs(s - 1.0) < 1e-3:
        return a
    h, w = a.shape
    nh, nw = max(2, int(round(h * s))), max(2, int(round(w * s)))
    yi = np.clip(np.arange(nh, dtype=F32) / s, 0, h - 1)
    xi = np.clip(np.arange(nw, dtype=F32) / s, 0, w - 1)
    y0 = np.floor(yi).astype(np.int32)
    y1 = np.minimum(y0 + 1, h - 1)
    fy = (yi - y0)[:, None].astype(F32)
    x0 = np.floor(xi).astype(np.int32)
    x1 = np.minimum(x0 + 1, w - 1)
    fx = (xi - x0)[None, :].astype(F32)
    top = a[y0][:, x0] * (1 - fx) + a[y0][:, x1] * fx
    bot = a[y1][:, x0] * (1 - fx) + a[y1][:, x1] * fx
    return (top * (1 - fy) + bot * fy).astype(F32)


def blur(arr: np.ndarray, radius: float) -> np.ndarray:
    if radius <= 0.2:
        return arr
    im = Image.fromarray(np.clip(arr * 255.0, 0, 255).astype(np.uint8))
    im = im.filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(im).astype(F32) / 255.0


# --------------------------------------------------------------------------- gradients
_GRAD_CACHE: dict = {}


def linear_gradient(w: int, h: int, c0, c1, angle: float = 90.0) -> np.ndarray:
    key = ("lin", w, h, tuple(c0), tuple(c1), round(angle, 1))
    if key in _GRAD_CACHE:
        return _GRAD_CACHE[key]
    yy, xx = np.mgrid[0:h, 0:w].astype(F32)
    a = np.radians(angle)
    t = xx * np.cos(a) + yy * np.sin(a)
    t = (t - t.min()) / (t.max() - t.min() + 1e-9)
    t = smoothstep(0, 1, t)[..., None]
    g = (np.array(c0, F32) * (1 - t) + np.array(c1, F32) * t).astype(F32)
    _GRAD_CACHE[key] = g
    return g


def radial_mask(w: int, h: int, soft: float = 0.65) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w].astype(F32)
    dx = (xx - w / 2) / (w / 2)
    dy = (yy - h / 2) / (h / 2)
    r = np.sqrt(dx * dx + dy * dy)
    return (1 - smoothstep(1.0 - soft, 1.0, r)).astype(F32)


def rounded_mask(w: int, h: int, radius: int, feather: float = 1.5) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w].astype(F32)
    r = min(radius, w // 2 - 1, h // 2 - 1)
    qx = np.abs(xx - (w - 1) / 2) - (w / 2 - r)
    qy = np.abs(yy - (h - 1) / 2) - (h / 2 - r)
    d = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
    return smoothstep(feather, -feather, d).astype(F32)


# --------------------------------------------------------------------------- compose
def paste(canvas: np.ndarray, layer_rgb: np.ndarray, alpha: np.ndarray, x: int, y: int,
          opacity: float = 1.0, mode: str = "over"):
    """Paste an RGB layer with an alpha mask at (x,y), clipped to the canvas.

    `canvas` may be HxWx3 or HxW (mono mask target).
    """
    mono = canvas.ndim == 2
    H, W = canvas.shape[:2]
    h, w = alpha.shape
    x, y = int(round(x)), int(round(y))
    x0, y0 = max(x, 0), max(y, 0)
    x1, y1 = min(x + w, W), min(y + h, H)
    if x1 <= x0 or y1 <= y0:
        return
    sx0, sy0 = x0 - x, y0 - y
    sx1, sy1 = sx0 + (x1 - x0), sy0 + (y1 - y0)
    a = alpha[sy0:sy1, sx0:sx1]
    if opacity != 1.0:
        a = a * opacity
    src = layer_rgb[sy0:sy1, sx0:sx1]
    dst = canvas[y0:y1, x0:x1]
    if mono:
        src = src[..., 0]
    elif src.shape[:2] == a.shape[:2]:
        a = a[..., None]
    if mode == "over":
        canvas[y0:y1, x0:x1] = src * a + dst * (1 - a)
    elif mode == "add":
        canvas[y0:y1, x0:x1] = np.clip(dst + src * a, 0, 1.5)
    elif mode == "screen":
        canvas[y0:y1, x0:x1] = 1 - (1 - dst) * (1 - np.clip(src * a, 0, 1))


def paint_alpha(canvas, alpha, x, y, color, opacity=1.0, mode="over"):
    h, w = alpha.shape
    rgb = np.empty((h, w, 3), F32)
    rgb[..., 0] = color[0]
    rgb[..., 1] = color[1]
    rgb[..., 2] = color[2]
    paste(canvas, rgb, alpha, x, y, opacity, mode)


def paint_gradient(canvas, alpha, x, y, c0, c1, angle=90.0, opacity=1.0, mode="over", shift=0.0):
    h, w = alpha.shape
    if shift:
        c0 = tuple(min(1.0, v + shift) for v in c0)
        c1 = tuple(min(1.0, v + shift) for v in c1)
    grad = linear_gradient(w, h, c0, c1, angle)
    paste(canvas, grad, alpha, x, y, opacity, mode)


def bloom(frame: np.ndarray, strength: float = 0.55, threshold: float = 0.62,
          radius: float = 9.0) -> np.ndarray:
    H, W = frame.shape[:2]
    small = frame[::4, ::4]
    lum = small.max(axis=2, keepdims=True)
    bright = np.clip((lum - threshold) / (1 - threshold + 1e-6), 0, 1)
    b = blur(np.clip(small * bright, 0, 1), radius)
    up = np.asarray(Image.fromarray(np.clip(b * 255, 0, 255).astype(np.uint8))
                    .resize((W, H), Image.BILINEAR)).astype(F32) / 255.0
    return np.clip(frame + up * strength, 0, 1)


def chromatic(frame: np.ndarray, amount: float) -> np.ndarray:
    if amount <= 0.4:
        return frame
    k = int(round(amount))
    out = frame.copy()
    out[:, k:, 0] = frame[:, :-k, 0]
    out[:, :-k, 2] = frame[:, k:, 2]
    return out


def vignette(frame: np.ndarray, strength: float = 0.55) -> np.ndarray:
    v = vignette_mask(*frame.shape[:2])
    return frame * (1 - v * strength)[..., None]


def halo(a: np.ndarray, radius: float, scale: float = 3.0):
    """Natural glow: pad before blurring so no rectangular edge shows up."""
    p = max(2, int(radius * scale))
    padded = np.pad(a, p)
    b = blur(padded, radius)
    return b, p


_VIG = {}


def vignette_mask(H, W):
    if (H, W) not in _VIG:
        yy, xx = np.mgrid[0:H, 0:W].astype(F32)
        dx = (xx - W / 2) / (W / 2)
        dy = (yy - H / 2) / (H / 2)
        r = np.sqrt(dx * dx * 0.85 + dy * dy)
        _VIG[(H, W)] = smoothstep(0.55, 1.45, r).astype(F32)
    return _VIG[(H, W)]


_GRAIN = {}


def grain(shape, seed: int, amount: float = 0.035):
    key = (shape, seed)
    if key not in _GRAIN:
        rng = np.random.default_rng(seed)
        g = rng.standard_normal(shape[:2]).astype(F32)
        _GRAIN[key] = blur(g, 0.6)
    return _GRAIN[key][..., None] * amount


def to_uint8(frame: np.ndarray) -> np.ndarray:
    return (np.clip(frame, 0, 1) * 255.0 + 0.5).astype(np.uint8)
