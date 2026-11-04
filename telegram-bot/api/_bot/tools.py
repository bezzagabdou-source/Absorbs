# -*- coding: utf-8 -*-
"""أدوات عملية: طقس، عملات، ويكيبيديا، ترجمة، حاسبة، QR، قرآن، نطق، ملصقات، صور."""
import ast
import io
import operator
import random
import re
import time
from datetime import datetime, date

import requests

from .helpers import esc, take, keyboard, btn, is_error, fullname, mention

SURAHS = ["الفاتحة", "البقرة", "آل عمران", "النساء", "المائدة", "الأنعام", "الأعراف", "الأنفال", "التوبة", "يونس",
          "هود", "يوسف", "الرعد", "إبراهيم", "الحجر", "النحل", "الإسراء", "الكهف", "مريم", "طه",
          "الأنبياء", "الحج", "المؤمنون", "النور", "الفرقان", "الشعراء", "النمل", "القصص", "العنكبوت", "الروم",
          "لقمان", "السجدة", "الأحزاب", "سبأ", "فاطر", "يس", "الصافات", "ص", "الزمر", "غافر",
          "فصلت", "الشورى", "الزخرف", "الدخان", "الجاثية", "الأحقاف", "محمد", "الفتح", "الحجرات", "ق",
          "الذاريات", "الطور", "النجم", "القمر", "الرحمن", "الواقعة", "الحديد", "المجادلة", "الحشر", "الممتحنة",
          "الصف", "الجمعة", "المنافقون", "التغابن", "الطلاق", "التحريم", "الملك", "القلم", "الحاقة", "المعارج",
          "نوح", "الجن", "المزمل", "المدثر", "القيامة", "الإنسان", "المرسلات", "النبأ", "النازعات", "عبس",
          "التكوير", "الانفطار", "المطففين", "الانشقاق", "البروج", "الطارق", "الأعلى", "الغاشية", "الفجر", "البلد",
          "الشمس", "الليل", "الضحى", "الشرح", "التين", "العلق", "القدر", "البينة", "الزلزلة", "العاديات",
          "القارعة", "التكاثر", "العصر", "الهمزة", "الفيل", "قريش", "الماعون", "الكوثر", "الكافرون", "النصر",
          "المسد", "الإخلاص", "الفلق", "الناس"]

WEATHER_CODES = {0: "☀️ صافٍ", 1: "🌤 صافٍ غالباً", 2: "⛅ غائم جزئياً", 3: "☁️ غائم",
                 45: "🌫 ضباب", 48: "🌫 ضباب متجمد", 51: "🌦 رذاذ خفيف", 53: "🌦 رذاذ",
                 55: "🌧 رذاذ كثيف", 61: "🌧 مطر خفيف", 63: "🌧 مطر", 65: "🌧 مطر غزير",
                 71: "🌨 ثلج خفيف", 73: "🌨 ثلج", 75: "❄️ ثلج كثيف", 77: "❄️ حبيبات ثلج",
                 80: "🌦 زخات خفيفة", 81: "🌧 زخات", 82: "⛈ زخات عنيفة", 85: "🌨 زخات ثلج",
                 86: "❄️ زخات ثلج كثيفة", 95: "⛈ عاصفة رعدية", 96: "⛈ عاصفة مع برد", 99: "⛈ عاصفة برد شديدة"}

CURRENCIES = {"دولار": "USD", "امريكي": "USD", "يورو": "EUR", "اورو": "EUR", "دينار": "DZD",
              "جزائري": "DZD", "درهم": "MAD", "مغربي": "MAD", "اماراتي": "AED", "ريال": "SAR",
              "سعودي": "SAR", "جنيه": "EGP", "مصري": "EGP", "ليره": "TRY", "تركي": "TRY",
              "جنيه استرليني": "GBP", "استرليني": "GBP", "ين": "JPY", "ياباني": "JPY",
              "يوان": "CNY", "صيني": "CNY", "روبيه": "INR", "هندي": "INR", "рубль": "RUB", "روبل": "RUB"}

