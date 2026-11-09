# -*- coding: utf-8 -*-
"""The ten shots + final grade."""
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from engine import *   # noqa
from timeline import CUT, END, FPS

def _plate(name):
    return Image.open(os.path.join(HERE, '..', 'assets', name)).convert('RGB')

def grade(im, tint=(1,1,1), contrast=1.0, lift=0.0, sat=1.0):
    a = np.asarray(im).astype(np.float32)/255
    g = a.mean(2, keepdims=True); a = g + (a-g)*sat
    a = np.clip((a-.5)*contrast+.5+lift, 0, 1)*np.array(tint, np.float32)
    return Image.fromarray(np.clip(a*255,0,255).astype(np.uint8),'RGB')

PL = {'dot': grade(_plate('a_dot.png'), (.94,.99,1.12), 1.18, -.015),
      'earth': grade(_plate('b_earth.png'), (.97,1.01,1.07), 1.10),
      'sun': grade(_plate('c_sun.png'), (1.03,.965,.905), 1.06, sat=.95),
      'galaxy': grade(_plate('d_galaxy.png'), (.99,1.0,1.06), 1.12, sat=1.05)}

def make_stars(w,h,n,r0,r1,seed,warm=0.):
    rng=np.random.default_rng(seed); img=Image.new('RGB',(w,h),(0,0,0)); d=ImageDraw.Draw(img)
    for _ in range(n):
        x=rng.uniform(0,w); y=rng.uniform(0,h); r=rng.uniform(r0,r1)
        b=rng.uniform(.22,1.)**2.3
        c=(int(255*b),int(250*b),int(min(255,255*b*(1+warm))))
        if r<1.3: d.point((x,y),fill=c)
        else: d.ellipse([x-r,y-r,x+r,y+r],fill=c)
    a=np.asarray(img.filter(ImageFilter.GaussianBlur(.6))).astype(np.float32)
    h2=np.asarray(img.filter(ImageFilter.GaussianBlur(7))).astype(np.float32)
    return np.clip(a+h2*.45,0,255)

SW,SH=1500,2650
STARS_FAR=make_stars(SW,SH,1300,.5,1.2,5,.1)
STARS_MID=make_stars(SW,SH,420,1.,2.,6,.05)
STARS_NEAR=make_stars(SW,SH,90,1.8,3.,7,0.)

def make_nebula(w,h,seed,col=(40,70,130)):
    rng=np.random.default_rng(seed)
    sm=rng.normal(.5,.30,(16,10)).astype(np.float32)
    im=Image.fromarray(np.clip(sm*255,0,255).astype(np.uint8),'L').resize((w,h),Image.BICUBIC)
    im=im.filter(ImageFilter.GaussianBlur(120))
    a=np.asarray(im).astype(np.float32)/255
    a=np.clip((a-.36)*2.,0,1)**1.4
    return np.clip(np.stack([a*col[0],a*col[1],a*col[2]],-1),0,255)
NEB=make_nebula(SW,SH,21)

def layer(src,z=1.,ox=0.,oy=0.,alpha=1.):
    sh,sw=src.shape[:2]; cw=sw/z; ch=cw*H/W
    if ch>sh: ch=sh; cw=ch*W/H
    cx=sw/2+ox*sw; cy=sh/2+oy*sh
    x0=np.clip(cx-cw/2,0,sw-cw); y0=np.clip(cy-ch/2,0,sh-ch)
    im=Image.fromarray(np.clip(src,0,255).astype(np.uint8),'RGB')
    im=im.crop((int(x0),int(y0),int(x0+cw),int(y0+ch))).resize((W,H),Image.BILINEAR)
    out=np.asarray(im).astype(np.float32)
    return out*alpha if alpha!=1 else out

def starfield(drift=(0,0),zoom=1.,neb=.8):
    bg=layer(NEB,zoom*.8,drift[0]*.3,drift[1]*.3,neb)
    bg+=layer(STARS_FAR,zoom,drift[0],drift[1])*.85
    bg+=layer(STARS_MID,zoom*1.3,drift[0]*1.5,drift[1]*1.5)*.7
    bg+=layer(STARS_NEAR,zoom*1.8,drift[0]*2.2,drift[1]*2.2)*.75
    return bg

