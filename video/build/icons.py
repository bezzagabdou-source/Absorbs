# -*- coding: utf-8 -*-
"""Hand-built line icon set (supersampled, glow)."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
S = 4

def _fin_glow(im, glow, color):
    sm = im.resize((im.width // S, im.height // S), Image.LANCZOS)
    a = np.asarray(sm).astype(np.float32) / 255
    halo = np.asarray(sm.filter(ImageFilter.GaussianBlur(glow))).astype(np.float32) / 255 * .9
    merged = np.clip(a + halo * .6, 0, 1)
    rgb = np.zeros(a.shape + (3,), np.float32)
    rgb += a[..., None] * 255
    rgb += halo[..., None] * np.array(color, np.float32)
    return (Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB'),
            Image.fromarray((merged * 255).astype(np.uint8), 'L'))

def icon(name, size=140, stroke=9, glow=0., color=(90, 170, 255)):
    im = Image.new('L', (size * S, size * S), 0)
    d = ImageDraw.Draw(im)
    SZ = size * S; st = int(stroke * S); m = SZ * .12; c = .5
    def L(pts, w=None, close=False):
        w = w or st
        p = [(x * SZ, y * SZ) for x, y in pts]
        if close: p = p + [p[0]]
        d.line(p, fill=255, width=w, joint='curve')
        for q in p: d.ellipse([q[0]-w/2, q[1]-w/2, q[0]+w/2, q[1]+w/2], fill=255)
    def star(cx, cy, r, inner=.24):
        pts = []
        for i in range(9):
            a = i * math.pi / 4 - math.pi / 2
            rr = r if i % 2 == 0 else r * inner
            pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        L(pts, close=True)
    if name == 'arrow_down':
        L([(c, .12), (c, .72)]); L([(c-.16, .56), (c, .74), (c+.16, .56)])
    elif name == 'arrow_up':
        L([(c, .88), (c, .28)]); L([(c-.16, .44), (c, .26), (c+.16, .44)])
    elif name == 'globe':
        d.ellipse([m, m, SZ-m, SZ-m], outline=255, width=st)
        ew = (SZ-2*m)*.34; d.ellipse([SZ/2-ew, m, SZ/2+ew, SZ-m], outline=255, width=st)
        L([(m*1.05, .36), (SZ-m*1.05, .36)], max(2, int(st*.8)))
        L([(m*1.05, .64), (SZ-m*1.05, .64)], max(2, int(st*.8)))
    elif name == 'target':
        d.ellipse([m, m, SZ-m, SZ-m], outline=255, width=st)
        r = SZ*.22; d.ellipse([SZ/2-r, SZ/2-r, SZ/2+r, SZ/2+r], outline=255, width=st)
        for a in range(4):
            ang = a*math.pi/2 + math.pi/4
            L([(c+math.cos(ang)*.30, c+math.sin(ang)*.30), (c+math.cos(ang)*.38, c+math.sin(ang)*.38)])
    elif name == 'bolt':
        L([(.58,.08),(.28,.54),(.5,.54),(.42,.92),(.74,.44),(.5,.44),(.58,.08)], close=True)
    elif name == 'heart':
        pts = []
        for i in range(80):
            t = i/80*2*math.pi
            x = 16*math.sin(t)**3
            y = 13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t)
            pts.append((c + x/38, c - y/38))
        L(pts, close=True)
    elif name == 'people':
        for dx in (-.16, .16):
            r = .1
            d.ellipse([SZ*(c+dx-r), SZ*.2, SZ*(c+dx+r), SZ*(.2+2*r)], outline=255, width=st)
            d.arc([SZ*(c+dx-.19), SZ*.52, SZ*(c+dx+.19), SZ*.95], 180, 360, fill=255, width=st)
    elif name == 'ruler':
        L([(.12,.5),(.88,.5)]); L([(.12,.34),(.12,.66)], w=max(2,int(st*.7)))
        L([(.88,.34),(.88,.66)], w=max(2,int(st*.7)))
        for x in (.12, .88):
            L([(x,.5),(x+(.1 if x < .5 else -.1),.4)], w=max(2,int(st*.7)))
            L([(x,.5),(x+(.1 if x < .5 else -.1),.6)], w=max(2,int(st*.7)))
    elif name == 'orbit':
        d.ellipse([m, SZ*.32, SZ-m, SZ*.68], outline=255, width=st)
        r = SZ*.06; d.ellipse([SZ-m-r, SZ/2-r, SZ-m+r, SZ/2+r], fill=255)
    elif name == 'sun':
        d.ellipse([SZ*.32, SZ*.32, SZ*.68, SZ*.68], outline=255, width=st)
        for i in range(12):
            a = i*math.pi/6
            L([(c+math.cos(a)*.22, c+math.sin(a)*.22), (c+math.cos(a)*.34, c+math.sin(a)*.34)], w=max(2,int(st*.7)))
    elif name == 'starfield':
        rng = np.random.default_rng(11)
        for _ in range(5):
            x, y = rng.uniform(.25, .75, 2); r = SZ*.035
            d.ellipse([SZ*x-r, SZ*y-r, SZ*x+r, SZ*y+r], fill=255)
        L([(.5,.1),(.5,.2)]); L([(.5,.8),(.5,.9)]); L([(.1,.5),(.2,.5)]); L([(.8,.5),(.9,.5)])
    elif name == 'galaxy':
        for arm in (0, math.pi):
            for t in range(1, 26):
                k = t/26; a = arm + k*3.2; r = k*.36
                x = c + math.cos(a)*r; y = c + math.sin(a)*r*.9; rr = SZ*.018*(1.1-k*.6)
                d.ellipse([SZ*x-rr, SZ*y-rr, SZ*x+rr, SZ*y+rr], fill=255)
        rr = SZ*.05; d.ellipse([SZ*c-rr, SZ*c-rr, SZ*c+rr, SZ*c+rr], fill=255)
    elif name == 'galaxies':
        for gx, gy in ((.3,.3),(.7,.28),(.28,.72),(.72,.7)):
            d.ellipse([SZ*(gx-.11), SZ*(gy-.11), SZ*(gx+.11), SZ*(gy+.11)], outline=255, width=max(2, st//2))
            for t in range(1, 12):
                k = t/12; a = k*4.; r = k*.10
                x = gx+math.cos(a)*r; y = gy+math.sin(a)*r; rr = SZ*.008
                d.ellipse([SZ*x-rr, SZ*y-rr, SZ*x+rr, SZ*y+rr], fill=255)
    elif name == 'spark':
        star(c, c, .40)
    elif name == 'eye':
        up = [(.12+.76*t/30, .5-.26*math.sin(math.pi*t/30)) for t in range(31)]
        dn = [(.88-.76*t/30, .5+.26*math.sin(math.pi*t/30)) for t in range(31)]
        L(up); L(dn)
        r = SZ*.10; d.ellipse([SZ*c-r, SZ*c-r, SZ*c+r, SZ*c+r], outline=255, width=st)
        d.ellipse([SZ*c-r*.42, SZ*c-r*.42, SZ*c+r*.42, SZ*c+r*.42], fill=255)
    elif name == 'moon_star':
        d.arc([SZ*.16, SZ*.16, SZ*.84, SZ*.84], 40, 320, fill=255, width=st)
        star(.74, .26, .10, .22)
    elif name == 'scale':
        L([(.5,.12),(.5,.86)]); L([(.18,.28),(.82,.28)])
        L([(.18,.28),(.08,.52),(.28,.52),(.18,.28)], close=True)
        L([(.82,.28),(.72,.52),(.92,.52),(.82,.28)], close=True)
        L([(.3,.86),(.7,.86)])
    elif name == 'dot':
        r = SZ*.13; d.ellipse([SZ*c-r, SZ*c-r, SZ*c+r, SZ*c+r], fill=255)
    elif name == 'down_left':
        L([(.78,.2),(.24,.66)]); L([(.24,.4),(.24,.68),(.52,.68)])
    else:
        d.ellipse([SZ*.2, SZ*.2, SZ*.8, SZ*.8], outline=255, width=st)
    return _fin_glow(im, glow, color)
