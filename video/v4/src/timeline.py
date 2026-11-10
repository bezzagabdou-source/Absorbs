# -*- coding: utf-8 -*-
"""Builds the beat grid from measured VO durations -> timeline.json (shared by JS + audio)."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.join(HERE, '..','vo','durs.json')
d = json.load(open(V))
TEMPO = 1.13
raw = [d[f'{i:02d}.mp3']['dur'] for i in range(1, 9)]
dur = [round(x / TEMPO, 4) for x in raw]
FPS = 30
TOTAL = 35.0
lead, tail = 0.30, 0.75
gaps_n = len(dur) - 1
gap = (TOTAL - sum(dur) - lead - tail) / gaps_n
starts, t = [], lead
for x in dur:
    starts.append(round(t, 4)); t += x + gap
end = round(starts[-1] + dur[-1] + tail, 4)
assert abs(end - TOTAL) < 1e-4, end
PRE = 0.10  # visual cut pre-lap before each line
cuts = [round(max(0.0, s - PRE), 4) for s in starts]
beat_names = ['earth', 'pullback', 'sun', 'lightspeed', 'galaxy', 'web', 'you', 'end']
beats = []
for i in range(8):
    a = cuts[i]
    b = cuts[i + 1] if i < 7 else TOTAL
    beats.append({'id': beat_names[i], 'start': a, 'end': round(b, 4),
                  'vo': starts[i], 'vodur': dur[i]})
out = {'fps': FPS, 'total': TOTAL, 'tempo': TEMPO, 'gap': round(gap, 6),
       'lines': [{'i': i + 1, 'start': starts[i], 'dur': dur[i]} for i in range(8)],
       'beats': beats}
json.dump(out, open(os.path.join(HERE, 'timeline.json'), 'w'), indent=1)
for b in beats:
    print(f"{b['id']:10s} {b['start']:6.3f} -> {b['end']:6.3f}  ({b['end']-b['start']:5.3f}s) vo@{b['vo']:.3f}")
print('gap', gap, 'end', end, 'frames', TOTAL * FPS)