def plate_shot(plate, zoom=1., fx=.5, fy=.5):
    sw,sh=plate.size; cw=sw/zoom; ch=cw*H/W
    if ch>sh: ch=sh; cw=ch*W/H
    cx,cy=sw*fx,sh*fy
    x0=np.clip(cx-cw/2,0,sw-cw); y0=np.clip(cy-ch/2,0,sh-ch)
    return np.asarray(plate.crop((int(x0),int(y0),int(x0+cw),int(y0+ch))).resize((W,H),Image.BILINEAR)).astype(np.float32)

def _disc_mask(n, feather=1.6):
    y,x=np.mgrid[0:n,0:n].astype(np.float32)
    d=np.sqrt((x-(n-1)/2)**2+(y-(n-1)/2)**2)
    return Image.fromarray((np.clip((n*.5-d)/feather,0,1)*255).astype(np.uint8),'L')

def plate_into(img, plate, cx, cy, size, alpha=1., rot=0., light=1.):
    n=max(6,int(size))
    im=plate.rotate(rot,resample=Image.BICUBIC,expand=False) if rot else plate
    m=_disc_mask(n, max(1.2,n*.03))
    if alpha<1: m=m.point(lambda v:int(v*alpha))
    paste_sprite(img, im.resize((n,n),Image.LANCZOS), m, cx, cy, 1., 'normal')
    if light>0: add_gauss_glow(img, cx-n*.14, cy-n*.16, n*.70, (40,95,185), .24*alpha*light)

def dot(img,cx,cy,r,s=1.):
    if s<=.002 or r<=.2: return
    add_glow(img,cx,cy,r*1.3,(255,255,255),.85*s,3.2)
    add_gauss_glow(img,cx,cy,r*3.2,(120,190,255),.50*s)
    add_gauss_glow(img,cx,cy,r*10,(55,115,205),.20*s)
    add_streak(img,cx,cy,r*22,max(1.2,r*.35),(95,165,245),.10*s)

def stamp_icon(img,t,t0,name,cx,cy,size=130,color=(90,170,255),dur=.5,alpha=1.):
    p=(t-t0)/dur
    if p<=0: return
    p=min(1.,p); sc=.6+.4*ease_out_back(p,2.4)
    a=min(1.,p*2.8)*alpha
    rgb,al=icons.icon(name,size=int(size*sc/10)*10,stroke=6,glow=8,color=color)
    paste_sprite(img,rgb,al,cx,cy,a,'add')
import icons  # noqa


# ============================================================ scenes
def scene_dot(t, lt, dur):
    p = min(1.0, lt / dur)
    z = 1.02 + 0.62 * ease_in_out(p ** 0.9)
    fy = 0.600 + 0.1422 / z
    img = plate_shot(PL['dot'], zoom=z, fx=0.473, fy=fy)
    g = smoothstep(0.20, 1.30, lt)
    dot(img, W / 2, 0.42 * H, (3.0 + 4.5 * g) * (z ** 0.35), 0.40 + 0.55 * g)
    add_gauss_glow(img, W / 2, 0.42 * H, 300 * z, (35, 80, 160), 0.12 * g)
    img += layer(STARS_MID, 1.25 + 0.12 * p, alpha=0.14)
    scrim(img, 0.74, 1080)
    brand(img, smoothstep(0.25, 0.9, lt))
    kicker(img, t, 0.34, 'صورة ناسا الحقيقية · ١٩٩٠', y=1128, size=29)
    stack(img, t, [
        dict(t=0.58, text='نقطة زرقاء باهتة', size=98, lh=130, path=FB, tracking=-1.5,
             colors={'زرقاء': CYAN, 'باهتة': CYAN}),
        dict(t=3.98, text='هذه هي الأرض.', size=62, lh=92, path=FB2, color=SOFT),
    ], y=1245, prev_dim=0.5)
    return img


