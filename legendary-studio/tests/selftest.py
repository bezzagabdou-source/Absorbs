"""End-to-end self-test: generates a clip, renders a legendary cut, verifies it.

    .venv/bin/python tests/selftest.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from legendary.analysis import build_plan, detect_onsets  # noqa: E402
from legendary.demo import make_demo_source  # noqa: E402
from legendary.ffmpeg import decode_pcm, ffmpeg_exe, probe  # noqa: E402
from legendary.render import PALETTES, Config, build_graph, render  # noqa: E402

ok = 0


def check(cond: bool, msg: str) -> None:
    global ok
    if not cond:
        raise AssertionError(msg)
    ok += 1
    print("  ✓ " + msg)


def main() -> int:
    print("LEGENDARY STUDIO — self-test")
    print("FFmpeg:", ffmpeg_exe())
    with tempfile.TemporaryDirectory(prefix="legendary_test_") as td:
        src = os.path.join(td, "source.mp4")
        out = os.path.join(td, "LEGEND.mp4")
        print("▸ generating 3s synthetic reel …")
        make_demo_source(src, duration=3.0, w=180, h=320, fps=24)
        info = probe(src)
        check(info.width == 180 and info.height == 320, "source resolution probed")
        check(info.duration >= 2.9, f"source duration probed ({info.duration:.2f}s)")
        check(info.has_audio, "source audio stream present")

        pcm = decode_pcm(src)
        onsets = detect_onsets(pcm)
        check(pcm.size >= 20000, "PCM decoding works")
        check(len(onsets) >= 1, f"onset detection found {len(onsets)} transients")
        plan = build_plan(3.0, 128, 2, onsets, [])
        check(len(plan.segments) >= 2, f"EDL has {len(plan.segments)} shots")
        check(abs(plan.cuts[-1] - 3.0) < 1e-6, "EDL covers full duration")
        check({s.style for s in plan.segments} >= {"hero", "impact"}, "style variety")

        for preset in PALETTES:
            g, ins = build_graph(
                Config(input=src, out=out, preset=preset, bars=True),
                info, plan, 360, 640, 24, td, safe=False)
            check("[v]" in g and len(ins) == 4, f"filtergraph builds for preset '{preset}'")

        print("▸ rendering …")
        report = render(Config(input=src, out=out, height=480, fps=24, crf=28,
                               x264_preset="ultrafast", max_duration=3.0,
                               workdir=os.path.join(td, "_work"),
                               progress=lambda m: None))
        check(os.path.isfile(out), "output MP4 created")
        check(os.path.getsize(out) > 20000, "output MP4 is non-trivial")
        res = probe(out)
        check(abs(res.duration - 3.0) < 0.35, f"output duration = {res.duration:.2f}s")
        check(res.width == 270 and res.height == 480, f"upscaled to {res.width}x{res.height}")
        check(res.has_audio, "output has mixed audio")
        check(len(report["shots"]) >= 2, "report contains shot list")

        wav = report["sfx"]
        import wave
        with wave.open(wav, "rb") as w:
            a = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768
        check(float(np.abs(a).max()) > 0.5, "soundtrack has real peak level")
        check(float(np.sqrt((a ** 2).mean())) > 0.05, "soundtrack is not silent")
        check(os.path.isfile(os.path.join(td, "_work", "report.json")), "report.json written")
        print(f"\n✅ {ok} checks passed. Sample output: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
