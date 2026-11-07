#!/data/data/com.termux/files/usr/bin/bash
# KINETIC — Termux one-shot installer (Android, no root)
# usage: bash install-termux.sh
set -e

echo "==> 1/5 system packages"
pkg update -y >/dev/null
pkg install -y python ffmpeg git libjpeg-turbo libpng freetype harfbuzz \
               clang make cmake pkg-config binutils

echo "==> 2/5 prebuilt python natives (fastest path on Android)"
pkg install -y python-numpy python-pillow || {
  echo "    prebuilt missing, falling back to pip (slow — may take 10 min)"
  pip install --no-cache-dir numpy pillow
}

echo "==> 3/5 python libs"
pip install --upgrade pip wheel >/dev/null
pip install --no-cache-dir uharfbuzz freetype-py imageio-ffmpeg arabic-reshaper python-bidi || {
  echo "    uharfbuzz/freetype failed -> the engine will use the Pillow text backend"
  pip install --no-cache-dir imageio-ffmpeg arabic-reshaper python-bidi
}

echo "==> 4/5 ffmpeg check"
if ! command -v ffmpeg >/dev/null; then echo "    ffmpeg missing (pip fallback will be used)"; fi

echo "==> 5/5 phone-friendly defaults"
cat > "$HOME/.kx-env" <<'EOF'
# KINETIC phone defaults — source this before rendering
export KX_RES=0.6        # 648x1152 render, upscaled to 1080x1920 at encode
export KX_WORKERS=2      # 2 = best on most Androids (more = thermal throttle)
export KX_PRESET=veryfast
export KX_CRF=22
EOF

cat <<'MSG'

✔ install done

Start every session with:
    source ~/.kx-env
    termux-wake-lock          # keep CPU awake while rendering

Render:
    cd kinetic
    python -m kx.render --audio media/vo.mp3 --out out/reel.mp4

Full quality (slower, needs a cooler phone / charger):
    KX_RES=1 KX_PRESET=medium python -m kx.render --audio media/vo.mp3 --out out/reel.mp4

MSG