def scene_earth(t, lt, dur):
    p = min(1.0, lt / dur)
    img = plate_shot(PL['earth'], zoom=1.06 + 0.34 * ease_in_out(p), fx=lerp(0.395, 0.44, p), fy=0.46)
    img += layer(STARS_FAR, 1.12, alpha=0.30)
    add_gauss_glow(img, 420, 730, 560, (28, 88, 168), 0.11 + 0.04 * math.sin(t * 1.6))
    scrim(img, 0.88, 900)
    textband(img, 1350, 470, 0.5)
    brand(img, 0.55)
    kicker(img, t, 4.70, 'الكوكب الثالث من الشمس', y=1020, size=27)
    stack(img, t, [
        dict(t=4.62, text='هذه هي الأرض.', size=88, lh=124, path=FB, colors={'الأرض': ICE}),
        dict(t=5.75, text='كل حروبنا،', size=70, lh=98, path=FB2),
        dict(t=7.30, text='وكل أحلامنا،', size=70, lh=98, path=FB2, colors={'أحلامنا،': CYAN}),
        dict(t=8.69, text='وكل من أحببناه...', size=68, lh=96, path=FB2, color=GOLD),
    ], y=1092, prev_dim=0.46)
    stamp_icon(img, t, 7.45, 'heart', 132, 1265, size=112, color=(255, 110, 140), alpha=0.9)
    stamp_icon(img, t, 8.85, 'people', 132, 1395, size=106, color=(255, 200, 130), alpha=0.9)
    stamp_icon(img, t, 5.85, 'target', 132, 1148, size=106, color=(150, 210, 255), alpha=0.9)
    return img


def scene_vanish(t, lt, dur):
    p = min(1.0, lt / dur)
    z = lerp(1.55, 0.86, ease_in_out(p))
    img = plate_shot(PL['galaxy'], zoom=z * 1.25, fx=0.51, fy=0.47) * 0.55
    img += starfield(drift=(0.05 * p, 0.02 * p), zoom=z, neb=0.6) * 0.75
    r = lerp(210, 5, ease_in_out(min(1.0, p * 1.05)) ** 0.75)
    a_ = 1 - smoothstep(0.55, 1.0, p)
    cx, cy = W / 2, H * 0.40
    if r > 5 and a_ > 0.01:
        plate_into(img, PL['earth'], cx, cy, r * 2.6, a_, rot=lt * 0.6)
    if r <= 40:
        dot(img, cx, cy, max(1.1, r * 0.6), 0.95)
    scrim(img, 0.74, 1100)
    textband(img, 1330, 330, 0.45)
    stack(img, t, [
        dict(t=10.76, text='فوق حبّة صغيرة', size=74, lh=104, path=FB),
        dict(t=12.00, text='تضيع في الظلام.', size=74, lh=104, path=FB, colors={'الظلام.': CYAN}),
    ], y=1268, prev_dim=0.45)
    fl = smoothstep(12.30, 12.55, t)
    if fl > 0:
        img = img * (1 - fl * 0.95) + 255 * fl * 0.95
    return img