TIMEZONES = {"الجزائر": "Africa/Algiers", "مصر": "Africa/Cairo", "السعوديه": "Asia/Riyadh",
             "المغرب": "Africa/Casablanca", "تونس": "Africa/Tunis", "الامارات": "Asia/Dubai",
             "فرنسا": "Europe/Paris", "بريطانيا": "Europe/London", "تركيا": "Europe/Istanbul",
             "امريكا": "America/New_York", "نيويورك": "America/New_York", "اليابان": "Asia/Tokyo",
             "الصين": "Asia/Shanghai", "المانيا": "Europe/Berlin", "اسبانيا": "Europe/Madrid",
             "ايطاليا": "Europe/Rome", "قطر": "Asia/Qatar", "الكويت": "Asia/Kuwait",
             "العراق": "Asia/Baghdad", "سوريا": "Asia/Damascus", "لبنان": "Asia/Beirut",
             "الاردن": "Asia/Amman", "فلسطين": "Asia/Gaza", "ليبيا": "Africa/Tripoli",
             "السودان": "Africa/Khartoum", "اليمن": "Asia/Aden", "عمان": "Asia/Muscat",
             "البحرين": "Asia/Bahrain", "موريتانيا": "Africa/Nouakchott", "كندا": "America/Toronto",
             "البرازيل": "America/Sao_Paulo", "الهند": "Asia/Kolkata", "روسيا": "Europe/Moscow"}


