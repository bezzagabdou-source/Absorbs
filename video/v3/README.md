# «ضخم» — V3

Third NEXUS short film. **35.000 s · 1080×1920 · 30 fps · Arabic VO.**
Delivered file: `out/nexus_dahm_1080x1920.mp4` (master, CRF 18) + `out/nexus_dahm_web.mp4` (web).

Real-time 3D (Three.js) rendered frame-by-frame in headless Chromium, composited with
2D Arabic typography on a Canvas, then encoded with ffmpeg. Audio is 100% synthesized in
Python (numpy/scipy), mixed under the voice track, mastered to −14 LUFS.

## Beat sheet (locked to the voice-over)

| # | beat | in | out | picture | Arabic line |
|---|------|----|-----|---------|-------------|
| 01 | earth | 0.43 | 3.72 | photoreal Earth (day/night shader, city lights, clouds) | كل شيء تعرفه… موجود هنا. |
| 02 | pullback | 3.72 | 7.47 | Earth shrinks to a pale dot in the void | كرة صغيرة… معلّقة في الفراغ. |
| 03 | sun | 7.47 | 12.50 | Earth silhouetted against a rising Sun, sunspot surface | حولها نجم… أكبر منها ×1,300,000 |
| 04 | lightspeed | 12.50 | 17.63 | radial light streaks, photon beam, whip-pan | أقرب نجم بعد شمسنا… أربع سنوات ضوئية. |
| 05 | galaxy | 17.63 | 21.45 | 92k-point spiral galaxy, tilt + push in | وفي مجرّتنا… 200B نجم |
| 06 | web | 21.45 | 27.55 | galaxy → single dot, cosmic web filaments | والمجرة كلها… مجرد نقطة / في كونٍ أوسع مما تتخيّل. |
| 07 | you | 27.55 | 32.04 | targeting reticle on Earth, "YOU ARE HERE" dot | ومع كل هذا… أنت هنا. وتنظر. |
| 08 | endcard | 32.04 | 35.00 | radial burst, wordmark, CTA | الفضاء بالعربي. |

Cut points sit 0.12 s before each line so every word lands on a new image.

## Pipeline

```
src/timeline.py   →  src/timeline.json   (beat grid from measured VO durations)
src/core.js          boot(): WebGL renderer + bloom + film-grade pass (vignette/grain/CA)
src/scenes3d.js      earth (custom GLSL day/night), sun, galaxy, cosmic web
src/type.js          Arabic kinetic type: word reveals, wipes, counters, lower-thirds
src/film.js          the eight beats + camera + HUD + transitions
render.mjs           headless Chromium → frames/final2/f#####.jpg (Playwright)
src/audio.py         score + sound design + VO chain → out/mix3_master.wav
encode.sh            frames + wav → mp4 (x264 CRF 18, AAC 256k)
```

### Rebuild

```bash
export LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp     # chromium's nss/nspr libs
node render.mjs --out frames/final2             # ~13 min on 2 vCPU (swiftshader)
/tmp/venv/bin/python src/audio.py               # writes out/mix3.wav
ffmpeg -i out/mix3.wav -af loudnorm=I=-14:TP=-1.5:LRA=11 out/mix3_master.wav
./encode.sh
```

Chromium comes from `@sparticuz/chromium` (no system Chrome in the sandbox); WebGL runs on
SwiftShader with `--use-gl=angle --use-angle=swiftshader`.

## Notes

* Fonts: Alexandria + Kufam (Arabic, variable) from Google Fonts, Anton for Latin numerals.
  Arabic is drawn right-aligned with `ctx.direction='rtl'`, one visual line per `fillText`
  (no letter-spacing, no per-glyph transforms).
* Earth textures: three.js `examples/textures/planets` (day / night lights / clouds).
* The voice is a neural Arabic TTS performance, processed as a studio VO (HPF, presence EQ,
  compression, light saturation, plate reverb) and ducked 4 dB under the score.
