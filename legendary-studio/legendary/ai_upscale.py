"""Optional AI super-resolution hook — Real-ESRGAN (github.com/xinntao/Real-ESRGAN).

The models are large and cannot be downloaded inside this sandbox, so this is
an *optional* pre-pass: if `realesrgan-ncnn-vulkan` is on PATH (or set via
REALESRGAN_BIN), the source is upscaled with the neural model BEFORE the
legendary grade/montage. Otherwise we quietly fall back to Lanczos+unsharp.

Grab the binary + models from the project's GitHub releases on your machine:
  https://github.com/xinntao/Real-ESRGAN/releases
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile

from .ffmpeg import probe, run


def available() -> str | None:
    p = os.environ.get("REALESRGAN_BIN") or shutil.which("realesrgan-ncnn-vulkan")
    return p if p and os.path.exists(p) else None


def upscale(src: str, dst: str, scale: int = 2, model: str = "realesrgan-x4plus-anime",
            progress=print) -> str | None:
    """Return the upscaled path, or None when the binary is unavailable."""
    binary = available()
    if not binary:
        progress("ℹ️  Real-ESRGAN غير مثبّت — سيُستعمل Lanczos + unsharp (ممتاز أيضاً).")
        progress("   حمّله من: https://github.com/xinntao/Real-ESRGAN/releases")
        return None
    info = probe(src)
    with tempfile.TemporaryDirectory(prefix="esrgan_") as td:
        fin, fout = os.path.join(td, "in"), os.path.join(td, "out")
        os.makedirs(fin); os.makedirs(fout)
        progress("▸ استخراج الإطارات لـ Real-ESRGAN…")
        run(["-y", "-v", "error", "-i", src, "-vsync", "0",
             os.path.join(fin, "%07d.png")])
        progress(f"▸ Real-ESRGAN ({model}) …")
        subprocess.run([binary, "-i", fin, "-o", fout, "-n", model,
                        "-s", str(scale), "-f", "png"], check=True)
        progress("▸ إعادة تجميع الفيديو المُحسَّن…")
        run(["-y", "-v", "error", "-framerate", str(info.fps),
             "-i", os.path.join(fout, "%07d.png"),
             "-i", src, "-map", "0:v", "-map", "1:a?", "-c:v", "libx264",
             "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p",
             "-c:a", "copy", "-shortest", dst])
    return dst
