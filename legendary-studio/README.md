# 🎬 LEGENDARY STUDIO — استوديو المونتاج الأسطوري

محرك مونتاج سينمائي **تلقائي وكامل** يعمل محلياً: يأخذ فيديو (ريل 9:16 مثلاً)، يحلّل إيقاعه، يبني قائمة لقطات متزامنة مع النبضات، يرفع الجودة، يضيف عشرات التأثيرات البصرية، ويولّد **تصميماً صوتياً سينمائياً من الصفر** (بدون أي مكتبات أصوات)، ثم يخرّج MP4 جاهزاً للنشر.

> built for the reel: `https://www.instagram.com/reel/DfSkvUnxXb7/`

---

## ⚠️ أولاً: لماذا لم أستطع تنزيل الريل من هنا؟

البيئة المعزولة التي أعمل فيها تسمح بالوصول إلى **github.com / pypi.org / registry.npmjs.org فقط**. جرّبت فعلياً:

| المحاولة | النتيجة |
|---|---|
| `fetch` لصفحة الريل | `HTTP 403` |
| `curl https://www.instagram.com/...` | `SSL_ERROR_SYSCALL` (لا اتصال) |
| `yt-dlp --simulate` على الرابط | `Unable to download webpage: TLS/SSL connection has been closed` |

يعني: **الفيديو نفسه غير قابل للتنزيل من هذا الساندبوكس**، وليس خللاً في الكود. لذلك بنيت لك الاستوديو كاملاً + فيديو تجريبي مُرندَر فعلياً، وثلاث طرق لتدخل بها الفيديو الحقيقي:

1. **الأسرع:** افتح الاستوديو (المعاينة الحيّة) → اسحب ملف الريل المحفوظ على جهازك → اضغط «ابدأ المونتاج» → حمّل النتيجة. كل شيء يعمل محلياً.
2. **من جهازك:** `./setup.sh` ثم `.venv/bin/python download_reel.py "رابط_الريل" --cookies-from-browser chrome` ثم `-i out/source.mp4`.
3. **رابط مباشر:** لو عندك رابط `.mp4` من الـ CDN، استعمل `--direct` أو الصقه في خانة الرابط.

---

## 🚀 التشغيل في 3 أوامر

```bash
cd legendary-studio
./setup.sh        # ينشئ venv، ينزّل yt-dlp من GitHub، يثبّت FFmpeg الثابت + numpy + Flask
./studio.sh       # استوديو المتصفح على http://localhost:8000
```

أو بدون واجهة:

```bash
.venv/bin/python -m legendary.cli --demo                        # فيديو خيالي تجريبي ← مونتاج كامل
.venv/bin/python -m legendary.cli -i out/source.mp4 -o out/LEGEND.mp4 \
    --preset fantasy --height 1920 --bpm 128 --title "الأسطورة" \
    --subtitle "لحظة التحول" --outro "ABSORBS · LEGENDARY CUT"
```

### تنزيل الريل (على جهازك)

```bash
.venv/bin/python download_reel.py "https://www.instagram.com/reel/DfSkvUnxXb7/" \
    --cookies-from-browser chrome -o out/source.mp4
# أو بملف كوكيز:
.venv/bin/python download_reel.py "URL" --cookies cookies.txt -o out/source.mp4
# أو رابط MP4 مباشر:
.venv/bin/python download_reel.py --direct "https://....mp4" -o out/source.mp4
```

> إنستغرام غالباً يطلب جلسة دخول؛ `--cookies-from-browser` هو الأسهل. الريلات الخاصة تحتاج الحساب نفسه.

---

## 🔥 ماذا يفعل المحرك بالضبط؟

### قائمة المونتاج (EDL) — ذكية، ليست عشوائية
- **شبكة إيقاعية** BPM قابلة للضبط (افتراضي 128، لقطة كل نبضتين).
- **كشف انتقالات صوتية** (energy flux على PCM بـ 8 kHz عبر numpy).
- **كشف تغيّر المشاهد** بـ FFmpeg `select=gt(scene,…)` + `showinfo`.
- كل حد لقطة يُـ **snap** إلى أقرب نبضة/تغيّر مشهد حقيقي ⇒ إحساس «مونتاج على الموسيقى».
- 6 أنماط لقطات تتناوب: `hero` · `impact` · `glide` · `glitch` · `slow` · `rush`، ولكل نمط سرعة مختلفة (speed ramp 0.72× ↔ 1.38×).

