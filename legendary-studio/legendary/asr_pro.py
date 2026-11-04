"""Multi-pass speech recognition for a precise, studio-grade transcript.

One big model is loaded once, then several decoding configurations are run
(domain prompt / auto language / no prompt / French). Each candidate carries
word-level timestamps and a confidence score so the best one can be picked —
or hand-proofread into FINAL_WORDS.json. Nothing here invents words.
"""
from __future__ import annotations

import argparse
import json
import os

DOMAIN_PROMPT = (
    "شيبس محاجب. ديجوستاسيون. راح ندوق نكهة حارة، مقرمشة، بنينة. "
    "جربت شوية حار، بزاف بنين، واو، الحار، الفلفل، البطاطا، الجديد."
)

CONFIGS = [
    ("large-v3 / ar / domain", "ar", DOMAIN_PROMPT),
    ("large-v3 / auto / domain", None, DOMAIN_PROMPT),
    ("large-v3 / ar / plain", "ar", None),
    ("large-v3 / fr / plain", "fr", None),
]


def run_model(src: str, model_size: str, out_path: str) -> dict:
    from faster_whisper import WhisperModel  # noqa: PLC0415

    print(f"▸ تحميل نموذج {model_size} …", flush=True)
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    candidates = []
    for name, language, prompt in CONFIGS:
        try:
            segments, info = model.transcribe(
                src, language=language, beam_size=5, temperature=0.0,
                word_timestamps=True, vad_filter=False,
                condition_on_previous_text=False,
                initial_prompt=prompt, no_speech_threshold=0.6,
            )
            words, probs, no_speech = [], [], []
            for seg in segments:
                probs.append(float(seg.avg_logprob))
                no_speech.append(float(seg.no_speech_prob))
                for w in (seg.words or []):
                    word = (w.word or "").strip()
                    if word:
                        words.append({
                            "word": word,
                            "start": round(float(w.start), 3),
                            "end": round(float(w.end), 3),
                            "prob": round(float(getattr(w, "probability", 0.0)), 3),
                        })
            avg = sum(probs) / len(probs) if probs else -3.0
            ns = sum(no_speech) / len(no_speech) if no_speech else 1.0
            score = round(avg - 1.5 * ns + (0.25 if len(words) >= 15 else 0.0), 4)
            text = " ".join(w["word"] for w in words)
            print(f"   {name} → lang={info.language} words={len(words)} "
                  f"score={score} :: {text[:150]}", flush=True)
            candidates.append({
                "name": name, "language": info.language, "score": score,
                "avg_logprob": round(avg, 4), "no_speech": round(ns, 4),
                "word_count": len(words), "text": text, "words": words,
            })
        except Exception as exc:
            print(f"   ⚠️ {name}: {str(exc)[:180]}", flush=True)
    if not candidates:
        raise RuntimeError("لم ينجح أي تمرير للتعرّف على الكلام")

    # A second, smaller model gives an independent opinion for proofreading.
    try:
        print("▸ تحميل نموذج large-v3-turbo للتحقق المتبادل …", flush=True)
        turbo = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
        segs, inf = turbo.transcribe(
            src, language="ar", beam_size=5, temperature=0.0,
            word_timestamps=True, vad_filter=False,
            condition_on_previous_text=False, initial_prompt=DOMAIN_PROMPT,
        )
        words, probs, ns = [], [], []
        for s in segs:
            probs.append(float(s.avg_logprob)); ns.append(float(s.no_speech_prob))
            for w in (s.words or []):
                t = (w.word or "").strip()
                if t:
                    words.append({"word": t, "start": round(float(w.start), 3),
                                  "end": round(float(w.end), 3),
                                  "prob": round(float(getattr(w, "probability", 0.0)), 3)})
        score = round((sum(probs)/len(probs) if probs else -3.0)
                      - 1.5*(sum(ns)/len(ns) if ns else 1.0), 4)
        print(f"   turbo → words={len(words)} score={score}", flush=True)
        candidates.append({
            "name": "large-v3-turbo / ar / domain", "language": inf.language,
            "score": score, "avg_logprob": round(sum(probs)/len(probs) if probs else -3, 4),
            "no_speech": 0.0, "word_count": len(words),
            "text": " ".join(w["word"] for w in words), "words": words,
        })
    except Exception as exc:
        print(f"   ⚠️ turbo: {str(exc)[:180]}", flush=True)

    best = max(candidates, key=lambda c: (c["score"], c["word_count"]))
    payload = {
        "source": os.path.abspath(src),
        "domain_prompt": DOMAIN_PROMPT,
        "best": best["name"],
        "candidates": candidates,
        "best_words": best["words"],
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"✅ الأفضل: {best['name']} ({len(best['words'])} كلمة)", flush=True)
    return payload


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-i", "--input", required=True)
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--model", default="large-v3")
    a = ap.parse_args()
    p = run_model(a.input, a.model, a.out)
    words_path = os.path.join(os.path.dirname(os.path.abspath(a.out)), "BEST_WORDS.json")
    with open(words_path, "w", encoding="utf-8") as f:
        json.dump(p["best_words"], f, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
