"""The LEGENDARY render engine.

Builds one FFmpeg filtergraph that does, per shot:
  time-remapping (speed ramps) → Lanczos upscale → denoise → unsharp →
  cinematic colour grade → Ken-Burns zoom/pan → camera shake → RGB-split
  glitch bursts → film grain → vignette → letterbox
then concatenates the shots, adds white flash frames on every cut, animated
light leaks, Arabic animated titles, and mixes the original audio with the
procedurally generated cinematic soundtrack (sidechain ducked).

No NLE, no GUI, no cloud: one deterministic command, reproducible anywhere.
"""
from __future__ import annotations

import json
import os
import shutil
from dataclasses import asdict, dataclass, field
from typing import Callable

import numpy as np

from .analysis import EditPlan, Segment, build_plan, detect_onsets
from .ffmpeg import MediaInfo, decode_pcm, probe, run, scene_times, write_wav
from .sfx import SR, build_soundtrack

PALETTES = {
    "epic": dict(contrast=1.16, brightness=0.012, saturation=1.30, gamma=1.02,
                 rs=0.09, gs=0.00, bs=-0.08, rm=0.04, bm=0.07,
                 grain=6, flash=0.80, leak=0.17, zoom=0.16, glitch=9, shake=6,
                 leak1="0x2b0b52", leak2="0xff7a2f", leak3="0x00c8ff"),
    "fantasy": dict(contrast=1.10, brightness=0.025, saturation=1.34, gamma=1.00,
                    rs=0.13, gs=0.02, bs=-0.10, rm=0.08, bm=0.05,
                    grain=5, flash=0.72, leak=0.24, zoom=0.20, glitch=5, shake=4,
                    leak1="0x3a0d6e", leak2="0xffb347", leak3="0x4de8ff"),
    "cyber": dict(contrast=1.22, brightness=0.005, saturation=1.48, gamma=1.04,
                  rs=0.11, gs=-0.05, bs=0.13, rm=-0.03, bm=0.14,
                  grain=9, flash=0.92, leak=0.20, zoom=0.13, glitch=16, shake=9,
                  leak1="0xff1f8f", leak2="0x00f0ff", leak3="0x7a2bff"),
    "clean": dict(contrast=1.07, brightness=0.008, saturation=1.12, gamma=1.00,
                  rs=0.03, gs=0.0, bs=-0.02, rm=0.02, bm=0.02,
                  grain=3, flash=0.45, leak=0.09, zoom=0.10, glitch=3, shake=2,
                  leak1="0x241a3d", leak2="0xffc98a", leak3="0x88d8ff"),
}

FONT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "assets", "fonts", "NotoSansArabic.ttf")


def noop(_: str) -> None:
    pass


@dataclass
class Config:
    input: str
    out: str
    workdir: str | None = None
    preset: str = "epic"
    bpm: float = 128.0
    beats_per_cut: int = 2
    height: int = 0            # 0 = auto (1920 vertical / 1080 horizontal)
    fps: int = 30
    seed: int = 7
    title: str = "مونتاج أسطوري"
    subtitle: str = "الأسطورة تبدأ الآن"
    outro: str = "ABSORBS · LEGENDARY CUT"
    bars: bool = True
    no_sfx: bool = False
    sfx_gain: float = 1.0
    orig_gain: float = 0.55
    crf: int = 19
    x264_preset: str = "medium"
    stems: bool = False
    scene_snap: bool = True
    max_duration: float = 0.0  # 0 = whole clip (capped at 180s)
    progress: Callable[[str], None] = field(default=noop, repr=False)


def target_size(info: MediaInfo, height: int) -> tuple[int, int]:
    h = height or (1920 if info.vertical else 1080)
    h = max(240, min(3840, int(h)))
    w = int(round(h * info.width / info.height))
    w += w % 2
    h += h % 2
    return w, h


def _even(v: float) -> int:
    x = int(v)
    return x + (x % 2)


def _grade(p: dict, style: str) -> str:
    extra = 1.10 if style in ("impact", "rush") else 1.0
    return (
        f"hqdn3d=1.6:1.4:6:6,"
        f"unsharp=5:5:0.72:5:5:0.0,"
        f"eq=contrast={p['contrast'] * extra:.3f}:brightness={p['brightness']:.3f}:"
        f"saturation={p['saturation']:.3f}:gamma={p['gamma']:.3f},"
        f"colorbalance=rs={p['rs']:.3f}:gs={p['gs']:.3f}:bs={p['bs']:.3f}:"
        f"rm={p['rm']:.3f}:bm={p['bm']:.3f}:rh=0.015:bh=-0.015"
    )


