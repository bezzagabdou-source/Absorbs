"""Compose kinetic captions, emojis, HUD and transitions onto the motion plates."""
import json
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (ROOT, FF, BUILD, W, H, FPS, font, shape,  # noqa: E402
                    ease_out_cubic, ease_out_back, load_emoji, paste_glow,
                    GOLD, GREEN, CYAN, PINK, WHITE)
from script import SCENES, TRANSITIONS, word_weights  # noqa: E402
import imageio_ffmpeg

GAP = 0.16
TRANS_F = 10
PLATE_DIR = os.path.join(BUILD, "plates")
SEG_DIR = os.path.join(BUILD, "segments")
TIMELINE = json.load(open(os.path.join(BUILD, "timeline.json")))
TIMING = TIMELINE["timing"]
TOTAL = TIMELINE["total"]
STARTS = TIMELINE["scene_starts"]

PAL = {"gold": GOLD, "green": GREEN, "cyan": CYAN, "pink": PINK, "white": WHITE}
AR_NAME = "Kufi900.ttf"
LAT_NAME = "KufiLatin900.ttf"

# ---- vertical layout map (safe zone aware, clear of TikTok/Shorts UI) ----
TOP_UI = 120
TITLE_TOP = 296          # special title / lockup band
CAP_BOTTOM = 1286        # captions end above handle chip (1530)
HANDLE_Y = 1530


def palette(style):
    return PAL[style]


# ------------------------------------------------------------------ HUD
def draw_hud(img, t, progress):
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, 54):
        gd.line((x, 0, x, H), fill=(255, 255, 255, 7))
    for y in range(0, H, 54):
        gd.line((0, y, W, y), fill=(255, 255, 255, 7))
    img.alpha_composite(grid)
    d = ImageDraw.Draw(img)

    # top progress bar
    w = max(int(W * progress), 1)
    bar = Image.new("RGBA", (w, 8))
    bd = ImageDraw.Draw(bar)
    for x in range(w):
        f = x / W
        bd.line((x, 0, x, 8), fill=(int(255 * f), int(226 - 24 * f), int(255 - 195 * f), 255))
    img.alpha_composite(bar, (0, 0))
    d = ImageDraw.Draw(img)

    # LIVE pill
    d.rounded_rectangle((42, 46, 196, 96), radius=25, fill=(0, 0, 0, 140),
                        outline=(255, 54, 84, 235), width=2)
    pulse = 0.5 + 0.5 * math.sin(t * 6.2)
    d.ellipse((62, 62, 80, 80), fill=(255, 54, 84, int(150 + 105 * pulse)))
    d.text((92, 58), "LIVE", font=font(30, LAT_NAME), fill=(255, 255, 255, 245))

    # GTA VI pill
    fb = font(38, LAT_NAME)
    lw = d.textlength("GTA VI", font=fb)
    d.rounded_rectangle((W - 42 - lw - 44, 46, W - 42, 96), radius=25,
                        fill=(0, 0, 0, 140), outline=(255, 201, 60, 215), width=2)
    d.text((W - 42 - lw - 22, 54), "GTA VI", font=fb, fill=GOLD)

    # handle chip (bottom, above platform UI)
    fh = font(40, AR_NAME)
    handle = shape("محتوى جديد كل يوم")
    hw = d.textlength(handle, font=fh) + 26
    d.rounded_rectangle(((W - hw) / 2 - 36, HANDLE_Y, (W + hw) / 2 + 36, HANDLE_Y + 76),
                        radius=38, fill=(0, 0, 0, 135),
                        outline=(0, 255, 156, 150), width=2)
    d.text(((W - hw) / 2, HANDLE_Y + 10), handle, font=fh, fill=(255, 255, 255, 240))

    # scene dots
    n = len(SCENES)
    cur = max([i for i in range(n) if t >= STARTS[i]] or [0])
    tw = n * 28
    for i in range(n):
        cx = (W - tw) / 2 + i * 28 + 10
        col = GOLD if i <= cur else (255, 255, 255, 60)
        r = 7 if i == cur else 4
        d.ellipse((cx - r, HANDLE_Y + 112 - r, cx + r, HANDLE_Y + 112 + r), fill=col)
    return img