### السلسلة البصرية (لكل لقطة، داخل filtergraph واحد)
| # | التأثير | الأداة |
|---|---|---|
| 1 | إعادة تخطيط زمني / Speed ramp | `setpts`, `fps`, `tpad` |
| 2 | رفع الدقة حتى 4K | `scale=flags=lanczos` |
| 3 | تنظيف الضجيج + حدة | `hqdn3d`, `unsharp` |
| 4 | تدرّج ألوان سينمائي (Teal & Orange / ذهبي / نيون) | `eq`, `colorbalance` |
| 5 | زووم و Pan ديناميكي (Ken Burns) | `zoompan` |
| 6 | اهتزاز كاميرا | `crop` بتعبيرات `sin(t)` |
| 7 | تشظي RGB + ضجيج glitch متقطّع | `rgbashift`, `noise` + timeline `enable` |
| 8 | ضبابية حلمية للحركة البطيئة | `gblur` |
| 9 | حبيبات فيلم + Vignette | `noise`, `vignette` |
| 10 | **وميض أبيض على كل كات** | `blend=screen` + `enable` |
| 11 | تسريبات ضوء متحركة | مصدر `gradients` + `blend` |
| 12 | عناوين عربية متحركة (تشكيل صحيح RTL) | `drawtext` + HarfBuzz + Noto Sans Arabic |
| 13 | شرائط سينمائية 2.35:1 | `drawbox` |
| 14 | خرج H.264 High / CRF 18 / `+faststart` | `libx264` |

### التصميم الصوتي — **مولّد بالكامل بـ numpy** (لا ملفات، لا حقوق)
`kick` · `snare` · `hi-hat` · `bass` · **pad/drone** · **whoosh** (ضجيج نطاقي متحرك بالـ FFT) · **sub impact** · **boom** · **riser** · **reverse cymbal** · **glitch stutter** · **drum roll** نهائي.
- كل كات له `whoosh` قبله و `impact` عنده.
- risers قبل اللحظات الكبرى، glitch على لقطات الـ glitch، slam ختامي.
- **Sidechain duck**: الموسيقى تنخفض تلقائياً تحت كل impact.
- مكس النهائي: صوت الفيديو الأصلي (مع `acompressor`) + المكس المولّد + `alimiter` لمنع القصّ.
- `--stems` يصدّر `stem_music.wav` و `stem_fx.wav` منفصلين.

### الهويات (`--preset`)
| preset | الطابع |
|---|---|
| `epic` | تباين عالٍ، Teal & Orange، ومضات قوية، glitch متوسط |
| `fantasy` | ذهبي/سماوي دافئ، تسريبات ضوء أقوى، زووم حالـم |
| `cyber` | نيون بنفسجي/سماوي، تشظي RGB قوي، اهتزاز أعلى |
| `clean` | تدرّج رصين، حبيبات خفيفة، وميض هادئ |

---

## 🧰 الأدوات الأسطورية من GitHub (مستعملة فعلاً)

| الأداة | من أين | الاستعمال هنا |
|---|---|---|
| **FFmpeg / libx264** | `github.com/FFmpeg/FFmpeg` | المحرك الكامل؛ نسخة static GPL عبر `imageio-ffmpeg` (لا تحتاج صلاحيات root) |
| **yt-dlp** | `github.com/yt-dlp/yt-dlp` | مُنسوخة حرفياً (`git clone`) إلى `vendor/yt-dlp` بواسطة `setup.sh`؛ تنزيل الريل |
| **Flask** | `github.com/pallets/flask` | استوديو المتصفح |
| **Noto Sans Arabic** | `github.com/google/fonts` | خط العناوين العربية + رخصة OFL مرفقة في `assets/fonts/` |
| **numpy** | `numpy/numpy` | تحليل الإيقاع + توليد كل الأصوات + توليد الفيديو التجريبي |
| **Pillow / imageio-ffmpeg** | PyPI | تغليف الوسائط والنسخة الثابتة لـ FFmpeg |
| **Real-ESRGAN** *(اختياري)* | `github.com/xinntao/Real-ESRGAN` | `--ai-upscale`: رفع دقة عصبي قبل المونتاج إن ثبّتّ الـ binary والموديلات |
| **RIFE / minterpolate** *(اختياري)* | `github.com/hzwer/Practical-RIFE` | حركة بطيئة حقيقية؛ بديل جاهز بلا تنزيل: `ffmpeg -vf minterpolate=fps=60:mi_mode=mci` |

