# -*- coding: utf-8 -*-
"""أدوات إضافية: تشفير/فك، تحويل وحدات، ملاحظات، كلمات مرور، نصوص، ألوان، حسابات."""
import base64
import hashlib
import random
import re
import string
import time
import urllib.parse
from datetime import datetime, date

from .helpers import esc, take, need_group, keyboard, btn, norm
from .store import get_user

MORSE = {".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E", "..-.": "F", "--.": "G",
         "....": "H", "..": "I", ".---": "J", "-.-": "K", ".-..": "L", "--": "M", "-.": "N",
         "---": "O", ".--.": "P", "--.-": "Q", ".-.": "R", "...": "S", "-": "T", "..-": "U",
         "...-": "V", ".--": "W", "-..-": "X", "-.--": "Y", "--..": "Z", "-----": "0", ".----": "1",
         "..---": "2", "...--": "3", "....-": "4", ".....": "5", "-....": "6", "--...": "7",
         "---..": "8", "----.": "9"}
MORSE_REV = {v: k for k, v in MORSE.items()}

UNITS = {
    "length": {"متر": 1, "كم": 1000, "سم": 0.01, "ملم": 0.001, "ميل": 1609.34, "قدم": 0.3048,
               "بوصة": 0.0254, "ياردة": 0.9144},
    "weight": {"كغ": 1, "غرام": 0.001, "طن": 1000, "رطل": 0.453592, "أونصة": 0.0283495},
    "data": {"بايت": 1, "كيلوبايت": 1024, "ميغابايت": 1048576, "غيغابايت": 1073741824, "تيرابايت": 1099511627776},
    "time": {"ثانية": 1, "دقيقة": 60, "ساعة": 3600, "يوم": 86400, "أسبوع": 604800},
    "speed": {"م/ث": 1, "كم/س": 0.277778, "ميل/س": 0.44704, "عقدة": 0.514444},
}