def handle(ctx):
    if not ctx.words:
        return False
    tg, cid = ctx.tg, ctx.chat_id

    # ---------- الطقس ----------
    rest = take(ctx, "طقس", "الطقس", "weather")
    if rest is not None:
        city = rest.strip() or "الجزائر"
        try:
            g = requests.get("https://geocoding-api.open-meteo.com/v1/search",
                             params={"name": city, "count": 1, "language": "ar"}, timeout=15).json()
            if not g.get("results"):
                ctx.reply(f"🔍 ما لقيت مدينة باسم {esc(city)}.")
                return True
            loc = g["results"][0]
            w = requests.get("https://api.open-meteo.com/v1/forecast",
                             params={"latitude": loc["latitude"], "longitude": loc["longitude"],
                                     "current": "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code",
                                     "daily": "temperature_2m_max,temperature_2m_min", "timezone": "auto",
                                     "forecast_days": 1}, timeout=15).json()
            cur = w["current"]
            desc = WEATHER_CODES.get(cur.get("weather_code"), "🌡")
            d = w.get("daily", {})
            ctx.reply(f"🌍 <b>الطقس في {esc(loc.get('name', city))} — {esc(loc.get('country', ''))}</b>\n\n"
                      f"{desc}\n🌡 الحرارة: <b>{cur['temperature_2m']}°C</b> (يحس كأنها {cur['apparent_temperature']}°)\n"
                      f"💧 الرطوبة: {cur['relative_humidity_2m']}%\n💨 الرياح: {cur['wind_speed_10m']} كم/س\n"
                      f"📈 العظمى: {d.get('temperature_2m_max', ['?'])[0]}° | 📉 الصغرى: {d.get('temperature_2m_min', ['?'])[0]}°")
        except Exception:
            ctx.reply("⚠️ خدمة الطقس غير متاحة حالياً.")
        return True

    # ---------- العملات ----------
    rest = take(ctx, "صرف", "سعر الصرف", "عمله", "currency")
    if rest is not None:
        try:
            rates = requests.get("https://open.er-api.com/v6/latest/USD", timeout=15).json()["rates"]
            parts = rest.split()
            amount, src, dst = 1.0, "USD", "DZD"
            nums = [p for p in parts if re.match(r"^\d+(\.\d+)?$", p)]
            if nums:
                amount = float(nums[0])
            words = [p for p in parts if not re.match(r"^\d+(\.\d+)?$", p)]
            codes = []
            for w in words:
                if re.match(r"^[a-zA-Z]{3}$", w):
                    codes.append(w.upper())
                else:
                    from .helpers import norm as _n
                    nw = _n(w)
                    if nw in CURRENCIES:
                        codes.append(CURRENCIES[nw])
                    elif nw == "للدينار" or nw == "دينار":
                        codes.append("DZD")
            if len(codes) >= 2:
                src, dst = codes[0], codes[1]
            elif len(codes) == 1:
                src, dst = codes[0], ("DZD" if codes[0] != "DZD" else "USD")
            if src not in rates or dst not in rates:
                ctx.reply("💱 عملة غير معروفة. مثال: صرف 100 دولار دينار")
                return True
            val = amount / rates[src] * rates[dst]
            ctx.reply(f"💱 <b>{amount:g} {src}</b> = <b>{val:,.2f} {dst}</b>\n\n"
                      f"📊 1 USD = {rates['DZD']:.2f} DZD | {rates['EUR']:.2f} EUR… \n"
                      f"💡 مثال: صرف 100 دولار دينار")
        except Exception:
            ctx.reply("⚠️ خدمة العملات غير متاحة حالياً.")
        return True

    # ---------- ويكيبيديا ----------
    rest = take(ctx, "ويكي", "ويكيبيديا", "wiki", "معرفه")
    if rest is not None:
        if not rest:
            ctx.reply("📚 الاستخدام: ويكي <الموضوع>")
            return True
        try:
            r = requests.get("https://ar.wikipedia.org/api/rest_v1/page/summary/" + requests.utils.quote(rest),
                             timeout=15, headers={"User-Agent": "AbsorbsBot/2.0"})
            if r.status_code == 200:
                d = r.json()
                extract = d.get("extract", "")[:1200]
                if extract:
                    text = f"📚 <b>{esc(d.get('title', rest))}</b>\n\n{esc(extract)}"
                    if d.get("thumbnail", {}).get("source"):
                        tg.send_photo(cid, d["thumbnail"]["source"], caption=text[:1020])
                    else:
                        ctx.reply(text)
                    return True
            ctx.reply(f"🔍 ما لقيت مقالاً عن {esc(rest)} في ويكيبيديا العربية.")
        except Exception:
            ctx.reply("⚠️ ويكيبيديا غير متاحة حالياً.")
        return True

    # ---------- الترجمة ----------
    rest = take(ctx, "ترجمه", "ترجمة", "translate", "ترجم")
    if rest is not None:
        if not rest:
            ctx.reply("🌐 الاستخدام: ترجمة <النص> (عربي↔إنجليزي تلقائي)\nأو: ترجمة fr <النص> لأي لغة")
            return True
        parts = rest.split(None, 1)
        target = None
        if len(parts) == 2 and re.match(r"^[a-z]{2}$", parts[0]):
            target, rest = parts[0], parts[1]
        has_ar = bool(re.search(r"[\u0600-\u06FF]", rest))
        src = "ar" if has_ar else "en"
        dst = target or ("en" if has_ar else "ar")
        try:
            r = requests.get("https://api.mymemory.translated.net/get",
                             params={"q": rest[:450], "langpair": f"{src}|{dst}"}, timeout=15).json()
            tr = r.get("responseData", {}).get("translatedText", "")
            if tr and "INVALID" not in tr.upper():
                ctx.reply(f"🌐 <b>الترجمة ({src} ← {dst}):</b>\n\n{esc(tr)}")
            else:
                ctx.reply("😔 تعذرت الترجمة، جرّب نصاً أقصر.")
        except Exception:
            ctx.reply("⚠️ خدمة الترجمة غير متاحة حالياً.")
        return True

    # ---------- الحاسبة ----------
    rest = take(ctx, "احسب", "حاسبه", "calc")
    if rest is not None:
        if not rest:
            ctx.reply("🧮 الاستخدام: احسب 25*4+10")
            return True
        try:
            val = safe_calc(rest)
            ctx.reply(f"🧮 <code>{esc(rest[:80])}</code> = <b>{val:g}</b>")
        except Exception:
            ctx.reply("⚠️ تعبير غير صالح. مثال: احسب (5+3)*2")
        return True

    # ---------- QR ----------
    rest = take(ctx, "qr", "كيو ار", "باركود")
    if rest is not None:
        if not rest:
            ctx.reply("🔳 الاستخدام: qr <نص أو رابط>")
            return True
        url = "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=" + requests.utils.quote(rest[:500])
        tg.send_photo(cid, url, caption="🔳 <b>رمز QR جاهز!</b>")
        return True

    # ---------- القرآن ----------
    rest = take(ctx, "قران", "قرآن", "سوره", "سورة", "quran")
    if rest is not None:
        q = rest.strip()
        idx = None
        if q.isdigit() and 1 <= int(q) <= 114:
            idx = int(q)
        else:
            from .helpers import norm as _n
            nq = _n(q).replace("سوره ", "").replace("سوره", "")
            for i, s in enumerate(SURAHS, 1):
                if _n(s) == nq or _n(s).replace("ال", "", 1) == nq.replace("ال", "", 1):
                    idx = i
                    break
        if not idx:
            ctx.reply("🕌 الاستخدام: قران <رقم السورة أو اسمها>\nمثال: قران الكهف | قران 36\n📿 أو اكتب: اية (آية عشوائية بالصوت)")
            return True
        name = SURAHS[idx - 1]
        num = f"{idx:03d}"
        url = f"https://server8.mp3quran.net/afs/{num}.mp3"
        res = tg.send_audio(cid, url, title=f"سورة {name}", performer="مشاري العفاسي",
                            caption=f"🕌 <b>سورة {esc(name)}</b>\n🎙 مشاري راشد العفاسي\nتقبل الله طاعتكم 🤲")
        if is_error(res):
            url2 = f"https://download.quranicaudio.com/quran/mishaari_raashid_al_3afaasee/{num}.mp3"
            res2 = tg.send_audio(cid, url2, title=f"سورة {name}", performer="مشاري العفاسي",
                                 caption=f"🕌 <b>سورة {esc(name)}</b> 🤲")
            if is_error(res2):
                ctx.reply("⚠️ تعذر إرسال السورة حالياً، جرّب مرة أخرى.")
        return True

    rest = take(ctx, "ايه", "آية", "اية عشوائيه", "ayah")
    if rest is not None:
        try:
            n = random.randint(1, 6236)
            d = requests.get(f"https://api.alquran.cloud/v1/ayah/{n}/ar.alafasy", timeout=15).json()["data"]
            text = (f"🕌 <b>{esc(d['surah']['name'])} — الآية {d['numberInSurah']}</b>\n\n"
                    f"﴿ {esc(d['text'])} ﴾")
            ctx.reply(text)
            if d.get("audio"):
                tg.send_audio(cid, d["audio"], title=f"آية {d['numberInSurah']} - {d['surah']['name']}",
                              performer="مشاري العفاسي")
        except Exception:
            ctx.reply("⚠️ خدمة الآيات غير متاحة حالياً.")
        return True

    # ---------- النطق ----------
    rest = take(ctx, "انطق", "نطق", "قول", "tts")
    if rest is not None:
        if not rest:
            ctx.reply("🗣 الاستخدام: انطق <النص>")
            return True
        try:
            from gtts import gTTS
            lang = "ar" if re.search(r"[\u0600-\u06FF]", rest) else "en"
            buf = io.BytesIO()
            gTTS(rest[:200], lang=lang).write_to_fp(buf)
            tg.send_voice(cid, buf.getvalue(), reply_to=ctx.msg["message_id"])
        except Exception:
            ctx.reply("⚠️ خدمة النطق غير متاحة حالياً.")
        return True

    # ---------- ملصق من صورة ----------
    rest = take(ctx, "ملصق", "ستيكر", "sticker")
    if rest is not None:
        src = ctx.reply_msg or ctx.msg
        if not src.get("photo"):
            ctx.reply("🖼 رد على صورة واكتب (ملصق) لأحولها إلى ملصق!")
            return True
        try:
            fid = src["photo"][-1]["file_id"]
            f = tg.get_file(fid)
            data = tg.download(f["file_path"], max_bytes=10_000_000)
            from PIL import Image
            im = Image.open(io.BytesIO(data)).convert("RGBA")
            im.thumbnail((512, 512))
            canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
            canvas.paste(im, ((512 - im.width) // 2, (512 - im.height) // 2))
            out = io.BytesIO()
            canvas.save(out, "WEBP", quality=90)
            tg.send_sticker(cid, out.getvalue(), reply_to=ctx.msg["message_id"])
        except Exception:
            ctx.reply("⚠️ تعذر تحويل الصورة إلى ملصق.")
        return True

    # ---------- بحث صور ----------
    rest = take(ctx, "صوره", "صورة", "image", "img")
    if rest is not None:
        if not rest:
            ctx.reply("🖼 الاستخدام: صورة <الوصف>")
            return True
        try:
            r = requests.get("https://commons.wikimedia.org/w/api.php", params={
                "action": "query", "generator": "search", "gsrnamespace": 6,
                "gsrsearch": rest, "gsrlimit": 8, "prop": "imageinfo",
                "iiprop": "url|mime", "iiurlwidth": 900, "format": "json"}, timeout=15,
                headers={"User-Agent": "AbsorbsBot/2.0"}).json()
            pages = (r.get("query", {}).get("pages") or {}).values()
            imgs = [p["imageinfo"][0] for p in pages
                    if p.get("imageinfo") and p["imageinfo"][0].get("mime") in ("image/jpeg", "image/png")]
            if imgs:
                pick = random.choice(imgs[:5])
                tg.send_photo(cid, pick.get("thumburl") or pick["url"],
                              caption=f"🖼 نتيجة البحث عن: <b>{esc(rest)}</b>\n📚 المصدر: ويكيميديا")
            else:
                ctx.reply(f"🔍 ما لقيت صوراً لـ {esc(rest)}.")
        except Exception:
            ctx.reply("⚠️ بحث الصور غير متاح حالياً.")
        return True

    # ---------- اختصار روابط ----------
    rest = take(ctx, "اختصر", "اختصار", "short")
    if rest is not None:
        if not rest.startswith("http"):
            ctx.reply("🔗 الاستخدام: اختصر https://example.com/very/long/url")
            return True
        try:
            r = requests.get("https://is.gd/create.php", params={"format": "simple", "url": rest}, timeout=12)
            if r.status_code == 200 and r.text.startswith("http"):
                ctx.reply(f"🔗 الرابط المختصر:\n{r.text.strip()}")
            else:
                ctx.reply("⚠️ تعذر الاختصار، تأكد من الرابط.")
        except Exception:
            ctx.reply("⚠️ خدمة الاختصار غير متاحة.")
        return True

    # ---------- العمر والبرج ----------
    rest = take(ctx, "عمري", "احسب عمري", "age", "برجي", "برج")
    if rest is not None:
        m = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", rest)
        if not m:
            m2 = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})", rest)
            if m2:
                d, mo, y = int(m2.group(1)), int(m2.group(2)), int(m2.group(3))
            else:
                ctx.reply("🎂 الاستخدام: عمري 2000-05-15")
                return True
        else:
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            bd = date(y, mo, d)
            today = date.today()
            years = today.year - y - ((today.month, today.day) < (mo, d))
            days_lived = (today - bd).days
            nxt = date(today.year if (today.month, today.day) < (mo, d) else today.year + 1, mo, d)
            zodiac = zodiac_sign(mo, d)
            ctx.reply(f"🎂 <b>عمرك:</b> {years} سنة\n📅 عشت <b>{days_lived:,}</b> يوم!\n"
                      f"🎉 عيد ميلادك القادم بعد <b>{(nxt - today).days}</b> يوم\n♈ برجك: <b>{zodiac}</b>")
        except Exception:
            ctx.reply("⚠️ تاريخ غير صالح.")
        return True

    # ---------- الساعة ----------
    rest = take(ctx, "الساعه", "الساعة", "الوقت", "time")
    if rest is not None:
        from zoneinfo import ZoneInfo
        from .helpers import norm as _n
        q = _n(rest.strip()) if rest else "الجزائر"
        tz = TIMEZONES.get(q) or TIMEZONES.get(q.replace("في ", "")) or "Africa/Algiers"
        now = datetime.now(ZoneInfo(tz))
        ctx.reply(f"🕐 <b>الساعة الآن في {esc(rest or 'الجزائر')}:</b>\n"
                  f"⏰ {now.strftime('%H:%M:%S')}\n📅 {now.strftime('%Y-%m-%d (%A)')}")
        return True

    # ---------- بنج ----------
    rest = take(ctx, "بنج", "بينج", "ping", "سرعه")
    if rest is not None:
        delay = max(0, time.time() - ctx.msg.get("date", time.time()))
        ctx.reply(f"🏓 <b>بونج!</b>\n⚡ زمن الاستجابة: {delay:.1f} ثانية\n🟢 البوت شغال بأفضل حال!")
        return True

    return False