> `--ai-upscale` لا ينزّل الموديلات تلقائياً (كبيرة ومحجوبة هنا): حمّلها من صفحة Releases على جهازك ثم اضبط `REALESRGAN_BIN`. إن غابت، يتراجع المحرك تلقائياً إلى Lanczos + unsharp.

---

## 🗂️ البنية

```
legendary-studio/
├─ setup.sh · studio.sh · requirements.txt
├─ README.md                      ← هذا الملف
├─ download_reel.py               ← yt-dlp wrapper (+ --direct)
├─ studio_server.py               ← Flask: رفع، تقدّم حيّ، معاينة، تنزيل
├─ templates/index.html           ← واجهة عربية RTL
├─ assets/fonts/                  ← NotoSansArabic.ttf + OFL.txt
├─ legendary/
│  ├─ ffmpeg.py                   ← اكتشاف FFmpeg، probe، PCM، scene detect، WAV
│  ├─ analysis.py                 ← BPM grid + onset/scene snapping ⇒ EDL
│  ├─ sfx.py                      ← محرك التصميم الصوتي (numpy DSP)
│  ├─ render.py                   ← باني الـ filtergraph + المكس النهائي
│  ├─ demo.py                     ← مولّد فيديو خيالي 9:16
│  ├─ ai_upscale.py               ← ربط Real-ESRGAN الاختياري
│  └─ cli.py
├─ tests/selftest.py              ← 21 فحصاً من البداية للنهاية
├─ vendor/yt-dlp/                 ← مستنسخ من GitHub (مستثنى من Git)
└─ out/                           ← كل المخرجات (مستثناة من Git)
```

كل مهمة تكتب داخل `out/jobs/<id>/`: `source.*`, `LEGENDARY_CUT.mp4`, `sfx.wav`, `filtergraph.txt`, `report.json` (قائمة اللقطات كاملة)، و`status.json`.

---

## ✅ الفحص الذاتي

```bash
.venv/bin/python tests/selftest.py
# ✅ 21 checks passed — يولّد فيديو، يرندره، يتحقق من المدة/الدقة/الصوت/مستوى الصوت
```

---

## ❓ حل المشاكل

| المشكلة | الحل |
|---|---|
| `Unable to download webpage` من إنستغرام | الشبكة محجوبة هنا؛ شغّل `download_reel.py` على جهازك أو ارفع الملف يدوياً |
| الريل يتطلب دخول | `--cookies-from-browser chrome` أو `--cookies cookies.txt` |
| الرندر بطيء | `--height 1080 --x264-preset veryfast --crf 23` أو `--max-duration 15` |
| أريد 4K | `--height 3840 --crf 18 --x264-preset slow` |
| أريد صوت الأصل أعلى | `--orig-gain 0.9` / أقل: `0.2` |
| بدون موسيقى مولّدة | `--no-sfx` (يبقى صوت الأصل فقط) |
| الفيديو بلا صوت أصلي | يعمل تلقائياً؛ الموسيقى المولّدة تصبح المكس الأساسي |
| `Real-ESRGAN` غير موجود | طبيعي؛ Lanczos + unsharp يعملان دائماً |

---

## 📜 تراخيص
- الكود هنا: حرّ للاستعمال داخل المشروع.
- FFmpeg / libx264: **GPL** (النسخة الثابتة المرفقة عبر `imageio-ffmpeg`).
- Noto Sans Arabic: **SIL OFL 1.1** — النص الكامل في `assets/fonts/OFL.txt`.
- yt-dlp: **Unlicense** — يُستنسخ وقت التثبيت ولا يُرفع إلى Git.
- كل الأصوات المولّدة **إنتاج إجرائي خاص**، بلا عيّنات خارجية ولا قيود حقوق.
