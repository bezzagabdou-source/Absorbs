# -*- coding: utf-8 -*-
"""V5 «هل وصل الإنسان للقمر؟» — VO retime (slow, cinematic), gaps that grow, 120.0 s grid."""
import json, os, subprocess
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VO = os.path.join(ROOT, 'vo')
FF = "/tmp/venv/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v9.0.2"

SPEED = 1.05           # 5% slower => heavier, documentary delivery
TOTAL = 120.0
LEAD = 0.20
TAIL = 2.40
GAIN0, GAIN1 = 0.85, 1.25   # gap grows across the film (momentum -> consequence)


def dur(path):
    e = subprocess.run([FF, '-hide_banner', '-i', path, '-f', 'null', '-'], capture_output=True, text=True).stderr
    l = [x for x in e.split('\n') if 'Duration' in x][0].split('Duration: ')[1].split(',')[0]
    h, m, s = l.split(':')
    return float(h) * 3600 + float(m) * 60 + float(s)


# ---- 1. slow each line down (rubberband-free: resample keeps pitch?? no) -> use atempo chain
LINES_IDX = [1, 2, 3, 4, 5, 6, 7, 9]   # line 08 (phone) cut: it made the film VO-heavy
raw = {}
for i in LINES_IDX:
    src = os.path.join(VO, f"{i:02d}_raw.wav")
    out = os.path.join(VO, f"{i:02d}.wav")
    if not os.path.exists(src):
        raise SystemExit(f'missing {src}')
    subprocess.run([FF, '-y', '-hide_banner', '-loglevel', 'error', '-i', src,
                    '-af', f'atempo={1/SPEED:.6f},highpass=f=78,equalizer=f=220:t=q:w=1.2:g=1.5,'
                           f'equalizer=f=3200:t=q:w=1.4:g=1.2,acompressor=threshold=-18dB:ratio=2.4:attack=8:release=180',
                    '-ar', '48000', '-ac', '1', out], check=True)
    raw[i] = dur(out)
x = np.array([raw[i] for i in LINES_IDX])

n_gap = len(x) - 1
need = TOTAL - TAIL - LEAD - x.sum()
gaps = np.linspace(GAIN0, GAIN1, n_gap)
gaps = gaps / gaps.sum() * need
if gaps.min() < 0.45:
    raise SystemExit(f'gaps too tight: {gaps.min():.2f}')

starts, t = [], LEAD
for i in range(len(x)):
    starts.append(round(t, 4))
    t += x[i] + (gaps[i] if i < n_gap else 0.0)
end = starts[-1] + x[-1]
assert abs(end + TAIL - TOTAL) < 1e-4, end

PRE = 0.12
ids = ['hook', 'rocks', 'laser', 'lro', 'myths', 'signal', 'witness', 'cta']
cuts = [round(max(0.0, s - PRE), 4) for s in starts]
beats = []
for i in range(8):
    a = cuts[i]
    b = cuts[i + 1] if i < 7 else TOTAL
    beats.append({'id': ids[i], 'start': a, 'end': round(b, 4), 'vo': starts[i], 'vodur': round(float(x[i]), 4)})
out = {'fps': 30, 'total': TOTAL, 'speed': SPEED, 'gaps': [round(float(g), 4) for g in gaps],
       'lines': [{'i': LINES_IDX[i], 'start': starts[i], 'dur': round(float(x[i]), 4)} for i in range(8)],
       'beats': beats}
json.dump(out, open(os.path.join(HERE, 'timeline.json'), 'w'), indent=1)
for b in beats:
    print(f"{b['id']:8s} {b['start']:7.3f} -> {b['end']:7.3f} ({b['end']-b['start']:5.2f}s) vo@{b['vo']:7.3f} dur {b['vodur']:6.2f}")
print('gaps', [round(float(g), 2) for g in gaps], 'end', round(end, 3), 'frames', int(TOTAL * 30))
