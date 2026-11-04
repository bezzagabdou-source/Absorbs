"""Studio-grade kinetic caption renderer.

Frame-accurate, word-by-word Arabic captions + real image stickers (Twemoji),
bounce/pop/glow animation, a progress bar and a gentle readability scrim.
The overlay is drawn with Pillow and streamed as RGBA straight into FFmpeg,
so the source video is NEVER cut, sped up, zoomed or re-timed: only the
picture quality is touched (denoise / sharpen / mild grade / Lanczos upscale)
and the original audio is copied bit-for-bit.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .ffmpeg import ffmpeg_exe, probe
from .render import target_size

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "assets" / "fonts" / "NotoSansArabic.ttf"
EMOJI = ROOT / "assets" / "stickers"

GOLD = (255, 211, 78, 255)
WHITE = (255, 255, 255, 255)
INK = (6, 8, 14, 255)

# keyword in the actual speech → (Arabic label, Twemoji PNG, accent colour)
STICKERS = [
    (r"حار|حرار|شط|فلفل|نار|spicy|hot|حارة", "حار", "1f525.png", (255, 92, 48, 255)),
    (r"شيبس|بطاط|chips|كريس|مقرمش|قرمش", "شيبس", "1f35f.png", (255, 176, 32, 255)),
    (r"دوق|لذيذ|بنين|مليح|زوين|حلو|لذيد|نكهة", "بنين", "1f60b.png", (72, 214, 148, 255)),
    (r"بزاف|واو|ووو|مليون|100|amazing", "واو", "1f4af.png", (120, 160, 255, 255)),
    (r"جرب|شوف|جديد|عرض|new|try", "شوف", "1f44d.png", (178, 122, 255, 255)),
    (r"الله|بسم|حمد|الحمد", "بسم الله", "2728.png", (255, 232, 150, 255)),
    (r"برد|بارد|ثلج|ماء|شراب", "بارد", "1f975.png", (110, 200, 255, 255)),
]
DEFAULT_STICKER = ("✨", "2728.png", GOLD)
SPARKLE = "2728.png"


def shape(text: str) -> str:
    if not any("\u0600" <= c <= "\u06ff" for c in text):
        return text
    try:
        import arabic_reshaper  # noqa: PLC0415
        from bidi.algorithm import get_display  # noqa: PLC0415
        return get_display(arabic_reshaper.reshape(text))
    except Exception:
        return text


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def smooth(v):
    v = clamp(v)
    return v * v * (3 - 2 * v)


def group_words(words, max_words=4, gap=0.45, max_dur=2.6):
    groups, cur = [], []
    for w in words:
        if cur and (len(cur) >= max_words
                    or w["start"] - cur[-1]["end"] > gap
                    or w["end"] - cur[0]["start"] > max_dur):
            groups.append(cur)
            cur = []
        cur.append(w)
    if cur:
        groups.append(cur)
    out = []
    for g in groups:
        out.append({
            "words": [{"text": w["word"], "start": float(w["start"]),
                       "end": float(w["end"])} for w in g],
            "start": round(float(g[0]["start"]), 3),
            "end": round(float(g[-1]["end"]) + 0.18, 3),
        })
    for i in range(len(out) - 1):
        if out[i]["end"] > out[i + 1]["start"]:
            out[i]["end"] = round(max(out[i]["start"] + 0.3,
                                      out[i + 1]["start"] - 0.02), 3)
    return out


def sticker_for(text: str):
    for pattern, label, png, color in STICKERS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return label, png, color
    return DEFAULT_STICKER


class Assets:
    def __init__(self, W, H):
        self.W, self.H = W, H
        self.base = int(H * 0.031)          # ~60px
        self.active = int(self.base * 1.16)
        self.small = int(H * 0.020)
        self.font = ImageFont.truetype(str(FONT), self.base)
        self.font_active = ImageFont.truetype(str(FONT), self.active)
        self.font_small = ImageFont.truetype(str(FONT), self.small)
        self.S = int(H * 0.135)             # sticker size ~260px
        self._emoji_cache: dict[str, Image.Image] = {}
        self.scrim = self._make_scrim()

    def _make_scrim(self):
        im = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        y0, y1 = int(self.H * 0.66), int(self.H * 0.93)
        for y in range(y0, y1, 2):
            a = int(96 * ((y - y0) / (y1 - y0)) ** 1.6)
            d.line((0, y, self.W, y), fill=(0, 0, 0, a), width=2)
        return im

    def emoji(self, name: str) -> Image.Image:
        if name not in self._emoji_cache:
            p = EMOJI / name
            im = (Image.open(p).convert("RGBA") if p.exists()
                  else Image.new("RGBA", (72, 72), (255, 211, 78, 255)))
            self._emoji_cache[name] = im.resize((self.S, self.S), Image.LANCZOS)
        return self._emoji_cache[name]


def _tw(font, text):
    b = font.getbbox(text)
    return b[2] - b[0]


def _glow(layer, cx, cy, text, font, color, radius=13):
    """Small blurred patch = cheap glow instead of blurring the whole frame."""
    w = int(_tw(font, text) + 90)
    h = int(font.size * 2.4)
    patch = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(patch).text((w / 2, h / 2), text, font=font, fill=color,
                               anchor="mm", stroke_width=2, stroke_fill=color)
    patch = patch.filter(ImageFilter.GaussianBlur(radius))
    layer.paste(patch, (int(cx - w / 2), int(cy - h / 2)), patch)


class Renderer:
    def __init__(self, words, W, H, fps, duration, workdir):
        self.A = Assets(W, H)
        self.W, self.H, self.fps, self.duration = W, H, fps, duration
        self.caps = group_words(words)
        self.stickers = []
        for i, c in enumerate(self.caps):
            label, png, color = sticker_for(" ".join(w["text"] for w in c["words"]))
            a = c["start"] + 0.05
            b = min(c["end"] + 0.55, a + 2.3)
            right = i % 2 == 1
            self.stickers.append({
                "a": a, "b": b, "label": label, "png": png, "color": color,
                "x": int(W * (0.78 if right else 0.22)),
                # keep clear of the creator's own title burned into the top
                "y": int(H * (0.165 if right else 0.145)),
            })
        self.total_frames = int(round(duration * fps))
        self._measure()

    def _measure(self):
        for c in self.caps:
            disp = [shape(w["text"]) for w in c["words"]]
            font, font_active = self.A.font, self.A.font_active
            widths = [_tw(font, s) + 18 for s in disp]
            total = sum(widths) + 26 * (len(widths) - 1)
            # Long lines must never be clipped: shrink this line only.
            if total > self.W * 0.86:
                scale = (self.W * 0.86) / total
                size = max(22, int(self.A.base * scale))
                size_a = max(24, int(self.A.active * scale))
                font = ImageFont.truetype(str(FONT), size)
                font_active = ImageFont.truetype(str(FONT), size_a)
                widths = [_tw(font, s) + 18 for s in disp]
                total = sum(widths) + 26 * (len(widths) - 1)
            c["font"], c["font_active"] = font, font_active
            c["disp"], c["widths"], c["total"] = disp, widths, total
            cursor = (self.W + total) / 2
            centers = []
            for w in widths:
                centers.append(cursor - w / 2)
                cursor -= w + 26
            c["centers"] = centers

    def frame(self, idx):
        t = idx / self.fps
        W, H, A = self.W, self.H, self.A
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        im.alpha_composite(A.scrim)
        d = ImageDraw.Draw(im)

        # ── progress bar ──────────────────────────────────────────────
        py = int(H * 0.962)
        x0, x1 = int(W * 0.10), int(W * 0.90)
        d.line((x0, py, x1, py), fill=(255, 255, 255, 55), width=6)
        p = clamp(t / max(self.duration, 0.01))
        xe = x0 + int((x1 - x0) * p)
        d.line((x0, py, xe, py), fill=GOLD, width=6)
        d.ellipse((xe - 9, py - 9, xe + 9, py + 9), fill=GOLD)
        for x in (x0, x1):
            d.ellipse((x - 5, py - 5, x + 5, py + 5), fill=(255, 255, 255, 110))

        # ── stickers (image overlays with pop, bounce, rotation, glow) ──
        for s in self.stickers:
            if not (s["a"] <= t <= s["b"]):
                continue
            u = (t - s["a"]) / max(s["b"] - s["a"], 0.01)
            enter, leave = smooth(u / 0.12), smooth((1 - u) / 0.14)
            alpha = min(enter, leave)
            pop = 0.42 + 0.72 * smooth(u / 0.16) - 0.14 * smooth(u / 0.30)
            bounce = 26 * math.sin(math.pi * clamp(u)) * math.sin(u * 9)
            cx, cy = s["x"], s["y"] + int(bounce)

            # soft coloured halo
            halo = Image.new("RGBA", (A.S + 120, A.S + 120), (0, 0, 0, 0))
            hd = ImageDraw.Draw(halo)
            c = s["color"]
            for k in range(3):
                pad = 30 + k * 22
                hd.ellipse((pad, pad, halo.width - pad, halo.height - pad),
                           fill=(c[0], c[1], c[2], 24))
            halo = halo.filter(ImageFilter.GaussianBlur(22))
            im.alpha_composite(halo, (int(cx - halo.width / 2), int(cy - halo.height / 2)))

            base = A.emoji(s["png"])
            size = max(24, int(A.S * pop))
            pic = base.resize((size, size), Image.LANCZOS)
            rot = 9 * math.sin(u * 11) * (1 - u)
            pic = pic.rotate(rot, resample=Image.BICUBIC, expand=True)
            if alpha < 1:
                pic.putalpha(pic.getchannel("A").point(lambda v: int(v * alpha)))
            im.paste(pic, (int(cx - pic.width / 2), int(cy - pic.height / 2)), pic)

            # little label plate underneath
            label = shape(s["label"])
            lw = _tw(A.font_small, label) + 46
            lh = int(A.small * 1.9)
            ly = cy + int(A.S * 0.55)
            d.rounded_rectangle((cx - lw / 2, ly, cx + lw / 2, ly + lh),
                                radius=lh // 2,
                                fill=(10, 12, 18, int(215 * alpha)),
                                outline=(c[0], c[1], c[2], int(235 * alpha)), width=3)
            d.text((cx, ly + lh / 2), label, font=A.font_small,
                   fill=(255, 255, 255, int(255 * alpha)), anchor="mm",
                   stroke_width=2, stroke_fill=(0, 0, 0, int(220 * alpha)))

            # orbiting sparkles
            sp = A.emoji(SPARKLE).resize((46, 46), Image.LANCZOS)
            for j in range(2):
                ang = u * 5.5 + j * math.pi
                sx = int(cx + math.cos(ang) * A.S * 0.62)
                sy = int(cy + math.sin(ang) * A.S * 0.46)
                small = sp.rotate(ang * 40, resample=Image.BICUBIC, expand=True)
                small.putalpha(small.getchannel("A").point(
                    lambda v: int(v * alpha * 0.85)))
                im.paste(small, (int(sx - small.width / 2), int(sy - small.height / 2)), small)

        # ── kinetic captions ──────────────────────────────────────────
        for c in self.caps:
            if not (c["start"] - 0.02 <= t <= c["end"] + 0.02):
                continue
            enter = smooth((t - c["start"]) / 0.16)
            leave = smooth((c["end"] - t) / 0.07)
            alpha = min(enter, leave, 1.0)
            dy = int((1 - enter) * 34)
            layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ld = ImageDraw.Draw(layer)

            cy = int(H * 0.792) + dy
            pad_x, pad_y = 40, 26
            total = c["total"]
            fs = c["font"].size
            box = (int((W - total) / 2 - pad_x), int(cy - fs * 0.95 - pad_y),
                   int((W + total) / 2 + pad_x), int(cy + fs * 1.05 + pad_y))
            # drop shadow + main plate + accent edge
            sh = tuple(v + 8 for v in box)
            ld.rounded_rectangle(sh, radius=34, fill=(0, 0, 0, 105))
            ld.rounded_rectangle(box, radius=34, fill=(10, 12, 19, 228),
                                 outline=(255, 211, 78, 215), width=3)
            ld.rounded_rectangle((box[2] - 9, box[1] + 16, box[2] - 3, box[3] - 16),
                                 radius=3, fill=GOLD)

            active = 0
            for k, w in enumerate(c["words"]):
                if w["start"] <= t < w["end"]:
                    active = k
                    break
            else:
                spoken = [k for k, w in enumerate(c["words"]) if w["start"] <= t]
                active = spoken[-1] if spoken else 0

            for k, (disp, cx) in enumerate(zip(c["disp"], c["centers"])):
                is_active = k == active
                f = c["font_active"] if is_active else c["font"]
                color = GOLD if is_active else WHITE
                if is_active:
                    _glow(layer, cx, cy, disp, f, (255, 190, 40, 190), radius=15)
                ld.text((cx, cy), disp, font=f, fill=color, anchor="mm",
                        stroke_width=4 if is_active else 3, stroke_fill=INK)
                if is_active:
                    wdt = _tw(f, disp)
                    ld.rounded_rectangle((cx - wdt / 2 - 10, cy + fs * 0.72,
                                          cx + wdt / 2 + 10, cy + fs * 0.72 + 7),
                                         radius=3, fill=GOLD)

            layer.putalpha(layer.getchannel("A").point(lambda v: int(v * alpha)))
            im.alpha_composite(layer)

        return im


def render(src, out, words, workdir, limit=0.0):
    os.makedirs(workdir, exist_ok=True)
    info = probe(src)
    W, H = target_size(info, 0)
    fps = float(info.fps)
    duration = min(float(info.duration), limit) if limit else float(info.duration)
    r = Renderer(words, W, H, fps, duration, workdir)
    print(f"▸ {len(r.caps)} سطر · {sum(len(c['words']) for c in r.caps)} كلمة · "
          f"{r.total_frames} إطار · {W}×{H}@{fps:g}", flush=True)
    with open(os.path.join(workdir, "PRO_TIMELINE.json"), "w", encoding="utf-8") as f:
        json.dump({"captions": [{k: c[k] for k in ("words", "start", "end")}
                                for c in r.caps],
                   "stickers": r.stickers}, f, ensure_ascii=False, indent=2)

    graph = (
        "[0:v]hqdn3d=1.2:1.2:5:5,unsharp=5:5:0.5:5:5:0.0,"
        "eq=contrast=1.05:brightness=0.005:saturation=1.08:gamma=1.01,"
        f"scale={W}:{H}:flags=lanczos,format=yuv420p,setsar=1[base];"
        "[1:v]format=rgba[ov];"
        "[base][ov]overlay=0:0:format=auto:eof_action=endall:shortest=1,"
        "format=yuv420p[v]"
    )
    cmd = [ffmpeg_exe(), "-y", "-loglevel", "warning", "-i", src,
           "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", f"{W}x{H}",
           "-framerate", f"{fps:g}", "-i", "pipe:0",
           "-filter_complex", graph, "-map", "[v]"]
    if info.has_audio:
        cmd += ["-map", "0:a", "-c:a", "copy"]
    cmd += ["-t", f"{duration:.3f}", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p",
            "-r", f"{fps:g}", "-movflags", "+faststart", out]

    print("▸ رندر استوديو: كتيبة حركية + صور ملصقات + تأثيرات (الزمن الأصلي محفوظ)", flush=True)
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                         stderr=subprocess.PIPE)
    assert p.stdin is not None
    try:
        for i in range(r.total_frames):
            p.stdin.write(r.frame(i).tobytes())
            if i and i % 150 == 0:
                print(f"   {i}/{r.total_frames} إطار", flush=True)
    except BrokenPipeError:
        pass
    finally:
        try:
            p.stdin.close()
        except Exception:
            pass
    err = p.stderr.read().decode("utf-8", "replace") if p.stderr else ""
    rc = p.wait()
    if rc != 0:
        raise RuntimeError(f"ffmpeg خرج {rc}: {err[-2500:]}")
    return {"output": os.path.abspath(out), "duration": duration,
            "size": [W, H], "fps": fps, "frames": r.total_frames,
            "captions": len(r.caps),
            "words": sum(len(c["words"]) for c in r.caps),
            "bytes": os.path.getsize(out) if os.path.exists(out) else 0}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-i", "--input", required=True)
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--words", required=True, help="JSON word list with start/end")
    ap.add_argument("--workdir", default=None)
    ap.add_argument("--limit", type=float, default=0.0)
    a = ap.parse_args()
    raw = json.load(open(a.words, encoding="utf-8"))
    words = (raw.get("best_words") or raw.get("words") or []
             ) if isinstance(raw, dict) else raw
    words = [{"word": w.get("word", w.get("text", "")),
              "start": float(w["start"]), "end": float(w["end"])}
             for w in words if w.get("word") or w.get("text")]
    if not words:
        raise SystemExit("لا توجد كلمات في ملف التفريغ")
    wd = a.workdir or os.path.join(os.path.dirname(os.path.abspath(a.out)), "_pro")
    r = render(a.input, a.out, words, wd, a.limit)
    print(json.dumps(r, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
