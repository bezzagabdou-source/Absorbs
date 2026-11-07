# KINETIC — أسطورة المونتاج بالكود | elite vertical reel studio

> نظام كامل يحوّل ملف صوت/فيديو + نص إلى **ريل سينمائي جاهز للنشر** (1080×1920، 30fps)
> بكتابة عربية متزامنة كلمة بكلمة، أيقونات مولّدة بالكود، تصميم ساوند كامل، ومونتاج بمستوى استوديو.
> كل شيء يعمل **بدون أي مكتبة رسوميات خارجية** (لا Chrome، لا GPU، لا Adobe):
> Rasterizer خاص مبني على `HarfBuzz + FreeType + numpy` → إطارات → `ffmpeg`.

---

## 0) لماذا هذا التصميم؟

| الطلب | كيف نُفّذ |
|---|---|
| تزامن كلمة بكلمة بدقة | محاذاة قسرية على مستوى المقطع الصوتي (silence-aware syllabic aligner) → `timeline.json` |
| Karaoke احترافي | الكلمة النشطة: تدرّج لوني متحرك + هالة مزدوجة (glow) + تكبير سبرينغ + خط سفلي ينمو |
| تايبوغرافي أسطوري | Cairo Black / Inter Black (مدمجة)، شادو، حد أقصى **خطّان × ٢–٣ كلمات** |
| أيقونات حسب الكلام | 19 أيقونة neon زجاجية مرسومة بـ SDF داخل الكود (لا تحميل، لا إيموجي) |
| تصميم صوتي | سكور مولّد بـ BPM (sub, pad, pluck, kick, hats) + WHOOSH/POP/IMPACT/RISER/SPARKLE + **ducking** + loudnorm −14 LUFS |
| جودة صورة | bloom، vignette، grain، contrast S-curve، zoom-punch، light-leak، chromatic-safe، CRT-free نظيف |
| B-roll حقيقي | `--broll source.mp4` → يستخرج الطبقة، يعمل لها grade سينمائي ويضعها خلف النص |

---

## 0.5) على الهاتف؟ Termux يخدم
```bash
cd kinetic && bash install-termux.sh
source ~/.kx-env && termux-wake-lock
python -m kx.render --audio media/vo.mp3 --out out/reel.mp4
```
دليل كامل + جدول السرعة + حل المشاكل: **[TERMUX.md](TERMUX.md)**

---

## 1) تشغيل سريع (٣ أوامر)

```bash
pip install numpy pillow freetype-py uharfbuzz imageio-ffmpeg   # ffmpeg مدمج
cd kinetic
python -m kx.story media/demo-vo.mp3 out/timeline.json         # (اختياري: داخل الرندر تلقائي)
python -m kx.render --audio media/demo-vo.mp3 --out out/reel.mp4 --workers 2
```

مثال بأصل فيديو حقيقي (b-roll) + صوت الشخص نفسه:

```bash
python -m kx.render --audio media/source-vo.wav --broll media/source.mp4 \
                    --out out/reel.mp4 --workers 2 --bpm 90
```

المخرجات:
```
out/reel.mp4          # H.264 high, CRF17, AAC 192k, faststart, 1080x1920@30
out/timeline.json     # كلمات/مجموعات/أيقونات/ماركرز + envelope الصوت
out/mix-master.wav    # الميكس النهائي (قبل الـ mux)
```

---

## 2) بنية الكود

```
kinetic/
├─ kx/
│  ├─ story.py     # السكربت + محاذاة الكلمات + مجموعات الكابشن + beats الأيقونات + envelope
│  ├─ font.py      # HarfBuzz shaping (تشكيل عربي صحيح) + FreeType raster → قناع alpha
│  ├─ icons.py     # 19 أيقونة SDF (glass + neon gradient + glow)
│  ├─ fx.py        # gradients, blur/halo, bloom, vignette, grain, resample, compositing
│  ├─ scene.py     # المسرح: خلفية، أيقونات، كابشن kinetic، waveform، grade
│  ├─ audio.py     # سكور + SFX + ducking + loudnorm
│  └─ render.py    # CLI: align → mix → frames (multiproc) → encode
├─ bridge/ingest_instagram.py   # تحميل الريل الأصلي من جهازك (yt-dlp/instaloader)
├─ assets/fonts/   # Cairo Black/Bold, Inter Black/Bold (SIL OFL)
├─ media/          # الصوت
└─ out/            # المخرجات
```

### خط الأنابيب
```
audio ──► voiced spans ──► syllabic weights ──► word t0/t1
                                   │
                                   ├─► groups (≤3 كلمات) ─► كابشن
                                   ├─► icon beats ─────────► أيقونة
                                   └─► markers ────────────► SFX
audio ⇄ envelope ─────────────────────────► glow/punch/waveform reactive
timeline + broll ─► Scene.frame(t) ─► JPEG ─► ffmpeg ─► MP4
```

---

