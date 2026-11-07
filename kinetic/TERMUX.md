# KINETIC على Termux (أندرويد، بلا روت)

**الجواب: إيه، يخدم.** الحسابات كاملة numpy، والخطوط عندنا داخل المستودع، و`ffmpeg` موجود في Termux.
التصميم صُمّم باش يخدم على الهاتف: دقة قابلة للتخفيض + عدد أنوية + preset ترميز.

---

## 1) التنصيب (مرة واحدة)

```bash
pkg update && pkg install -y git
git clone https://github.com/bezzagabdou-source/Absorbs.git
cd Absorbs/kinetic
bash install-termux.sh
```

السكربت يركّب: `python ffmpeg freetype harfbuzz clang`, ثم `numpy/pillow` (prebuilt إن وُجد)،
ثم `uharfbuzz freetype-py imageio-ffmpeg arabic-reshaper python-bidi`، ويكتب ملف `~/.kx-env`.

> إذا فشل `uharfbuzz` أو `freetype-py` (يصير على بعض إصدارات أندرويد/بايثون)،
> **المحرّك يتحوّل أوتوماتيكيًا** إلى backend بديل: `arabic_reshaper + python-bidi + Pillow`.
> التشكيل العربي يبقى صحيح (مجرّب: نفس النص، نفس الحروف المتصلة) — الاختلاف البسيط هو الكيرنينغ فقط.

---

## 2) الرندر على الهاتف

```bash
source ~/.kx-env          # يضبط KX_RES / KX_WORKERS / KX_PRESET / KX_CRF
termux-wake-lock          # يمنع النوم وقت الرندر
cd ~/Absorbs/kinetic

# ريل 30 ثانية بإعدادات الهاتف (~5–8 دقائق على Snapdragon حديث)
python -m kx.render --audio media/vo.mp3 --out out/reel.mp4
```

| متغيّر | الافتراضي | الوظيفة |
|---|---|---|
| `KX_RES` | `0.6` | رندر 648×1152 ثم تحسين للأعلى إلى 1080×1920 عند الترميز (أسرع ~3×) |
| `KX_WORKERS` | `2` | 2 هو الأنسب حرارياً؛ جرب 3–4 على هاتف بتبريد |
| `KX_PRESET` | `veryfast` | سرعة x264 |
| `KX_CRF` | `22` | جودة/حجم |
| `KX_FRAMEDIR` | `out/frames` | حطّه في `/sdcard/...` إذا التخزين الداخلي ضيّق |

**جودة كاملة:** `KX_RES=1 KX_PRESET=medium python -m kx.render ...` (بطيء، والشاحن موصول).

---

## 3) وين تحصر السرعة

| مرحلة | على الهاتف |
|---|---|
| align + score + mix + master | ~3–6 ثواني |
| frames | **0.25–0.6 ث/إطار** بـ `KX_RES=0.6` (مقابل ~0.9 ث على الحاسوب) |
| encode (veryfast) | ثواني |

تخفيض إضافي لو لزم:
```bash
KX_RES=0.45 KX_WORKERS=1 python -m kx.render ...   # ~أسرع 2× إضافية
```

---

## 4) الصوت في Termux

- `ffmpeg` من pkg فيه `aac`, `libx264`, `loudnorm` → كل شي يخدم.
- إذا ما لقاش `ffmpeg` في PATH، الكود يستعمل اللي في `imageio-ffmpeg` تلقائيًا.
- التسجيل من الميكروفون:
```bash
pkg install -y termux-api
termux-microphone-record -f media/vo.m4a -l 0     # Ctrl+C للإيقاف
# حوّله لـ mp3:
ffmpeg -y -i media/vo.m4a media/vo.mp3
```

---

## 5) تحميل ريل انستغرام من الهاتف

Termux عندو إنترنت عادي (ماشي محجوب مثل الساندبوكس):

```bash
pip install yt-dlp
python bridge/ingest_instagram.py "https://www.instagram.com/reel/Dfc_0KpoWC0/" --out media/source.mp4
python -m kx.render --audio media/source-vo.wav --broll media/source.mp4 --out out/reel.mp4
```

`--broll` ياخذ الفيديو الأصلي، يعمل grade سينمائي غامق، ويحطّه **خلف** الكتابة والأيقونات.

---

## 6) مشاكل متوقعة وحلولها

| المشكلة | الحل |
|---|---|
| `navieFF pip` ياخذ ساعات | استعمل `pkg install python-numpy python-pillow` قبل pip |
| `uharfbuzz` compile error | تجاهله — الـfallback يخدم (`arabic_reshaper`) |
| الرندر يوقف في الخلفية | `termux-wake-lock` + `settings put global ...` أو خلّي الشاشة شاعلة |
| الحرارة تخنق الجهاز | `KX_WORKERS=1`، وانزع الغلاف، وخلّيه على بلاط |
| نفد التخزين | `KX_FRAMEDIR=/sdcard/kx-frames` (وبعد الرندر امسحها) |
| `MemoryError` | `KX_RES=0.4` و`KX_WORKERS=1` |
