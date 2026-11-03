"""Synthetic fantasy clip generator.

Creates a real vertical 9:16 video (nebula, light rays, particles, horizon)
plus a musical bed, so the whole pipeline can be exercised end-to-end without
any external media. Used by `--demo`, the self-test and the studio's preview.
"""
from __future__ import annotations

import os
import subprocess

import numpy as np

from .ffmpeg import ffmpeg_exe, run, write_wav
from .sfx import SR, music_bed


def make_demo_source(path: str, duration: float = 8.0, w: int = 360, h: int = 640,
                     fps: int = 30, bpm: float = 128.0, seed: int = 7) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    rng = np.random.default_rng(seed)
    ff = ffmpeg_exe()
    silent = os.path.join(os.path.dirname(os.path.abspath(path)), "_demo_video.mp4")
    cmd = [
        ff, "-hide_banner", "-loglevel", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", silent,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    yy = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    xx = np.linspace(0.0, 1.0, w, dtype=np.float32)[None, :]
    Y = np.broadcast_to(yy, (h, w))
    X = np.broadcast_to(xx, (h, w))
    stars_x = rng.random(130).astype(np.float32)
    stars_y = rng.random(130).astype(np.float32)
    stars_p = rng.random(130).astype(np.float32) * 6.28

    n_frames = int(duration * fps)
    try:
        for i in range(n_frames):
            t = i / fps
            u = t / duration
            # deep space gradient
            base = np.zeros((h, w, 3), np.float32)
            base[..., 0] = 12 + 30 * (1 - Y) + 8 * np.sin(X * 4 + t * 0.6)
            base[..., 1] = 9 + 18 * (1 - Y) + 6 * np.cos(Y * 5 + t * 0.4)
            base[..., 2] = 28 + 46 * Y + 12 * np.sin(X * 3 - t * 0.5)

            # three drifting nebula glows
            for k, (col, fx, fy) in enumerate((
                ((255, 120, 40), 0.30, 0.28),
                ((40, 200, 255), 0.72, 0.42),
                ((190, 70, 255), 0.48, 0.68),
            )):
                cx = fx + 0.18 * np.sin(t * (0.5 + 0.17 * k) + k * 2.1)
                cy = fy + 0.14 * np.cos(t * (0.42 + 0.2 * k) + k * 1.3)
                r2 = (X - cx) ** 2 + (Y - cy) ** 2 * 1.6
                glow = np.exp(-r2 / (0.035 + 0.02 * np.sin(t * 0.7 + k))) * (0.55 + 0.25 * np.sin(t * 1.3 + k))
                for c in range(3):
                    base[..., c] += glow * col[c] * (0.55 + 0.25 * u)

            # volumetric diagonal rays
            rays = np.maximum(0.0, np.sin((X * 9 + Y * 3) * 3.14 + t * 1.1)) ** 8
            base += rays[..., None] * np.array([18, 26, 42], np.float32) * (0.4 + 0.6 * u)

            # horizon + rising light
            horizon = np.exp(-((Y - 0.80) / 0.012) ** 2) * (0.6 + 0.4 * np.sin(t * 2))
            base += horizon[..., None] * np.array([90, 150, 210], np.float32)
            below = np.clip((Y - 0.80) / 0.2, 0, 1)[..., None]
            base *= (1.0 - 0.72 * below)

            # twinkling particles
            for sx, sy, sp in zip(stars_x, stars_y, stars_p):
                px, py = int(sx * (w - 1)), int(sy * (h - 1))
                tw = (0.5 + 0.5 * np.sin(t * 3 + sp))
                if py < h - 3 and px < w - 3:
                    base[py:py + 2, px:px + 2] += 150 * tw * (1 - 0.5 * sy)

            # grain
            base += rng.standard_normal((h, w, 1)).astype(np.float32) * 3.0
            frame = np.clip(base, 0, 255).astype(np.uint8)
            proc.stdin.write(frame.tobytes())
    finally:
        if proc.stdin:
            proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("demo video encode failed")

    wav = os.path.join(os.path.dirname(os.path.abspath(path)), "_demo_audio.wav")
    write_wav(wav, music_bed(duration, bpm, seed) * 0.55, SR)
    run(["-y", "-v", "error", "-i", silent, "-i", wav,
         "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", path])
    for tmp in (silent, wav):
        try:
            os.remove(tmp)
        except OSError:
            pass
    return path
