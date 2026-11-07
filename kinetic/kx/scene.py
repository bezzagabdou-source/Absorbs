"""kx.scene — the look: glassmorphic dark stage, kinetic Arabic captions,
floating neon icons, light leaks, bloom, grain. Renders a frame at time t.
"""
from __future__ import annotations

import json
import math
import os

import numpy as np

from . import fx
from .font import space_advance, word_mask
from .icons import PALETTE, icon

F32 = np.float32
W, H = 1080, 1920
FPS = 30

STYLE = {
    "bg0": (0.028, 0.034, 0.055),
    "bg1": (0.058, 0.074, 0.118),
    "cap_base": 124,
    "cap_line_max": 2,
    "cap_y": 0.630,
    "safe": 60,
    "icon_size": 430,
    "icon_y": 0.315,
    "hero_grad": ((1.00, 0.88, 0.44), (1.00, 0.44, 0.55)),
}

# four premium gradient duos, rotated per sentence so the reel never repeats itself
GRADS = [
    ((1.00, 0.88, 0.44), (1.00, 0.42, 0.52)),   # gold -> coral
    ((0.55, 0.98, 1.00), (0.45, 0.55, 1.00)),   # ice -> indigo
    ((0.62, 1.00, 0.72), (0.10, 0.80, 0.92)),   # mint -> teal
    ((1.00, 0.72, 0.42), (1.00, 0.28, 0.45)),   # amber -> crimson
]


def _fit_size(text: str, base: int, max_w: int, voice: str) -> int:
    size = base
    while size > 56:
        w, _ = word_mask(text, voice, size).width, None
        if w <= max_w:
            break
        size -= 4
    return size


