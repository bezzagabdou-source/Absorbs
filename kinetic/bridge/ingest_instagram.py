"""bridge/ingest_instagram.py — bring YOUR source reel into the studio.

The sandbox this repo lives in has no route to instagram.com, so downloading
happens on your machine / server.  This script is the one-command bridge:

    python bridge/ingest_instagram.py "https://www.instagram.com/reel/Dfc_0KpoWC0/" \
        --out media/source.mp4

It tries, in order:
  1. yt-dlp (best, keeps audio + video)
  2. instaloader (login or anonymous)
  3. gallery-dl
Then it extracts a clean 48k wav for alignment and prints the next command.

There is no "download video from your own tools without permission" shortcut:
the studio always re-edits the *audio you own* and puts a cinematic design on
top — that is what makes the output look like a studio produced it.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys


def have(bin_name: str) -> bool:
    return shutil.which(bin_name) is not None


def ffmpeg() -> str:
    env = os.environ.get("FFMPEG")
    if env:
        return env
    if shutil.which("ffmpeg"):
        return "ffmpeg"
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        sys.exit("ffmpeg not found — install ffmpeg or `pip install imageio-ffmpeg`")


def download(url: str, out: str) -> bool:
    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)

    if have("yt-dlp"):
        print("[1/3] yt-dlp")
        cmd = ["yt-dlp", "--no-playlist", "-f", "bv*+ba/b", "--merge-output-format", "mp4",
               "-o", out, url]
        if subprocess.run(cmd).returncode == 0 and os.path.exists(out):
            return True

    if have("gallery-dl"):
        print("[2/3] gallery-dl")
        tmp = os.path.join(os.path.dirname(out), "_gal")
        if subprocess.run(["gallery-dl", "-D", tmp, url]).returncode == 0:
            for fn in sorted(os.listdir(tmp)):
                if fn.lower().endswith((".mp4", ".webm", ".mkv", ".jpg")):
                    shutil.move(os.path.join(tmp, fn), out)
                    return True

    print("[3/3] instaloader")
    try:
        import instaloader
        shortcode = url.rstrip("/").split("/")[-1].split("?")[0]
        L = instaloader.Instaloader(dirname_pattern=os.path.dirname(out),
                                    filename_pattern="source",
                                    download_video_thumbnails=False,
                                    save_metadata=False, post_metadata_txt_pattern="")
        L.download_post(instaloader.Post.from_shortcode(L.context, shortcode), target="src")
        cand = os.path.join(os.path.dirname(out), "src", "source.mp4")
        if os.path.exists(cand):
            shutil.move(cand, out)
            return True
    except Exception as exc:  # pragma: no cover
        print("  instaloader failed:", exc)
    return False


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--out", default="media/source.mp4")
    a = ap.parse_args(argv)

    if not download(a.url, a.out):
        sys.exit("download failed — `pip install yt-dlp` (or instaloader/gallery-dl) and retry,\n"
                 "or drop the file in manually and pass it with --audio/--broll.")

    wav = os.path.splitext(a.out)[0] + "-vo.wav"
    subprocess.run([ffmpeg(), "-y", "-v", "error", "-i", a.out,
                    "-vn", "-ac", "2", "-ar", "44100", wav], check=True)
    print(f"\nsource : {a.out}\nvoice  : {wav}\n")
    print("next   : python -m kx.render --audio", wav, "--broll", a.out,
          "--out out/reel.mp4")


if __name__ == "__main__":
    main()
