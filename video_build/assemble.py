"""Concatenate scene segments + mastered audio into the final deliverable."""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import FF, BUILD, ROOT, run, probe_dur  # noqa: E402
from script import SCENES  # noqa: E402

SEG_DIR = os.path.join(BUILD, "segments")
OUT = os.path.join(ROOT, "gta6_viral_short.mp4")


def main():
    lst = os.path.join(BUILD, "concat.txt")
    with open(lst, "w") as f:
        for i, sc in enumerate(SCENES):
            f.write(f"file '{os.path.join(SEG_DIR, f's{i:02d}.mp4')}'\n")

    video = os.path.join(BUILD, "video_only.mp4")
    run([FF, "-hide_banner", "-loglevel", "error", "-y",
         "-f", "concat", "-safe", "0", "-i", lst,
         "-c", "copy", "-movflags", "+faststart", video])

    audio = os.path.join(BUILD, "audio_master.wav")

    # ---- two-pass EBU R128 normalisation to -14 LUFS (YouTube/TikTok target)
    m = run([FF, "-hide_banner", "-i", audio, "-af",
             "loudnorm=I=-14:TP=-1.0:LRA=9:print_format=json", "-f", "null", "-"],
            quiet=True)
    blob = m.stderr[m.stderr.rindex("{"):m.stderr.rindex("}") + 1]
    meas = json.loads(blob)
    print("measured:", {k: meas[k] for k in
                        ("input_i", "input_tp", "input_lra", "input_thresh")})
    norm = os.path.join(BUILD, "audio_norm.wav")
    run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", audio, "-af",
         ("loudnorm=I=-14:TP=-1.0:LRA=9:linear=true"
          f":measured_I={meas['input_i']}:measured_TP={meas['input_tp']}"
          f":measured_LRA={meas['input_lra']}:measured_thresh={meas['input_thresh']}"
          f":offset={meas['target_offset']}"),
         "-c:a", "pcm_s16le", norm])
    audio = norm
    run([FF, "-hide_banner", "-loglevel", "error", "-y",
         "-i", video, "-i", audio,
         "-map", "0:v:0", "-map", "1:a:0",
         "-c:v", "copy",
         "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
         "-shortest", "-movflags", "+faststart",
         "-metadata", "title=GTA VI — اربح من وراء الضجة",
         "-metadata", "comment=Rendered autonomously with FFmpeg + Pillow + HarfBuzz shaping",
         OUT])

    print(f"FINAL {OUT}")
    print(f"duration {probe_dur(OUT):.2f}s  size {os.path.getsize(OUT)/1e6:.1f} MB")


if __name__ == "__main__":
    main()
