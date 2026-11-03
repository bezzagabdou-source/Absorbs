"""Beat / transient analysis → an edit decision list (EDL).

Cuts are laid out on a musical grid (BPM × beats-per-cut), then snapped to the
nearest real audio transient or FFmpeg scene change. That is what makes the
result feel "edited to the beat" instead of randomly sliced.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

STYLES = ("hero", "impact", "glide", "glitch", "slow", "rush")

_SPEED = {
    "hero": 1.00,
    "impact": 0.82,   # punch-in speed-up
    "glide": 1.00,
    "glitch": 0.90,
    "slow": 1.38,     # dreamy slow motion
    "rush": 0.72,
}


@dataclass
class Segment:
    index: int
    start: float
    end: float
    style: str
    speed: float
    intensity: float
    cut: bool  # does a hard cut happen at `start`?

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass
class EditPlan:
    duration: float
    bpm: float
    beat: float
    cuts: list[float]          # all boundaries, including 0 and duration
    segments: list[Segment]
    onsets: list[float]
    scene_changes: list[float]


def detect_onsets(pcm: np.ndarray, sr: int = 8000, min_gap: float = 0.14) -> list[float]:
    """Energy-flux onset detection on a mono 8 kHz signal."""
    if pcm.size < sr // 4:
        return []
    hop, win = 128, 256
    n = 1 + (pcm.size - win) // hop
    if n < 4:
        return []
    # frame energy (fast sliding sum via cumulative energy)
    energy = np.cumsum(np.concatenate(([0.0], pcm.astype(np.float64) ** 2)))
    idx = np.arange(n) * hop
    env = np.sqrt(np.maximum(energy[idx + win] - energy[idx], 0) / win)
    # flux = positive change of energy + a touch of high-frequency activity
    flux = np.maximum(np.diff(env, prepend=env[0]), 0.0)
    if flux.max() <= 0:
        return []
    flux = flux / (flux.max() + 1e-9)
    smooth = np.convolve(flux, np.ones(3) / 3, mode="same")
    thr = float(np.percentile(smooth, 82))
    gap = max(1, int(min_gap * sr / hop))
    picks: list[int] = []
    for i in range(1, n - 1):
        if smooth[i] < max(thr, 0.045):
            continue
        if smooth[i] >= smooth[i - 1] and smooth[i] > smooth[i + 1]:
            if picks and i - picks[-1] < gap:
                if smooth[i] > smooth[picks[-1]]:
                    picks[-1] = i
                continue
            picks.append(i)
    return [round(i * hop / sr, 3) for i in picks]


def _snap(t: float, anchors: list[float], tol: float) -> float:
    if not anchors:
        return t
    best, dist = t, tol + 1
    for a in anchors:
        d = abs(a - t)
        if d < dist:
            best, dist = a, d
    return best if dist <= tol else t


def build_plan(
    duration: float,
    bpm: float = 128.0,
    beats_per_cut: int = 2,
    onsets: list[float] | None = None,
    scene_changes: list[float] | None = None,
    seed: int = 7,
    max_segments: int = 48,
    scene_snap: bool = True,
) -> EditPlan:
    duration = max(float(duration), 0.6)
    beat = 60.0 / max(40.0, min(float(bpm), 220.0))
    step = beat * max(1, int(beats_per_cut))
    while duration / step > max_segments:
        step *= 2

    onsets = sorted(o for o in (onsets or []) if 0.2 < o < duration - 0.15)
    scenes = sorted(s for s in (scene_changes or []) if 0.2 < s < duration - 0.15)
    anchors = sorted(set(onsets + (scenes if scene_snap else [])))

    tol = min(0.16, step * 0.34)
    raw = [i * step for i in range(1, int(duration / step) + 1)]
    snapped = sorted({round(_snap(t, anchors, tol), 3) for t in raw})
    # keep a minimum shot length so nothing becomes a 2-frame flicker
    min_shot = max(0.34, beat * 0.75)
    boundaries: list[float] = [0.0]
    for t in snapped:
        if t - boundaries[-1] >= min_shot and duration - t >= min_shot:
            boundaries.append(t)
    if duration - boundaries[-1] < min_shot and len(boundaries) > 1:
        boundaries.pop()
    boundaries.append(duration)

    rng = np.random.default_rng(seed)
    pattern = ["hero", "impact", "glide", "hero", "glitch", "slow", "impact", "rush"]
    segments: list[Segment] = []
    for i, (a, b) in enumerate(zip(boundaries[:-1], boundaries[1:])):
        style = pattern[i % len(pattern)]
        if i and rng.random() < 0.22:
            style = pattern[int(rng.integers(0, len(pattern)))]
        intensity = float(min(1.0, 0.35 + 0.65 * (b / duration) + 0.12 * rng.random()))
        segments.append(Segment(i, a, b, style, _SPEED[style], intensity, i > 0))

    return EditPlan(duration, bpm, beat, boundaries, segments, onsets, scenes)