# ------------------------------------------------------------------ title band
def _stroke_text(img, xy, text, f, fill, stroke=13, sfill=(0, 0, 0, 246)):
    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(gl).text((xy[0], xy[1] + 5), text, font=f,
                            fill=(0, 0, 0, 190), stroke_width=stroke,
                            stroke_fill=(0, 0, 0, 190))
    img.alpha_composite(gl)
    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(gl).text(xy, text, font=f, fill=fill, stroke_width=stroke,
                            stroke_fill=sfill)
    img.alpha_composite(gl)


def draw_title(img, scene, t_local):
    """Special `GTA VI` lockup, only for the hook."""
    if scene["name"] != "hook":
        return
    d = ImageDraw.Draw(img)
    appear = GAP + 0.02
    if t_local < appear:
        return
    p = ease_out_cubic(min((t_local - appear) / 0.45, 1.0))
    flash = 1 - min((t_local - appear) / 0.6, 1.0)

    f1 = font(152, LAT_NAME)
    label = "GTA VI"
    lw = d.textlength(label, font=f1)
    x = (W - lw) / 2
    y = TITLE_TOP + int(44 * (1 - p))

    # chromatic split + white core
    ghost = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(ghost)
    gd.text((x - 9 - 4 * flash, y), label, font=f1, fill=(255, 40, 140, 190))
    gd.text((x + 9 + 4 * flash, y), label, font=f1, fill=(0, 215, 255, 190))
    img.alpha_composite(ghost)
    _stroke_text(img, (x, y), label, f1, (255, 255, 255, 255), stroke=11)

    # gold date bar
    f2 = font(64, LAT_NAME)
    date = "19 / 11 / 2026"
    w2 = d.textlength(date, font=f2)
    y2 = y + 202
    d.rounded_rectangle(((W - w2) / 2 - 40, y2 - 12, (W + w2) / 2 + 40, y2 + 84),
                        radius=18, fill=(0, 0, 0, int(165 * p)),
                        outline=(255, 201, 60, int(190 * p)), width=2)
    d.text(((W - w2) / 2, y2 - 3), date, font=f2, fill=(255, 201, 60, 255))

    # "3 days" urgency bar
    f3 = font(52, AR_NAME)
    chip = shape("باقي ٣ أيام فقط")
    w3 = d.textlength(chip, font=f3)
    y3 = y2 + 96
    pulse = 0.80 + 0.20 * math.sin(t_local * 8)
    icon_w = 74
    pad_l, pad_r = 24, 34
    bar_w = int(w3 + icon_w + pad_l + pad_r)
    bar_h = 84
    bar = Image.new("RGBA", (bar_w, bar_h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bar)
    bd.rounded_rectangle((0, 0, bar_w - 1, bar_h - 1), radius=bar_h // 2,
                         fill=(226, 18, 62, int(212 * pulse * p)))
    bd.rounded_rectangle((0, 0, bar_w - 1, bar_h - 1), radius=bar_h // 2,
                         outline=(255, 255, 255, int(70 * p)), width=2)
    bx = int((W - bar_w) / 2)
    img.alpha_composite(bar, (bx, y3))
    d = ImageDraw.Draw(img)
    d.text((bx + pad_l + icon_w + 6, y3 + 13), chip, font=f3,
           fill=(255, 255, 255, 255), stroke_width=3, stroke_fill=(120, 0, 20, 255))
    clock = load_emoji("23f0")
    if clock is not None:
        cs = int(58 * pulse)
        clock = clock.resize((cs, cs), Image.LANCZOS)
        img.alpha_composite(clock, (bx + pad_l - 4, int(y3 + (bar_h - cs) / 2)))


# ------------------------------------------------------------------ captions

def measure(d, text, f, stroke=12):
    """True ink width (textlength underestimates for this font)."""
    b = d.textbbox((0, 0), text, font=f, stroke_width=stroke)
    return b[2] - b[0], b[3] - b[1]


def wrap_lines(d, words, max_w, f, stroke=12):
    space = f.size * 0.30
    ws = [measure(d, shape(w[0]), f, stroke)[0] for w in words]
    lines, cur, cw = [], [], 0.0
    for w, ww in zip(words, ws):
        add = ww if not cur else ww + space
        if cw + add > max_w and cur:
            lines.append(cur)
            cur, cw = [w], ww
        else:
            cur.append(w)
            cw += add
    if cur:
        lines.append(cur)
    return lines


def draw_caption(img, scene, t_local, vo_dur):
    words = scene["words"]
    weights = word_weights([w[0] for w in words])
    tot = sum(weights)
    starts, acc = [], 0.0
    for w in weights:
        starts.append(GAP + acc / tot * vo_dur)
        acc += w
    act = -1
    for i, s in enumerate(starts):
        if t_local >= s:
            act = i
    if act < 0:
        return

    name = AR_NAME
    d = ImageDraw.Draw(img)
    max_w = W - 152
    stroke = 12

    size = int(94 * scene.get("weight_scale", 1.0))
    lines = None
    while size > 50:
        f = font(size, name)
        lines = wrap_lines(d, words, max_w, f, stroke)
        if len(lines) <= 3:
            ok = True
            for ln in lines:
                tw = sum(measure(d, shape(w[0]), f, stroke)[0] for w in ln)
                tw += f.size * 0.30 * (len(ln) - 1)
                if tw > max_w:
                    ok = False
                    break
            if ok:
                break
        size -= 4
    f = font(size, name)
    space = size * 0.30
    line_h = int(size * 1.42)
    block_h = line_h * len(lines)
    y = CAP_BOTTOM - block_h
    y = max(y, TITLE_TOP + 470)

    # widths per line for backing
    line_ws = []
    for ln in lines:
        tw = sum(measure(d, shape(w[0]), f, stroke)[0] for w in ln)
        tw += space * (len(ln) - 1)
        line_ws.append(tw)
    widest = max(line_ws)

    # soft feathered scrim (no hard rectangle)
    scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    pad_x, pad_y = 62, 36
    sd.rounded_rectangle(((W - widest) / 2 - pad_x, y - pad_y,
                          (W + widest) / 2 + pad_x, y + block_h + pad_y),
                         radius=74, fill=(1, 3, 7, 196))
    scrim = scrim.filter(ImageFilter.GaussianBlur(30))
    img.alpha_composite(scrim)

    text_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    seen = set()
    for li, ln in enumerate(lines):
        glyphs = []
        for w in ln:
            idx = next(k for k, ww in enumerate(words)
                       if ww[0] == w[0] and k not in seen)
            seen.add(idx)
            glyphs.append((shape(w[0]), w[1], idx))
        ws = [measure(d, g, f, stroke)[0] for g, _, _ in glyphs]
        total = sum(ws) + space * (len(ws) - 1)
        cx = W / 2 + total / 2
        row_y = y + li * line_h + (line_h - size * 1.30) / 2
        for (g, style, idx), gw in zip(glyphs, ws):
            col = palette(style)
            is_act = idx == act
            x = cx - gw
            if is_act:
                since = t_local - starts[idx]
                pop = 1.0 + 0.13 * max(0.0, 1 - since / 0.16)
                fs = int(size * pop)
                ff = font(fs, name)
                gw2 = measure(d, g, ff, stroke)[0]
                ox = x + (gw - gw2) / 2 - 2
                oy = row_y - (fs - size) * 0.55
                ImageDraw.Draw(glow_layer).text(
                    (ox, oy), g, font=ff, fill=col[:3] + (120,),
                    stroke_width=17, stroke_fill=col[:3] + (120,))
                _stroke_text(text_layer, (ox, oy), g, ff, col, stroke=stroke)
            else:
                # keyword colours stay visible; filler words read as white
                c = col if style != "white" else (250, 250, 252, 255)
                _stroke_text(text_layer, (x, row_y), g, f, c, stroke=stroke)
            cx -= (gw + space)

    img.alpha_composite(glow_layer.filter(ImageFilter.GaussianBlur(16)))
    img.alpha_composite(text_layer)

    # contextual emojis floating above the caption block
    codes = (scene.get("emoji") or [])[:2]
    for k, code in enumerate(codes):
        ic = load_emoji(code)
        if ic is None:
            continue
        appear = GAP + 0.10 + k * 0.42
        if t_local < appear:
            continue
        p = min((t_local - appear) / 0.30, 1.0)
        sc = ease_out_back(p)
        sz = int(126 * sc * (1 + 0.035 * math.sin((t_local - appear) * 7 + k)))
        if sz < 10:
            continue
        cx = W / 2 + widest / 2 - 34 - k * 124
        cy = y - 66 - (0 if k == 0 else 34)
        glow_rgb = palette(words[min(act, len(words) - 1)][1])[:3]
        paste_glow(img, ic, (cx, cy), sz, glow_rgb, alpha=80)


# ------------------------------------------------------------------ kicker
def draw_kicker(img, scene, t_local):
    labels = {"method": "الاستراتيجية", "audience": "الجمهور موجود",
              "clip": "الخطوة الأولى", "retention": "سر الاحتفاظ",
              "agent": "الأتمتة الكاملة", "scale": "عشرة أضعاف",
              "money": "المعادلة بسيطة", "cta": "الوقت ينفد"}
    lab = labels.get(scene["name"])
    if not lab or t_local < GAP + 0.22:
        return
    p = ease_out_cubic(min((t_local - GAP - 0.22) / 0.32, 1.0))
    d = ImageDraw.Draw(img)
    f = font(44, AR_NAME)
    s = shape(lab)
    w = measure(d, s, f, 4)[0]
    y = TITLE_TOP + 172
    pill = Image.new("RGBA", (int(w) + 90, 78), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    pd.rounded_rectangle((0, 0, pill.width - 1, 77), radius=39,
                         fill=(0, 0, 0, int(135 * p)),
                         outline=(255, 201, 60, int(175 * p)), width=2)
    img.alpha_composite(pill, (int((W - pill.width) / 2), y))
    d = ImageDraw.Draw(img)
    d.text(((W - w) / 2, y + 11), s, font=f, fill=(255, 201, 60, int(250 * p)))



# ------------------------------------------------------------------ extra cards
def draw_extra(img, scene, t_local):
    """AI-agent status pill and the CTA button."""
    name = scene["name"]
    if name == "agent":
        if t_local < GAP + 0.18:
            return
        p = ease_out_cubic(min((t_local - GAP - 0.18) / 0.35, 1.0))
        d = ImageDraw.Draw(img)
        f = font(42, LAT_NAME)
        label = "AI AGENT  /  AUTO CLIP"
        lw = d.textlength(label, font=f)
        w_box = lw + 118
        x0 = (W - w_box) / 2
        y = TITLE_TOP + 262
        box = Image.new("RGBA", (int(w_box), 82), (0, 0, 0, 0))
        bd = ImageDraw.Draw(box)
        bd.rounded_rectangle((0, 0, int(w_box) - 1, 81), radius=41,
                             fill=(0, 0, 0, int(165 * p)),
                             outline=(0, 255, 156, int(200 * p)), width=2)
        img.alpha_composite(box, (int(x0), y))
        d = ImageDraw.Draw(img)
        blink = 0.35 + 0.65 * abs(math.sin(t_local * 5.5))
        d.ellipse((x0 + 26, y + 31, x0 + 46, y + 51),
                  fill=(0, 255, 156, int(255 * blink * p)))
        d.text((x0 + 64, y + 19), label, font=f, fill=(236, 255, 250, int(250 * p)))

    elif name == "cta":
        if t_local < GAP + 0.30:
            return
        p = ease_out_cubic(min((t_local - GAP - 0.30) / 0.40, 1.0))
        y = CAP_BOTTOM + 34
        d = ImageDraw.Draw(img)
        f = font(52, AR_NAME)
        label = shape("تابعني الآن")
        lw = d.textlength(label, font=f)
        pw, ph = lw + 132, 96
        x0 = (W - pw) / 2
        pulse = 1 + 0.015 * math.sin(t_local * 7)
        hh = ph * pulse
        btn = Image.new("RGBA", (int(pw), int(hh)), (0, 0, 0, 0))
        bd = ImageDraw.Draw(btn)
        bd.rounded_rectangle((0, 0, int(pw) - 1, int(hh) - 1), radius=int(hh / 2),
                             fill=(0, 255, 156, int(232 * p)))
        img.alpha_composite(btn, (int(x0), int(y - (hh - ph) / 2)))
        d = ImageDraw.Draw(img)
        d.text(((W - lw) / 2, y + 16), label, font=f, fill=(3, 12, 8, int(250 * p)))


# ------------------------------------------------------------------ atmosphere
def _vig_mask():
    if not hasattr(_vig_mask, "m"):
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.sqrt(((xx - W / 2) / (W * 0.80)) ** 2 + ((yy - H * 0.5) / (H * 0.60)) ** 2)
        m = np.clip((r - 0.52) / 0.72, 0, 1) ** 1.55
        _vig_mask.m = Image.fromarray((m * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(46))
    return _vig_mask.m


def add_vignette(img, strength=0.62):
    dark = Image.new("RGBA", (W, H), (0, 0, 0, int(230 * strength)))
    img.alpha_composite(Image.composite(dark, Image.new("RGBA", (W, H), (0, 0, 0, 0)),
                                        _vig_mask()))


def bottom_gradient(img):
    if not hasattr(bottom_gradient, "g"):
        g = np.zeros((H, W, 4), np.uint8)
        ramp = np.clip((np.arange(H) - H * 0.46) / (H * 0.54), 0, 1) ** 1.5
        g[:, :, 3] = (ramp * 190).astype(np.uint8)[:, None]
        bottom_gradient.g = Image.fromarray(g, "RGBA")
    img.alpha_composite(bottom_gradient.g)


def glitch_frame(bg, prev, p):
    arr = np.array(bg.convert("RGB"))
    out = arr.copy()
    dx = int(20 * (1 - p))
    if dx:
        out[:, :, 0] = np.roll(arr[:, :, 0], dx, axis=1)
        out[:, :, 2] = np.roll(arr[:, :, 2], -dx, axis=1)
    for k in range(4):
        y = int((0.15 + 0.22 * k + 0.05 * p) * H)
        hgt = int(12 + 30 * (1 - p))
        shift = int((40 * (1 - p)) * (1 if k % 2 else -1))
        out[y:y + hgt] = np.roll(out[y:y + hgt], shift, axis=1)
    g = Image.fromarray(out).convert("RGBA")
    if prev is not None:
        g = Image.blend(prev, g, 0.35 + 0.65 * p)
    return g



# ------------------------------------------------------------------ sub-shots
SUBSHOT_LEN = 2.05        # target max seconds per shot
SCALES = [1.0, 1.17, 1.06, 1.24, 1.10]
ANCHORS = [(0.5, 0.5), (0.56, 0.44), (0.44, 0.56), (0.5, 0.40), (0.58, 0.52)]


def snap_zoom(bg, sub):
    """Hard punch-in for a new sub-shot (extra cut energy)."""
    s = SCALES[sub % len(SCALES)]
    if s <= 1.001:
        return bg
    cw, ch = int(W / s), int(H / s)
    ax, ay = ANCHORS[sub % len(ANCHORS)]
    x0 = int((W - cw) * ax)
    y0 = int((H - ch) * ay)
    return bg.crop((x0, y0, x0 + cw, y0 + ch)).resize((W, H), Image.LANCZOS)


def n_subshots(L):
    return max(1, int(round(L / SUBSHOT_LEN)))


# ------------------------------------------------------------------ segment
def read_tail(path, n):
    rd = imageio_ffmpeg.read_frames(path, pix_fmt="rgb24")
    meta = next(rd)
    keep = []
    for fr in rd:
        keep.append(fr)
        if len(keep) > n + 1:
            keep.pop(0)
    return [Image.frombytes("RGB", (meta["size"][0], meta["size"][1]), f)
            .resize((W, H), Image.LANCZOS) for f in keep[-n:]]


def render_segment(i):
    sc = SCENES[i]
    vo = TIMING[str(i + 1)] if str(i + 1) in TIMING else TIMING[i + 1]
    L = (GAP + vo) if i < len(SCENES) - 1 else (TOTAL - STARTS[i])
    nframes = int(round(L * FPS))
    plate = os.path.join(PLATE_DIR, f"p{i:02d}_{sc['name']}.mp4")
    prev_plate = (os.path.join(PLATE_DIR, f"p{i-1:02d}_{SCENES[i-1]['name']}.mp4")
                  if i else None)
    out = os.path.join(SEG_DIR, f"s{i:02d}.mp4")

    enc = subprocess.Popen(
        [FF, "-hide_banner", "-loglevel", "error", "-y",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16",
         "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
         "-x264-params", "keyint=60:min-keyint=30:scenecut=0", "-an", out],
        stdin=subprocess.PIPE)

    tail = read_tail(prev_plate, TRANS_F) if prev_plate and os.path.exists(prev_plate) else []
    ttype = TRANSITIONS[i - 1] if i else "cut"

    rd = imageio_ffmpeg.read_frames(plate, pix_fmt="rgb24")
    meta = next(rd)
    fi = 0
    bg = None
    for raw in rd:
        if fi >= nframes:
            break
        t_glob = STARTS[i] + fi / FPS
        t_loc = fi / FPS
        raw_img = Image.frombytes("RGB", (meta["size"][0], meta["size"][1]), raw)
        raw_img = raw_img.resize((W, H), Image.LANCZOS)
        bg = raw_img.convert("RGBA")

        if i > 0 and fi < TRANS_F and tail:
            p = fi / TRANS_F
            prev = tail[min(fi, len(tail) - 1)].convert("RGBA")
            if ttype == "whip":
                # extra plate-derived background for the slide
                bg = Image.new("RGBA", (W, H), (0, 0, 0, 255))
                off = int(W * (1 - ease_out_cubic(p)))
                bg.paste(prev, (-off, 0))
                bg.paste(prev, (W - off, 0))
                bg.paste(raw_img.convert("RGBA"), (-off, 0))
                bg.paste(raw_img.convert("RGBA"), (W - off, 0))
                bg = Image.blend(bg, bg.filter(ImageFilter.GaussianBlur(9)),
                                 0.6 * (1 - p))
            elif ttype == "glitch":
                bg = glitch_frame(bg.convert("RGB"), prev, p)
            else:
                bg = Image.blend(prev, bg, ease_out_cubic(min(p * 1.7, 1.0)))
                bg = Image.alpha_composite(
                    bg, Image.new("RGBA", (W, H), (255, 255, 255, int(210 * (1 - p) ** 2))))

        # ---- mid-scene snap-zoom cuts
        nsub = n_subshots(L)
        if nsub > 1:
            sub = min(int(t_loc / (L / nsub)), nsub - 1)
            bg = snap_zoom(bg, sub)
            since = t_loc - sub * (L / nsub)
            if sub > 0 and since < 0.05:
                a = int(150 * (1 - since / 0.05))
                bg = Image.alpha_composite(bg, Image.new("RGBA", (W, H), (255, 255, 255, a)))

        add_vignette(bg, 0.58)
        bottom_gradient(bg)
        if i == 0 and fi < 6:
            bg = Image.alpha_composite(
                bg, Image.new("RGBA", (W, H), (255, 255, 255, int(165 * (1 - fi / 6)))))

        draw_hud(bg, t_glob, min(t_glob / TOTAL, 1.0))
        draw_title(bg, sc, t_loc)
        draw_kicker(bg, sc, t_loc)
        draw_caption(bg, sc, t_loc, vo)
        draw_extra(bg, sc, t_loc)

        enc.stdin.write(bg.convert("RGB").tobytes())
        fi += 1

    while fi < nframes:
        enc.stdin.write((bg.convert("RGB") if bg else
                         Image.new("RGB", (W, H), (0, 0, 0))).tobytes())
        fi += 1
    enc.stdin.close()
    enc.wait()
    if enc.returncode != 0:
        raise RuntimeError(f"segment {i} failed")
    return out, nframes


if __name__ == "__main__":
    os.makedirs(SEG_DIR, exist_ok=True)
    idx = [int(x) for x in sys.argv[1:]] if len(sys.argv) > 1 else list(range(len(SCENES)))
    if os.environ.get("PARALLEL") == "1" and len(idx) > 1:
        from multiprocessing import Pool
        with Pool(2) as pool:
            for out, n in pool.imap_unordered(render_segment, idx):
                print(f"done {os.path.basename(out)} frames={n}", flush=True)
    else:
        for i in idx:
            out, n = render_segment(i)
            print(f"seg {i:02d} {SCENES[i]['name']:<10} frames={n}", flush=True)
    print("segments done")
