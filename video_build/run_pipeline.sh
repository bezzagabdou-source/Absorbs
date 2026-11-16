#!/usr/bin/env bash
# Full autonomous render pipeline for gta6_viral_short.mp4
#   0. deps:  python3 -m venv /tmp/venv && /tmp/venv/bin/pip install \
#             pillow numpy arabic-reshaper python-bidi imageio-ffmpeg fonttools
#   1. VO:    voice clips in video_assets/vo/seg*.mp3 (fuṣḥā Arabic TTS)
#   2. plates: motion backgrounds  -> video_build/plates/
#   3. audio:  music + SFX + VO mix -> video_build/audio_master.wav + timeline.json
#   4. cards:  captions/HUD/transitions -> video_build/segments/
#   5. master: concat + EBU R128 -14 LUFS -> gta6_viral_short.mp4
set -euo pipefail
PY=/tmp/venv/bin/python
cd "$(dirname "$0")"
$PY proc_vo.py
$PY motion.py
$PY audio_builder.py
PARALLEL=1 $PY render_cards.py
$PY assemble.py