def handle(ctx):
    if not ctx.words:
        return False
    tg, cid = ctx.tg, ctx.chat_id

    # ---- كلمة مرور ----
    rest = take(ctx, "كلمه مرور", "كلمة مرور", "password", "باسورد")
    if rest is not None:
        n = 16
        for a in ctx.args:
            if a.isdigit():
                n = max(6, min(int(a), 64))
        chars = string.ascii_letters + string.digits + "!@#$%^&*"
        pw = "".join(random.SystemRandom().choice(chars) for _ in range(n))
        ctx.reply(f"🔐 <b>كلمة مرور قوية ({n} حرف):</b>\n<code>{pw}</code>\n\n⚠️ احفظها في مكان آمن!")
        return True

    # ---- تشفير/تجزئة ----
    rest = take(ctx, "تشفير", "hash", "هاش")
    if rest is not None:
        if not rest:
            ctx.reply("🔒 الاستخدام: تشفير md5/sha1/sha256 <النص>\nمثال: تشفير sha256 مرحبا")
            return True
        parts = rest.split(None, 1)
        algo = parts[0].lower() if parts[0].lower() in ("md5", "sha1", "sha256", "sha512") else "sha256"
        text = parts[1] if len(parts) > 1 and parts[0].lower() in ("md5", "sha1", "sha256", "sha512") else rest
        h = hashlib.new(algo, text.encode()).hexdigest()
        ctx.reply(f"🔒 <b>{algo.upper()}:</b>\n<code>{h}</code>")
        return True

    # ---- ترميز/فك ----
    rest = take(ctx, "ترميز", "encode", "base64")
    if rest is not None:
        if not rest:
            ctx.reply("🔤 الاستخدام: ترميز base64/url/hex/نص <النص>")
            return True
        parts = rest.split(None, 1)
        mode = parts[0].lower() if len(parts) > 1 else "base64"
        text = parts[1] if len(parts) > 1 else rest
        try:
            if mode == "base64":
                out = base64.b64encode(text.encode()).decode()
            elif mode == "url":
                out = urllib.parse.quote(text)
            elif mode == "hex":
                out = text.encode().hex()
            else:
                out = base64.b64encode(rest.encode()).decode()
            ctx.reply(f"🔤 <b>الترميز ({mode}):</b>\n<code>{esc(out)}</code>")
        except Exception:
            ctx.reply("⚠️ تعذر الترميز.")
        return True

    rest = take(ctx, "فك", "decode")
    if rest is not None:
        if not rest:
            ctx.reply("🔓 الاستخدام: فك base64/url/hex <النص المشفر>")
            return True
        parts = rest.split(None, 1)
        mode = parts[0].lower() if len(parts) > 1 else "base64"
        text = parts[1] if len(parts) > 1 else rest
        try:
            if mode == "base64":
                out = base64.b64decode(text.encode()).decode()
            elif mode == "url":
                out = urllib.parse.unquote(text)
            elif mode == "hex":
                out = bytes.fromhex(text).decode()
            else:
                out = base64.b64decode(rest.encode()).decode()
            ctx.reply(f"🔓 <b>النص المفكوك:</b>\n{esc(out)}")
        except Exception:
            ctx.reply("⚠️ تعذر الفك — تأكد من الصيغة.")
        return True

    # ---- مورس ----
    rest = take(ctx, "مورس", "morse")
    if rest is not None:
        if not rest:
            ctx.reply("📡 الاستخدام: مورس <نص إنجليزي>")
            return True
        out = " ".join(MORSE_REV.get(c.upper(), "") for c in rest if c.strip())
        ctx.reply(f"📡 <b>مورس:</b>\n<code>{out}</code>")
        return True

    rest = take(ctx, "فك مورس", "demorse")
    if rest is not None:
        out = "".join(MORSE.get(code, "?") for code in rest.split())
        ctx.reply(f"📡 <b>النص:</b> {esc(out)}")
        return True

    # ---- تحويل وحدات ----
    rest = take(ctx, "حول", "تحويل", "convert")
    if rest is not None:
        # مثال: حول 100 كم ميل  / حول 30 حرارة فهرنهايت
        parts = rest.split()
        nums = [p for p in parts if re.match(r"^\d+(\.\d+)?$", p)]
        if not nums:
            ctx.reply("📏 الاستخدام: حول 100 كم ميل\nالوحدات: كم، متر، سم، ميل، قدم / كغ، غرام، رطل / بايت، ميغابايت…")
            return True
        val = float(nums[0])
        words = [norm(p) for p in parts if not re.match(r"^\d+(\.\d+)?$", p)]
        # حرارة خاصة
        if "حراره" in words or "حرارة" in rest or "فهرنهايت" in rest or "سيليزيوس" in rest:
            if "فهرنهايت" in rest:
                out = val * 9 / 5 + 32
                ctx.reply(f"🌡 {val}°C = <b>{out:.1f}°F</b>")
            else:
                out = (val - 32) * 5 / 9
                ctx.reply(f"🌡 {val}°F = <b>{out:.1f}°C</b>")
            return True
        found = None
        for cat, units in UNITS.items():
            for w in words:
                if w in units and found is None:
                    found = (cat, w)
        if not found:
            ctx.reply("🔍 وحدة غير معروفة. مثال: حول 100 كم ميل")
            return True
        cat, src = found
        dst = None
        for w in words:
            if w in UNITS[cat] and w != src:
                dst = w
                break
        if not dst:
            ctx.reply(f"🔍 حدد وحدة الهدف. مثال: حول 100 {src} متر")
            return True
        result = val * UNITS[cat][src] / UNITS[cat][dst]
        ctx.reply(f"📏 <b>{val:g} {src}</b> = <b>{result:,.4g} {dst}</b>")
        return True

    # ---- أدوات نص ----
    rest = take(ctx, "عد الحروف", "عد", "count")
    if rest is not None:
        if not rest:
            ctx.reply("🔢 الاستخدام: عد الحروف <النص>")
            return True
        chars = len(rest)
        words = len(rest.split())
        letters = len(re.findall(r"[a-zA-Z\u0600-\u06FF]", rest))
        digits = len(re.findall(r"\d", rest))
        spaces = rest.count(" ")
        ctx.reply(f"🔢 <b>إحصائيات النص:</b>\n📝 الأحرف: {chars}\n📖 الكلمات: {words}\n"
                  f"🔤 الحروف فقط: {letters}\n🔢 الأرقام: {digits}\n␣ المسافات: {spaces}")
        return True

    rest = take(ctx, "اعكس", "اقلب", "reverse")
    if rest is not None:
        ctx.reply(f"🔄 <b>النص المعكوس:</b>\n{esc(rest[::-1])}")
        return True

    rest = take(ctx, "بدون تشكيل", "ازل التشكيل", "tashkeel")
    if rest is not None:
        out = re.sub(r"[\u064B-\u065F\u0670\u0640]", "", rest)
        ctx.reply(f"🔤 <b>بدون تشكيل:</b>\n{esc(out)}")
        return True

    rest = take(ctx, "كبير", "upper", "caps")
    if rest is not None:
        ctx.reply(f"🔠 <code>{esc(rest.upper())}</code>")
        return True

    rest = take(ctx, "صغير", "lower")
    if rest is not None:
        ctx.reply(f"🔡 <code>{esc(rest.lower())}</code>")
        return True

    # ---- ألوان ----
    rest = take(ctx, "لون عشوائي", "لون")
    if rest is not None:
        hexc = "#{:06x}".format(random.randint(0, 0xFFFFFF))
        r, g, b = int(hexc[1:3], 16), int(hexc[3:5], 16), int(hexc[5:7], 16)
        ctx.reply(f"🎨 <b>لون عشوائي:</b>\nHEX: <code>{hexc}</code>\nRGB: <code>{r}, {g}, {b}</code>")
        return True

    # ---- حسابات ----
    rest = take(ctx, "نسبه", "نسبة", "percent")
    if rest is not None:
        nums = re.findall(r"\d+(?:\.\d+)?", rest)
        if len(nums) >= 2:
            a, b = float(nums[0]), float(nums[1])
            if b != 0:
                ctx.reply(f"💯 {a:g} من {b:g} = <b>{a / b * 100:.2f}%</b>")
                return True
        ctx.reply("💯 الاستخدام: نسبة 25 200 (كم نسبة 25 من 200)")
        return True

    rest = take(ctx, "كتله", "bmi", "كتلة الجسم")
    if rest is not None:
        nums = re.findall(r"\d+(?:\.\d+)?", rest)
        if len(nums) >= 2:
            w, h = float(nums[0]), float(nums[1]) / 100
            bmi = w / (h * h)
            cat = "نحيف 🌱" if bmi < 18.5 else "طبيعي ✅" if bmi < 25 else "زيادة ⚠️" if bmi < 30 else "سمنة 🔴"
            ctx.reply(f"⚖️ <b>مؤشر كتلة الجسم:</b> {bmi:.1f}\nالتصنيف: {cat}")
        else:
            ctx.reply("⚖️ الاستخدام: كتلة 70 175 (الوزن كغ، الطول سم)")
        return True

    rest = take(ctx, "فرق التاريخ", "كم بين")
    if rest is not None:
        dates = re.findall(r"\d{4}-\d{1,2}-\d{1,2}", rest)
        if len(dates) >= 2:
            try:
                d1 = date.fromisoformat(dates[0])
                d2 = date.fromisoformat(dates[1])
                diff = abs((d2 - d1).days)
                ctx.reply(f"📅 الفرق: <b>{diff}</b> يوم ({diff // 7} أسبوع، {diff // 30} شهر تقريباً)")
            except Exception:
                ctx.reply("⚠️ تاريخ غير صالح. مثال: فرق التاريخ 2024-01-01 2025-01-01")
        else:
            ctx.reply("📅 الاستخدام: فرق التاريخ 2024-01-01 2025-01-01")
        return True

    # ---- عشوائي ----
    rest = take(ctx, "رقم عشوائي", "random")
    if rest is not None:
        nums = re.findall(r"\d+", rest)
        lo, hi = (int(nums[0]), int(nums[1])) if len(nums) >= 2 else (1, 100)
        if lo > hi:
            lo, hi = hi, lo
        ctx.reply(f"🎲 الرقم العشوائي ({lo}-{hi}): <b>{random.randint(lo, hi)}</b>")
        return True

    rest = take(ctx, "uuid", "معرف فريد")
    if rest is not None:
        import uuid
        ctx.reply(f"🆔 <code>{uuid.uuid4()}</code>")
        return True

    rest = take(ctx, "طابع زمني", "timestamp")
    if rest is not None:
        now = int(time.time())
        ctx.reply(f"🕐 <b>الطابع الزمني الحالي:</b>\n<code>{now}</code>\n📅 {datetime.utcfromtimestamp(now).strftime('%Y-%m-%d %H:%M:%S')} UTC")
        return True

    # ---- ملاحظات ----
    rest = take(ctx, "احفظ", "ملاحظة", "note")
    if rest is not None:
        if not rest:
            ctx.reply("📝 الاستخدام: احفظ <النص> — تُحفظ ملاحظتك الخاصة")
            return True
        u = get_user(ctx.chat_data, ctx.user)
        notes = u.setdefault("notes", [])
        if len(notes) >= 20:
            notes.pop(0)
        notes.append({"text": rest[:500], "ts": time.time()})
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"📝 حُفظت ملاحظتك! (لديك {len(notes)} ملاحظة)\nاكتب (ملاحظاتي) للعرض.")
        return True

    rest = take(ctx, "ملاحظاتي", "notes")
    if rest is not None:
        u = get_user(ctx.chat_data, ctx.user)
        notes = u.get("notes", [])
        if not notes:
            ctx.reply("📝 لا توجد ملاحظات. احفظ بـ (احفظ نص).")
            return True
        lines = ["📝 <b>ملاحظاتك:</b>\n"]
        for i, n in enumerate(notes, 1):
            lines.append(f"{i}. {esc(n['text'][:80])}")
        lines.append("\n🗑 <b>امسح ملاحظة 1</b> للحذف")
        ctx.reply("\n".join(lines))
        return True

    rest = take(ctx, "امسح ملاحظة", "احذف ملاحظة")
    if rest is not None:
        u = get_user(ctx.chat_data, ctx.user)
        notes = u.get("notes", [])
        if rest.strip().isdigit() and 1 <= int(rest.strip()) <= len(notes):
            notes.pop(int(rest.strip()) - 1)
            ctx.dirty = ctx.force_save = True
            ctx.reply("🗑 حُذفت الملاحظة.")
        else:
            ctx.reply("🔢 حدد رقم الملاحظة. اكتب (ملاحظاتي).")
        return True

    # ---- اقتراع / تصويت ----
    rest = take(ctx, "تصويت", "اقتراع", "poll")
    if rest is not None:
        if not rest or "|" not in rest:
            ctx.reply("📊 الاستخدام: تصويت السؤال | خيار1 | خيار2 | خيار3")
            return True
        parts = [p.strip() for p in rest.split("|") if p.strip()]
        if len(parts) < 3:
            ctx.reply("📊 تحتاج سؤالاً + خيارين على الأقل.")
            return True
        q, opts = parts[0], parts[1:11]
        res = tg.call("sendPoll", {"chat_id": cid, "question": q[:300],
                                   "options": __import__("json").dumps(opts, ensure_ascii=False),
                                   "is_anonymous": False})
        if isinstance(res, dict) and res.get("_error"):
            ctx.reply("⚠️ تعذر إنشاء التصويت.")
        return True

    return False