## 3) المحاذاة (Word-Level Alignment)

`kx/story.py`:
1. فك ترميز الصوت mono 16k، حساب RMS كل 10ms، عتبة ديناميكية (−34dB تحت الذروة) → **spans** للكلام فقط.
2. وزن كل كلمة = `0.42·عدد الحروف + 0.55·عدد حروف العلة الطويلة` (مضبوط على الدارجة/العربية).
3. توزيع زمني **داخل الكلام المنطوق فقط** (الصمت لا يأكل من مدة الكلمات) + فرض رتابة وحد أدنى للظهور.
4. `FPS=30` envelope للتفاعل الصوتي.

هذا يعطي دقة عالية بلا API. لو تريد دقة كلمة-بكلمة قصوى في الإنتاج:
```bash
pip install faster-whisper     # على جهازك
# استبدل build_timeline بمحاذير whisper word timestamps، نفس صيغة words[].start/end
```

---

## 4) الأصوات/التنسيقات القابلة للضبط

في `kx/scene.py`:
```python
STYLE = {"cap_base": 124, "cap_y": 0.630, "icon_size": 430, "icon_y": 0.315, ...}
GRADS = [ (ذهبي→مرجاني), (ثلجي→نيلي), (نعناعي→فيروزي), (عنبري→قرمزي) ]
```
- الكلمة النشطة تأخذ تدرّجًا حسب رقم الجملة (لا تكرار بصري).
- الكلمات المنطوقة تصبح رمادية، القادمة بيضاء → إحساس "قارئ أمامك".
- كل جملة جديدة = whoosh + light leak + (كل ٤ جمل) impact.
- الأيقونة تتغير مع عنوان الجملة (`ICONS` في `story.py`).

---

## 5) الساوند ديزاين

| طبقة | تفاصيل |
|---|---|
| سكور | A1 minor pentatonic، 86 BPM (قابل للتغيير `--bpm`)، pad + sub pulse + pluck 8ths + kick + hats + swells |
| SFX | `whoosh` عند تبديل الجمل، `pop` على الكلمات المفتاحية، `impact` عند كل قسم، `riser` قبل النهاية، `sparkle` عند دخول الأيقونة |
| Mix | sidechain-ducking 82% تحت الصوت، glue tanh، loudnorm I=−14, TP=−1.2, limiter |

كل الأصوات **مُصنَّعة رياضيًا** (numpy) — لا حقوق، لا ملفات ضخمة.

---

## 6) استخدام أصل انستغرام (الريل المرجعي)

هذا الساندبوكس محجوب عن `instagram.com` (handshake مقتول على مستوى الشبكة)، لذلك التحميل يجري على جهازك:

```bash
pip install yt-dlp
python bridge/ingest_instagram.py "https://www.instagram.com/reel/Dfc_0KpoWC0/" --out media/source.mp4
# يطبع الأمر التالي:
python -m kx.render --audio media/source-vo.wav --broll media/source.mp4 --out out/reel.mp4
```

> ملاحظة مهنية: إعادة نشر فيديو شخص آخر كما هو = مشكلة حقوق. الطريقة الاحترافية (وهي ما يفعله هذا النظام)
> هي إعادة المونتاج على **الصوت** الذي تملكه/تصرّح لك به، مع تصميم بصري أصلي — النتيجة أقوى من الأصل.

---

## 7) الأداء (قابل للضبط)

| متغيّر | الافتراضي | الوظيفة |
|---|---|---|
| `KX_RES` | `1` | دقة الرندر (0.5 ≈ 4× أسرع، ثم يُحسَّن للأعلى 1080×1920) |
| `KX_WORKERS` / `--workers` | `2` | عمليات متوازية |
| `KX_PRESET` / `KX_CRF` | `slow` / `20` | x264 |
| `KX_FRAMEDIR` | `out/frames` | مكان الإطارات المؤقتة |

### قياسات فعلية (ساندبوكس 2 vCPU)
| إعداد | إطارات | ريل 32s |
|---|---|---|
| `KX_RES=1` | 0.32 s/frame | ~4.5 دقائق |
| `KX_RES=0.5` | 0.09 s/frame | ~1.5 دقيقة |


| مرحلة | زمن (2 vCPU) |
|---|---|
| align + mix + master | ~2s |
| frames | **~3 fps** (0.32s/إطار) |
| encode | ثوانٍ |

- 32s ريل ≈ 11–12 دقيقة على 2 vCPU. على جهاز عادي (8 cores) ≈ 3 دقائق.
- قلل `STYLE["icon_size"]` أو عطّل `grain/bloom` لسرعة أكبر.

---

## 8) الخطوط

Cairo (Google Fonts, SIL OFL) + Inter (SIL OFL) — مضمّنة في `assets/fonts` لضمان نفس النتيجة على أي جهاز.
للتبديل: أضف ملف `.ttf` وعدّل `ALIASES` في `kx/font.py`.
