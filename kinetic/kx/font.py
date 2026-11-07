"""Shaping + rasterisation of Arabic/Latin text without any system libs.

* HarfBuzz (uharfbuzz)  -> correct Arabic joining, ligatures, bidi runs
* FreeType (freetype-py) -> anti-aliased glyph bitmaps
* Returns numpy alpha masks so the compositor can paint gradients / glow on top.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

import freetype
import numpy as np
import uharfbuzz as hb

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(os.path.dirname(HERE), "assets", "fonts")


class Face:
    def __init__(self, path: str):
        self.path = path
        self.ft = freetype.Face(path)
        blob = hb.Blob.from_file_path(path)
        self.hb = hb.Font(hb.Face(blob))

    @lru_cache(maxsize=64)
    def shaped(self, text: str, size: int):
        ft = self.ft
        ft.set_pixel_sizes(0, size)
        hb_font = self.hb
        hb_font.scale = (size, size)
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(hb_font, buf, {"kern": True, "liga": True, "calt": True})
        return list(zip(buf.glyph_infos, buf.glyph_positions)), buf.direction

    def glyph_bitmap(self, gid: int, size: int):
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


@lru_cache(maxsize=2048)
def word_mask(text: str, font: str, size: int) -> Mask:
    """Rasterise one word (Arabic words shape correctly on their own).

    Result is tightly cropped left/right, vertical space kept relative to the
    font's ascender box so consecutive words share a baseline.
    """
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
    f = face(font)
    glyphs, _ = f.shaped("x x", size)
    if len(glyphs) >= 3:
        return int(glyphs[1][1].x_advance)
    return int(size * 0.28)