class Scene:
    def __init__(self, timeline: dict, bg_frames: str | None = None, voice: str = "ar-black"):
        self.tl = timeline
        self.dur = timeline["duration"]
        self.words = timeline["words"]
        self.groups = timeline["groups"]
        self.icons = timeline["icons"]
        self.voice = voice
        self.bg_dir = bg_frames
        self._bg_cache: dict[int, np.ndarray] = {}
        self.env = np.asarray(timeline.get("envelope") or [], dtype=F32)

        self.masks = {}
        for w in self.words:
            base = STYLE["cap_base"] + (6 if w["hero"] else 0)
            self.masks[w["text"]] = word_mask(
                w["text"], voice, _fit_size(w["text"], base, W - 210, voice))

        self.sprites = {}
        for b in self.icons:
            if b["icon"] not in self.sprites:
                self.sprites[b["icon"]] = icon(b["icon"], 512)

        # per-group layout, precomputed once
        self.layout = [self._layout(g) for g in self.groups]
        self._cache = {}
        self.bg_static = self._build_bg()
        self.particles = self._particles_init()

    # ------------------------------------------------------------------ rms
    def rms(self, t: float) -> float:
        if len(self.env) == 0:
            return 0.35
        i = min(len(self.env) - 1, max(0, int(t * FPS)))
        return float(self.env[i])

    # ------------------------------------------------------------------ background
    def _build_bg(self):
        g = fx.linear_gradient(W, H, STYLE["bg0"], STYLE["bg1"], angle=100)
        for (cx, cy, r, c, a) in [
            (0.16, 0.14, 0.52, (0.26, 0.50, 1.00), 0.20),
            (0.88, 0.80, 0.55, (0.95, 0.32, 0.62), 0.14),
            (0.55, 0.42, 0.60, (0.16, 0.80, 0.82), 0.08),
        ]:
            yy, xx = np.mgrid[0:H, 0:W].astype(F32)
            d = np.sqrt((xx / W - cx) ** 2 + ((yy / H - cy) * 1.2) ** 2)
            m = np.exp(-(d / r) ** 2 * 2.4).astype(F32) * a
            fx.paint_alpha(g, m, 0, 0, c, 1.0, "add")
        return np.clip(g, 0, 1)

    def _particles_init(self):
        rng = np.random.default_rng(21)
        n = 54
        return {"x": rng.uniform(0, 1, n), "y": rng.uniform(0, 1, n),
                "v": rng.uniform(0.014, 0.045, n), "a": rng.uniform(0.2, 0.85, n),
                "p": rng.uniform(0, 6.28, n), "s": rng.uniform(0.7, 1.8, n)}

    def _particles(self, frame, t):
        S = 4
        h, w = H // S, W // S
        pts = np.zeros((h, w), F32)
        p = self.particles
        for i in range(len(p["x"])):
            x = (p["x"][i] * w + 5 * math.sin(t * 0.5 + p["p"][i])) % w
            y = ((p["y"][i] - t * p["v"][i] * 0.35) % 1.12 - 0.06) * h
            xi, yi = int(x), int(y)
            if 1 <= xi < w - 1 and 1 <= yi < h - 1:
                k = p["a"][i] * p["s"][i]
                pts[yi, xi] += k
                pts[yi - 1, xi] += k * 0.45
                pts[yi + 1, xi] += k * 0.45
                pts[yi, xi - 1] += k * 0.45
                pts[yi, xi + 1] += k * 0.45
        from PIL import Image
        big = np.asarray(Image.fromarray((np.clip(pts, 0, 1) * 255).astype(np.uint8))
                         .resize((W, H), Image.BILINEAR)).astype(F32) / 255.0
        return np.clip(frame + big[..., None] * np.array([0.72, 0.86, 1.0], F32) * 0.5, 0, 1)

    def source_frame(self, t: float):
        if not self.bg_dir:
            return None
        idx = int(t * 12)
        if idx in self._bg_cache:
            return self._bg_cache[idx]
        p = os.path.join(self.bg_dir, f"{idx:05d}.npy")
        if not os.path.exists(p):
            return None
        a = np.load(p)
        if len(self._bg_cache) > 20:
            self._bg_cache.pop(next(iter(self._bg_cache)))
        self._bg_cache[idx] = a
        return a

    def background(self, t: float, accent) -> np.ndarray:
        src = self.source_frame(t)
        if src is not None:
            frame = self._treat_source(src)
        else:
            dx = int(10 * math.sin(t * 0.33))
            dy = int(14 * math.sin(t * 0.21 + 1.1))
            frame = self._shift(self.bg_static, dx, dy)
            frame = self._particles(frame, t)
        # audio-reactive aura (computed at 1/4 res, then upscaled)
        S = 4
        hh, ww = H // S, W // S
        if "gy" not in self._cache:
            yy, xx = np.mgrid[0:hh, 0:ww].astype(F32)
            self._cache["gx"] = xx / ww
            self._cache["gy"] = yy / hh
        gx, gy = self._cache["gx"], self._cache["gy"]
        cx = 0.5 + 0.20 * math.sin(t * 0.37)
        cy = 0.30 + 0.08 * math.cos(t * 0.29)
        d = np.sqrt((gx - cx) ** 2 * 1.15 + (gy - cy) ** 2)
        amp = 0.12 + 0.18 * self.rms(t)
        aura = (np.exp(-(d / 0.40) ** 2 * 2.1) * amp).astype(F32)
        from PIL import Image
        big = np.asarray(Image.fromarray((np.clip(aura, 0, 1) * 255).astype(np.uint8))
                         .resize((W, H), Image.BILINEAR)).astype(F32) / 255.0
        col = np.array(accent[0], F32)
        frame = frame + big[..., None] * col
        np.clip(frame, 0, 1, out=frame)
        return frame

    @staticmethod
    def _shift(a, dx, dy):
        """translate with edge clamping (cheap, no wrap artefacts)."""
        h, w = a.shape[:2]
        ys = np.clip(np.arange(h) - dy, 0, h - 1)
        xs = np.clip(np.arange(w) - dx, 0, w - 1)
        return a[ys][:, xs]

    def _treat_source(self, src):
        a = src.astype(F32) / 255.0
        a = np.floor(a * 16) / 16
        lum = a @ np.array([0.299, 0.587, 0.114], F32)
        a = np.clip(lum[..., None] * 0.50 + a * 0.30, 0, 1)
        a = a * 0.70 + np.array([0.09, 0.15, 0.28], F32) * 0.30
        a = fx.blur(a, 1.4)
        yy = np.linspace(0, 1, H, dtype=F32)[:, None]
        scrim = 0.20 + 0.50 * np.exp(-((yy - 0.66) ** 2) / 0.06)
        return np.clip(a * (1 - scrim[..., None] * 0.6), 0, 1)

    # ------------------------------------------------------------------ layout
    def _layout(self, g):
        ws = [self.words[i] for i in g["words"]]
        items = []
        for w in ws:
            m = self.masks[w["text"]]
            items.append({"w": w, "m": m, "size": int(m.height * 0.98)})
        # split into at most 2 lines, balanced by pixel width
        if len(items) <= 1:
            lines = [items]
        else:
            best, best_cost = None, 1e18
            for cut in range(1, len(items)):
                l1, l2 = items[:cut], items[cut:]
                w1 = sum(i["m"].width for i in l1) + 0.24 * max(i["m"].height for i in l1) * (len(l1) - 1)
                w2 = sum(i["m"].width for i in l2) + 0.24 * max(i["m"].height for i in l2) * (len(l2) - 1)
                cost = abs(w1 - w2) + max(w1, w2) * 0.02
                if w1 < W - 130 and w2 < W - 130 and cost < best_cost:
                    best, best_cost = (l1, l2), cost
            lines = best or [items]
        line_h = []
        for ln in lines:
            line_h.append(max(i["m"].height for i in ln) * 1.02)
        total_h = sum(line_h) + 10 * (len(lines) - 1)
        return {"items": items, "lines": lines, "line_h": line_h, "total_h": total_h}

    # ------------------------------------------------------------------ captions
    def captions(self, frame, t):
        gi, g = None, None
        for i, gg in enumerate(self.groups):
            if gg["start"] <= t < gg["end"]:
                gi, g = i, gg
                break
        if g is None:
            return
        L = self.layout[gi]
        gi_in = fx.clamp((t - g["start"]) / 0.15)
        gi_out = fx.clamp((g["end"] - t) / 0.10)
        env = min(gi_in, gi_out)
        if env <= 0.002:
            return
        g_op = fx.smoothstep(0, 1, env)
        rise = (1 - fx.ease_out_cubic(gi_in)) * 54 + (1 - fx.ease_out_cubic(gi_out)) * 46

        cy = H * STYLE["cap_y"] + rise
        y_line = cy - L["total_h"] / 2

        # ambient plate behind the block (soft glass, no border)
        maxw = max(sum(i["m"].width for i in ln) + 0.24 * max(i["m"].height for i in ln) * (len(ln) - 1)
                   for ln in L["lines"])
        pw = min(int(maxw + 150), W - 20)
        ph = int(L["total_h"] + 120)
        # soft "spotlight" scrim under the block (elliptical, no hard edges)
        yy_, xx_ = np.mgrid[0:H, 0:W].astype(F32)
        ex = (xx_ - W / 2) / (pw / 2)
        ey = (yy_ - (y_line + L["total_h"] / 2)) / (ph / 2)
        spot = (1 - fx.smoothstep(0.55, 1.25, np.sqrt(ex * ex + ey * ey))) * 0.30
        fx.paint_alpha(frame, spot.astype(F32), 0, 0, (0.01, 0.015, 0.04), 1.0, "over")

        for li, ln in enumerate(L["lines"]):
            # RTL: first word on the right
            gap = int(0.24 * max(i["m"].height for i in ln))
            widths = [i["m"].width for i in ln]
            line_w = sum(widths) + gap * (len(ln) - 1)
            x = int((W - line_w) / 2)
            baseline_y = y_line + sum(L["line_h"][:li]) + 10 * li
            ph_ = max(i["m"].height for i in ln)
            for idx, it in enumerate(ln):
                w, m = it["w"], it["m"]
                st = fx.clamp((t - w["start"] + 0.06) / 0.17)
                xx = x
                x += m.width + gap
                if st <= 0:
                    continue
                yy = int(baseline_y + (ph_ - m.height) / 2)
                active = w["start"] - 0.02 <= t < w["end"] + 0.05
                pop = fx.spring(st, 6.2, 8.5)
                scale = 0.90 + 0.10 * pop
                if active:
                    k = fx.clamp((t - w["start"]) / 0.11)
                    # audio punch
                    scale *= 1.0 + 0.065 * fx.spring(k, 4.4, 6.0) + 0.02 * self.rms(t)
                alpha = fx.smoothstep(0, 0.5, st) * g_op

                a = fx.warp_alpha(m.alpha, scale)
                cx_ = xx + m.width / 2
                cy_ = yy + m.height / 2
                px_ = int(cx_ - a.shape[1] / 2)
                py_ = int(cy_ - a.shape[0] / 2)

                if active:
                    pulse = 0.72 + 0.28 * self.rms(t)
                    c0, c1 = GRADS[(w.get("sentence", 0)) % len(GRADS)]
                    h1, p1 = fx.halo(a, 20)
                    fx.paint_alpha(frame, h1, px_ - p1, py_ - p1, c1, 0.80 * pulse, "add")
                    h2, p2 = fx.halo(a, 48)
                    fx.paint_alpha(frame, h2, px_ - p2, py_ - p2, c0, 0.50 * pulse, "add")
                    # gradient fill, slow shimmer
                    shimmer = 0.10 + 0.10 * math.sin(t * 5.2)
                    fx.paint_gradient(frame, a, px_, py_, c0, c1, angle=112, opacity=alpha,
                                      shift=shimmer * 0.25)
                    # underline glide
                    prog = fx.ease_out_cubic(fx.clamp((t - w["start"]) / 0.26))
                    bw = int(a.shape[1] * 0.9 * prog)
                    if bw > 8:
                        bar = np.zeros((6, bw), F32)
                        grad = fx.smoothstep(0, 1, np.linspace(0, 1, bw))[None, :]
                        bar[:] = np.minimum(grad ** 0.35, 1)
                        bar[0] *= 0.15
                        bar[-1] *= 0.15
                        bx = px_ + int(a.shape[1] * 0.05)
                        by = py_ + a.shape[0] - int(a.shape[0] * 0.06)
                        fx.paint_gradient(frame, bar, bx, by, c0, c1, 90, 0.9 * alpha, "add")
                        fx.paint_alpha(frame, fx.blur(bar, 6) * 0.8, bx, by, c0, 0.5 * alpha, "add")
                else:
                    spoken = t >= w["end"]
                    col = (0.70, 0.75, 0.86) if spoken else (0.985, 0.99, 1.0)
                    sh2, ps = fx.halo(a, 11)
                    fx.paint_alpha(frame, sh2, px_ - ps + 4, py_ - ps + 10, (0, 0, 0), 0.5, "over")
                    fx.paint_alpha(frame, a, px_, py_, col, alpha, "over")

    # ------------------------------------------------------------------ icons
    def icons_layer(self, frame, t):
        for b in self.icons:
            if not (b["t"] <= t < b["t"] + b["dur"]):
                continue
            spr = self.sprites[b["icon"]]
            S = STYLE["icon_size"]
            ein = fx.spring(fx.clamp((t - b["t"]) / 0.46), 3.8, 6.2)
            eout = fx.clamp((b["t"] + b["dur"] - t) / 0.34)
            sc = (0.60 + 0.40 * ein) * (0.88 + 0.12 * fx.ease_out_cubic(eout))
            alpha = fx.smoothstep(0, 0.26, t - b["t"]) * fx.smoothstep(0, 1, eout)
            rot = math.radians(-14 * (1 - ein) + 2.4 * math.sin(t * 1.6))
            bob = 10 * math.sin(t * 2.0 + 1.3)
            r_ = self.rms(t)
            cx = W * 0.5 + 26 * math.sin(t * 0.9)
            cy = H * STYLE["icon_y"] + bob

            size = max(16, int(S * sc * (1 + 0.03 * r_)))
            a = _resize_rgba(spr, size)
            if abs(rot) > 0.01:
                a = _rotate_rgba(a, rot)
            h, w = a.shape[:2]
            x, y = int(cx - w / 2), int(cy - h / 2)
            c0 = PALETTE.get(b["icon"], PALETTE["star"])[0]
            padp = int(size * 0.22)
            pad_a = np.pad(a[..., 3], padp)
            halo = fx.blur(pad_a, size * 0.085) * 0.9
            fx.paint_alpha(frame, halo, x - padp, y - padp, c0,
                           alpha * (0.40 + 0.30 * r_), "add")
            fx.paste(frame, a[..., :3], a[..., 3], x, y, alpha, "over")

            k = fx.clamp((t - b["t"]) / 0.55)
            if k < 1:
                yy2, xx2 = np.mgrid[0:9, 0:9]
                dot = np.exp(-(((xx2 - 4) ** 2 + (yy2 - 4) ** 2) / 3.2)).astype(F32)
                for i in range(10):
                    ang = i * 0.63 + b["t"] * 1.7
                    rr = size * (0.48 + 0.34 * fx.ease_out_cubic(k))
                    fx.paint_alpha(frame, dot * (1 - k), int(cx + math.cos(ang) * rr),
                                   int(cy + math.sin(ang) * rr), c0, 0.95, "add")

    # ------------------------------------------------------------------ chrome
    def chrome(self, frame, t, accent):
        pad, y = 44, 40
        bar = np.full((4, W - pad * 2), 0.14, F32)
        fx.paint_alpha(frame, bar, pad, y, (1, 1, 1), 0.45, "over")
        pr = int((W - pad * 2) * min(1.0, t / self.dur))
        if pr > 0:
            pb = np.full((4, pr), 1.0, F32)
            pb *= fx.smoothstep(0, 1, np.linspace(0, 1, pr))[None, :] ** 0.4
            fx.paint_alpha(frame, pb, pad, y, accent, 0.95, "add")
            yy2, xx2 = np.mgrid[0:13, 0:13]
            dot = np.exp(-(((xx2 - 6) ** 2 + (yy2 - 6) ** 2) / 7.0)).astype(F32)
            fx.paint_alpha(frame, dot, pad + pr - 6, y - 4, (1, 1, 1), 0.85, "add")

    def waveform(self, frame, t, accent):
        """thin reactive waveform at the bottom — premium 'audio design' cue."""
        n_bars = 42
        bw, gap = 7, 12
        total = n_bars * gap
        x0 = (W - total) // 2
        base_y = int(H * 0.905)
        for i in range(n_bars):
            k = (i - n_bars / 2) / (n_bars / 2)
            tt = max(0.0, t - 0.0)
            sample = self.rms(tt - i * 0.035)
            h = int(8 + 78 * (0.25 + 0.75 * sample) * (1 - 0.45 * k * k))
            h = max(6, h)
            bar = np.zeros((h, bw), F32)
            ramp = np.linspace(1.0, 0.45, h)[:, None]
            bar[:] = ramp
            a = 0.55 + 0.45 * sample
            fx.paint_gradient(frame, bar, x0 + i * gap, base_y - h // 2, accent,
                              (accent[0] * 0.4, accent[1] * 0.4, accent[2] * 0.6), 90, a, "add")
        # progress dot row
        pr = min(1.0, t / self.dur)
        dp = np.zeros((6, int(total * pr) + 1), F32)
        dp[:] = 0.35
        fx.paint_alpha(frame, dp, x0, base_y + 62, (1, 1, 1), 0.35, "over")

    # ------------------------------------------------------------------ frame
    def frame(self, t: float) -> np.ndarray:
        accent = STYLE["hero_grad"][1]
        for b in self.icons:
            if b["t"] - 0.25 <= t < b["t"] + 1.1:
                accent = PALETTE.get(b["icon"], STYLE["hero_grad"])[0]
                break
        f = self.background(t, (accent, accent))
        self.icons_layer(f, t)
        self.captions(f, t)
        self.chrome(f, t, accent)
        self.waveform(f, t, accent)

        t_in = fx.clamp(t / 0.40)
        t_out = fx.clamp((self.dur - t) / 0.50)
        if t_in < 1:
            e = fx.ease_out_cubic(t_in)
            f = f * (0.30 + 0.70 * e) + (1 - e) * np.array([0.85, 0.92, 1.0], F32) * 0.06
        if t_out < 1:
            f = f * (0.20 + 0.80 * fx.ease_out_cubic(t_out))

        for g in self.groups:
            dt = t - g["start"]
            if 0 <= dt < 0.32:
                k = dt / 0.32
                leak = math.exp(-((k - 0.42) ** 2) / 0.055) * 0.085
                yy, xx = np.mgrid[0:H, 0:W].astype(F32)
                band = np.exp(-(((xx / W) - (0.15 + 0.7 * k)) ** 2) / 0.005) * (yy / H * 0.45 + 0.55)
                f = np.clip(f + band[..., None] * np.array(accent, F32) * leak, 0, 1)
                break

        for w in self.words:
            dt = t - w["start"]
            if w["hero"] and 0 <= dt < 0.20:
                f = _zoom(f, 1 + 0.018 * (1 - dt / 0.20) ** 2)
                break

        f = fx.bloom(f, 0.40, 0.60, 9.0)
        if "vig" not in self._cache:
            self._cache["vig"] = (1 - fx.vignette_mask(H, W) * 0.45)[..., None].astype(F32)
        f *= self._cache["vig"]
        f += fx.grain((H, W), int(t * FPS) % 10, 0.030)
        f *= 1.045
        f -= 0.018
        np.clip(f, 0, 1, out=f)
        return f


# --------------------------------------------------------------------------- utils
def _resize_rgba(a: np.ndarray, size: int) -> np.ndarray:
    from PIL import Image
    if a.shape[0] == size:
        return a
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")
    im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im).astype(F32) / 255.0


def _rotate_rgba(a: np.ndarray, rad: float) -> np.ndarray:
    from PIL import Image
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")
    im = im.rotate(math.degrees(rad), resample=Image.BICUBIC, expand=True)
    return np.asarray(im).astype(F32) / 255.0


def _zoom(f: np.ndarray, k: float) -> np.ndarray:
    if abs(k - 1) < 0.001:
        return f
    from PIL import Image
    h, w = f.shape[:2]
    nw, nh = int(w * k), int(h * k)
    im = Image.fromarray((np.clip(f, 0, 1) * 255).astype(np.uint8)).resize((nw, nh), Image.BILINEAR)
    a = np.asarray(im).astype(F32) / 255.0
    x0, y0 = (nw - w) // 2, (nh - h) // 2
    return a[y0:y0 + h, x0:x0 + w]