def scene_sun(t, lt, dur):
    p = min(1.0, lt / dur)
    img = plate_shot(PL['sun'], zoom=1.04 + 0.26 * ease_in_out(p), fx=lerp(0.57, 0.50, p), fy=0.46)
    img = shake(img, lt, 14.0, 0.20)
    add_gauss_glow(img, 630, 780, 380, (255, 145, 55), 0.10)
    add_streak(img, 630, 780, 400, 20, (255, 190, 110), 0.18)
    img *= 0.90
    scrim(img, 1.0, 640)
    textband(img, 1030, 300, 0.46, blue=False)
    brand(img, 0.5)
    kicker(img, t, 12.95, 'الشمس · نجمنا', y=986, size=27)
    stack(img, t, [
        dict(t=13.00, text='الأرض تبعد عنها', size=54, lh=74, path=FB2, color=(238, 240, 245)),
    ], y=1036, prev_dim=0.4)
    bignum(img, t, 14.98, 150000000, unit='كيلومتر', label='١٥٠ مليون', y=690, size=190,
           color=GOLD, t1=17.45)
    hairline(img, t, 15.20, W / 2, 880, 700, GOLD, 0.8, 2, 0.5)
    stamp_icon(img, t, 15.30, 'arrow_down', W / 2 - 130, 940, size=74, color=(255, 205, 120), alpha=0.8)
    stamp_icon(img, t, 15.30, 'ruler', W / 2 + 130, 940, size=74, color=(255, 205, 120), alpha=0.8)
    chip(img, t, 16.25, 'لو كانت الشمس بحجم كرة سلّة... الأرض حبّة رمل', y=1500, size=28,
         color=(255, 220, 170))
    return img


def scene_stars(t, lt, dur):
    p = min(1.0, lt / dur)
    img = starfield(drift=(-0.02 * p, -0.01 * p), zoom=1.0 + 0.14 * ease_in_out(p), neb=0.55)
    suna = 1 - smoothstep(0.0, 1.0, p)
    add_gauss_glow(img, W / 2, H * 0.30, 340, (255, 200, 130), 0.30 * suna)
    dot(img, W / 2, H * 0.30, lerp(26, 3, p), 0.95 * suna)
    rng = np.random.default_rng(31)
    for i in range(70):
        st = rng.uniform(0, 0.75)
        if p < st: continue
        k = min(1.0, (p - st) / 0.15)
        splat_dot(img, rng.uniform(50, W - 50), rng.uniform(200, 1090),
                  (1.4 + 2.2 * rng.uniform()) * k, 0.55 * k)
    scrim(img, 0.86, 940)
    textband(img, 1120, 380, 0.42)
    brand(img, 0.5)
    kicker(img, t, 17.62, 'درب التبانة', y=1010, size=27)
    stack(img, t, [dict(t=17.95, text='والشمس...', size=72, lh=96, path=FB2)], y=1064, prev_dim=0.4)
    bignum(img, t, 18.95, 200000000000, unit='نجم في مجرّتنا', label='٢٠٠ مليار', y=606,
           size=150, color=ICE, t1=21.72)
    stamp_icon(img, t, 19.25, 'sun', W / 2 - 250, 830, size=64, color=(255, 210, 140), alpha=0.75)
    stamp_icon(img, t, 19.25, 'starfield', W / 2 + 250, 830, size=64, color=(150, 210, 255), alpha=0.75)
    return img


def scene_galaxy(t, lt, dur):
    p = min(1.0, lt / dur)
    img = plate_shot(PL['galaxy'], zoom=lerp(1.75, 1.02, ease_out(p)), fx=0.51, fy=0.465)
    img += layer(STARS_FAR, 1.3, alpha=0.18)
    add_gauss_glow(img, 545, 800, 270, (255, 190, 120), 0.20 * (1 - p * 0.45))
    add_streak(img, 545, 800, 320, 20, (255, 200, 140), 0.16)
    scrim(img, 0.92, 780)
    textband(img, 950, 400, 0.66)
    brand(img, 0.5)
    kicker(img, t, 21.92, 'المجرّة', y=846, size=27)
    stack(img, t, [dict(t=22.35, text='ومجرّتنا...', size=66, lh=90, path=FB2, color=SOFT)],
          y=900, prev_dim=0.4)
    bignum(img, t, 23.55, 2000000000000, unit='مجرّة في الكون المنظور', label='٢ تريليون',
           y=600, size=140, color=WHITE, t1=25.36, count_dur=1.2, glow_col=(255, 220, 180))
    stamp_icon(img, t, 23.78, 'galaxy', W / 2 - 260, 810, size=60, color=(215, 195, 255), alpha=0.7)
    stamp_icon(img, t, 23.78, 'galaxies', W / 2 + 260, 810, size=60, color=(215, 195, 255), alpha=0.7)
    return img


