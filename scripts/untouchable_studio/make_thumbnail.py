#!/usr/bin/env python3
"""Render a YouTube-grade cinematic thumbnail with crisp RTL Arabic typography."""
from __future__ import annotations

import sys
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "untouchable"
FONTS = CACHE / "fonts"
SRC = ROOT / "thumbnails" / "base_art.png"
OUT_DIR = ROOT / "thumbnails"

W, H = 1920, 1080
INK = (8, 10, 12)
WHITE = (246, 251, 250)
TEAL = (70, 232, 204)
ORANGE = (255, 138, 43)
RED = (255, 62, 62)

RS = arabic_reshaper.ArabicReshaper(configuration={"delete_harakat": True, "support_ligatures": True})


def ar(text: str) -> str:
    return get_display(RS.reshape(text))


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def fit(draw: ImageDraw.ImageDraw, text: str, path: str, target_w: int, hi: int = 340, lo: int = 20) -> ImageFont.FreeTypeFont:
    best = font(path, lo)
    while lo <= hi:
        mid = (lo + hi) // 2
        f = font(path, mid)
        w = draw.textlength(text, font=f)
        if w <= target_w:
            best, lo = f, mid + 1
        else:
            hi = mid - 1
    return best


def gradient(w: int, h: int, stops):
    """Vertical/horizontal multi-stop gradient as RGBA image."""
    img = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(img)
    for i in range(h if len(stops) and stops[0][0] != "h" else w):
        pass
    return img


def horizontal_shade(w: int, h: int, start_x: int, peak_alpha: int):
    """Black gradient: transparent at start_x -> peak_alpha at right edge, with eased curve."""
    strip = Image.new("L", (w - start_x, 1))
    px = strip.load()
    span = max(1, (w - start_x) - 1)
    for x in range(w - start_x):
        t = x / span
        px[x, 0] = int(peak_alpha * (t ** 1.35))
    strip = strip.resize((w - start_x, h), Image.BILINEAR)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    black = Image.new("RGBA", (w - start_x, h), (4, 6, 9, 255))
    layer.paste(black, (start_x, 0), strip)
    return layer


def glow(layer: Image.Image, radius: int, strength: float = 1.4) -> Image.Image:
    g = layer.filter(ImageFilter.GaussianBlur(radius))
    if strength != 1.0:
        g = ImageEnhance.Brightness(g).enhance(strength)
    return g


VARIANTS = [
    # (headline word 1, headline word 2, kicker, sub)
    ("عقلية", "المُدَمِّر", "الذي لا يخشى شيئاً ولا يردُّ على الضعف", "تحوُّلٌ كامل في خمس دقائق"),
    ("لا يخاف", "أحداً", "السِّرُّ الذي يخفيه الأقوياء", "عقلية المفترس الأسمى"),
    ("الصَّمْت", "المُطْلَق", "سلاحُ من لا يُقْهَر", "عقلية المفترس الأسمى"),
]


