# -*- coding: utf-8 -*-
"""إسلاميات موسّعة: أسماء الله الحسنى، مواقيت الصلاة، القبلة، أحاديث، أذكار، ختمة، قرّاء."""
import math
import random
import time

import requests

from .helpers import esc, take, need_group, keyboard, btn
from .store import get_user
from . import content_bank as cb
from .tools import SURAHS

RECITERS = {
    "العفاسي": "https://server8.mp3quran.net/afs/",
    "السديس": "https://server11.mp3quran.net/sds/",
    "الشريم": "https://server7.mp3quran.net/shur/",
    "الحصري": "https://server13.mp3quran.net/husr/",
    "المنشاوي": "https://server10.mp3quran.net/minsh/",
    "عبدالباسط": "https://server7.mp3quran.net/basit/",
    "ماهر": "https://server12.mp3quran.net/maher/",
    "الدوسري": "https://server11.mp3quran.net/yasser/",
    "الغامدي": "https://server6.mp3quran.net/gmd/",
    "العجمي": "https://server10.mp3quran.net/ajm/",
}


def handle(ctx):
    if not ctx.words:
        return False
    tg, cid = ctx.tg, ctx.chat_id

    # ---- أسماء الله الحسنى ----
    rest = take(ctx, "اسماء الله", "أسماء الله", "الاسماء الحسني", "الأسماء الحسنى")
    if rest is not None:
        names = cb.ALLAH_NAMES
        if rest.strip().isdigit() and 1 <= int(rest.strip()) <= 99:
            i = int(rest.strip()) - 1
            ctx.reply(f"🕌 <b>من أسماء الله الحسنى ({i + 1}/99):</b>\n\n✨ <b>{names[i]}</b> ✨")
        else:
            # 20 اسماً في كل رسالة لتجنب الطول
            chunk = names[:33]
            ctx.reply("🕌 <b>أسماء الله الحسنى (1-33):</b>\n\n" + " ✦ ".join(names[:33]) +
                      "\n\nاكتب (اسماء الله 2) للصفحة التالية، أو رقماً لاسم محدد.")
        return True

    rest = take(ctx, "اسم الله", "اسم عشوائي")
    if rest is not None:
        ctx.reply(f"✨ من أسماء الله الحسنى:\n\n🕌 <b>{random.choice(cb.ALLAH_NAMES)}</b> 🕌")
        return True

    # ---- أحاديث ----
    rest = take(ctx, "حديث", "احاديث", "hadith")
    if rest is not None:
        ctx.reply(random.choice(cb.HADITHS))
        return True

    # ---- أذكار موسّعة ----
    adhkar_map = {
        "اذكار النوم": "النوم", "اذكار الاستيقاظ": "الاستيقاظ", "اذكار الصلاة": "الصلاة",
        "اذكار الطعام": "الطعام", "اذكار السفر": "السفر", "اذكار المنزل": "المنزل",
        "اذكار الكرب": "الكرب", "اذكار المسجد": "المسجد",
        "دعاء النوم": "النوم", "دعاء الاستيقاظ": "الاستيقاظ", "دعاء السفر": "السفر",
        "دعاء الكرب": "الكرب", "دعاء الطعام": "الطعام",
    }
    for pref, cat in adhkar_map.items():
        rest = take(ctx, pref)
        if rest is not None:
            items = cb.ADHKAR_EXTRA.get(cat, [])
            if items:
                ctx.reply(f"🤲 <b>أذكار {cat}:</b>\n\n" + "\n\n".join(items))
            return True

    rest = take(ctx, "الاذكار", "الأذكار", "اذكار")
    if rest is not None:
        ctx.reply("🤲 <b>الأذكار والأدعية:</b>\n\n"
                  "🌅 اذكار الصباح · 🌙 اذكار المساء\n"
                  "😴 اذكار النوم · ☀️ اذكار الاستيقاظ\n"
                  "🕌 اذكار الصلاة · 🍽 اذكار الطعام\n"
                  "✈️ اذكار السفر · 🏠 اذكار المنزل\n"
                  "🤲 اذكار الكرب · 🕌 اذكار المسجد\n\n"
                  "📿 سبحة · ✨ اسماء الله · 📜 حديث")
        return True

    # ---- مواقيت الصلاة ----
    rest = take(ctx, "مواقيت", "اوقات الصلاة", "مواقيت الصلاة", "prayer", "الصلاة")
    if rest is not None:
        city = rest.strip() or "الجزائر"
        try:
            r = requests.get("https://api.aladhan.com/v1/timingsByCity",
                             params={"city": city, "country": "", "method": 3}, timeout=15)
            d = r.json().get("data", {})
            timings = d.get("timings", {})
            if not timings:
                ctx.reply(f"🔍 ما لقيت مواقيت لـ {esc(city)}. جرّب اسم مدينة صحيح.")
                return True
            meta = d.get("meta", {})
            date_info = d.get("date", {})
            hijri = date_info.get("hijri", {})
            lines = [f"🕌 <b>مواقيت الصلاة — {esc(city)}</b>",
                     f"📅 {hijri.get('day', '')} {hijri.get('month', {}).get('ar', '')} {hijri.get('year', '')} هـ",
                     f"🌍 {meta.get('timezone', '')}\n"]
            names_ar = {"Fajr": "🌅 الفجر", "Sunrise": "☀️ الشروق", "Dhuhr": "🕛 الظهر",
                        "Asr": "🕒 العصر", "Maghrib": "🌆 المغرب", "Isha": "🌙 العشاء"}
            for k, label in names_ar.items():
                lines.append(f"{label}: <b>{timings.get(k, '—')}</b>")
            ctx.reply("\n".join(lines))
        except Exception:
            ctx.reply("⚠️ خدمة المواقيت غير متاحة حالياً.")
        return True

    # ---- القبلة ----
    rest = take(ctx, "القبله", "القبلة", "qibla", "اتجاه القبلة")
    if rest is not None:
        city = rest.strip() or "الجزائر"
        try:
            g = requests.get("https://geocoding-api.open-meteo.com/v1/search",
                             params={"name": city, "count": 1, "language": "ar"}, timeout=15).json()
            if not g.get("results"):
                ctx.reply(f"🔍 ما لقيت {esc(city)}.")
                return True
            loc = g["results"][0]
            lat, lon = math.radians(loc["latitude"]), math.radians(loc["longitude"])
            klat, klon = math.radians(21.4225), math.radians(39.8262)  # الكعبة
            dlon = klon - lon
            x = math.sin(dlon)
            y = math.cos(lat) * math.tan(klat) - math.sin(lat) * math.cos(dlon)
            bearing = (math.degrees(math.atan2(x, y)) + 360) % 360
            dirs = ["الشمال ⬆️", "الشمال الشرقي ↗️", "الشرق ➡️", "الجنوب الشرقي ↘️",
                    "الجنوب ⬇️", "الجنوب الغربي ↙️", "الغرب ⬅️", "الشمال الغربي ↖️"]
            direction = dirs[round(bearing / 45) % 8]
            ctx.reply(f"🕋 <b>اتجاه القبلة من {esc(loc.get('name', city))}:</b>\n\n"
                      f"🧭 {bearing:.1f}° من الشمال\n📍 الاتجاه: {direction}\n\n"
                      f"💡 استخدم بوصلة هاتفك وحدد هذه الزاوية.")
        except Exception:
            ctx.reply("⚠️ تعذر حساب القبلة.")
        return True

    # ---- قرّاء متعددون ----
    rest = take(ctx, "قارئ", "قراء", "reciters", "القرّاء")
    if rest is not None:
        ctx.reply("🎙 <b>القرّاء المتاحون:</b>\n\n" + "\n".join(f"• {n}" for n in RECITERS) +
                  "\n\n📖 الاستخدام: قران الكهف العفاسي\nأو: قران 36 السديس")
        return True

    # ---- ختمة ----
    rest = take(ctx, "ختمتي", "ختمة", "khatma")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        kh = u.setdefault("khatma", {"done": [], "start": time.time()})
        done = kh.get("done", [])
        if rest.strip().isdigit() and 1 <= int(rest.strip()) <= 114:
            s = int(rest.strip())
            if s not in done:
                done.append(s)
                kh["done"] = done
                ctx.dirty = ctx.force_save = True
            ctx.reply(f"📖 سجّلت قراءة سورة {SURAHS[s - 1]}!\nتقدمك: <b>{len(done)}/114</b> سورة"
                      f"\n{'🎉 مبروك! أتممت ختمة كاملة!' if len(done) >= 114 else ''}")
            return True
        pct = len(done) / 114 * 100
        bar = "█" * int(pct / 10) + "░" * (10 - int(pct / 10))
        ctx.reply(f"📖 <b>ختمتك:</b>\n{bar} {pct:.0f}%\nقرأت <b>{len(done)}/114</b> سورة\n\n"
                  f"💡 سجّل سورة: ختمتي 18 (الكهف)\n🔄 ختمة جديدة: ختمة جديدة")
        return True

    rest = take(ctx, "ختمة جديدة", "ختمة جديده")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        u["khatma"] = {"done": [], "start": time.time()}
        ctx.dirty = ctx.force_save = True
        ctx.reply("📖 بدأت ختمة جديدة! تقبّل الله طاعتك 🤲\nسجّل تقدمك: ختمتي <رقم السورة>")
        return True

    # ---- التاريخ الهجري ----
    rest = take(ctx, "التاريخ الهجري", "هجري", "hijri")
    if rest is not None:
        try:
            today = time.strftime("%d-%m-%Y")
            r = requests.get(f"https://api.aladhan.com/v1/gToH/{today}", timeout=12).json()
            h = r.get("data", {}).get("hijri", {})
            ctx.reply(f"📅 <b>التاريخ الهجري اليوم:</b>\n\n"
                      f"🌙 {h.get('day', '')} {h.get('month', {}).get('ar', '')} {h.get('year', '')} هـ\n"
                      f"📆 {h.get('weekday', {}).get('ar', '')}")
        except Exception:
            ctx.reply("⚠️ تعذر جلب التاريخ الهجري.")
        return True

    return False