MANY = None
def scene_many(t, lt, dur):
    global MANY
    if MANY is None:
        r = np.random.default_rng(77); n = 850
        MANY = dict(x=r.uniform(0, 1, n), y=r.uniform(0, 1, n), z=r.uniform(.35, 1, n),
                    b=r.uniform(.3, 1, n), ph=r.uniform(0, 6.28, n), warm=r.random(n) > .72)
    S = MANY
    p = min(1.0, lt / dur)
    img = np.zeros((H, W, 3), np.float32) + np.array([2, 3, 8], np.float32)
    add_gauss_glow(img, W / 2, H * .44, 780, (22, 40, 86), 0.9)
    cxm, cym = W / 2, H * .44
    rot = t * 0.16
    for i in range(len(S['x'])):
        ang = S['ph'][i] + rot
        zz = S['z'][i]
        cx = cxm + (S['x'][i] - .5) * 2000 * zz * math.cos(ang) * 0.75
        cy = cym + (S['y'][i] - .5) * 1900 * zz + math.sin(ang) * 30 * zz
        if not (-30 < cx < W + 30 and 150 < cy < H + 30): continue
        b = S['b'][i] * (0.6 + 0.4 * math.sin(t * 2.4 + S['ph'][i])) * (0.5 + 0.5 * zz)
        col = (255, 215, 175) if S['warm'][i] else (160, 200, 255)
        splat_dot(img, cx, cy, (1.6 + 2.8 * zz) * (0.65 + 0.35 * b), b * 0.8, halo=col)
    for gi, (gx, gy, gr) in enumerate(((305, 600, 150), (800, 980, 120), (500, 1330, 190))):
        sp = galaxy_sprite(int(gr * .9), (185, 205, 255), seed=gi, tilt=gi * .7, squash=.42)
        paste_sprite(img, sp[0], sp[1], gx, gy, 0.55, 'add')
        for k in range(18):
            ang = k * .9 + t * .22 + gi
            rr = gr * (.2 + k / 18 * .8)
            splat_dot(img, gx + math.cos(ang) * rr, gy + math.sin(ang) * rr * .40, 1.4, .22,
                      halo=(255, 225, 190))
    img = bloom(img, 150, 16, 0.55)
    scrim(img, 0.66, 980)
    textband(img, 1230, 430, 0.40)
    brand(img, 0.45)
    kicker(img, t, 25.55, 'الكون المنظور', y=984, size=26)
    stack(img, t, [
        dict(t=25.72, text='كل نقطة هنا...', size=54, lh=76, path=FB2, color=SOFT),
        dict(t=26.35, text='مجرّة كاملة.', size=62, lh=86, path=FB2, color=ICE),
        dict(t=27.15, text='فمشكلتك اليوم...', size=78, lh=108, path=FB),
    ], y=1050, prev_dim=0.3)
    return img


def scene_dot2(t, lt, dur):
    p = min(1.0, lt / dur)
    e = ease_in_out(p)
    img = starfield(drift=(0, -0.03 * p), zoom=lerp(1.9, 0.9, e), neb=0.5)
    rng = np.random.default_rng(77)
    cx0, cy0 = W / 2, H * .40
    for i in range(220):
        ang = rng.uniform(0, 6.28); d = rng.uniform(300, 1100) * (1 - e) + 14
        splat_dot(img, cx0 + math.cos(ang) * d * .9, cy0 + math.sin(ang) * d,
                  (1.6 + 2.0 * (1 - e) ** 1.4), 0.55 * (1 - e) ** 1.4)
    dot(img, cx0, cy0, 8 + 14 * (1 - e), 0.85 + 0.4 * (1 - e))
    add_gauss_glow(img, cx0, cy0, 330, (30, 70, 140), 0.18)
    scrim(img, 0.70, 1020)
    textband(img, 1330, 330, 0.45)
    stack(img, t, [dict(t=28.70, text='أصغر من نقطة.', size=94, lh=126, path=FB,
                        colors={'نقطة.': CYAN})], y=1286)
    return img


