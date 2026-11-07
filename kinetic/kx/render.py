"""kx.render — one command: audio/script in, cinematic vertical reel out.

    python -m kx.render --audio media/vo.mp3 --out out/reel.mp4

Stages: align -> score/SFX mix -> frames (multiprocess) -> ffmpeg master.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time

import numpy as np

from . import audio as kxaudio
import kx.scene as KSCENE
from .scene import Scene
from .story import SCRIPT, build_timeline

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "out")

_G = {}


def _init(timeline_path: str, bg_frames: str | None, frame_dir: str):
    _G["tl"] = json.load(open(timeline_path, encoding="utf-8"))
    _G["scene"] = Scene(_G["tl"], bg_frames)
    _G["dir"] = frame_dir


def _work(i: int):
    from PIL import Image
    t = i / KSCENE.FPS
    f = _G["scene"].frame(t)
    Image.fromarray((np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8)).save(
        os.path.join(_G["dir"], f"{i:05d}.jpg"), quality=95, subsampling=0)
    return i


def ffmpeg() -> str:
    return os.environ.get("FFMPEG") or kxaudio._ffmpeg()


def extract_broll(src: str, out_dir: str, fps_sample: int = 12, width: int | None = None,
                  height: int | None = None):
    width = width or KSCENE.W
    height = height or KSCENE.H
    """Grab the source video as a 12fps, graded-ready b-roll bed (cover crop)."""
    os.makedirs(out_dir, exist_ok=True)
    vf = (f"fps={fps_sample},scale={width}:{height}:force_original_aspect_ratio=increase,"
          f"crop={width}:{height}")
    subprocess.run([ffmpeg(), "-y", "-v", "error", "-i", src, "-vf", vf,
                    os.path.join(out_dir, "%05d.png")], check=True)
    # convert to npy for fast random access
    from PIL import Image
    for fn in sorted(os.listdir(out_dir)):
        if not fn.endswith(".png"):
            continue
        im = np.asarray(Image.open(os.path.join(out_dir, fn)).convert("RGB"))
        np.save(os.path.join(out_dir, fn.replace(".png", ".npy")), im)
        os.remove(os.path.join(out_dir, fn))
    return out_dir


def render(audio_path: str, out_path: str, broll: str | None = None,
           workers: int = 2, keep_frames: bool = False, bpm: float = 86.0):
    os.makedirs(OUT, exist_ok=True)
    t0 = time.time()

    # 1) timeline
    tl_path = os.path.join(OUT, "timeline.json")
    tl = build_timeline(audio_path, tl_path)
    dur = tl["duration"]
    n_frames = int(dur * KSCENE.FPS) + 1
    print(f"[align] {len(tl['words'])} words / {len(tl['groups'])} groups / {dur:.2f}s "
          f"({time.time() - t0:.1f}s)")

    # 2) b-roll bed
    bg_dir = None
    if broll:
        bg_dir = extract_broll(broll, os.path.join(OUT, "broll"))
        print(f"[b-roll] extracted ({time.time() - t0:.1f}s)")

    # 3) mix
    mix_wav = os.path.join(OUT, "mix.wav")
    mast_wav = os.path.join(OUT, "mix-master.wav")
    kxaudio.build_mix(audio_path, mix_wav, tl, bpm=bpm)
    kxaudio.master(mix_wav, mast_wav)
    print(f"[audio] score + sfx + duck + loudnorm ({time.time() - t0:.1f}s)")

    # 4) frames
    frame_dir = os.environ.get("KX_FRAMEDIR") or os.path.join(OUT, "frames")
    shutil.rmtree(frame_dir, ignore_errors=True)
    os.makedirs(frame_dir, exist_ok=True)
    import multiprocessing as mp
    step = max(1, n_frames // 12)
    with mp.Pool(workers, initializer=_init, initargs=(tl_path, bg_dir, frame_dir)) as pool:
        done = 0
        for _ in pool.imap_unordered(_work, range(n_frames), chunksize=4):
            done += 1
            if done % step == 0 or done == n_frames:
                el = time.time() - t0
                print(f"[frames] {done}/{n_frames}  {done / max(el, 1e-6):.1f} fps  "
                      f"eta {max(0, (n_frames - done) / max(done / el, 1e-6)):.0f}s", flush=True)
    print(f"[frames] done ({time.time() - t0:.1f}s)")

    # 5) encode
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    preset = os.environ.get("KX_PRESET", "slow")
    crf = os.environ.get("KX_CRF", "20")
    scale_filter = ("scale=in_range=full:out_range=tv" if KSCENE.RES == 1.0
                    else f"scale=in_range=full:out_range=tv,scale=1080:1920:flags=lanczos")
    cmd = [ffmpeg(), "-y", "-v", "error",
           "-framerate", str(KSCENE.FPS), "-i", os.path.join(frame_dir, "%05d.jpg"),
           "-i", mast_wav,
           "-map", "0:v:0", "-map", "1:a:0",
           "-vf", scale_filter,
           "-c:v", "libx264", "-preset", preset, "-crf", crf,
           "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.2",
           "-g", str(KSCENE.FPS * 2), "-bf", "2",
           "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
           "-color_range", "tv", "-x264-params", "aq-mode=3:deblock=-1,-1",
           "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
           "-movflags", "+faststart", "-shortest", out_path]
    subprocess.run(cmd, check=True)
    if not keep_frames:
        shutil.rmtree(frame_dir, ignore_errors=True)
    print(f"[done] {out_path}  ({time.time() - t0:.1f}s)")
    return out_path


def main(argv=None):
    ap = argparse.ArgumentParser(description="kinetic reel studio")
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out", default=os.path.join(OUT, "reel.mp4"))
    ap.add_argument("--broll", default=None, help="source video to sit under the type")
    ap.add_argument("--workers", type=int,
                    default=int(os.environ.get("KX_WORKERS", "2") or 2))
    ap.add_argument("--bpm", type=float, default=86.0)
    ap.add_argument("--keep-frames", action="store_true")
    a = ap.parse_args(argv)
    print(f"[cfg] {KSCENE.W}x{KSCENE.H} @ {KSCENE.FPS}fps  workers={a.workers}  "
          f"preset={os.environ.get('KX_PRESET', 'slow')}")
    render(a.audio, a.out, a.broll, a.workers, a.keep_frames, a.bpm)


if __name__ == "__main__":
    main()
