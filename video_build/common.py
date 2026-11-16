"""Shared utilities: paths, Arabic shaping, caption-card rendering, easing."""
import os
import math

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import arabic_reshaper
from bidi.algorithm import get_display

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "video_assets", "fonts")
EMOJI = os.path.join(ROOT, "video_assets", "emoji")
BUILD = os.path.join(ROOT, "video_build")

W, H, FPS = 1080, 1920, 60

FF = "/tmp/venv/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v9.0.2"

# palette
GOLD = (255, 201, 60, 255)
GREEN = (0, 255, 156, 255)
WHITE = (255, 255, 255, 255)
CYAN = (34, 227, 255, 255)
PINK = (255, 62, 150, 255)
MAGENTA = (233, 30, 160, 255)
BLACK = (0, 0, 0, 255)

_FONT_CACHE = {}


def font(size, name="Kufi900.ttf"):
    key = (name, size)
    if key not in _FONT_CACHE:
        _FONT_CACHE[key] = ImageFont.truetype(os.path.join(FONTS, name), size)
    return _FONT_CACHE[key]


def shape(text):
    """Reshape Arabic + apply bidi so PIL can draw it correctly."""
    return get_display(arabic_reshaper.reshape(text))


def text_w(draw, s, f):
    return draw.textlength(s, font=f)


def draw_rtl_line(img_draw, words, f, center_x, top, stroke=11,
                  shadow=True, glow_rgb=None):
    """Draw a line of (word, rgba) segments right-to-left, centered.

    Returns the line height.
    """
    shapes = [(shape(t), c) for t, c in words]
    space = max(f.getlength(" "), f.size * 0.26)
    widths = [text_w(img_draw, s, f) for s, _ in shapes]
    total = sum(widths) + space * (len(shapes) - 1)
    cx = center_x + total / 2.0

    bbox = img_draw.textbbox((0, 0), "أ", font=f, stroke_width=stroke)
    line_h = bbox[3] - bbox[1]

    for (s, c), w in zip(shapes, widths):
        x = cx - w
        if shadow:
            img_draw.text((x, top + 9), s, font=f, fill=(0, 0, 0, 200),
                          stroke_width=stroke, stroke_fill=(0, 0, 0, 200))
        img_draw.text((x, top), s, font=f, fill=c,
                      stroke_width=stroke, stroke_fill=(0, 0, 0, 242))
        cx -= (w + space)
    return line_h


def draw_ltr_line(img_draw, text, f, center_x, top, fill=GOLD, stroke=10,
                  chroma=None):
    """Draw Latin text centred (used for GTA VI / numbers)."""
    w = text_w(img_draw, text, f)
    x = center_x - w / 2.0
    bbox = img_draw.textbbox((0, 0), "Ag", font=f, stroke_width=stroke)
    line_h = bbox[3] - bbox[1]
    if chroma:
        dx, col = chroma
        img_draw.text((x - dx, top), text, font=f, fill=col,
                      stroke_width=0, stroke_fill=None)
        img_draw.text((x + dx, top), text, font=f, fill=col,
                      stroke_width=0, stroke_fill=None)
    img_draw.text((x, top + 9), text, font=f, fill=(0, 0, 0, 210),
                  stroke_width=stroke, stroke_fill=(0, 0, 0, 210))
    img_draw.text((x, top), text, font=f, fill=fill,
                  stroke_width=stroke, stroke_fill=(0, 0, 0, 245))
    return line_h


def fit_size(draw, words, max_w, start, minimum=46, name="Kufi900.ttf"):
    """Shrink font until the line fits inside max_w."""
    s = start
    while s > minimum:
        f = font(s, name)
        space = max(f.getlength(" "), s * 0.26)
        total = sum(text_w(draw, shape(t), f) for t, _ in words) + space * (len(words) - 1)
        if total <= max_w:
            return f
        s -= 4
    return font(minimum, name)


def ease_out_cubic(t):
    return 1 - pow(1 - t, 3)


def ease_out_back(t, s=1.9):
    t = min(max(t, 0.0), 1.0) - 1
    return 1 + t * t * ((s + 1) * t + s)


def rounded_rect(img, box, radius, fill=None, outline=None, width=1):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def paste_glow(base, icon, center, size, glow_rgb, alpha=95, spread=1.55):
    """Paste an emoji PNG with a soft coloured glow halo behind it."""
    icon = icon.resize((size, size), Image.LANCZOS)
    halo_r = int(size * spread / 2)
    margin = int(halo_r * 0.9)
    canvas = halo_r * 2 + margin * 2
    halo = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.ellipse((margin, margin, margin + halo_r * 2, margin + halo_r * 2),
               fill=glow_rgb[:3] + (alpha,))
    halo = halo.filter(ImageFilter.GaussianBlur(halo_r * 0.55))
    cx, cy = center
    base.alpha_composite(halo, (int(cx - canvas / 2), int(cy - canvas / 2)))
    x = int(cx - size / 2)
    y = int(cy - size / 2)
    base.alpha_composite(icon, (x, y))


def load_emoji(code):
    p = os.path.join(EMOJI, code + ".png")
    if not os.path.exists(p):
        return None
    return Image.open(p).convert("RGBA")


def run(cmd, check=True, quiet=False):
    import subprocess
    p = subprocess.run(cmd, capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError("CMD FAILED:\n" + " ".join(cmd) + "\n" + p.stderr[-4000:])
    if not quiet and p.stderr:
        for line in p.stderr.strip().splitlines()[-3:]:
            if "error" in line.lower() or "fail" in line.lower():
                print("  ff:", line)
    return p


def probe_dur(path):
    import re
    p = run([FF, "-hide_banner", "-i", path, "-f", "null", "-"], check=False, quiet=True)
    m = re.findall(r"time=(\d+):(\d+):([\d.]+)", p.stderr)
    if not m:
        return 0.0
    d = m[-1]
    return int(d[0]) * 3600 + int(d[1]) * 60 + float(d[2])
