"""kx.icons — procedural vector icons (no downloads, no emoji fonts).

Every icon is an SDF (signed distance field) composition rendered with
supersampling, then filled with a vertical gradient, an inner highlight and a
soft outer glow.  Output is an RGBA float array ready for the compositor.
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageFilter

# --------------------------------------------------------------------------- SDF
def _grid(size: int):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    return xx, yy


def sd_circle(X, Y, c, r):
    return np.hypot(X - c[0], Y - c[1]) - r


def sd_segment(X, Y, a, b, r):
    ax, ay = a
    bx, by = b
    px, py = X - ax, Y - ay
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy or 1e-6
    t = np.clip((px * dx + py * dy) / denom, 0, 1)
    return np.hypot(px - t * dx, py - t * dy) - r


def sd_polyline(X, Y, pts, r):
    d = None
    for a, b in zip(pts[:-1], pts[1:]):
        s = sd_segment(X, Y, a, b, r)
        d = s if d is None else np.minimum(d, s)
    return d


def sd_arc(X, Y, c, r, a0, a1, w):
    ang = np.arctan2(Y - c[1], X - c[0])
    a0, a1 = np.radians(a0), np.radians(a1)
    span = (a1 - a0) % (2 * np.pi)
    rel = (ang - a0) % (2 * np.pi)
    inside = rel <= span
    ring = np.abs(np.hypot(X - c[0], Y - c[1]) - r) - w / 2
    e0 = (c[0] + r * np.cos(a0), c[1] + r * np.sin(a0))
    e1 = (c[0] + r * np.cos(a1), c[1] + r * np.sin(a1))
    cap = np.minimum(np.hypot(X - e0[0], Y - e0[1]), np.hypot(X - e1[0], Y - e1[1])) - w / 2
    return np.where(inside, ring, cap)


def sd_rrect(X, Y, c, hw, hh, rad):
    qx = np.abs(X - c[0]) - hw + rad
    qy = np.abs(Y - c[1]) - hh + rad
    out = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0))
    inside = np.minimum(np.maximum(qx, qy), 0)
    return out + inside - rad


def sd_poly(X, Y, pts):
    """signed distance to a closed polygon (even-odd inside test)."""
    n = len(pts)
    d = np.full(X.shape, 1e9, dtype=np.float32)
    inside = np.zeros(X.shape, dtype=bool)
    for i in range(n):
        a = pts[i]
        b = pts[(i + 1) % n]
        d = np.minimum(d, sd_segment(X, Y, a, b, 0.0))
        cond = ((a[1] > Y) != (b[1] > Y))
        with np.errstate(divide="ignore", invalid="ignore"):
            xint = (b[0] - a[0]) * (Y - a[1]) / (b[1] - a[1] + 1e-9) + a[0]
        inside ^= cond & (X < xint)
    return np.where(inside, -d, d)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def fill_from_sdf(d, aa=1.4):
    return smoothstep(aa, -aa, d)


# --------------------------------------------------------------------------- palettes
PALETTE = {
    "play": ((0.36, 0.98, 0.88), (0.13, 0.62, 1.00)),
    "code": ((0.65, 0.55, 1.00), (0.22, 0.85, 1.00)),
    "ai": ((1.00, 0.55, 0.85), (0.55, 0.35, 1.00)),
    "palette": ((1.00, 0.75, 0.35), (1.00, 0.36, 0.55)),
    "scissors": ((0.70, 0.95, 0.55), (0.15, 0.80, 0.70)),
    "clock": ((0.55, 0.88, 1.00), (0.35, 0.45, 1.00)),
    "timer": ((1.00, 0.85, 0.35), (1.00, 0.45, 0.25)),
    "flame": ((1.00, 0.85, 0.35), (1.00, 0.25, 0.35)),
    "sparkle": ((1.00, 0.95, 0.55), (1.00, 0.55, 0.85)),
    "growth": ((0.55, 1.00, 0.70), (0.10, 0.75, 0.95)),
    "image": ((0.75, 0.90, 1.00), (0.35, 0.55, 1.00)),
    "star": ((1.00, 0.90, 0.45), (1.00, 0.50, 0.20)),
    "wave": ((0.45, 0.98, 1.00), (0.30, 0.45, 1.00)),
    "phone": ((0.85, 0.90, 1.00), (0.40, 0.45, 0.95)),
    "gear": ((0.80, 0.85, 0.95), (0.35, 0.50, 0.85)),
    "trophy": ((1.00, 0.88, 0.40), (1.00, 0.55, 0.10)),
    "hand": ((1.00, 0.90, 0.60), (1.00, 0.60, 0.25)),
}


# --------------------------------------------------------------------------- icons
def _draw(name: str, S: int):
    """Return an alpha mask (float32 SxS) of the icon glyph."""
    X, Y = _grid(S)
    u = S / 116.0  # 100u design box + 8u bleed on every side
    X, Y = (X + 0.5) / u - 8.0, (Y + 0.5) / u - 8.0
    C = (50.0, 50.0)
    d = None

    def add(layer):
        nonlocal d
        d = layer if d is None else np.minimum(d, layer)

    if name == "play":
        d = np.abs(sd_circle(X, Y, C, 42)) - 2.4
        tri = sd_poly(X, Y, [(42, 30), (42, 70), (70, 50)])
        d = np.minimum(d, tri)
        d = np.minimum(d, sd_rrect(X, Y, (36, 50), 2.6, 16, 2.6))
    elif name == "code":
        add(sd_polyline(X, Y, [(38, 30), (16, 50), (38, 70)], 4.2))
        add(sd_polyline(X, Y, [(62, 30), (84, 50), (62, 70)], 4.2))
        add(sd_polyline(X, Y, [(56, 22), (44, 78)], 3.6))
    elif name == "ai":
        add(sd_rrect(X, Y, C, 26, 26, 9))
        for p in [(34, 16), (50, 12), (66, 16), (34, 84), (50, 88), (66, 84), (16, 34), (12, 50), (16, 66),
                  (84, 34), (88, 50), (84, 66)]:
            add(sd_circle(X, Y, p, 3.4))
        add(sd_circle(X, Y, (41, 42), 3.6))
        add(sd_circle(X, Y, (59, 42), 3.6))
        add(sd_polyline(X, Y, [(39, 60), (50, 66), (61, 60)], 3.4))
    elif name == "palette":
        d = np.abs(sd_circle(X, Y, C, 34)) - 4.0
        d = np.maximum(d, -((np.hypot(X - 78, Y - 66) - 20)))     # thumb bite
        for p in [(40, 34), (58, 32), (31, 52), (66, 52), (48, 62)]:
            d = np.minimum(d, sd_circle(X, Y, p, 5.2))
    elif name == "scissors":
        add(sd_circle(X, Y, (30, 74), 11) - 1 + 0)
        d = np.minimum(np.abs(sd_circle(X, Y, (30, 74), 11)) - 3.4, np.abs(sd_circle(X, Y, (70, 74), 11)) - 3.4)
        add(sd_polyline(X, Y, [(36, 66), (74, 20)], 3.6))
        add(sd_polyline(X, Y, [(64, 66), (26, 20)], 3.6))
    elif name == "clock":
        d = np.abs(sd_circle(X, Y, C, 36)) - 4.2
        add(sd_segment(X, Y, C, (50, 26), 3.6))
        add(sd_segment(X, Y, C, (68, 58), 3.6))
        add(sd_circle(X, Y, C, 4.0))
    elif name == "timer":
        d = np.abs(sd_circle(X, Y, (50, 56), 30)) - 4.2
        add(sd_segment(X, Y, (50, 56), (50, 36), 3.4))
        add(sd_polyline(X, Y, [(40, 14), (60, 14)], 3.6))
        add(sd_segment(X, Y, (50, 14), (50, 22), 3.6))
        add(sd_polyline(X, Y, [(72, 30), (80, 22)], 3.2))
    elif name == "flame":
        outer = sd_poly(X, Y, [(50, 6), (74, 38), (80, 60), (62, 88), (38, 88), (20, 60), (26, 38)])
        d = np.abs(outer) - 4.2
        d = np.minimum(d, np.abs(sd_poly(X, Y, [(50, 46), (64, 64), (56, 84), (44, 84), (36, 64)])) - 3.2)
    elif name == "sparkle":
        def star4(cx, cy, r, ir):
            pts = []
            for i in range(8):
                a = np.pi / 4 * i - np.pi / 2
                rr = r if i % 2 == 0 else ir
                pts.append((cx + rr * np.cos(a), cy + rr * np.sin(a)))
            return sd_poly(X, Y, pts)
        d = star4(50, 50, 42, 12)
        d = np.minimum(d, star4(80, 22, 16, 5))
        d = np.minimum(d, star4(20, 78, 13, 4))
    elif name == "growth":
        base = sd_polyline(X, Y, [(14, 84), (84, 84)], 3.0)
        bars = np.full(X.shape, 1e9, dtype=np.float32)
        for i, h in enumerate([26, 42, 58, 74]):
            x0 = 24 + i * 16
            bars = np.minimum(bars, sd_rrect(X, Y, (x0, 84 - h / 2), 5.5, h / 2, 3.0))
        d = np.minimum(base, bars)
        d = np.minimum(d, sd_polyline(X, Y, [(22, 44), (44, 30), (62, 34), (80, 16)], 3.2))
    elif name == "image":
        d = np.abs(sd_rrect(X, Y, (50, 52), 36, 28, 7)) - 3.8
        d = np.minimum(d, sd_circle(X, Y, (36, 40), 5.4))
        d = np.minimum(d, sd_polyline(X, Y, [(20, 74), (42, 50), (58, 66), (70, 54), (82, 70)], 3.6))
    elif name == "star":
        pts = []
        for i in range(10):
            a = -np.pi / 2 + i * np.pi / 5
            rr = 38 if i % 2 == 0 else 16
            pts.append((50 + rr * np.cos(a), 50 + rr * np.sin(a)))
        d = np.abs(sd_poly(X, Y, pts)) - 3.6
    elif name == "wave":
        d = np.full(X.shape, 1e9, dtype=np.float32)
        for i, (x, h) in enumerate([(22, 12), (33, 24), (44, 34), (55, 26), (66, 40), (77, 18)]):
            d = np.minimum(d, sd_segment(X, Y, (x, 50 - h), (x, 50 + h), 3.6))
    elif name == "phone":
        d = np.abs(sd_rrect(X, Y, (50, 50), 22, 36, 8)) - 3.8
        d = np.minimum(d, sd_segment(X, Y, (43, 20), (57, 20), 2.4))
        d = np.minimum(d, sd_segment(X, Y, (44, 80), (56, 80), 2.4))
    elif name == "gear":
        Xc, Yc = X - 50, Y - 50
        ang = np.arctan2(Yc, Xc)
        rad = np.hypot(Xc, Yc)
        teeth = 30 + 7 * np.cos(8 * ang)
        d = rad - teeth
        d = np.minimum(d, np.abs(rad - 20) - 4.0)
        d = np.minimum(d, rad - 7)
    elif name == "trophy":
        cup = sd_poly(X, Y, [(32, 18), (68, 18), (64, 52), (36, 52)])
        d = np.abs(cup) - 3.8
        d = np.minimum(d, sd_arc(X, Y, (32, 26), 12, 90, 270, 3.6))
        d = np.minimum(d, sd_arc(X, Y, (68, 26), 12, 270, 450, 3.6))
        d = np.minimum(d, sd_segment(X, Y, (50, 52), (50, 72), 4.0))
        d = np.minimum(d, sd_segment(X, Y, (34, 80), (66, 80), 4.0))
        d = np.minimum(d, sd_segment(X, Y, (50, 72), (50, 80), 4.0))
    elif name == "hand":
        d = sd_rrect(X, Y, (50, 66), 20, 16, 6)
        for i, (x, top) in enumerate([(34, 34), (44, 24), (56, 26), (66, 38)]):
            d = np.minimum(d, sd_rrect(X, Y, (x, (top + 60) / 2 + 2), 5.2, (62 - top) / 2 + 8, 5.2))
        d = np.minimum(d, sd_rrect(X, Y, (28, 56), 6, 16, 5))
    else:
        d = np.abs(sd_circle(X, Y, C, 30)) - 4.0
    return fill_from_sdf(d, aa=0.9)


def gradient(size: int, c0, c1, angle=115.0):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    a = np.radians(angle)
    t = (xx * np.cos(a) + yy * np.sin(a))
    t = (t - t.min()) / (t.max() - t.min() + 1e-9)
    t = smoothstep(0, 1, t)
    return (np.stack([c0[i] + (c1[i] - c0[i]) * t for i in range(3)], -1)).astype(np.float32)


def render_icon(name: str, size: int = 512, glow: float = 1.0) -> np.ndarray:
    """RGBA float32 (size, size, 4) of the icon, with glass disc + glow."""
    S = size
    mask = _draw(name, S)
    c0, c1 = PALETTE.get(name, PALETTE["star"])

    # glass disc backdrop
    X, Y = _grid(S)
    u = S / 116.0
    X, Y = X + 0.5, Y + 0.5
    dx_, dy_ = X / u - 8.0, Y / u - 8.0
    disc = smoothstep(1.6, -1.6, sd_circle(dx_, dy_, (50, 50), 46))
    ring = np.exp(-((np.abs(sd_circle(dx_, dy_, (50, 50), 46)) - 0.8) ** 2) / 1.6)

    # glyph gradient
    grad = gradient(S, c0, c1)
    rgba = np.zeros((S, S, 4), dtype=np.float32)
    # backdrop: dark navy glass + tinted
    tint = 0.16
    rgba[..., 0] = 0.05 + c0[0] * tint
    rgba[..., 2] = 0.10 + c1[2] * tint
    rgba[..., 1] = 0.07 + c0[1] * tint * 0.6
    rgba[..., 3] = disc * 0.60
    # ring highlight
    rgba[..., 0] += ring * 0.55 * c0[0]
    rgba[..., 1] += ring * 0.55 * c0[1]
    rgba[..., 2] += ring * 0.55 * c1[2]
    rgba[..., 3] = np.maximum(rgba[..., 3], ring * 0.7)
    # glyph
    g = np.zeros((S, S, 4), dtype=np.float32)
    g[..., 0] = np.clip(grad[..., 0] * 1.05, 0, 1)
    g[..., 1] = np.clip(grad[..., 1] * 1.05, 0, 1)
    g[..., 2] = np.clip(grad[..., 2] * 1.05, 0, 1)
    g[..., 3] = mask
    # inner white highlight on glyph top
    hi = np.clip((grad[..., 1] - 0.4) * 0.5, 0, 0.35)[..., None]
    g[..., :3] = np.clip(g[..., :3] + hi, 0, 1)

    out = _over(g, rgba)

    if glow > 0:
        halo = mask * glow
        halo = _blur(halo, S * 0.055) * 0.85
        col = np.zeros((S, S, 4), dtype=np.float32)
        col[..., 0] = c0[0]
        col[..., 1] = c0[1]
        col[..., 2] = c1[2]
        col[..., 3] = np.clip(halo, 0, 1) * 0.55
        out = _over(out, col)
    return out


def _over(src, dst):
    """src over dst, both premultiplied-free RGBA float32."""
    sa = src[..., 3:4]
    da = dst[..., 3:4]
    oa = sa + da * (1 - sa)
    rgb = (src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    return np.concatenate([rgb, oa], -1).astype(np.float32)


def _blur(arr: np.ndarray, radius: float) -> np.ndarray:
    im = Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8))
    im = im.filter(ImageFilter.GaussianBlur(max(0.5, radius)))
    return np.asarray(im).astype(np.float32) / 255.0


_CACHE: dict[tuple[str, int], np.ndarray] = {}


def icon(name: str, size: int = 512) -> np.ndarray:
    key = (name, size)
    if key not in _CACHE:
        _CACHE[key] = render_icon(name, size)
    return _CACHE[key]


if __name__ == "__main__":
    from PIL import Image as I
    names = sorted(PALETTE)
    S = 200
    cols = 6
    rows = (len(names) + cols - 1) // cols
    sheet = np.zeros((rows * S, cols * S, 3), dtype=np.float32)
    for i, n in enumerate(names):
        r, c = divmod(i, cols)
        ic = icon(n, S)
        a = ic[..., 3:4]
        sheet[r * S:(r + 1) * S, c * S:(c + 1) * S] = ic[..., :3] * a
    I.fromarray((np.clip(sheet, 0, 1) * 255).astype(np.uint8)).save("/tmp/icons.png")
    print("ok")