def scene_finale(t, lt, dur):
    p = min(1.0, lt / dur)
    img = starfield(drift=(0.015 * p, -0.02 * p), zoom=lerp(1.05, 0.88, p), neb=0.85)
    img = shake(img, lt, 7.0, 0.16)
    cx, cy = W / 2, H * .38
    burst = smoothstep(0.0, 2.4, lt)
    add_gauss_glow(img, cx, cy, 240 + 260 * burst, (60, 125, 215), 0.22 + 0.12 * burst)
    dot(img, cx, cy, lerp(9, 30, ease_out(min(1, lt / 1.9))), 1.15)
    add_streak(img, cx, cy, 560, 26, (150, 200, 255), 0.28 * burst)
    rays = smoothstep(2.1, 4.3, lt)
    if rays > 0:
        ov = Image.new('L', (W, H), 0); d = ImageDraw.Draw(ov)
        for k in range(16):
            ang = k * (2 * math.pi / 16) + .17
            d.line([cx + math.cos(ang) * 46, cy + math.sin(ang) * 46,
                    cx + math.cos(ang) * (46 + 460 * rays), cy + math.sin(ang) * (46 + 460 * rays)],
                   fill=int(52 * rays), width=2)
        add_mask(img, ov.filter(ImageFilter.GaussianBlur(3)), (150, 205, 255))
    scrim(img, 0.86, 900)
    textband(img, 1200, 420, 0.42)
    brand(img, 0.5)
    stack(img, t, [
        dict(t=30.40, text='انظر إلى السماء.', size=62, lh=86, path=FB2, color=SOFT),
        dict(t=31.80, text='كل شيء عظيم...', size=84, lh=114, path=FB),
        dict(t=33.35, text='يبدأ من نقطة.', size=100, lh=134, path=FB, colors={'نقطة.': GOLD}),
    ], y=1090, prev_dim=0.34)
    return img


def scene_endcard(t, lt, dur):
    img = starfield(drift=(0, -0.01 * lt), zoom=0.92, neb=0.75)
    cx, cy = W / 2, H * .33
    add_gauss_glow(img, cx, cy, 340, (55, 115, 205), 0.20)
    add_streak(img, cx, cy, 430, 20, (140, 190, 255), 0.22)
    dot(img, cx, cy, 11, 1.0)
    a1, dy1 = fadein(t, 0.1, 0.75, 30)
    draw_line(img, cx, cy + 140 + dy1, 'NEXUS', GROT, 122, fill=(252, 253, 255), alpha=a1,
              align='center', tracking=16, glow=16, shadow=(18, .95), glow_fill=(70, 130, 210))
    a2, dy2 = fadein(t, 0.5, 0.7, 24)
    draw_line(img, cx, cy + 300 + dy2, 'الفضاء بالعربي', TAJ, 52, fill=CYAN, alpha=a2 * .96,
              align='center', glow=8)
    hairline(img, t, 0.8, cx, cy + 408, 320, CYAN, 0.75, 3)
    a3, dy3 = fadein(t, 1.25, 0.6, 22)
    draw_line(img, cx, cy + 456 + dy3, 'من نقطة... إلى الكون.', FB2, 44, fill=SOFT,
              alpha=a3 * .92, align='center')
    a4, dy4 = fadein(t, 1.85, 0.6, 26)
    if a4 > 0.004:
        yy = cy + 610 + dy4; w = 480
        ovp = Image.new('L', (W, H), 0)
        ImageDraw.Draw(ovp).rounded_rectangle([cx - w / 2, yy, cx + w / 2, yy + 112],
                                              radius=56, fill=int(255 * a4))
        paste_mask(img, ovp, (255, 255, 255))
        draw_line(img, cx, yy + 76, 'تابع  NEXUS', TAJ, 50, fill=(6, 9, 18), alpha=a4, align='center')
    a5, dy5 = fadein(t, 2.3, 0.6, 18)
    draw_line(img, cx, cy + 770 + dy5, 'حلقة جديدة كل يوم', FB2, 36, fill=(188, 208, 230),
              alpha=a5 * .85, align='center')
    stamp_icon(img, t, 2.55, 'arrow_up', cx, cy + 860, size=64, color=(150, 200, 255), alpha=0.8)
    return img


