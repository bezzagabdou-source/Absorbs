"""Render high-quality 1080x1920 motion plates from stills (60 fps)."""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT, FF, BUILD, run  # noqa: E402
from script import SCENES, GRADES  # noqa: E402

SRC = {
    "neon_street.png": "video_assets/bg/neon_street.png",
    "miami1.png": "image-search/miami-vice-city-neon-night-skyline-palm--1.jpg",
    "vice_sunset.png": "video_assets/bg/vice_sunset.png",
    "gamer_setup.png": "video_assets/bg/gamer_setup.png",
    "ai_dashboard.png": "video_assets/bg/ai_dashboard.png",
}

# pre-scale factor: work larger than output then downsample for smooth motion
UP = 2.0

MOTIONS = {
    # slow cinematic push-in
    "push":      ("1.00 + 0.16*on/N", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),
    # slow pull-out
    "pull":      ("1.18 - 0.16*on/N", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),
    # restrained push for dense UI plates
    "push_soft": ("1.00 + 0.10*on/N", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),
    # fast aggressive push
    "push_fast": ("1.02 + 0.26*on/N", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),
    # lateral drift (whip-pan flavour)
    "whip":      ("1.20 + 0.05*on/N",
                  "(iw/2-(iw/zoom/2)) - (iw*0.045)*(1-on/N)",
                  "ih/2-(ih/zoom/2)"),
}


def build_plate(scene, dur, out):
    g = GRADES[scene["grade"]]
    z_expr, x_expr, y_expr = MOTIONS[scene["motion"]]
    n = max(int(round(dur * 60)), 2)
    frames = n
    z_expr = z_expr.replace("N", str(n))
    x_expr = x_expr.replace("N", str(n))
    y_expr = y_expr.replace("N", str(n))

    # work canvas
    ww, wh = int(1080 * UP), int(1920 * UP)

    vf = [
        # normalise to work canvas
        f"scale={ww}:{wh}:force_original_aspect_ratio=increase:flags=lanczos",
        f"crop={ww}:{wh}",
        f"zoompan=z='{z_expr}':"
        f"x='{x_expr}':y='{y_expr}':d={frames}:s=1080x1920:fps=60",
        # cinematic split-tone grade: teal shadows / warm highlights
        f"eq=saturation={g['sat']}:contrast={g['con']}:brightness={g['bri']}:gamma={g['gam']}",
        "colorbalance=rs=-0.07:gs=0.01:bs=0.09:rm=-0.02:bm=0.02:rh=0.05:gh=0.01:bh=-0.05",
        "vibrance=intensity=0.18",
        # crisp micro-contrast before bloom
        "unsharp=7:7:0.9:5:5:0.0",
        # subtle dreamy bloom
        "split[a][b]",
        "[b]gblur=sigma=14,eq=brightness=0.02:contrast=1.1[bl]",
        "[a][bl]blend=all_mode=screen:all_opacity=0.13",
        # deep vignette + film grain
        "vignette=angle=PI/4.0",
        "noise=alls=4:allf=t+u",
        "format=yuv420p",
    ]
    cmd = [FF, "-hide_banner", "-loglevel", "error", "-y",
           "-loop", "1", "-framerate", "60", "-t", f"{dur + 0.35:.3f}",
           "-i", os.path.join(ROOT, SRC[scene["bg"]]),
           "-vf", ",".join(vf),
           "-frames:v", str(frames + 20),
           "-c:v", "libx264", "-preset", "medium", "-crf", "15",
           "-pix_fmt", "yuv420p", "-an", out]
    run(cmd)
    return out


if __name__ == "__main__":
    from script import SCENES as S
    timing = {d["seg"]: d["dur"] for d in
              json.load(open(os.path.join(BUILD, "vo_proc", "timing.json")))}
    os.makedirs(os.path.join(BUILD, "plates"), exist_ok=True)
    order = list(S)
    for i, sc in enumerate(order):
        dur = timing[i + 1]
        out = os.path.join(BUILD, "plates", f"p{i:02d}_{sc['name']}.mp4")
        if os.path.exists(out) and os.path.getsize(out) > 100000:
            print(f"skip  {i + 1:02d} {sc['name']}")
            continue
        print(f"plate {i + 1:02d} {sc['name']:<10} {dur:5.2f}s -> {os.path.basename(out)}")
        build_plate(sc, dur, out)
    print("plates done")
