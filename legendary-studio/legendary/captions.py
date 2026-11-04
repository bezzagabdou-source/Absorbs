"""Quality-only pass + speech-driven captions & stickers.

NO cuts, NO speed ramps, NO zoom/shake/glitch, NO added music: the original
timeline and original audio are preserved. We only
  1. upscale / denoise / sharpen / gently colour-grade (quality),
  2. transcribe the speech (faster-whisper, word timestamps),
  3. burn Arabic captions timed to the words,
  4. pop coloured stickers whose label depends on what was said.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path

from .ffmpeg import ffmpeg_exe, probe, run
from .render import target_size

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "assets" / "fonts" / "NotoSansArabic.ttf"

# keyword → (sticker label, badge colour)
KEYWORDS = [
    (r"حار|حرار|سبايس|سبايسي|شط|فلفل|نار|hot|spicy", "حار!", "0xE23C2E"),
    (r"شيبس|شيب|بطاط|بطاطا|chips|chip", "شيبس!", "0xF2A71B"),
    (r"بنين|لذيذ|طيب|مليح|زوين|حلو|لذيد", "بنين!", "0x2FA36B"),
    (r"مقرمش|قرمش|كريس|crunch|قرق", "مقرمش!", "0x2F7FD1"),
    (r"جرب|جربو|شوف|شوفو|شوفوا|انظرو|watch|try", "شوف!", "0x8B4FD1"),
    (r"جديد| nouvea|new|عرض|offer", "جديد!", "0x1FA8A0"),
    (r"واو|ووو|ya|ياا|wow|amazing", "واو!", "0xD14FA0"),
    (r"\d+|واحد|زوج|اثنين|ثلاث|اربع|خمس", "كمية!", "0x4A4AD1"),
]
DEFAULT_COLOR = "0xB87333"


def transcribe(src: str, sizes=("small", "base", "tiny")) -> list[dict]:
    try:
        from faster_whisper import WhisperModel  # noqa: PLC0415
    except ImportError as exc:
        raise RuntimeError("faster-whisper غير مثبّت") from exc
    words: list[dict] = []
    last_error = None
    for size in sizes:
        try:
            print(f"▸ تحميل نموذج Whisper ({size}) …", flush=True)
            model = WhisperModel(size, device="cpu", compute_type="int8")
            segments, info = model.transcribe(
                src, language=None, beam_size=5, word_timestamps=True,
                vad_filter=True, condition_on_previous_text=False,
            )
            for seg in segments:
                for w in (seg.words or []):
                    word = (w.word or "").strip()
                    if word:
                        words.append({"word": word,
                                      "start": round(float(w.start), 2),
                                      "end": round(float(w.end), 2)})
            print(f"   اللغة: {info.language} · {len(words)} كلمة", flush=True)
            if words:
                return words
        except Exception as exc:  # model download / runtime failure
            last_error = exc
            print(f"⚠️  {size}: {str(exc)[:200]}", flush=True)
    if last_error and not words:
        print(f"⚠️  لم يعد النموذج أي كلام: {str(last_error)[:200]}", flush=True)
    return words


def make_captions(words: list[dict], max_words: int = 4, gap: float = 0.45,
                  max_dur: float = 2.5) -> list[dict]:
    groups: list[list[dict]] = []
    cur: list[dict] = []
    for w in words:
        if cur and (len(cur) >= max_words
                    or w["start"] - cur[-1]["end"] > gap
                    or w["end"] - cur[0]["start"] > max_dur):
            groups.append(cur)
            cur = []
        cur.append(w)
    if cur:
        groups.append(cur)
    return [{"text": " ".join(x["word"] for x in g).strip(),
             "start": round(g[0]["start"], 2),
             "end": round(g[-1]["end"] + 0.25, 2)} for g in groups if g]


def pick_sticker(text: str) -> tuple[str, str]:
    for pattern, label, color in KEYWORDS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return label, color
    # Still tied to speech: use the longest word of the utterance as a label.
    tokens = [t for t in re.split(r"\s+", text) if len(t) > 1]
    label = max(tokens, key=len)[:10] if tokens else "✨"
    return label, DEFAULT_COLOR


def write_srt(captions: list[dict], path: str) -> None:
    def ts(t: float) -> str:
        ms = int(round(t * 1000))
        h, ms = divmod(ms, 3600000)
        m, ms = divmod(ms, 60000)
        s, ms = divmod(ms, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    with open(path, "w", encoding="utf-8") as f:
        for i, c in enumerate(captions, 1):
            f.write(f"{i}\n{ts(c['start'])} --> {ts(c['end'])}\n{c['text']}\n\n")


def _esc(t: str) -> str:
    return t.replace("\\", "").replace("\r", "").strip()


def _wrap(text: str, max_chars: int = 24) -> str:
    """Keep captions inside the frame: two short lines beat one clipped line."""
    parts = text.split()
    if len(text) <= max_chars or len(parts) < 3:
        return text
    mid = max(1, len(parts) // 2)
    return " ".join(parts[:mid]) + "\n" + " ".join(parts[mid:])


def build_graph(captions: list[dict], info, W: int, H: int, workdir: str) -> str:
    lines: list[str] = []
    lines.append(
        "[0:v]hqdn3d=1.2:1.2:5:5,"
        "unsharp=5:5:0.55:5:5:0.0,"
        "eq=contrast=1.06:brightness=0.006:saturation=1.10:gamma=1.01,"
        f"scale={W}:{H}:flags=lanczos,format=yuv420p,setsar=1[base]"
    )
    label = "base"
    events: list[dict] = []
    for i, c in enumerate(captions):
        a, b = c["start"], max(c["start"] + 0.4, c["end"])
        events.append({"kind": "caption", "index": i, "a": a, "b": b, "text": c["text"]})
        slabel, color = pick_sticker(c["text"])
        sa = a + 0.06
        sb = min(b + 0.35, sa + 2.0)
        events.append({"kind": "sticker", "index": i, "a": sa, "b": sb,
                       "text": slabel, "color": color})
    events.sort(key=lambda e: (e["a"], 0 if e["kind"] == "sticker" else 1))

    cap_size = int(H * 0.026)
    box_w = int(W * 0.44)
    box_h = int(H * 0.056)
    for k, ev in enumerate(events):
        out = f"e{k}"
        a, b = ev["a"], ev["b"]
        win = f"'between(t,{a:.2f},{b:.2f})'"
        if ev["kind"] == "caption":
            tf = os.path.join(workdir, f"caption_{ev['index']}.txt")
            with open(tf, "w", encoding="utf-8") as f:
                f.write(_esc(_wrap(ev["text"])))
            lines.append(
                f"[{label}]drawtext=fontfile={FONT}:textfile={tf}:text_shaping=1:expansion=none:"
                f"fontcolor=white:fontsize={cap_size}:line_spacing=10:"
                f"x=(w-text_w)/2:y=h*0.80:"
                f"box=1:boxcolor=black@0.55:boxborderw={max(8, cap_size // 3)}:"
                f"borderw=2:bordercolor=black@0.8:fix_bounds=1:enable={win}[{out}]"
            )
        else:
            i = ev["index"]
            right = i % 2 == 1
            x = int(W - box_w - W * 0.05) if right else int(W * 0.05)
            y = int(H * (0.50 if right else 0.43))
            cx, cy = x + box_w // 2, y + box_h // 2
            size = int(box_h * 0.48)
            # outer white rim → coloured badge → accent square
            lines.append(
                f"[{label}]"
                f"drawbox=x={x-4}:y={y-4}:w={box_w+8}:h={box_h+8}:color=white@0.85:t=fill:enable={win},"
                f"drawbox=x={x}:y={y}:w={box_w}:h={box_h}:color={ev['color']}@0.92:t=fill:enable={win},"
                f"drawbox=x={x+10}:y={y+box_h//2-8}:w=16:h=16:color=white@0.9:t=fill:enable={win},"
                f"drawbox=x={x+box_w-26}:y={y+box_h//2-8}:w=16:h=16:color=white@0.9:t=fill:enable={win},"
                f"drawtext=fontfile={FONT}:textfile={os.path.join(workdir, f'sticker_{i}.txt')}:"
                f"text_shaping=1:expansion=none:fontcolor=white:fontsize={size}:"
                f"x='{cx}-text_w/2':y='{cy}-text_h/2':borderw=1:bordercolor=black@0.5:"
                f"fix_bounds=1:enable={win}[{out}]"
            )
            with open(os.path.join(workdir, f"sticker_{i}.txt"), "w", encoding="utf-8") as f:
                f.write(_esc(ev["text"]))
        label = out
    lines.append(f"[{label}]null[v]")
    return ";\n".join(lines)


def render(src: str, out: str, workdir: str, transcript_json: str | None = None) -> dict:
    os.makedirs(workdir, exist_ok=True)
    info = probe(src)
    W, H = target_size(info, 0)
    words = (json.load(open(transcript_json, encoding="utf-8"))
             if transcript_json else transcribe(src))
    print(f"▸ {len(words)} كلمة مستخرجة من الصوت", flush=True)
    if not words:
        # No speech detected: still improve quality, add no fake captions.
        words = []
    captions = make_captions(words)
    print(f"▸ {len(captions)} سطر ترجمة · {len(captions)} ملصق", flush=True)
    write_srt(captions, os.path.join(workdir, "CAPTIONS.srt"))
    with open(os.path.join(workdir, "TRANSCRIPT.json"), "w", encoding="utf-8") as f:
        json.dump({"words": words, "text": " ".join(w["word"] for w in words)},
                  f, ensure_ascii=False, indent=2)

    graph = build_graph(captions, info, W, H, workdir)
    with open(os.path.join(workdir, "filtergraph.txt"), "w", encoding="utf-8") as f:
        f.write(graph)

    cmd = ["-y", "-loglevel", "warning", "-i", src,
           "-filter_complex", graph, "-map", "[v]"]
    if info.has_audio:
        cmd += ["-map", "0:a", "-c:a", "copy"]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
            "-pix_fmt", "yuv420p", "-profile:v", "high",
            "-r", str(int(info.fps)), "-movflags", "+faststart",
            "-shortest", out]
    print("▸ رندر: تحسين الجودة + الترجمة والملصقات (بدون أي تغيير في الزمن)", flush=True)
    run(cmd)
    report = {
        "input": os.path.abspath(src), "output": os.path.abspath(out),
        "duration": info.duration, "source_size": [info.width, info.height],
        "output_size": [W, H], "fps": info.fps,
        "words": len(words), "captions": captions,
        "transcript": " ".join(w["word"] for w in words),
        "stickers": [pick_sticker(c["text"])[0] for c in captions],
        "edits": "none (original timeline + original audio preserved)",
        "size_bytes": os.path.getsize(out) if os.path.exists(out) else 0,
    }
    with open(os.path.join(workdir, "CAPTION_REPORT.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-i", "--input", required=True)
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--workdir", default=None)
    ap.add_argument("--transcript-json", default=None)
    a = ap.parse_args()
    wd = a.workdir or os.path.join(os.path.dirname(os.path.abspath(a.out)), "_captions")
    r = render(a.input, a.out, wd, a.transcript_json)
    print(json.dumps({k: r[k] for k in ("output", "duration", "output_size", "words")},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