def _segment_chain(seg: Segment, cfg: Config, info: MediaInfo, W: int, H: int,
                   FPS: int, p: dict) -> str:
    dur = seg.duration
    src_end = min(info.duration, seg.start + dur / max(seg.speed, 0.05))
    SW, SH = _even(W * 1.07), _even(H * 1.07)
    frames = max(1, int(dur * FPS))
    amp = p["zoom"] * (1.0 + 0.5 * seg.intensity)
    drift = 0 if seg.style == "glide" else int(W * 0.006)
    shake = int(p["shake"] * (1.4 if seg.style in ("impact", "glitch", "rush") else 0.35))

    parts = [
        f"trim=start={seg.start:.4f}:end={src_end:.4f},setpts=PTS-STARTPTS,"
        f"setpts={seg.speed:.4f}*(PTS-STARTPTS),fps={FPS},"
        f"tpad=stop_mode=clone:stop_duration={dur:.3f},trim=duration={dur:.4f},"
        f"setpts=N/({FPS}*TB)",
        f"scale={W}:{H}:flags=lanczos,setsar=1",
        _grade(p, seg.style),
        f"zoompan=z='1+{amp:.3f}*min(in/{frames},1)':"
        f"x='iw/2-(iw/zoom/2)+{drift}*sin(in*0.09)':"
        f"y='ih/2-(ih/zoom/2)+{drift}*cos(in*0.07)':"
        f"d=1:s={SW}x{SH}:fps={FPS},setpts=N/({FPS}*TB)",
        f"crop={W}:{H}:x='(in_w-out_w)/2+{shake}*sin(t*39)':"
        f"y='(in_h-out_h)/2+{shake}*cos(t*31)'",
    ]
    if seg.style in ("glitch", "rush"):
        g = p["glitch"]
        parts.append(
            f"rgbashift=rh={g}:bh=-{g}:rv=2:enable='lt(mod(t,0.42),0.085)',"
            f"noise=alls=14:allf=t:enable='lt(mod(t,0.42),0.085)'"
        )
    if seg.style == "slow":
        parts.append("gblur=sigma=0.6:enable='lt(mod(t,0.9),0.3)'")
    parts += [
        f"noise=alls={p['grain']}:allf=t+u",
        "vignette=PI/5",
        f"format=yuv420p,setsar=1,setpts=N/({FPS}*TB)",
    ]
    return ",".join(parts)


def _windows(times: list[tuple[float, float]], limit: int = 40) -> str:
    clauses = [f"between(t,{max(0.0, a):.3f},{b:.3f})" for a, b in times[:limit] if b > a]
    return "+".join(clauses) if clauses else "0"


