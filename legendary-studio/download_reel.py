"""Reel downloader — yt-dlp (github.com/yt-dlp/yt-dlp), vendored by setup.sh.

⚠️ This sandbox only has outbound access to github.com / pypi.org / npm, so
Instagram itself is NOT reachable here. On your own machine (or any network
that can reach Instagram) this works. Instagram usually needs a logged-in
session: pass --cookies-from-browser chrome (or --cookies cookies.txt).

Usage:
  .venv/bin/python download_reel.py "https://www.instagram.com/reel/XXXX/" \
      --cookies-from-browser chrome -o out/source.mp4
  .venv/bin/python download_reel.py --direct "https://....mp4" -o out/source.mp4
"""
from __future__ import annotations

import argparse
import os
import ssl
import sys
import urllib.request

DEFAULT_REEL = "https://www.instagram.com/reel/DfSkvUnxXb7/?obrf=MTFiNzUzNmlxa2VpMA=="
HERE = os.path.dirname(os.path.abspath(__file__))


def _import_ytdlp():
    vendor = os.path.join(HERE, "vendor", "yt-dlp")
    if os.path.isdir(vendor) and vendor not in sys.path:
        sys.path.insert(0, vendor)
    try:
        import yt_dlp  # noqa: PLC0415
        return yt_dlp
    except ImportError as exc:
        raise RuntimeError("yt-dlp مفقود: نفّذ ./setup.sh أولاً") from exc


def download_direct(url: str, out: str) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=90, context=ctx) as r, open(out, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    return out


def download_reel(
    url: str,
    out: str,
    *,
    cookies_from_browser: str | None = None,
    cookies_file: str | None = None,
    username: str | None = None,
    password: str | None = None,
    progress=lambda msg: None,
) -> str:
    yt_dlp = _import_ytdlp()
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    tmp = os.path.splitext(out)[0]
    opts = {
        "outtmpl": tmp + ".%(ext)s",
        "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
        "merge_output_format": "mp4",
        "retries": 3,
        "socket_timeout": 20,
        "quiet": True,
        "no_warnings": False,
        "noplaylist": True,
        "overwrites": True,
        "progress_hooks": [lambda d: progress(f"   {d.get('status')} {d.get('_percent_str','')}".strip())],
    }
    if cookies_from_browser:
        opts["cookiesfrombrowser"] = (cookies_from_browser,)
    if cookies_file:
        opts["cookiefile"] = cookies_file
    if username:
        opts["username"] = username
    if password:
        opts["password"] = password
    progress("▸ اتصال بـ yt-dlp (أداة GitHub الأسطورية)…")
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            produced = ydl.prepare_filename(info)
    except Exception as exc:  # network / login / private reel
        msg = str(exc)
        if any(k in msg for k in ("SSL", "TLS", "Connection", "urlopen", "timed out", "Resolve")):
            raise RuntimeError(
                "تعذّر الوصول إلى Instagram من هذه البيئة (الشبكة محجوبة هنا).\n"
                "✅ الحل: حمّل الفيديو من متصفحك ثم ارفعه في الاستوديو، أو شغّل "
                "download_reel.py على جهازك، أو استعمل --direct مع رابط MP4 مباشر."
            ) from exc
        raise RuntimeError(f"فشل التحميل: {msg[:500]}") from exc

    for ext in ("mp4", "mkv", "webm", "mov"):
        cand = f"{tmp}.{ext}"
        if os.path.isfile(cand):
            if cand != out:
                os.replace(cand, out)
            progress(f"✅ تم التحميل: {out}")
            return out
    raise RuntimeError(f"تم التحميل لكن لم أجد الملف الناتج قرب {tmp}")


def main() -> int:
    ap = argparse.ArgumentParser(description="تنزيل Reel من إنستغرام عبر yt-dlp")
    ap.add_argument("url", nargs="?", default=DEFAULT_REEL)
    ap.add_argument("-o", "--out", default="out/source.mp4")
    ap.add_argument("--direct", help="رابط MP4 مباشر (بدون yt-dlp)")
    ap.add_argument("--cookies-from-browser", choices=["chrome", "firefox", "edge", "safari", "brave"])
    ap.add_argument("--cookies", help="ملف cookies.txt بصيغة Netscape")
    ap.add_argument("--username")
    ap.add_argument("--password")
    a = ap.parse_args()
    try:
        if a.direct:
            path = download_direct(a.direct, a.out)
        else:
            path = download_reel(a.url, a.out,
                                 cookies_from_browser=a.cookies_from_browser,
                                 cookies_file=a.cookies, username=a.username,
                                 password=a.password, progress=print)
        print(path)
        return 0
    except Exception as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