def main(variant: int = 0) -> Image.Image:
    base = Image.open(SRC).convert("RGB")
    # cover-crop to 1920x1080
    scale = max(W / base.width, H / base.height)
    nw, nh = int(base.width * scale + 0.5), int(base.height * scale + 0.5)
    base = base.resize((nw, nh), Image.LANCZOS)
    left = (nw - W) // 2
    top = int((nh - H) * 0.45)
    canvas = base.crop((left, top, left + W, top + H))

    # punch: contrast + saturation + slight sharpen (thumbnail standard)
    canvas = ImageEnhance.Color(canvas).enhance(1.14)
    canvas = ImageEnhance.Contrast(canvas).enhance(1.12)
    canvas = ImageEnhance.Brightness(canvas).enhance(1.03)
    canvas = canvas.filter(ImageFilter.UnsharpMask(radius=2.2, percent=90, threshold=2))

    # soften the AI pseudo-text scribbles on the glass panels (they read as noise)
    def soften(box, radius=14, feather=40):
        nonlocal canvas
        x0, y0, x1, y1 = box
        region = canvas.crop(box).filter(ImageFilter.GaussianBlur(radius))
        mask = Image.new("L", (x1 - x0, y1 - y0), 0)
        md = ImageDraw.Draw(mask)
        md.rounded_rectangle([feather // 2, feather // 2, (x1 - x0) - feather // 2, (y1 - y0) - feather // 2],
                             radius=feather, fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(feather // 2))
        canvas.paste(region, (x0, y0), mask)

    soften((830, 380, 1010, 730))
    soften((100, 520, 300, 700), radius=10, feather=60)

    # darkening for text legibility
    canvas = Image.alpha_composite(canvas.convert("RGBA"), horizontal_shade(W, H, 700, 234))
    # bottom + top vignette
    vig = Image.new("L", (1, H))
    for y in range(H):
        t = abs(y - H * 0.5) / (H * 0.5)
        vig.putpixel((0, y), int(120 * (t ** 2.4)))
    canvas = Image.alpha_composite(canvas, Image.composite(
        Image.new("RGBA", (W, H), (0, 0, 0, 255)),
        Image.new("RGBA", (W, H), (0, 0, 0, 0)),
        vig.resize((W, H))))

    d = ImageDraw.Draw(canvas)

    # ---------- copy ----------
    c1, c2, ck, cs = VARIANTS[variant % len(VARIANTS)]
    kicker = ar(ck)
    w1, w2 = ar(c1), ar(c2)
    sub = ar(cs)
    tag = "4K UHD  ·  60 FPS  ·  05:00"
    act = "ACT IV / V"

    RIGHT = 1836
    HEAD_FONT = "IBMPlexSansArabic-Bold.ttf"
    SUB_FONT = "IBMPlexSansArabic-Bold.ttf"
    KICK_FONT = "IBMPlexSansArabic-SemiBold.ttf"
    MONO_FONT = "JetBrainsMono[wght].ttf"
    MAXW = 900

    # ---- kicker ----
    kf = font(KICK_FONT, 48)
    kw = d.textlength(kicker, font=kf)
    ky = 176
    d.text((RIGHT, ky), kicker, font=kf, fill=TEAL + (255,), anchor="ra")
    ul_y = ky + 90
    d.rectangle([RIGHT - kw - 4, ul_y, RIGHT, ul_y + 4], fill=(70, 232, 204, 205))
    d.rectangle([RIGHT - 110, ul_y, RIGHT, ul_y + 4], fill=ORANGE + (255,))

    # ---- headline: fit the WHOLE phrase, then split colours on one shared baseline ----
    full = w1 + " " + w2
    fh = fit(d, full, HEAD_FONT, MAXW, hi=300)
    size = fh.size
    gap = size * 0.26
    ww1 = d.textlength(w1, font=fh)
    ww2 = d.textlength(w2, font=fh)
    total = ww1 + gap + ww2
    x_right = RIGHT
    baseline = ul_y + int(size * 1.02)

    txt = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(txt)
    td.text((x_right, baseline), w1, font=fh, fill=(255, 255, 255, 255), anchor="rs")
    td.text((x_right - ww1 - gap, baseline), w2, font=fh, fill=ORANGE + (255,), anchor="rs")

    # deep drop shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.text((x_right + 7, baseline + 11), w1, font=fh, fill=(0, 0, 0, 240), anchor="rs")
    sd.text((x_right - ww1 - gap + 7, baseline + 11), w2, font=fh, fill=(0, 0, 0, 240), anchor="rs")
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(5)))
    # tight bloom
    canvas = Image.alpha_composite(canvas, txt.filter(ImageFilter.GaussianBlur(9)))
    canvas = Image.alpha_composite(canvas, txt)
    d = ImageDraw.Draw(canvas)

    # ---- sub-headline ----
    sf = fit(d, sub, SUB_FONT, max(420, int(total * 0.86)), hi=120)
    y_sub = baseline + int(size * 0.60)
    st = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(st).text((x_right, y_sub), sub, font=sf, fill=(236, 246, 244, 255), anchor="rs")
    canvas = Image.alpha_composite(canvas, st.filter(ImageFilter.GaussianBlur(7)))
    canvas = Image.alpha_composite(canvas, st)
    d = ImageDraw.Draw(canvas)

    # ---- neon divider ----
    y_div = y_sub + int(sf.size * 1.75)
    x0 = x_right - min(total + 60, 940)
    div = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(div)
    for x in range(x0, x_right):
        t = (x - x0) / (x_right - x0)
        col = (int(60 + 195 * t), int(228 - 70 * t), int(200 - 165 * t), int(30 + 225 * (t ** 1.8)))
        dd.line([(x, y_div), (x, y_div + 7)], fill=col)
    canvas = Image.alpha_composite(canvas, div.filter(ImageFilter.GaussianBlur(11)))
    canvas = Image.alpha_composite(canvas, div)
    d = ImageDraw.Draw(canvas)

    d.text((x0 + 2, y_div + 24), act, font=font(MONO_FONT, 30), fill=(150, 232, 216, 230))

    # ---- bottom-left spec pill ----
    pf = font(MONO_FONT, 32)
    pw = d.textlength(tag, font=pf)
    px0, py0 = 84, H - 118
    pill = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    pd.rounded_rectangle([px0, py0, px0 + pw + 62, py0 + 66], radius=33,
                         fill=(6, 14, 16, 176), outline=(70, 232, 204, 190), width=2)
    canvas = Image.alpha_composite(canvas, pill)
    d = ImageDraw.Draw(canvas)
    d.text((px0 + 31, py0 + 17), tag, font=pf, fill=(226, 250, 246, 255))

    # ---- red accent dot (eye magnet) ----
    acc = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(acc).ellipse([px0 + pw + 96, py0 + 18, px0 + pw + 128, py0 + 50], fill=RED + (255,))
    canvas = Image.alpha_composite(canvas, acc.filter(ImageFilter.GaussianBlur(18)))
    canvas = Image.alpha_composite(canvas, acc)

    # ---- final film grain + vignette ----
    import numpy as np
    arr = np.asarray(canvas.convert("RGB")).astype(np.int16)
    rng = np.random.default_rng(77)
    arr = np.clip(arr + rng.normal(0, 3.1, arr.shape).astype(np.int16), 0, 255).astype(np.uint8)
    final = Image.fromarray(arr)
    final = ImageEnhance.Contrast(final).enhance(1.05)
    return final


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    only = int(sys.argv[1]) if len(sys.argv) > 1 else None
    for i in range(len(VARIANTS) if only is None else 1):
        idx = i if only is None else only
        img = main(idx)
        suffix = "" if idx == 0 else f"_v{idx + 1}"
        
        img.save(OUT_DIR / f"youtube_thumbnail{suffix}_1920x1080.jpg", quality=94, subsampling=0)
        img.resize((1280, 720), Image.LANCZOS).save(OUT_DIR / f"youtube_thumbnail{suffix}_1280x720.jpg", quality=95, subsampling=0)
        print("ok", suffix or "_v1")
    sys.exit(0)