def _title_file(workdir: str, name: str, text: str) -> str | None:
    if not text.strip():
        return None
    path = os.path.join(workdir, f"title_{name}.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(text.strip())
    return path


def _drawtext(path: str, y: str, size: int, a: float, b: float, color: str) -> str:
    alpha = (f"if(lt(t,{a:.3f}),(t-{a:.3f})/0.32,"
             f"if(gt(t,{b:.3f}-0.32),({b:.3f}-t)/0.32,1))")
    return (
        f"drawtext=fontfile={FONT}:textfile={path}:text_shaping=1:expansion=none:"
        f"fontcolor={color}:fontsize={size}:x=(w-text_w)/2:y={y}:"
        f"box=1:boxcolor=black@0.38:boxborderw={max(8, size // 3)}:"
        f"borderw=2:bordercolor=black@0.65:shadowx=0:shadowy=3:fix_bounds=1:"
        f"alpha='{alpha}':enable='between(t,{a:.3f},{b:.3f})'"
    )


def build_graph(cfg: Config, info: MediaInfo, plan: EditPlan, W: int, H: int,
                FPS: int, workdir: str, safe: bool = False) -> tuple[str, list[str]]:
    p = PALETTES.get(cfg.preset, PALETTES["epic"])
    segs = plan.segments
    n = len(segs)
    lines: list[str] = []

    if n == 1:
        lines.append(f"[0:v]{_segment_chain(segs[0], cfg, info, W, H, FPS, p)}[cat]")
    else:
        labels = "".join(f"[s{i}]" for i in range(n))
        lines.append(f"[0:v]split={n}{labels}")
        for i, seg in enumerate(segs):
            lines.append(f"[s{i}]{_segment_chain(seg, cfg, info, W, H, FPS, p)}[v{i}]")
        chain = "".join(f"[v{i}]" for i in range(n))
        lines.append(f"{chain}concat=n={n}:v=1:a=0,setpts=N/({FPS}*TB)[cat]")

    dur = plan.duration
    flashes = [(max(0.0, c - 0.035), min(dur, c + 0.055)) for c in plan.cuts[1:-1]]
    flash_expr = _windows(flashes)
    lines.append(f"[2:v]format=yuv420p,setsar=1,setpts=N/({FPS}*TB)[flashsrc]")
    lines.append(
        f"[cat][flashsrc]blend=all_mode=screen:all_opacity={p['flash']:.2f}:"
        f"enable='{flash_expr}'[f1]"
    )
    last = "f1"

    if not safe:
        leaks = [(s.start + 0.08, s.end - 0.08) for s in segs
                 if s.style in ("hero", "glide", "slow") and s.end - s.start > 0.5]
        lines.append(f"[3:v]format=yuv420p,setsar=1,setpts=N/({FPS}*TB)[leaksrc]")
        lines.append(
            f"[{last}][leaksrc]blend=all_mode=screen:all_opacity={p['leak']:.2f}:"
            f"enable='{_windows(leaks)}'[f2]"
        )
        last = "f2"

    # Arabic titles, animated and auto-timed
    if dur > 3.0:
        windows = [
            ("intro", cfg.title, (0.18, min(2.3, dur * 0.30)), "h*0.34", int(H * 0.052), "0xFFE6A3"),
            ("mid", cfg.subtitle, (dur * 0.42, min(dur * 0.62, dur * 0.42 + 1.7)),
             "h*0.68", int(H * 0.030), "0xFFFFFF"),
            ("outro", cfg.outro, (max(dur * 0.74, dur - 2.1), dur - 0.12),
             "h*0.80", int(H * 0.026), "0x8FE9FF"),
        ]
        for idx, (name, text, (a, b), y, size, color) in enumerate(windows):
            if b - a < 0.6:
                continue
            tf = _title_file(workdir, name, text)
            if not tf:
                continue
            nxt = f"t{idx}"
            lines.append(f"[{last}]{_drawtext(tf, y, size, a, b, color)}[{nxt}]")
            last = nxt

    if cfg.bars:
        lines.append(
            f"[{last}]drawbox=x=0:y=0:w=iw:h=ih*0.042:color=black@1:t=fill,"
            f"drawbox=x=0:y=ih*0.958:w=iw:h=ih*0.042:color=black@1:t=fill[v]"
        )
    else:
        lines.append(f"[{last}]null[v]")

    # ---- audio: original (ducked) + generated soundtrack ------------------
    d = f"{dur:.4f}"
    lines.append(
        f"[1:a]atrim=0:{d},asetpts=PTS-STARTPTS,aresample={SR},"
        f"aformat=sample_fmts=fltp:channel_layouts=stereo,"
        f"asplit=2[fxmain][fxside]"
    )
    if info.has_audio and not safe:
        lines.append(
            f"[0:a]atrim=0:{d},asetpts=PTS-STARTPTS,aresample={SR},"
            f"aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"volume={cfg.orig_gain:.2f},acompressor=threshold=0.15:ratio=3:attack=8:release=140[orig]"
        )
        lines.append(
            "[orig][fxside]sidechaincompress=threshold=0.045:ratio=5:"
            "attack=10:release=260[ducked]"
        )
        lines.append(
            "[ducked][fxmain]amix=inputs=2:duration=first:normalize=0,"
            "alimiter=limit=0.92:level=false[a]"
        )
    elif info.has_audio:
        lines.append(
            f"[0:a]atrim=0:{d},asetpts=PTS-STARTPTS,aresample={SR},"
            f"aformat=sample_fmts=fltp:channel_layouts=stereo,volume={cfg.orig_gain:.2f}[orig]"
        )
        lines.append("[orig][fxmain]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.92:level=false[a]")
    else:
        lines.append("[fxmain]alimiter=limit=0.92:level=false[a]")

    leak = p["leak1"], p["leak2"], p["leak3"]
    inputs = [
        cfg.input,
        os.path.join(workdir, "sfx.wav"),
        f"color=c=white:s={W}x{H}:r={FPS}:d={dur + 0.6:.3f}",
        (f"gradients=s={W}x{H}:r={FPS}:d={dur + 0.6:.3f}:"
         f"c0={leak[0]}:c1={leak[1]}:c2={leak[2]}:n=3:seed={cfg.seed % 9999}:speed=0.012"),
    ]
    # inputs 2/3 are lavfi sources, so prefix them with -f lavfi at command build time
    return ";\n".join(lines), inputs


def render(cfg: Config) -> dict:
    """Run the whole pipeline and return a report dict."""
    emit = cfg.progress
    cfg.preset = cfg.preset if cfg.preset in PALETTES else "epic"
    os.makedirs(os.path.dirname(os.path.abspath(cfg.out)), exist_ok=True)
    workdir = cfg.workdir or os.path.join(os.path.dirname(os.path.abspath(cfg.out)), "_work")
    os.makedirs(workdir, exist_ok=True)
    cfg.workdir = workdir

    emit("▸ فحص الفيديو واستخراج المعلومات (FFmpeg probe)")
    info = probe(cfg.input)
    duration = info.duration
    if cfg.max_duration > 0:
        duration = min(duration, cfg.max_duration)
    duration = min(duration, 180.0)
    info.duration = duration
    W, H = target_size(info, cfg.height)
    FPS = max(24, min(60, int(cfg.fps)))
    emit(f"   {info.width}×{info.height} · {duration:.2f}s · {info.fps:.1f}fps  →  {W}×{H} @ {FPS}fps")

    emit("▸ تحليل الإيقاع: كشف الانتقالات الصوتية + تغيّر المشاهد (FFmpeg scene detect)")
    pcm = decode_pcm(cfg.input)
    onsets = detect_onsets(pcm)
    scenes = scene_times(cfg.input) if cfg.scene_snap else []
    emit(f"   {len(onsets)} نبضة صوتية · {len(scenes)} تغيّر مشهد")

    emit("▸ بناء قائمة المونتاج (EDL) على شبكة الإيقاع")
    plan = build_plan(duration, cfg.bpm, cfg.beats_per_cut, onsets, scenes, cfg.seed)
    emit(f"   {len(plan.segments)} لقطة · {cfg.bpm:.0f} BPM · كل {cfg.beats_per_cut} نبضات")

    sfx_path = os.path.join(workdir, "sfx.wav")
    if cfg.no_sfx:
        emit("▸ تخطي المؤثرات الصوتية (--no-sfx)")
        write_wav(sfx_path, np.zeros((int(SR * duration) + SR, 2), np.float32), SR)
    else:
        emit("▸ تصميم صوتي سينمائي: طبل ترايلر + whoosh + impacts + risers + glitch + ducking")
        build_soundtrack(plan, sfx_path, preset=cfg.preset, seed=cfg.seed,
                         stems=cfg.stems, sfx_gain=cfg.sfx_gain)

    emit("▸ بناء فلتر FFmpeg الأسطوري (تحسين الجودة · زووم · اهتزاز · glitch · ألوان · عناوين)")
    graph, inputs = build_graph(cfg, info, plan, W, H, FPS, workdir, safe=False)
    with open(os.path.join(workdir, "filtergraph.txt"), "w", encoding="utf-8") as f:
        f.write(graph)

    d = f"{duration:.4f}"
    def command(g: str) -> list[str]:
        return [
            "-y", "-loglevel", "warning",
            "-i", inputs[0], "-i", inputs[1],
            "-f", "lavfi", "-i", inputs[2],
            "-f", "lavfi", "-i", inputs[3],
            "-filter_complex", g,
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", cfg.x264_preset, "-crf", str(cfg.crf),
            "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", str(FPS),
            "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k",
            "-ar", str(SR), "-t", d, cfg.out,
        ]

    emit("▸ الرندر النهائي H.264 + AAC (قد يأخذ دقائق على 4K)…")
    try:
        res = run(command(graph), progress=None)
    except RuntimeError as first_error:
        emit("⚠️  تعذّر المسار الكامل، إعادة المحاولة بالمسار الآمن (نفس التأثيرات الأساسية)")
        safe_graph, _ = build_graph(cfg, info, plan, W, H, FPS, workdir, safe=True)
        with open(os.path.join(workdir, "filtergraph.txt"), "w", encoding="utf-8") as f:
            f.write(safe_graph)
        try:
            res = run(command(safe_graph), progress=None)
        except RuntimeError:
            raise first_error

    stderr = (res.stderr or b"").decode("utf-8", "replace")
    if stderr.strip():
        emit("   ffmpeg: " + stderr.strip().splitlines()[-1][:160])

    report = {
        "input": os.path.abspath(cfg.input),
        "output": os.path.abspath(cfg.out),
        "preset": cfg.preset,
        "bpm": cfg.bpm,
        "duration": round(duration, 3),
        "source": {"width": info.width, "height": info.height, "fps": info.fps,
                   "has_audio": info.has_audio},
        "output_size": [W, H],
        "fps": FPS,
        "shots": [
            {"index": s.index, "start": round(s.start, 3), "end": round(s.end, 3),
             "style": s.style, "speed": s.speed} for s in plan.segments
        ],
        "onsets": len(onsets), "scene_changes": len(scenes),
        "sfx": os.path.abspath(sfx_path),
        "size_bytes": os.path.getsize(cfg.out) if os.path.exists(cfg.out) else 0,
        "tools": ["FFmpeg/libx264", "yt-dlp (GitHub)", "numpy", "Pillow",
                  "google/fonts · Noto Sans Arabic"],
    }
    with open(os.path.join(workdir, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    emit(f"✅ اكتمل: {os.path.abspath(cfg.out)} ({report['size_bytes'] / 1048576:.2f} MB)")
    return report
