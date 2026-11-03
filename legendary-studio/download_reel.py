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
import html
import os
import re
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


_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")


def download_via_embed(url: str, out: str, progress=lambda msg: None) -> str:
    """Fallback for public reels: Instagram's public embed page often embeds
    the raw CDN .mp4 URL even when yt-dlp hits the login wall."""
    m = re.search(r"/(?:reel|p|tv)/([A-Za-z0-9_-]+)", url)
    if not m:
        raise RuntimeError("cannot extract shortcode from URL")
    sc = m.group(1)
    headers = {"User-Agent": _UA, "Accept-Language": "en-US,en;q=0.9"}
    pages = [
        f"https://www.instagram.com/reel/{sc}/embed/captioned/",
        f"https://www.instagram.com/p/{sc}/embed/captioned/",
        f"https://www.instagram.com/p/{sc}/embed/",
        f"https://www.instagram.com/reel/{sc}/",
    ]
    for page in pages:
        try:
            req = urllib.request.Request(page, headers=headers)
            with urllib.request.urlopen(req, timeout=25, context=ssl.create_default_context()) as r:
                body = r.read().decode("utf-8", "replace")
        except Exception as exc:
            progress(f"   embed {page}: {exc}")
            continue
        found = re.findall(r"https?[^\s\"'<]+?\.mp4[^\s\"'<]*", body)
        found += re.findall(r'"video_url"\s*:\s*"([^"]+)"', body)
        progress(f"   embed {page}: {len(body)} bytes · {len(found)} MP4 candidates")
        for cand in found:
            cand = (html.unescape(cand).replace("\\u0026", "&").replace("\\/", "/")
                    .replace("&amp;", "&"))
            if cand.startswith("//"):
                cand = "https:" + cand
            if not cand.startswith("http"):
                continue
            try:
                req2 = urllib.request.Request(cand, headers={**headers, "Referer": page})
                with urllib.request.urlopen(req2, timeout=90,
                                           context=ssl.create_default_context()) as rr, open(out, "wb") as f:
                    while True:
                        chunk = rr.read(1 << 20)
                        if not chunk:
                            break
                        f.write(chunk)
                if os.path.getsize(out) > 10000:
                    progress(f"✅ تم التحميل من CDN: {out}")
                    return out
            except Exception as exc2:
                progress(f"   CDN attempt: {str(exc2)[:160]}")
    raise RuntimeError("no playable MP4 found in Instagram embed pages (likely login-gated / private)")


def download_direct(url: str, out: str) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    headers = {
        "User-Agent": _UA,
        "Accept": "video/mp4,application/octet-stream,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.image2url.com/",
        "Origin": "https://www.image2url.com",
        "Sec-Fetch-Dest": "video",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "same-origin",
    }
    req = urllib.request.Request(url, headers=headers)
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=120, context=ctx) as r, open(out, "wb") as f:
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
    # yt-dlp needs ffmpeg to merge separate A/V streams. Give it the static build.
    try:
        import imageio_ffmpeg  # noqa: PLC0415
        opts_ffmpeg = {"ffmpeg_location": imageio_ffmpeg.get_ffmpeg_exe()}
    except Exception:
        opts_ffmpeg = {}
    opts = {
        "outtmpl": tmp + ".%(ext)s",
        # Prefer a single progressive MP4 (no merge); fall back to A/V merge.
        "format": "b[ext=mp4][acodec!=none]/bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
        "merge_output_format": "mp4",
        "retries": 3,
        "socket_timeout": 20,
        "quiet": True,
        "no_warnings": False,
        "noplaylist": True,
        "overwrites": True,
        "progress_hooks": [lambda d: progress(f"   {d.get('status')} {d.get('_percent_str','')}".strip())],
        **opts_ffmpeg,
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
    except Exception as exc:  # login wall / private reel → try public embed page
        progress(f"⚠️  yt-dlp: {str(exc)[:280]}")
        try:
            return download_via_embed(url, out, progress)
        except Exception as emb:
            progress(f"⚠️  embed fallback: {str(emb)[:280]}")
            raise RuntimeError(
                f"yt-dlp: {str(exc)[:280]}\nembed: {str(emb)[:280]}"
            ) from exc
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
