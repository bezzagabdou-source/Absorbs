"""Shaping + rasterisation of Arabic/Latin text without any system libs.

* HarfBuzz (uharfbuzz)  -> correct Arabic joining, ligatures, bidi runs
* FreeType (freetype-py) -> anti-aliased glyph bitmaps
* Returns numpy alpha masks so the compositor can paint gradients / glow on top.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

import numpy as np

try:  # full engine (Linux / macOS / server)
    import freetype
    import uharfbuzz as hb
    BACKEND = "harfbuzz"
except Exception:  # Termux / minimal env: shape with arabic_reshaper + Pillow
    freetype = None
    hb = None
    BACKEND = "pillow"

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(os.path.dirname(HERE), "assets", "fonts")


class Face:
    def __init__(self, path: str):
        self.path = path
        if BACKEND == "harfbuzz":
            self.ft = freetype.Face(path)
            blob = hb.Blob.from_file_path(path)
            self.hb = hb.Font(hb.Face(blob))
        else:
            from PIL import ImageFont
            self._pil = {}
            self._ImageFont = ImageFont

    @lru_cache(maxsize=64)
    def shaped(self, text: str, size: int):
        if BACKEND != "harfbuzz":
            raise RuntimeError("shaping needs the harfbuzz backend")
        ft = self.ft
        ft.set_pixel_sizes(0, size)
        hb_font = self.hb
        hb_font.scale = (size, size)
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(hb_font, buf, {"kern": True, "liga": True, "calt": True})
        return list(zip(buf.glyph_infos, buf.glyph_positions)), buf.direction

    def glyph_bitmap(self, gid: int, size: int):  # harfbuzz backend only
        if BACKEND != "harfbuzz":
            raise RuntimeError("glyph_bitmap needs the harfbuzz backend")
        ft = self.ft
        ft.set_pixel_sizes(0, size)
        flags = freetype.FT_LOAD_RENDER | freetype.FT_LOAD_TARGET_NORMAL
        ft.load_glyph(gid, flags)
        bm = ft.glyph.bitmap
        if bm.rows == 0 or bm.width == 0:
            return None, 0, 0, 0, 0
        arr = np.array(bm.buffer, dtype=np.uint8).reshape(bm.rows, bm.pitch)
        arr = arr[:, : bm.width].astype(np.float32) / 255.0
        return arr, ft.glyph.bitmap_left, ft.glyph.bitmap_top, bm.width, bm.rows


_FACES: dict[str, Face] = {}
ALIASES = {
    "ar-black": "Cairo-Black.ttf",
    "ar-bold": "Cairo-Bold.ttf",
    "en-black": "Inter-Black.ttf",
    "en-bold": "Inter-Bold.ttf",
    "en-med": "Inter-Medium.ttf",
}


def face(name: str) -> Face:
    if name not in _FACES:
        _FACES[name] = Face(os.path.join(FONT_DIR, ALIASES.get(name, name)))
    return _FACES[name]


@dataclass
class Mask:
    """A rasterised run of text (alpha only, white)."""
    alpha: np.ndarray      # HxW float32 0..1
    width: int
    height: int
    baseline: int          # y of baseline inside alpha
    direction: str = "ltr"

    def rgba(self, rgb, a: float = 1.0) -> np.ndarray:
        h, w = self.alpha.shape
        out = np.empty((h, w, 4), dtype=np.float32)
        out[..., 0] = rgb[0]
        out[..., 1] = rgb[1]
        out[..., 2] = rgb[2]
        out[..., 3] = self.alpha * a
        return out


@lru_cache(maxsize=1)
def _isolated_map() -> dict:
    """Presentation-form -> base-letter map (for fonts without isolated forms)."""
    import unicodedata
    out = {}
    for cp in range(0xFE70, 0xFF00):
        try:
            name = unicodedata.name(chr(cp))
        except ValueError:
            continue
        for suffix in (" ISOLATED FORM", " FINAL FORM", " INITIAL FORM", " MEDIAL FORM"):
            if name.endswith(suffix):
                base = name[: -len(suffix)]
                try:
                    out[cp] = unicodedata.lookup(base)
                except KeyError:
                    pass
                break
    return out


def _fix_coverage(shaped: str, path: str) -> str:
    """Swap presentation forms the font does not map to their base letters."""
    from fontTools.ttLib import TTFont  # optional: only used for the check
    try:
        cmap = _cmap_cache(path)
    except Exception:
        return shaped
    m = _isolated_map()
    out = []
    for ch in shaped:
        cp = ord(ch)
        if cp not in cmap and cp in m:
            out.append(m[cp])
        else:
            out.append(ch)
    return "".join(out)


_CMAP = {}


def _cmap_cache(path: str):
    if path not in _CMAP:
        from fontTools.ttLib import TTFont
        _CMAP[path] = set(TTFont(path).getBestCmap().keys())
    return _CMAP[path]


def _pil_mask(text: str, font: str, size: int) -> Mask:
    """Fallback: pre-shape with arabic_reshaper + bidi, rasterise with Pillow."""
    from PIL import Image, ImageDraw
    import arabic_reshaper
    from bidi.algorithm import get_display

    f = face(font)
    if not hasattr(f, "_pil"):
        from PIL import ImageFont
        f._pil = {}
        f._ImageFont = ImageFont
    if size not in f._pil:
        f._pil[size] = f._ImageFont.truetype(f.path, size)
    pil_font = f._pil[size]
    shaped = get_display(arabic_reshaper.reshape(text))
    shaped = _fix_coverage(shaped, f.path)
    pad = size // 4 + 8
    asc, desc = pil_font.getmetrics()
    canvas_h = asc + desc + pad * 2
    probe = Image.new("L", (8, 8))
    d = ImageDraw.Draw(probe)
    try:
        w = int(d.textlength(shaped, font=pil_font))
    except Exception:
        w = int(size * 1.2 * len(shaped))
    canvas_w = max(8, w + pad * 2)
    im = Image.new("L", (canvas_w, canvas_h), 0)
    ImageDraw.Draw(im).text((pad, pad), shaped, font=pil_font, fill=255,
                            features=["-liga"] if False else None)
    a = np.asarray(im).astype(np.float32) / 255.0
    cols = np.where(a.max(axis=0) > 0.004)[0]
    rows = np.where(a.max(axis=1) > 0.004)[0]
    if len(cols) == 0:
        return Mask(alpha=np.zeros((8, 8), np.float32), width=8, height=8,
                    baseline=asc + pad, direction="rtl")
    a = a[:, cols[0]: cols[-1] + 1]
    keep_top = max(0, rows[0] - pad // 2)
    keep_bot = min(a.shape[0], rows[-1] + pad)
    a = a[keep_top:keep_bot]
    return Mask(alpha=np.ascontiguousarray(a), width=a.shape[1], height=a.shape[0],
                baseline=asc + pad - keep_top, direction="rtl")


@lru_cache(maxsize=2048)
def word_mask(text: str, font: str, size: int) -> Mask:
    """Rasterise one word (Arabic words shape correctly on their own).

    Result is tightly cropped left/right, vertical space kept relative to the
    font's ascender box so consecutive words share a baseline.
    """
    if BACKEND != "harfbuzz":
        return _pil_mask(text, font, size)
    f = face(font)
    glyphs, direction = f.shaped(text, size)
    ascender = int(size * 1.02)
    descender = int(size * 0.42)
    height = ascender + descender

    total = 0
    for info, pos in glyphs:
        total += pos.x_advance
    total = max(total, 1)
    pad = size // 6 + 4
    canvas_w = total + pad * 2
    acc = np.zeros((height, canvas_w), dtype=np.float32)

    pen = pad
    for info, pos in glyphs:
        bmp, left, top, w, h = f.glyph_bitmap(info.codepoint, size)
        if bmp is not None:
            x = pen + pos.x_offset + left
            y = ascender - pos.y_offset - top
            x0, y0 = max(x, 0), max(y, 0)
            x1, y1 = min(x + w, canvas_w), min(y + h, height)
            if x1 > x0 and y1 > y0:
                acc[y0:y1, x0:x1] += bmp[y0 - y : y1 - y, x0 - x : x1 - x]
        pen += pos.x_advance
    np.clip(acc, 0.0, 1.0, out=acc)

    cols = np.where(acc.max(axis=0) > 0.004)[0]
    if len(cols):
        acc = acc[:, cols[0]: cols[-1] + 1]
    return Mask(alpha=np.ascontiguousarray(acc), width=acc.shape[1],
                height=acc.shape[0], baseline=ascender, direction=direction)


def measure(text: str, font: str, size: int) -> tuple[int, int]:
    m = word_mask(text, font, size)
    return m.width, m.height


def space_advance(font: str, size: int) -> int:
    if BACKEND != "harfbuzz":
        return int(size * 0.28)
    f = face(font)
    glyphs, _ = f.shaped("x x", size)
    if len(glyphs) >= 3:
        return int(glyphs[1][1].x_advance)
    return int(size * 0.28)
