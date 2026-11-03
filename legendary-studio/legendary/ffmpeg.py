"""FFmpeg bridge.

The engine is FFmpeg (github.com/FFmpeg/FFmpeg). We use the system binary when
available, otherwise the static GPL build shipped by `imageio-ffmpeg`, so the
studio works on a bare machine with no root access.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from typing import Callable

import numpy as np

__all__ = [
    "ffmpeg_exe", "run", "probe", "decode_pcm", "scene_times",
    "write_wav", "MediaInfo",
]


def ffmpeg_exe() -> str:
    env = os.environ.get("FFMPEG_BINARY")
    if env and os.path.exists(env):
        return env
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "FFmpeg غير موجود. نفّذ ./setup.sh أو ثبّت ffmpeg أو اضبط FFMPEG_BINARY"
        ) from exc


def run(
    args: list[str],
    *,
    check: bool = True,
    stdin=None,
    capture: bool = True,
    progress: Callable[[str], None] | None = None,
) -> subprocess.CompletedProcess:
    """Run ffmpeg with -hide_banner and return the completed process."""
    cmd = [ffmpeg_exe(), "-hide_banner", *args]
    if progress:
        progress("$ " + " ".join(cmd[:6]) + " …")
    proc = subprocess.run(
        cmd,
        input=stdin,
        stdin=subprocess.DEVNULL if stdin is None else None,
        capture_output=capture,
        check=False,
    )
    if check and proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", "replace")
        raise RuntimeError(f"FFmpeg failed ({proc.returncode}):\n{err[-3500:]}")
    return proc


@dataclass
class MediaInfo:
    duration: float
    width: int
    height: int
    fps: float
    has_audio: bool

    @property
    def vertical(self) -> bool:
        return self.height > self.width


def _duration_from_ffmpeg(text: str) -> float:
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    if not m:
        return 0.0
    h, mi, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
    return h * 3600 + mi * 60 + s


def probe(path: str) -> MediaInfo:
    """Read stream metadata without ffprobe (ffmpeg -i prints everything)."""
    p = run(["-i", path], check=False)
    text = (p.stderr or b"").decode("utf-8", "replace")
    duration = _duration_from_ffmpeg(text)
    vm = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", text)
    width, height = (int(vm.group(1)), int(vm.group(2))) if vm else (720, 1280)
    fm = re.search(r"(\d+(?:\.\d+)?)\s*(?:fps|tbr)", text)
    fps = float(fm.group(1)) if fm else 30.0
    if not (1 <= fps <= 240):
        fps = 30.0
    if duration <= 0:
        # last resort: decode and count frames/time
        p2 = run(["-v", "error", "-i", path, "-f", "null", "-"], check=False)
        duration = _duration_from_ffmpeg((p2.stderr or b"").decode("utf-8", "replace"))
    return MediaInfo(
        duration=max(duration, 0.2),
        width=width,
        height=height,
        fps=fps,
        has_audio="Audio:" in text,
    )


def decode_pcm(path: str, sr: int = 8000, max_seconds: float = 180.0) -> np.ndarray:
    """Mono float32 PCM for onset/beat analysis."""
    p = run(
        ["-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(sr),
         "-t", str(max_seconds), "-f", "s16le", "-"],
        check=False,
    )
    raw = p.stdout or b""
    if not raw:
        return np.zeros(0, dtype=np.float32)
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0


def scene_times(path: str, threshold: float = 0.35, max_seconds: float = 90.0) -> list[float]:
    """FFmpeg's own scene-change detector (select=gt(scene,…))."""
    p = run(
        ["-v", "info", "-i", path, "-t", str(max_seconds), "-an",
         "-vf", f"select='gt(scene,{threshold})',showinfo", "-f", "null", "-"],
        check=False,
    )
    text = (p.stderr or b"").decode("utf-8", "replace")
    times = [float(x) for x in re.findall(r"pts_time:\s*(\d+(?:\.\d+)?)", text)]
    return sorted({round(t, 3) for t in times if t > 0.2})


def write_wav(path: str, audio: np.ndarray, sr: int = 48000) -> str:
    """Write a float32 (N,2) or (N,) array as 16-bit PCM WAV."""
    import wave

    a = np.asarray(audio, dtype=np.float32)
    if a.ndim == 1:
        a = np.repeat(a[:, None], 2, axis=1)
    a = np.nan_to_num(a, nan=0.0, posinf=0.0, neginf=0.0)
    peak = float(np.max(np.abs(a))) or 1.0
    if peak > 1.0:
        a = a / peak
    pcm = (a * 32767.0).clip(-32768, 32767).astype("<i2")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return path


def probe_demo() -> None:
    """Tiny self-check used by setup.sh (encoders/decoders really work)."""
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, "x.mp4")
        run(["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=10:d=0.3",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", out])
        info = probe(out)
        assert info.width == 64 and info.duration > 0
    print("   libx264 OK · static FFmpeg ready")
