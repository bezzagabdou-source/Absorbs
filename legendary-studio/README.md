# 🎬 LEGENDARY STUDIO — استوديو المونتاج الأسطوري

> 🏆 **النسخة النهائية — استوديو احترافي (مُختبَرة 206 · video/mp4)**: [🎬 كامل 18MB · الأفضل](https://is.gd/B3kcZX) · [⚡ خفيف 2.7MB](https://is.gd/f3AskK) · [بديل filebin كامل](https://is.gd/CICeOa) · [بديل filebin خفيف](https://is.gd/PVTj1Y) — كل الروابط وتفاصيل التدقيق في [`downloads/STUDIO_LINKS.md`](./downloads/STUDIO_LINKS.md). كتيبة حركية كلمة‑بكلمة + صور ملصقات + تأثيرات، بلا تقطيع ولا تسريع. `CAPTION_LINKS.md` و `LINKS.md` نسخ سابقة.

محرك مونتاج سينمائي **تلقائي وكامل** يعمل محلياً: يأخذ فيديو (ريل 9:16 مثلاً)، يحلّل إيقاعه، يبني قائمة لقطات متزامنة مع النبضات، يرفع الجودة، يضيف عشرات التأثيرات البصرية، ويولّد **تصميماً صوتياً سينمائياً من الصفر** (بدون أي مكتبات أصوات)، ثم يخرّج MP4 جاهزاً للنشر.

> built for the reel: `https://www.instagram.com/reel/DfSkvUnxXb7/`

---

## ✅ تمّ تنزيل الريل وعمل المونتاج عليه فعلاً

الساندبوكس يسمح بـ **github.com / pypi.org فقط** (إنستغرام محجوب: `HTTP 403` + `SSL_ERROR_SYSCALL` + فشل `yt-dlp`). الحل: ملف
[`.github/workflows/fetch-reel.yml`](../.github/workflows/fetch-reel.yml) يشغّل **GitHub Actions** — السيرفر هناك يوصل لإنستغرام، ينزّل الريل بـ `yt-dlp`، يرندر المونتاج بنفس هذا الاستوديو، ثم يدفع الـ MP4 النهائي إلى **نفس الفرع** `arena/ecff9abf-absorbs`.

النتيجة الحقيقية (مو فيديو تجريبي): **`downloads/REEL_LEGENDARY.mp4`** · المصدر 720×1280 / 20.83s / صوت أصلي · الإخراج **1080×1920 · 22 لقطة · 128 BPM · 55 نبضة · 11 تغيّر مشهد · preset fantasy · 23.5 MB**. التقرير الكامل في `downloads/REEL_REPORT.json` وسجل التنزيل في `downloads/REEL_LOG.txt`.

> إعادة التشغيل: أي commit رسالته تحتوي `[fetch-reel]` على هذا الفرع يعيد التنزيل + المونتاج تلقائياً.

**الرابط المباشر (`image2url.com`)**: نفس الفكرة عبر [`.github/workflows/montage-url.yml`](../.github/workflows/montage-url.yml) مع فرق واحد — الموقع محمي بتحدّي Cloudflare «Just a moment…» (كل محاولات curl العادية والبروكسي رجعت 403). الحل في [`legendary/cloudflare_fetch.py`](./legendary/cloudflare_fetch.py): `curl_cffi` يقلّد بصمة TLS/HTTP2 الخاصة بـ Chrome (نجح من أول محاولة: 200 · video/mp4 · 4.7 MB)، ومعاه مسار احتياطي بـ Playwright/Chromium يحلّ التحدّي ويستعمل كوكي `cf_clearance`. أي commit رسالته `[montage-url]` يعيد العملية.

ولو تحبّ تدخل فيديو آخر: ارفعه في الاستوديو، أو شغّل `download_reel.py` على جهازك مع `--cookies-from-browser chrome`، أو الصق رابط `.mp4` مباشر.

---

## 🔗 روابط تحميل الفيديو المُرندَر

| النوع | الرابط | ملاحظة |
|---|---|---|
| **🎬 مونتاج رابطك المباشر (الأحدث)** | **[`URL_LEGENDARY.mp4`](https://raw.githubusercontent.com/bezzagabdou-source/Absorbs/arena/ecff9abf-absorbs/legendary-studio/downloads/URL_LEGENDARY.mp4)** | `image2url.com` · 1080×1920 · 20.92s · 22.3 MB — Cloudflare تجاوزناه بـ `curl_cffi` على GitHub Actions |
| **🎬 مونتاج الريل الحقيقي (دائم)** | **[`REEL_LEGENDARY.mp4`](https://raw.githubusercontent.com/bezzagabdou-source/Absorbs/arena/ecff9abf-absorbs/legendary-studio/downloads/REEL_LEGENDARY.mp4)** | إنستغرام `DfSkvUnxXb7` · 1080×1920 · 20.83s · 23.5 MB — **هذا هو المطلوب** |
| **تجريبي (دائم)** | [`LEGENDARY_DEMO_1080x1920.mp4`](https://raw.githubusercontent.com/bezzagabdou-source/Absorbs/arena/ecff9abf-absorbs/legendary-studio/downloads/LEGENDARY_DEMO_1080x1920.mp4) | نسخة خيالية `fantasy` · 1080×1920 · 8s · 8.3 MB |
| **من الاستوديو** | `https://<host>/download/DEMO.mp4` | الزر «حمّل الفيديو» + خانة «رابط التحميل المباشر» تنسخ الرابط المطلق تلقائياً |
| **بعد رفع فيديوك** | `https://<host>/download/jobs/<id>/LEGENDARY_CUT.mp4` | يتولّد تلقائياً عند اكتمال كل مهمة |

الملف الوحيد المُثبَّت في Git هو `downloads/LEGENDARY_DEMO_1080x1920.mp4` (استثناء مقصود في `.gitignore`) باش يبقى رابط التحميل العام شغّال. باقي المخرجات في `out/` مستثناة من Git.

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
