#!/bin/bash
set -e
FF=/tmp/venv/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v9.0.2
cd "$(dirname "$0")"
echo "frames: $(ls frames/all/*.jpg | wc -l)"
"$FF" -y -hide_banner -loglevel warning -framerate 30 -i frames/all/f%05d.jpg \
  -i out/mix5_master.wav \
  -c:v libx264 -preset medium -crf 21 -profile:v high -pix_fmt yuv420p \
  -x264-params "keyint=60:min-keyint=30:ref=3:bframes=3" \
  -vf "scale=in_range=full:out_range=limited" -color_range tv \
  -c:a aac -b:a 192k -ar 48000 \
  -t 120.0 -movflags +faststart out/nexus_moon_720x1280.mp4
ls -la out/nexus_moon_720x1280.mp4
"$FF" -hide_banner -i out/nexus_moon_720x1280.mp4 2>&1 | grep -E "Duration|Stream" | head -4