# ============================================================ post
def bloom(img, thresh=200, radius=24, strength=0.55):
    small = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((W // 4, H // 4), Image.BILINEAR)
    a = np.asarray(small).astype(np.float32)
    m = np.clip((a.max(2, keepdims=True) - thresh) / (255 - thresh + 1e-6), 0, 1)
    b = Image.fromarray(np.clip(a * m, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius // 2))
    return img + np.asarray(b.resize((W, H), Image.BILINEAR)).astype(np.float32) * strength

_VIG = None
def vignette(img, strength=.58):
    global _VIG
    if _VIG is None:
        d = np.sqrt(((GX - CX) / CX) ** 2 + ((GY - CY) / CY) ** 2) / 1.414
        _VIG = np.clip(1 - d, 0, 1) ** 0.8
    img *= np.clip(1 - strength * (1 - _VIG), 0, 1)[..., None]

_G = [np.random.default_rng(s).normal(0, 1, (H, W)).astype(np.float32) for s in (1, 2, 3)]
def grain(img, amount=5.5, seed=0):
    img += (_G[seed % 3] * amount)[..., None]

SHOT_LIST = [(CUT['dot'], 'dot'), (CUT['earth'], 'earth'), (CUT['vanish'], 'vanish'),
             (CUT['sun'], 'sun'), (CUT['stars'], 'stars'), (CUT['galaxy'], 'galaxy'),
             (CUT['many'], 'many'), (CUT['dot2'], 'dot2'), (CUT['finale'], 'finale'),
             (CUT['endcard'], 'endcard')]
FUNCS = dict(dot=scene_dot, earth=scene_earth, vanish=scene_vanish, sun=scene_sun,
             stars=scene_stars, galaxy=scene_galaxy, many=scene_many, dot2=scene_dot2,
             finale=scene_finale, endcard=scene_endcard)
FLASHES = [(CUT['earth'], .45), (CUT['sun'], .60), (CUT['galaxy'], .40), (CUT['many'], .34), (CUT['finale'], .50)]
CHROMA = [(CUT['sun'], 1.8), (CUT['galaxy'], 1.1), (CUT['finale'], 2.0)]

def shot_bounds(t):
    for i in range(len(SHOT_LIST) - 1):
        a, n = SHOT_LIST[i]; b = SHOT_LIST[i + 1][0]
        if a <= t < b: return n, t - a, b - a
    return SHOT_LIST[-1][1], t - CUT['endcard'], END - CUT['endcard']

def render_frame(t):
    name, lt, dur = shot_bounds(t)
    img = FUNCS[name](t, lt, dur).astype(np.float32)
    img = np.clip(img, 0, 255)
    lum = img.mean(2, keepdims=True) / 255
    img = img * (np.array([.975, 1, 1.045], np.float32) * (1 - lum)
                 + np.array([1.025, 1, .98], np.float32) * lum)
    for ft, pk in FLASHES:
        d = abs(t - ft)
        if d < .09: img = img * (1 - (1 - d / .09) * pk) + 255 * (1 - d / .09) * pk
    amp = 0.0
    for ft, pk in CHROMA:
        d = abs(t - ft)
        if d < .30: amp = max(amp, pk * (1 - d / .30))
    if amp > .02:
        img[..., 0] = np.roll(img[..., 0], int(3 * amp), axis=1)
        img[..., 2] = np.roll(img[..., 2], -int(3 * amp), axis=1)
    img = bloom(img)
    vignette(img)
    grain(img, 5.5, int(t * 60) % 3)
    img = np.tanh(np.clip(img, 0, 255) / 255 * 1.03) * 255
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB')
