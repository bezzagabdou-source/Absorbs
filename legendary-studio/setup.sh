#!/usr/bin/env bash
# LEGENDARY STUDIO — one-command installer
# Downloads the legendary open-source tools from GitHub + PyPI and bootstraps a venv.
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
VENV=".venv"

echo "▸ [1/5] Python virtual environment"
if [ ! -d "$VENV" ]; then "$PYTHON" -m venv "$VENV"; fi
PY="$VENV/bin/python"
PIP="$VENV/bin/pip"

echo "▸ [2/5] PyPI packages (numpy · Pillow · imageio-ffmpeg/FFmpeg · yt-dlp · Flask)"
"$PIP" install --disable-pip-version-check -q --upgrade pip
"$PIP" install --disable-pip-version-check -q -r requirements.txt

echo "▸ [3/5] yt-dlp straight from GitHub (yt-dlp/yt-dlp)"
mkdir -p vendor
if [ ! -f vendor/yt-dlp/yt_dlp/__init__.py ]; then
  rm -rf vendor/yt-dlp
  git clone --depth 1 https://github.com/yt-dlp/yt-dlp.git vendor/yt-dlp
  rm -rf vendor/yt-dlp/.git
fi

echo "▸ [4/5] Noto Sans Arabic (google/fonts) — already vendored with its OFL licence"
[ -f assets/fonts/NotoSansArabic.ttf ] || { echo "!! missing font, run the fetch step in README"; exit 1; }

echo "▸ [5/5] Preflight: FFmpeg + decoder/encoder check"
"$PY" -c "import sys; sys.path.insert(0,'.'); from legendary.ffmpeg import ffmpeg_exe, probe_demo; print('FFmpeg:', ffmpeg_exe()); probe_demo()"

echo ""
echo "✅ جاهز. شغّل الاستوديو:   ./studio.sh"
echo "   أو من سطر الأوامر:      .venv/bin/python -m legendary.cli --demo"
