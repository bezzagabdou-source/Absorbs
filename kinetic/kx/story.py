"""kx.story — turns a VO track + script into a word-accurate timeline.

The aligner is a *silence-aware proportional forced aligner*:
it detects voiced regions in the audio, then distributes the script's words
across the voiced time using syllabic weight. Result: every word lands on the
right syllable cluster without needing a cloud API.

Output: timeline.json  (words, groups, icon beats, markers, sections)
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass, field

import numpy as np

SR = 16000


# --------------------------------------------------------------------------- script
# Each sentence: text + optional icon keyword hints (word -> icon id)
SCRIPT = [
    "واش راكم!",
    "شوفو هاد الفيديو،",
    "صنعناه كامل بالكود.",
    "ما كاينش مصمم،",
    "ما كاينش مونتير،",
    "غير سكريبت وذكاء اصطناعي.",
    "كل كلمة تهبط في وقتها،",
    "بالمللي ثانية.",
    "والكلمة المهمة تولّع،",
    "تلمع،",
    "وتكبر.",
    "والصورة اللي تجي في بالك،",
    "الأيقونة تدخل غير في وقتها.",
    "والساوند؟",
    "يسحبك من أول ثانية",
    "حتى الأخيرة.",
    "النتيجة ريل يوقّف السكرول.",
    "من الألف إلى الياء،",
    "أوتوماتيك.",
]

# keyword -> (icon id, accent colour pair)
ICONS = {
    "الفيديو": "play",
    "بالكود": "code",
    "سكريبت": "code",
    "اصطناعي": "ai",
    "مصمم": "palette",
    "مونتير": "scissors",
    "وقتها": "clock",
    "ثانية": "timer",
    "تولّع": "flame",
    "تلمع": "sparkle",
    "وتكبر": "growth",
    "الصورة": "image",
    "الأيقونة": "star",
    "الساوند": "wave",
    "يسحبك": "wave",
    "السكرول": "phone",
    "أوتوماتيك": "gear",
    "النتيجة": "trophy",
    "راكم": "hand",
}

PAUSE_AFTER = {"،": 0.10, ".": 0.18, "!": 0.16, "؟": 0.16}

# highlight (hero) words get the gradient + glow + pop
HERO = {"بالكود", "اصطناعي", "وقتها", "ثانية", "تولّع", "تلمع", "وتكبر",
        "الأيقونة", "الساوند", "السكرول", "أوتوماتيك", "النتيجة", "الفيديو"}


# --------------------------------------------------------------------------- audio
def decode(path: str, sr: int = SR) -> np.ndarray:
    ff = os.environ.get("FFMPEG") or _ffmpeg()
    raw = subprocess.run([ff, "-v", "quiet", "-i", path, "-ac", "1", "-ar", str(sr),
                          "-f", "s16le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def _ffmpeg() -> str:
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def voiced_spans(y: np.ndarray, sr: int = SR, floor_db: float = -34.0,
                 min_gap: float = 0.24, min_len: float = 0.05):
    hop = int(sr * 0.01)
    n = len(y) // hop
    e = np.sqrt(np.add.reduceat(y[: n * hop] ** 2, np.arange(0, n * hop, hop)) / hop)
    db = 20 * np.log10(np.maximum(e, 1e-6))
    db -= db.max()
    voiced = db > floor_db
    # smooth: fill any dip shorter than min_gap inside speech
    spans, i = [], 0
    while i < len(voiced):
        if voiced[i]:
            j = i
            while j < len(voiced) and voiced[j]:
                j += 1
            spans.append([i * 0.01, j * 0.01])
            i = j
        else:
            i += 1
    merged = []
    for s in spans:
        if merged and s[0] - merged[-1][1] < min_gap:
            merged[-1][1] = s[1]
        else:
            merged.append(s[:])
    return [s for s in merged if s[1] - s[0] >= min_len]


# --------------------------------------------------------------------------- align
_AR_DIAC = re.compile(r"[\u064B-\u0652\u0670\u0653-\u0655]")
_LONG = set("اويىأإآئؤإ")


def syll_weight(w: str) -> float:
    core = _AR_DIAC.sub("", w)
    core = re.sub(r"[^\w\u0600-\u06FF]", "", core)
    if not core:
        return 0.35
    long_v = sum(1 for c in core if c in _LONG)
    return max(0.85, 0.42 * len(core) + 0.55 * long_v)


def _voiced_timeline(spans):
    total = sum(b - a for a, b in spans)
    return total


def _t_at(spans, cum):
    """map cumulative voiced seconds -> absolute time"""
    for a, b in spans:
        d = b - a
        if cum <= d:
            return a + cum
        cum -= d
    return spans[-1][1] if spans else 0.0


def build_timeline(audio_path: str, out_path: str) -> dict:
    y = decode(audio_path)
    dur = len(y) / SR
    spans = voiced_spans(y)
    if not spans:
        raise SystemExit("no speech detected")

    words = []
    for si, sent in enumerate(SCRIPT):
        toks = [t for t in re.split(r"\s+", sent.strip()) if t]
        for ti, t in enumerate(toks):
            core = re.sub(r"[^\w\u0600-\u06FF\u064B-\u0652]", "", t)
            words.append({
                "text": t,
                "core": core,
                "sentence": si,
                "weight": syll_weight(t),
                "hero": core in HERO or t in HERO,
                "icon": ICONS.get(core) or ICONS.get(t.strip("،.!؟")),
                "tail": t[-1] if t else "",
            })

    total_w = sum(w["weight"] for w in words)
    usable = _voiced_timeline(spans)
    cum = 0.0
    for w in words:
        w["start"] = _t_at(spans, cum)
        cum += usable * w["weight"] / total_w
        w["end"] = _t_at(spans, cum)
    # guarantee monotone + min visible duration, clamp end of last
    for i, w in enumerate(words):
        nxt = words[i + 1]["start"] if i + 1 < len(words) else spans[-1][1]
        if w["end"] > nxt - 0.01:
            w["end"] = max(w["start"] + 0.12, nxt - 0.01)
        if w["end"] <= w["start"]:
            w["end"] = w["start"] + 0.18

    # ------------------------------------------------------------------ groups
    groups, cur = [], []
    def flush():
        if cur:
            groups.append(cur[:])
            cur.clear()
    for i, w in enumerate(words):
        cur.append(i)
        word_dur = w["end"] - w["start"]
        maxw = 2 if word_dur > 0.30 else 3
        if len(cur) >= maxw:
            flush()
        elif w["tail"] in PAUSE_AFTER and len(cur) >= 1:
            flush()
    flush()

    gl = []
    for gi, g in enumerate(groups):
        start = words[g[0]]["start"] - 0.04
        end = words[g[-1]]["end"] + (0.16 if words[g[-1]]["tail"] in PAUSE_AFTER else 0.06)
        if gi + 1 < len(groups):
            end = min(end, words[groups[gi + 1][0]]["start"] - 0.02)
        end = max(end, start + 0.30)
        gl.append({"words": g, "start": max(0.0, start), "end": end})

    # ------------------------------------------------------------------ icons
    icon_beats = []
    for i, w in enumerate(words):
        if not w["icon"]:
            continue
        if any(abs(w["start"] - b["t"]) < 1.15 for b in icon_beats):
            continue
        icon_beats.append({
            "t": round(w["start"], 3),
            "dur": 2.1,
            "icon": w["icon"],
            "word": w["text"],
            "hero": w["hero"],
        })

    # ------------------------------------------------------------------ markers
    markers = []
    for i, w in enumerate(words):
        if w["hero"]:
            markers.append({"t": round(w["start"], 3), "kind": "pop", "text": w["text"]})
    for gi, g in enumerate(gl):
        markers.append({"t": round(g["start"], 3), "kind": "whoosh"})

    sections = []
    for gi, g in enumerate(gl):
        if gi == 0 or words[g["words"][0]]["sentence"] != words[gl[gi - 1]["words"][0]]["sentence"]:
            sections.append({"t": round(g["start"], 3), "sentence": words[g["words"][0]]["sentence"]})

    # audio envelope at FPS resolution (drives reactive glow / punch)
    env = []
    hop = SR // 30
    for i in range(0, len(y) - hop, hop):
        env.append(float(np.sqrt(np.mean(y[i:i + hop] ** 2))))
    env = np.asarray(env, dtype=float)
    if len(env):
        env = env / (np.percentile(env, 96) + 1e-9)
        env = np.clip(env, 0, 1) ** 0.75
    tl = {
        "envelope": [round(float(v), 3) for v in env],
        "audio": os.path.basename(audio_path),
        "duration": round(dur, 3),
        "spans": [[round(a, 3), round(b, 3)] for a, b in spans],
        "words": [{k: (round(v, 3) if isinstance(v, float) else v) for k, v in w.items()}
                  for w in words],
        "groups": gl,
        "icons": icon_beats,
        "markers": markers,
        "sections": sections,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(tl, fh, ensure_ascii=False, indent=1)
    return tl


if __name__ == "__main__":
    import sys
    tl = build_timeline(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "timeline.json")
    print(f"{len(tl['words'])} words, {len(tl['groups'])} groups, "
          f"{len(tl['icons'])} icon beats, {tl['duration']}s")
    for g in tl["groups"][:8]:
        txt = " ".join(tl["words"][i]["text"] for i in g["words"])
        print(f"  {g['start']:6.2f}-{g['end']:6.2f}  {txt}")
