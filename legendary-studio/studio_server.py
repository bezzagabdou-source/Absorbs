"""Browser studio — upload your reel, get a legendary cut.

    ./studio.sh          → http://localhost:8000 (binds 0.0.0.0 for previews)

Uses Flask (github.com/pallets/flask). Everything runs locally; no video ever
leaves your machine.
"""
from __future__ import annotations

import argparse
import json
import os
import threading
import traceback
import uuid

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from download_reel import download_reel
from legendary.render import Config, render

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "out")
JOBS = os.path.join(OUT, "jobs")
os.makedirs(JOBS, exist_ok=True)

app = Flask(__name__, static_folder=None)

_STAGES = [
    ("فحص", 10), ("تحليل", 24), ("بناء قائمة", 36), ("تصميم صوتي", 54),
    ("بناء فلتر", 66), ("الرندر", 78), ("اتصال بـ", 8), ("تم التحميل", 16),
    ("اكتمل", 100),
]


def _status_path(jid: str) -> str:
    return os.path.join(JOBS, jid, "status.json")


def _write_status(jid: str, **fields) -> None:
    path = _status_path(jid)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = {}
    if os.path.isfile(path):
        try:
            data = json.load(open(path, encoding="utf-8"))
        except Exception:
            data = {}
    data.update(fields)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def _emit(jid: str, msg: str) -> None:
    line = str(msg).strip()
    if not line:
        return
    try:
        cur = json.load(open(_status_path(jid), encoding="utf-8"))
    except Exception:
        cur = {"pct": 0, "log": []}
    pct = cur.get("pct", 0)
    for key, value in _STAGES:
        if key in line:
            pct = max(pct, value)
            break
    log = cur.get("log", [])[-60:] + [line]
    _write_status(jid, state=cur.get("state", "running"), pct=pct, log=log, stage=line)


def _run_job(jid: str, form: dict, input_path: str | None, url: str) -> None:
    jobdir = os.path.join(JOBS, jid)
    try:
        _write_status(jid, state="running", pct=2, log=[], stage="بدء المهمة")
        if url and not input_path:
            _emit(jid, "▸ محاولة تنزيل الفيديو من الرابط عبر yt-dlp…")
            input_path = os.path.join(jobdir, "source.mp4")
            download_reel(
                url, input_path,
                cookies_from_browser=(form.get("cookies") or None),
                progress=lambda m: _emit(jid, m),
            )
        if not input_path or not os.path.isfile(input_path):
            raise RuntimeError("لا يوجد فيديو: ارفع ملفاً أو أدخل رابطاً صالحاً")

        out_path = os.path.join(jobdir, "LEGENDARY_CUT.mp4")
        cfg = Config(
            input=input_path,
            out=out_path,
            workdir=os.path.join(jobdir, "_work"),
            preset=form.get("preset", "epic"),
            bpm=float(form.get("bpm") or 128),
            beats_per_cut=int(form.get("beats") or 2),
            height=int(form.get("height") or 0),
            fps=int(form.get("fps") or 30),
            seed=int(form.get("seed") or 7),
            title=form.get("title") or "مونتاج أسطوري",
            subtitle=form.get("subtitle") or "الأسطورة تبدأ الآن",
            outro=form.get("outro") or "ABSORBS · LEGENDARY CUT",
            bars=form.get("bars") == "1",
            no_sfx=form.get("no_sfx") == "1",
            stems=form.get("stems") == "1",
            crf=int(form.get("crf") or 21),
            x264_preset=form.get("x264_preset") or "veryfast",
            max_duration=float(form.get("max_duration") or 45),
            progress=lambda m: _emit(jid, m),
        )
        report = render(cfg)
        rel = os.path.relpath(out_path, OUT).replace(os.sep, "/")
        _write_status(jid, state="done", pct=100, output=rel, report=report,
                      stage="✅ المونتاج جاهز")
    except Exception as exc:
        _write_status(jid, state="error", error=str(exc),
                      trace=traceback.format_exc()[-1200:], stage="❌ فشل")
        _emit(jid, f"❌ {exc}")


@app.get("/")
def index():
    return open(os.path.join(BASE, "templates", "index.html"), encoding="utf-8").read()


@app.get("/health")
def health():
    return jsonify(ok=True, jobs=len(os.listdir(JOBS)))


@app.post("/api/render")
def api_render():
    form = request.form.to_dict()
    url = (form.get("url") or "").strip()
    input_path = None
    f = request.files.get("video")
    if f and f.filename:
        jid = uuid.uuid4().hex[:12]
        jobdir = os.path.join(JOBS, jid)
        os.makedirs(jobdir, exist_ok=True)
        ext = os.path.splitext(secure_filename(f.filename))[1].lower() or ".mp4"
        if ext not in (".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"):
            return jsonify(error="صيغة غير مدعومة"), 400
        input_path = os.path.join(jobdir, "source" + ext)
        f.save(input_path)
    else:
        jid = uuid.uuid4().hex[:12]
        os.makedirs(os.path.join(JOBS, jid), exist_ok=True)
    if not input_path and not url:
        return jsonify(error="ارفع فيديو أو ضع رابطاً"), 400
    _write_status(jid, state="queued", pct=0, log=[], stage="في الانتظار")
    t = threading.Thread(target=_run_job, args=(jid, form, input_path, url), daemon=True)
    t.start()
    return jsonify(job=jid)


@app.get("/api/status/<jid>")
def api_status(jid: str):
    path = _status_path(jid)
    if not os.path.isfile(path):
        return jsonify(error="not found"), 404
    return jsonify(json.load(open(path, encoding="utf-8")))


@app.get("/media/<path:rel>")
def media(rel: str):
    return send_from_directory(OUT, rel, conditional=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    print(f"🎬 LEGENDARY STUDIO → http://{a.host}:{a.port}")
    app.run(host=a.host, port=a.port, threaded=True, debug=False)


if __name__ == "__main__":
    main()