def safe_calc(expr):
    expr = expr.replace("×", "*").replace("÷", "/").replace("^", "**").replace("،", ".")
    expr = re.sub(r"[^0-9+\-*/().% ]", "", expr)[:80]
    node = ast.parse(expr, mode="eval")
    ops = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
           ast.Div: operator.truediv, ast.Pow: operator.pow, ast.Mod: operator.mod,
           ast.USub: operator.neg, ast.UAdd: operator.pos}

    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in ops:
            if isinstance(n.op, ast.Pow) and isinstance(n.right, ast.Constant) and n.right.value > 50:
                raise ValueError("big power")
            return ops[type(n.op)](ev(n.left), ev(n.right))
        if isinstance(n, ast.UnaryOp) and type(n.op) in ops:
            return ops[type(n.op)](ev(n.operand))
        raise ValueError("bad expr")
    return ev(node)


def zodiac_sign(m, d):
    boundaries = [20, 19, 21, 20, 21, 21, 23, 23, 23, 23, 22, 22]
    names = ["♒ الدلو", "♓ الحوت", "♈ الحمل", "♉ الثور", "♊ الجوزاء", "♋ السرطان",
             "♌ الأسد", "♍ العذراء", "♎ الميزان", "♏ العقرب", "♐ القوس", "♑ الجدي"]
    if not 1 <= m <= 12:
        return "غير معروف"
    idx = m - 1 if d >= boundaries[m - 1] else (m - 2) % 12
    return names[idx]
