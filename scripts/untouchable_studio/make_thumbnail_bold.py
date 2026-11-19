#!/usr/bin/env python3
"""High-CTR close-up YouTube thumbnail: 'لا يخاف أحداً'."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_thumbnail import CACHE, FONTS, H, OUT_DIR, ROOT, W, ar, font  # noqa: E402

SRC = ROOT / "thumbnails" / "base_art_bold.png"
TEAL = (70, 232, 204)
ORANGE = (255, 138, 43)
RED = (255, 72, 48)
YELLOW = (255, 214, 76)


def fit(draw, text, path, target_w, hi=420, lo=24):
    best = font(path, lo)
    while lo <= hi:
        mid = (lo + hi) // 2
        f = font(path, mid)
        if draw.textlength(text, font=f) <= target_w:
            best, lo = f, mid + 1
        else:
            hi = mid - 1
    return best


def main() -> Image.Image:
    base = Image.open(SRC).convert("RGB")
    scale = max(W / base.width, H / base.height)
    nw, nh = int(base.width * scale + 0.5), int(base.height * scale + 0.5)
    base = base.resize((nw, nh), Image.LANCZOS)
    left = (nw - W) // 2
    top = int((nh - H) * 0.5)
    canvas = base.crop((left, top, left + W, top + H))

    canvas = ImageEnhance.Color(canvas).enhance(1.18)
    canvas = ImageEnhance.Contrast(canvas).enhance(1.16)
    canvas = canvas.filter(ImageFilter.UnsharpMask(radius=2.4, percent=110, threshold=2))
    canvas = canvas.convert("RGBA")

    # left-side shade for the headline
    span = 1080
    strip = Image.new("L", (span, 1))
    for x in range(span):
        t = 1.0 - x / span
        strip.putpixel((x, 0), int(248 * (t ** 1.15)))
    mask = strip.resize((span, H), Image.BILINEAR)
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shade.paste(Image.new("RGBA", (span, H), (2, 3, 4, 255)), (0, 0), mask)
    canvas = Image.alpha_composite(canvas, shade)

    # vignette
    vig = Image.new("L", (1, H))
    for y in range(H):
        t = abs(y - H * 0.5) / (H * 0.5)
        vig.putpixel((0, y), int(135 * (t ** 2.2)))
    canvas = Image.alpha_composite(canvas, Image.composite(
        Image.new("RGBA", (W, H), (0, 0, 0, 255)), Image.new("RGBA", (W, H), (0, 0, 0, 0)),
        vig.resize((W, H))))

    d = ImageDraw.Draw(canvas)
    HEAD = "IBMPlexSansArabic-Bold.ttf"
    RIGHT = 858          # headline block hugs the face
    MAXW = 700

    kicker = ar("عقلية المفترس الأسمى")
    l1 = ar("لا يخاف")
    l2 = ar("أحداً")
    sub = ar("قوة الصمت المطلق")
    tag = "4K UHD  ·  60 FPS  ·  05:00"

    # ---------- kicker ----------
    kf = font("IBMPlexSansArabic-SemiBold.ttf", 50)
    d.text((RIGHT, 236), kicker, font=kf, fill=TEAL + (255,), anchor="ra")
    kw = d.textlength(kicker, font=kf)
    d.rectangle([RIGHT - kw, 302, RIGHT, 307], fill=TEAL + (200,))
    d.rectangle([RIGHT - 120, 302, RIGHT, 307], fill=YELLOW + (255,))

    # ---------- headline (2 lines, hard drop shadow + bloom) ----------
    f1 = fit(d, l1, HEAD, MAXW, hi=340)
    f2 = fit(d, l2, HEAD, MAXW * 0.62, hi=340)
    size = min(f1.size, f2.size) * 1.02
    f1 = font(HEAD, int(size))
    f2 = font(HEAD, int(size))
    y1 = 330
    y2 = y1 + int(size * 1.12)

    txt = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(txt)
    td.text((RIGHT, y1), l1, font=f1, fill=(255, 255, 255, 255), anchor="ra")
    td.text((RIGHT, y2), l2, font=f2, fill=RED + (255,), anchor="ra")

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.text((RIGHT + 9, y1 + 13), l1, font=f1, fill=(0, 0, 0, 245), anchor="ra")
    sd.text((RIGHT + 9, y2 + 13), l2, font=f2, fill=(0, 0, 0, 245), anchor="ra")
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(7)))
    canvas = Image.alpha_composite(canvas, txt.filter(ImageFilter.GaussianBlur(14)))
    canvas = Image.alpha_composite(canvas, txt)

    d = ImageDraw.Draw(canvas)

    # ---------- red slash accent ----------
    acc = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ad = ImageDraw.Draw(acc)
    bar_y = y2 + int(size * 1.02)
    ad.polygon([(RIGHT - int(size * 2.9), bar_y), (RIGHT, bar_y),
                (RIGHT, bar_y + 9), (RIGHT - int(size * 2.9), bar_y + 9)],
               fill=RED + (235,))
    canvas = Image.alpha_composite(canvas, acc.filter(ImageFilter.GaussianBlur(12)))
    canvas = Image.alpha_composite(canvas, acc)
    d = ImageDraw.Draw(canvas)

    # ---------- sub line with yellow highlight ----------
    sf = font("IBMPlexSansArabic-Bold.ttf", 74)
    y_sub = y2 + int(size * 1.32)
    d.text((RIGHT, y_sub), sub, font=sf, fill=(240, 250, 248, 255), anchor="ra")
    sw = d.textlength(sub, font=sf)
    d.rectangle([RIGHT - sw - 4, y_sub + 96, RIGHT + 4, y_sub + 102], fill=YELLOW + (255,))

    # ---------- minimal bottom-left caption ----------
    d.text((84, H - 62), "4K UHD  ·  60 FPS  ·  05:00", font=font("JetBrainsMono[wght].ttf", 30),
           fill=(120, 200, 190, 150))
    acc2 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(acc2).ellipse([70, H - 48, 88, H - 30], fill=RED + (255,))
    canvas = Image.alpha_composite(canvas, acc2.filter(ImageFilter.GaussianBlur(16)))
    canvas = Image.alpha_composite(canvas, acc2)
    d = ImageDraw.Draw(canvas)

    # ---------- grain ----------
    arr = np.asarray(canvas.convert("RGB")).astype(np.int16)
    rng = np.random.default_rng(1234)
    arr = np.clip(arr + rng.normal(0, 3.4, arr.shape).astype(np.int16), 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


if __name__ == "__main__":
    img = main()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img.save(OUT_DIR / "youtube_thumbnail_bold_1920x1080.jpg", quality=94, subsampling=0)
    img.resize((1280, 720), Image.LANCZOS).save(OUT_DIR / "youtube_thumbnail_bold_1280x720.jpg",
                                               quality=95, subsampling=0)
    print("ok")
