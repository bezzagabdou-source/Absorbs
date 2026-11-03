"""Command line interface.

    .venv/bin/python -m legendary.cli --demo
    .venv/bin/python -m legendary.cli -i myreel.mp4 -o out/LEGEND.mp4 --preset fantasy --height 1920
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from .ai_upscale import upscale as ai_upscale
from .demo import make_demo_source
from .render import PALETTES, Config, render


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="legendary",
        description="LEGENDARY STUDIO — مونتاج سينمائي تلقائي بالذكاء الإيقاعي + تصميم صوتي",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("-i", "--input", help="مسار الفيديو المصدر")
    ap.add_argument("-o", "--out", default="out/LEGENDARY_CUT.mp4", help="الفيديو الناتج")
    ap.add_argument("--demo", action="store_true", help="ولّد فيديو تجريبي خيالي وطبّق عليه المونتاج كاملاً")
    ap.add_argument("--preset", choices=sorted(PALETTES), default="epic")
    ap.add_argument("--bpm", type=float, default=128.0)
    ap.add_argument("--beats-per-cut", type=int, default=2)
    ap.add_argument("--height", type=int, default=0, help="ارتفاع الإخراج (0 = تلقائي 1920/1080، 3840 = 4K)")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--title", default="مونتاج أسطوري")
    ap.add_argument("--subtitle", default="الأسطورة تبدأ الآن")
    ap.add_argument("--outro", default="ABSORBS · LEGENDARY CUT")
    ap.add_argument("--no-bars", action="store_true", help="إلغاء الشرائط السينمائية")
    ap.add_argument("--no-sfx", action="store_true", help="بدون المؤثرات الصوتية المولّدة")
    ap.add_argument("--stems", action="store_true", help="صدّر أيضاً مسارات الموسيقى والمؤثرات منفصلة WAV")
    ap.add_argument("--sfx-gain", type=float, default=1.0)
    ap.add_argument("--orig-gain", type=float, default=0.55, help="مستوى صوت الفيديو الأصلي")
    ap.add_argument("--crf", type=int, default=19, help="جودة H.264 (أقل = أفضل)")
    ap.add_argument("--x264-preset", default="medium")
    ap.add_argument("--max-duration", type=float, default=0.0)
    ap.add_argument("--no-scene-snap", action="store_true")
    ap.add_argument("--ai-upscale", action="store_true",
                    help="ارفع الدقة بـ Real-ESRGAN قبل المونتاج (إن كان مثبّتاً)")
    ap.add_argument("--workdir", default=None)
    ap.add_argument("--json", action="store_true", help="اطبع التقرير JSON فقط")
    return ap


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    inp = args.input
    if args.demo or not inp:
        if not inp:
            print("⚠️  لم تحدد --input، سيتم استعمال الفيديو التجريبي المولّد (--demo)")
        work = os.path.join(os.path.dirname(os.path.abspath(args.out)), "_demo")
        os.makedirs(work, exist_ok=True)
        inp = os.path.join(work, "source.mp4")
        if not os.path.exists(inp) or args.demo:
            print("▸ توليد فيديو خيالي تجريبي 9:16 …")
            make_demo_source(inp, duration=8.0)
    if not os.path.isfile(inp):
        print(f"❌ الملف غير موجود: {inp}", file=sys.stderr)
        return 2

    def log(msg: str) -> None:
        if not args.json:
            print(msg, flush=True)

    if args.ai_upscale:
        boosted = os.path.join(os.path.dirname(os.path.abspath(args.out)), "_ai_source.mp4")
        better = ai_upscale(inp, boosted, progress=log)
        if better:
            inp = better

    cfg = Config(
        input=inp,
        out=args.out,
        workdir=args.workdir,
        preset=args.preset,
        bpm=args.bpm,
        beats_per_cut=args.beats_per_cut,
        height=args.height,
        fps=args.fps,
        seed=args.seed,
        title=args.title,
        subtitle=args.subtitle,
        outro=args.outro,
        bars=not args.no_bars,
        no_sfx=args.no_sfx,
        sfx_gain=args.sfx_gain,
        orig_gain=args.orig_gain,
        crf=args.crf,
        x264_preset=args.x264_preset,
        stems=args.stems,
        scene_snap=not args.no_scene_snap,
        max_duration=args.max_duration,
        progress=log,
    )
    try:
        report = render(cfg)
    except Exception as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("\n🎬 تقرير المونتاج:")
        print(f"   اللقطات: {len(report['shots'])} | الإخراج: {report['output_size'][0]}×{report['output_size'][1]}"
              f" | المدة: {report['duration']}s | الحجم: {report['size_bytes']/1048576:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
