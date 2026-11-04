# -*- coding: utf-8 -*-
"""قوائم المساعدة التفاعلية ولوحات الأقفال والإعدادات."""
from .helpers import esc, take, need_group, need_admin, keyboard, btn, is_group_admin
from .protection import LOCK_NAMES_AR

BOT_NAME = "Absorbs"

HELP_MAIN = """⚡ <b>Absorbs — البوت الأسطوري</b> 🛡🎮🎵

أكثر من <b>585 ميزة</b> في بوت واحد:
حماية فولاذية فورية، إدارة كاملة، أغاني يوتيوب، ألعاب، قرآن، اقتصاد، أدوات ذكية والمزيد!

🧙 <b>اضف رد</b> — معالج تفاعلي للردود (نص/صورة/عشوائي)
🤖 منشنني @ أو رد على رسالتي ونجاوبك بذكاء!
⚡ أوامر سهلة: <b>/حظر</b> · <b>!كتم</b> · <b>/قوانين</b>

اختر القسم من الأزرار 👇 أو اكتب <b>الاوامر</b> نصياً."""

HELP_TEXTS = {
    "protect": """🛡 <b>أوامر الحماية (للمشرفين):</b>

<b>قفل الروابط</b> / <b>فتح الروابط</b>
<b>قفل الصور</b> / <b>فتح الصور</b>
<b>قفل الفيديو</b> · <b>قفل المتحركات</b> · <b>قفل الملصقات</b>
<b>قفل الصوت</b> · <b>قفل الملفات</b> · <b>قفل الاستطلاعات</b>
<b>قفل المعرفات</b> · <b>قفل التاك</b> · <b>قفل التوجيه</b>
<b>قفل الجهات</b> · <b>قفل المواقع</b> · <b>قفل البوتات</b>
<b>قفل الكلايش</b> · <b>قفل السب</b> · <b>قفل القنوات</b>
<b>قفل الأجنبية</b> · <b>قفل التعديل</b> · <b>قفل الانلاين</b>
<b>قفل الكل</b> / <b>فتح الكل</b> — دردشة للمشرفين فقط
<b>الاقفال</b> — لوحة تحكم تفاعلية 🔘
<b>قفل المجموعة</b> / <b>فتح المجموعة</b>

🌊 مكافحة السبام تلقائية (كتم 5 دقائق)
<b>ضع حد السبام 5</b> · <b>تفعيل/تعطيل مكافحة السبام</b>
🚫 <b>اضف كلمة X</b> · <b>احذف كلمة X</b> · <b>قائمة السب</b>
🔐 <b>تفعيل الكابتشا</b> — تحقق حسابي للداخلين
📢 <b>ضع قناة الاشتراك @ch</b> — اشتراك إجباري""",

    "admin": """👮 <b>أوامر الإدارة (مشرفين + مالك فقط):</b>

<b>حظر</b> / <b>طرد</b> / <b>الغاء الحظر</b> (بالرد أو @user)
<b>كتم 30m</b> / <b>كتم 2h</b> / <b>كتم 3d</b> / <b>رفع الكتم</b>
<b>تقييد</b> — منع الوسائط فقط
<b>تحذير</b> / <b>تحذيرات</b> / <b>مسح التحذيرات</b>
<b>ضع حد التحذيرات 5</b> · <b>عقوبة التحذيرات كتم|حظر|طرد</b>
<b>رفع مشرف</b> / <b>تنزيل مشرف</b> / <b>ضع لقب</b>
<b>تثبيت</b> / <b>الغاء التثبيت</b> (بالرد)
<b>مسح 50</b> — حذف آخر 50 رسالة
<b>مسح</b> بالرد — حذف من الرسالة للرد
<b>تنظيف</b> — حذف رسائل البوت
<b>كشف</b> — بطاقة كاملة عن العضو
<b>المشرفين</b> · <b>معلومات المجموعة</b> · <b>رابط</b>
<b>تبليغ</b> بالرد — مناداة المشرفين 🚨
<b>ضع قوانين نص</b> · <b>ضع ترحيب نص</b> · <b>ضع وداع نص</b>
<b>تفعيل/تعطيل الترحيب</b> · <b>تفعيل/تعطيل الوداع</b>
<b>وضع المشرفين</b> — البوت يرد على المشرفين فقط
<b>الغاء وضع المشرفين</b>
<b>اضف رد كلمة | الرد</b> · <b>احذف رد كلمة</b> · <b>الردود</b>
<b>الاعدادات</b> — لوحة التحكم الكاملة 🔘""",

    "games": """🎮 <b>الألعاب والمسابقات:</b>

🧠 <b>كويز</b> — 60 سؤال معرفي
🌍 <b>عواصم</b> · 🚩 <b>اعلام</b>
🧮 <b>رياضيات</b> · 🔢 <b>خمن</b> (1-100)
🔤 <b>فكك</b> · ⚡ <b>اسرع</b> · 🧩 <b>لغز</b>
🎮 <b>اكس او</b> — ضد البوت أو صديقك بالرد
🎲 <b>حجر</b> — حجر ورقة مقص
🎲 <b>نرد</b> · 🎰 <b>سلوت</b> · 🎯 <b>هدف</b> · 🏀 <b>كرة</b>
😂 <b>صراحة</b> · <b>جرأة</b> · <b>لو خيروك</b>
🪙 <b>عملة</b> — صورة أم كتابة
🎁 <b>هدية</b> — نقاط يومية مجانية
⭐ <b>نقاطي</b> · <b>رتبتي</b> · <b>توب</b> · <b>توب الرسائل</b>
📊 <b>احصائياتي</b> · <b>احصائيات المجموعة</b>""",

    "music": """🎵 <b>الموسيقى والأغاني:</b>

▶️ <b>يوت اسم الأغنية</b> — تحميل الأغنية من يوتيوب وإرسالها صوتية!
مثال: <code>يوت الشاب خالد عيشة</code>
مثال: <code>يوت Amr Diab Tamally Maak</code>

🔎 <b>بحث يوت اسم</b> — 6 نتائج مع أزرار تحميل
📝 <b>كلمات اسم الأغنية</b> — كلمات الأغنية كاملة

💡 لو يوتيوب محجوب، يرسل معاينة عالية الجودة تلقائياً من ديزر/آيتونز.""",

    "fun": """😂 <b>التسلية والردود:</b>

💍 <b>زواج</b> بالرد · <b>طلاق</b> · <b>زوجي/زوجتي</b>
💖 <b>نسبة الحب</b> · 💔 <b>نسبة الكره</b> · 🧠 <b>نسبة الذكاء</b>
🤪 <b>نسبة الغباء</b> · ✨ <b>نسبة الجمال</b> · 🍀 <b>نسبة الحظ</b>
💪 <b>نسبة الرجولة</b> · 🌸 <b>نسبة الأنوثة</b> · 🐍 <b>نسبة الخيانة</b>
😴 <b>نسبة الكسل</b> · 🌀 <b>نسبة الجنون</b> · 🤝 <b>نسبة الصداقة</b>
💋 <b>بوسة</b> · 🤗 <b>حضن</b> · 👋 <b>صفعة</b> (بالرد)
😂 <b>نكتة</b> · 🦉 <b>حكمة</b> · 📜 <b>مثل</b> · 💬 <b>غزل</b> · 🔥 <b>قلد</b>
✨ <b>زخرفة نص</b> — 12 ستايل فخم
🎯 <b>اختار X او Y</b> · 🎲 <b>سحب</b> عشوائي
📣 <b>منشن الكل</b> (مشرفين)
💬 البوت يرد تلقائياً: سلام، هلا، صباح الخير، احبك، بوت…
➕ <b>اضف رد كلمة | الرد</b> (مشرفين)""",

    "contacts": """👥 <b>نظام الجهات (الدعوات):</b>

📥 <b>جهاتي</b> — كم عضو أضفت + ترتيبك
🗑 <b>مسح جهاتي</b> — تصفير عدادك
🏆 <b>توب الجهات</b> — أقوى 10 دعاة
👤 <b>جهاته</b> بالرد — جهات عضو آخر
🧹 <b>مسح جهات</b> بالرد (مشرفين)

💡 كل عضو تضيفه للمجموعة يُحسب لك تلقائياً!
🎁 نقاط XP لكل رسالة + هدية يومية + انتصارات الألعاب.""",

    "tools": """🧰 <b>الأدوات الذكية:</b>

🌦 <b>طقس الجزائر</b> — طقس أي مدينة
💱 <b>صرف 100 دولار دينار</b> — عملات عالمية
📚 <b>ويكي الجزائر</b> — ملخصات ويكيبيديا
🌐 <b>ترجمة نص</b> — عربي↔إنجليزي + كل اللغات
🧮 <b>احسب (25+5)*3</b> — حاسبة علمية
🔳 <b>qr نص</b> — توليد رمز QR
🗣 <b>انطق نص</b> — تحويل النص لصوت
🖼 <b>ملصق</b> بالرد على صورة — ملصق فوري
🔍 <b>صورة وصف</b> — بحث صور
🔗 <b>اختصر رابط</b> — اختصار روابط
🎂 <b>عمري 2000-05-15</b> — عمرك وبرجك
🕐 <b>الساعة في مصر</b> — وقت أي دولة
🆔 <b>ايدي</b> · <b>كشف</b> · <b>بنج</b>""",

    "islam": """🕌 <b>الإسلاميات:</b>

📖 <b>قران الكهف</b> أو <b>قران 36</b> — أي سورة صوت (العفاسي)
✨ <b>اية</b> — آية عشوائية بالنص والصوت
🌅 <b>اذكار الصباح</b> · 🌙 <b>اذكار المساء</b>
🤲 <b>دعاء</b> — أدعية مأثورة
📿 <b>سبحة</b> — سبحة إلكترونية بأزرار""",

    "owner": """👑 <b>أوامر المطور:</b>

<b>اذاعة نص</b> — رسالة لكل المجموعات (بالخاص)
<b>حظر عام</b> بالرد — حظر من كل المجموعات
<b>الغاء الحظر العام</b> بالرد
<b>رفع مطور</b> / <b>تنزيل مطور</b> بالرد
<b>الحالة</b> — إحصائيات البوت العامة
<b>المطور</b> — معلومات المطور""",

    "replies": """💬 <b>نظام الردود الخارق:</b>

🧙 <b>اضف رد</b> — معالج تفاعلي خطوة بخطوة (الأسهل!)
📷 يدعم نص + صورة مع تعليق + ملصق/صوت/فيديو + ردود عشوائية
⚡ <b>اضف رد الكلمة</b> — معالج بكلمة جاهزة

➕ <b>اضف رد كلمة | الرد</b> — رد نصي سريع
🎲 <b>اضف رد كلمة | رد1 || رد2</b> — رد عشوائي
🎬 رد على وسائط + <b>اضف رد كلمة</b> — رد بالوسائط
🗑 <b>احذف رد كلمة</b> · ✏️ <b>عدل رد كلمة | الجديد</b>
📋 <b>الردود</b> · 🔎 <b>بحث رد كلمة</b>
✅ <b>تفعيل رد كلمة</b> · ⛔ <b>تعطيل رد كلمة</b>
🧹 <b>مسح الردود</b>

🧩 المتغيرات: {name} {username} {id} {group} {date} {time} {random:أ|ب}
💡 مثال: <code>اضف رد هلا | هلا {name} نورت {group} 🌹</code>""",

    "economy": """🛒 <b>نظام الاقتصاد:</b>

🛍 <b>المتجر</b> · <b>شراء عنصر</b> · <b>مقتنياتي</b>
💸 <b>تحويل 100</b> (بالرد) — تحويل نقاط
🎲 <b>رهان 100</b> — خاطر بنقاطك
💼 <b>عمل</b> — اربح نقاط (كل 30 دقيقة)
🏦 <b>بنك</b> · <b>ايداع 100</b> · <b>سحب 100</b>
📈 <b>استثمار 500</b> · <b>حصاد</b> — عائد 10-30%
🥷 <b>سرقة</b> (بالرد) — حاول تسرق نقاط!
🎟 <b>يانصيب</b> · <b>سحب يانصيب</b> — جائزة 500
💼 <b>راتب</b> — راتب يومي
🎁 <b>هدية</b> — هدية يومية
🛡 <b>شراء shield</b> — حماية من السرقة
⚡ <b>شراء double</b> — مضاعف النقاط""",

    "social": """👥 <b>النظام الاجتماعي:</b>

👤 <b>ملفي</b> / <b>بروفايل</b> — بطاقتك الكاملة
📝 <b>ضع نبذة نص</b> — نبذة عنك
❤️ <b>سمعتي</b> · <b>سمعة+</b> (بالرد) — أعطِ سمعة
🏅 <b>انجازاتي</b> — 20 إنجاز
👥 <b>اضف صديق</b> · <b>احذف صديق</b> · <b>اصدقائي</b>
🏆 <b>توب السمعة</b> · <b>توب الثراء</b> · <b>توب الالعاب</b>
💍 <b>زواج</b> · <b>طلاق</b> · <b>زوجي/زوجتي</b>
🎖 شارات وألقاب من المتجر""",

    "moregames": """🎮 <b>ألعاب إضافية:</b>

🎯 <b>شنق</b> — خمن الكلمة حرفاً حرفاً
🔗 <b>سلسلة</b> — كلمات بآخر حرف
🧠 <b>ذاكرة</b> — احفظ الرقم
🎬 <b>خمن الفيلم</b> — من الإيموجي
😀 <b>ايموجي</b> — خمن الكلمة
💰 <b>مليونير</b> — من سيربح النقاط
⚡ <b>تحدي</b> — تحديات سريعة

🎮 الأساسية: كويز، عواصم، اعلام، رياضيات، خمن، فكك، اسرع، لغز، اكس او، حجر""",

    "moretools": """🧰 <b>أدوات إضافية:</b>

🔐 <b>كلمة مرور 16</b> — كلمة مرور قوية
🔒 <b>تشفير sha256 نص</b> — md5/sha1/sha256/sha512
🔤 <b>ترميز base64 نص</b> · <b>فك base64 نص</b>
📡 <b>مورس نص</b> · <b>فك مورس</b>
📏 <b>حول 100 كم ميل</b> — طول/وزن/حرارة/بيانات/وقت/سرعة
🔢 <b>عد الحروف نص</b> · <b>اعكس نص</b> · <b>بدون تشكيل</b>
🎨 <b>لون عشوائي</b> · 💯 <b>نسبة 25 200</b>
⚖️ <b>كتلة 70 175</b> — BMI
📅 <b>فرق التاريخ 2024-01-01 2025-01-01</b>
🎲 <b>رقم عشوائي 1 100</b> · 🆔 <b>uuid</b> · 🕐 <b>طابع زمني</b>
📝 <b>احفظ نص</b> · <b>ملاحظاتي</b> · <b>امسح ملاحظة 1</b>
📊 <b>تصويت سؤال | خيار1 | خيار2</b>""",

    "moreislam": """🕌 <b>إسلاميات موسّعة:</b>

✨ <b>اسماء الله</b> — الأسماء الحسنى (99)
📜 <b>حديث</b> — أحاديث نبوية
🤲 <b>الاذكار</b> — كل الأذكار (نوم/صلاة/طعام/سفر/كرب…)
🕌 <b>مواقيت الجزائر</b> — أوقات الصلاة
🕋 <b>القبلة الجزائر</b> — اتجاه القبلة
📅 <b>التاريخ الهجري</b>
📖 <b>ختمتي</b> — تتبع ختمة القرآن · <b>ختمة جديدة</b>
🎙 <b>قارئ</b> — 10 قرّاء
📖 <b>قران الكهف العفاسي</b> — أي سورة بأي قارئ""",
}

MAIN_ROWS = [
    [btn("🛡 الحماية", data="help:protect"), btn("👮 الإدارة", data="help:admin")],
    [btn("💬 الردود", data="help:replies"), btn("🛒 الاقتصاد", data="help:economy")],
    [btn("🎮 الألعاب", data="help:games"), btn("🎵 الأغاني", data="help:music")],
    [btn("😂 التسلية", data="help:fun"), btn("👥 جهاتي", data="help:contacts")],
    [btn("🧰 الأدوات", data="help:tools"), btn("🕌 إسلاميات", data="help:islam")],
    [btn("👤 الاجتماعي", data="help:social"), btn("🎮 ألعاب+", data="help:moregames")],
    [btn("🧰 أدوات+", data="help:moretools"), btn("🕌 إسلاميات+", data="help:moreislam")],
    [btn("⚡ كل الميزات (500+)", data="help:features"), btn("👑 المطور", data="help:owner")],
]


def handle(ctx):
    rest = take(ctx, "الاوامر", "اوامر", "مساعده", "مساعدة", "help", "start", "/start")
    if rest is not None:
        if ctx.is_group:
            ctx.reply("⚡ <b>Absorbs جاهز!</b>\nاكتب (يوت اسم أغنية) 🎵 أو (العاب) 🎮 أو (جهاتي) 👥\n📋 القائمة الكاملة تصلك في الخاص 👇")
        ctx.tg.send(ctx.chat_id, HELP_MAIN, markup=keyboard(MAIN_ROWS))
        return True

    rest = take(ctx, "القوانين", "قوانين", "rules")
    if rest is not None:
        rules = ctx.settings.get("rules") if ctx.is_group else ""
        if rules:
            ctx.reply(f"📜 <b>قوانين المجموعة:</b>\n\n{esc(rules)}")
        else:
            ctx.reply("📜 لا توجد قوانين محفوظة بعد." + (" المشرف يكتب: ضع قوانين <النص>" if ctx.is_group else ""))
        return True

    rest = take(ctx, "الاقفال", "الأقفال", "locks")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        ctx.tg.send(ctx.chat_id, locks_text(ctx), markup=locks_markup(ctx))
        return True

    rest = take(ctx, "الاعدادات", "الإعدادات", "settings")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        ctx.tg.send(ctx.chat_id, settings_text(ctx), markup=settings_markup(ctx))
        return True

    rest = take(ctx, "السورس", "سورس", "about", "البوت")
    if rest is not None:
        ctx.reply(f"⚡ <b>{BOT_NAME} v2.0 — LEGEND EDITION</b>\n\n"
                  "🛡 حماية · 👮 إدارة · 🎵 أغاني · 🎮 ألعاب\n"
                  "👥 جهات · 🧰 أدوات · 🕌 إسلاميات\n\n"
                  f"📊 ميزات: 200+ | ⚡ استضافة: Vercel\nاكتب (الاوامر) للبدء 🚀")
        return True

    return False


def locks_text(ctx):
    locks = ctx.settings.get("locks", {})
    lines = ["🔐 <b>لوحة أقفال المجموعة</b>\nاضغط أي زر للتبديل 🔘\n"]
    for key, name in LOCK_NAMES_AR.items():
        if key == "all":
            continue
        lines.append(f"{'🔒' if locks.get(key) else '🔓'} {name}")
    return "\n".join(lines)


def locks_markup(ctx):
    locks = ctx.settings.get("locks", {})
    rows = []
    keys = [k for k in LOCK_NAMES_AR if k != "all"]
    for i in range(0, len(keys), 2):
        row = []
        for k in keys[i:i + 2]:
            row.append(btn(f"{'🔒' if locks.get(k) else '🔓'} {LOCK_NAMES_AR[k]}", data=f"lock:{k}"))
        rows.append(row)
    rows.append([btn("🔒 قفل الكل", data="lock:all"), btn("🔓 فتح الكل", data="unlockall")])
    rows.append([btn("⚙️ الإعدادات", data="panel:settings"), btn("🏠 القائمة", data="help:main")])
    return keyboard(rows)


def settings_text(ctx):
    s = ctx.settings
    def onoff(v):
        return "✅" if v else "⛔"
    return (f"⚙️ <b>إعدادات المجموعة:</b>\n\n"
            f"{onoff(s.get('welcome_on'))} الترحيب | {onoff(s.get('goodbye_on'))} الوداع\n"
            f"{onoff(s.get('captcha'))} الكابتشا | {onoff(s.get('flood_on'))} مكافحة السبام ({s.get('flood_n')}/{s.get('flood_s')}ث)\n"
            f"{onoff(s.get('admin_only'))} وضع المشرفين | {onoff(s.get('replies_on'))} الردود\n"
            f"{onoff(s.get('force_sub_on'))} الاشتراك الإجباري | {onoff(s.get('badwords_on'))} فلتر السب\n"
            f"⚠️ حد التحذيرات: {s.get('warn_limit')} → {s.get('warn_action')}\n"
            f"🔒 أقفال مفعلة: {sum(1 for v in s.get('locks', {}).values() if v)}\n\n"
            f"اضغط للتبديل 👇")


def settings_markup(ctx):
    s = ctx.settings
    def t(label, key):
        return btn(f"{'✅' if s.get(key) else '⛔'} {label}", data=f"set:{key}")
    return keyboard([
        [t("الترحيب", "welcome_on"), t("الوداع", "goodbye_on")],
        [t("الكابتشا", "captcha"), t("السبام", "flood_on")],
        [t("وضع المشرفين", "admin_only"), t("الردود", "replies_on")],
        [t("الاشتراك الإجباري", "force_sub_on"), t("فلتر السب", "badwords_on")],
        [btn("🔐 الأقفال", data="panel:locks"), btn("🏠 القائمة", data="help:main")],
    ])


def callback(ctx, parts):
    tg, cid = ctx.tg, ctx.chat_id
    cq = ctx.update["callback_query"]
    kind = parts[0]

    if kind == "help":
        sec = parts[1] if len(parts) > 1 else "main"
        if sec == "main":
            tg.answer_callback(cq["id"])
            tg.edit(cid, cq["message"]["message_id"], HELP_MAIN, markup=keyboard(MAIN_ROWS))
        elif sec == "rules":
            tg.answer_callback(cq["id"])
            rules = ctx.settings.get("rules", "")
            tg.send(cid, f"📜 <b>القوانين:</b>\n{esc(rules) if rules else 'لا توجد قوانين.'}")
        elif sec == "features":
            tg.answer_callback(cq["id"])
            from . import features as _feat
            cats = _feat.all_features()
            total = _feat.total_count()
            lines = [f"⚡ <b>ميزات Absorbs: {total}+ ميزة!</b> 🔥\n"]
            for cat, items in cats.items():
                lines.append(f"{cat}: <b>{len(items)}</b> ميزة")
            keys = list(cats.keys())
            rows = []
            for i in range(0, len(keys), 2):
                rows.append([btn(f"{k} ({len(cats[k])})", data=f"feat:{keys.index(k)}") for k in keys[i:i + 2]])
            tg.edit(cid, cq["message"]["message_id"], "\n".join(lines), markup=keyboard(rows))
        elif sec in HELP_TEXTS:
            # أقسام الإدارة والحماية والمطور للمشرفين فقط في المجموعات
            if ctx.is_group and sec in ("protect", "admin", "owner") and not (ctx.is_owner or ctx.is_sudo or is_group_admin(ctx)):
                tg.answer_callback(cq["id"], "🔒 هذا القسم للمشرفين فقط!", alert=True)
                return
            tg.answer_callback(cq["id"])
            tg.edit(cid, cq["message"]["message_id"], HELP_TEXTS[sec],
                    markup=keyboard([[btn("🏠 رجوع", data="help:main")]]))
        return

    if kind == "panel":
        if ctx.is_group and not (ctx.is_owner or ctx.is_sudo or is_group_admin(ctx)):
            tg.answer_callback(cq["id"], "🔒 للمشرفين فقط!", alert=True)
            return
        tg.answer_callback(cq["id"])
        if parts[1] == "locks":
            tg.edit(cid, cq["message"]["message_id"], locks_text(ctx), markup=locks_markup(ctx))
        else:
            tg.edit(cid, cq["message"]["message_id"], settings_text(ctx), markup=settings_markup(ctx))
        return

    if kind == "lock":
        if ctx.is_group and not (ctx.is_owner or ctx.is_sudo or is_group_admin(ctx)):
            tg.answer_callback(cq["id"], "🔒 للمشرفين فقط!", alert=True)
            return
        key = parts[1]
        locks = ctx.settings.setdefault("locks", {})
        if key == "all":
            locks["all"] = True
            tg.mute_all(cid, True)
            tg.answer_callback(cq["id"], "🔒 قُفلت الدردشة على المشرفين فقط", alert=False)
        else:
            locks[key] = not locks.get(key)
            ctx.dirty = True
            tg.answer_callback(cq["id"], f"{'🔒 قُفل' if locks[key] else '🔓 فُتح'} {LOCK_NAMES_AR.get(key, key)}")
        tg.edit_markup(cid, cq["message"]["message_id"], locks_markup(ctx))
        return

    if kind == "unlockall":
        if ctx.is_group and not (ctx.is_owner or ctx.is_sudo or is_group_admin(ctx)):
            tg.answer_callback(cq["id"], "🔒 للمشرفين فقط!", alert=True)
            return
        ctx.settings["locks"] = {}
        ctx.dirty = True
        tg.mute_all(cid, False)
        tg.answer_callback(cq["id"], "🔓 فُتح كل شيء!")
        tg.edit_markup(cid, cq["message"]["message_id"], locks_markup(ctx))
        return

    if kind == "set":
        if ctx.is_group and not (ctx.is_owner or ctx.is_sudo or is_group_admin(ctx)):
            tg.answer_callback(cq["id"], "🔒 للمشرفين فقط!", alert=True)
            return
        key = parts[1]
        ctx.settings[key] = not ctx.settings.get(key)
        ctx.dirty = True
        tg.answer_callback(cq["id"], "✅ تم التبديل")
        tg.edit(cid, cq["message"]["message_id"], settings_text(ctx), markup=settings_markup(ctx))
        return

    if kind == "fs":
        u = ctx.chat_data["users"].get(str(ctx.user_id), {})
        u["fs_ok"] = 0
        ctx.dirty = True
        tg.answer_callback(cq["id"], "🔄 أعد إرسال رسالتك وسأتحقق من اشتراكك!", alert=False)
        return

    if kind == "tasbih":
        from .store import get_user
        if ctx.is_group:
            u = get_user(ctx.chat_data, ctx.user)
            if parts[1] == "0":
                u["ts"] = 0
            else:
                u["ts"] = u.get("ts", 0) + 1
            count = u["ts"]
        else:
            if parts[1] == "0":
                ctx.chat_data["tasbih"] = 0
            else:
                ctx.chat_data["tasbih"] = ctx.chat_data.get("tasbih", 0) + 1
            count = ctx.chat_data["tasbih"]
        ctx.dirty = True
        tg.answer_callback(cq["id"], f"📿 {count}")
        rows = [[btn("📿 سبح (+1)", data="tasbih:1"), btn("🔄 تصفير", data="tasbih:0")]]
        tg.edit(cid, cq["message"]["message_id"],
                f"📿 <b>السبحة الإلكترونية</b>\nالعداد: <b>{count}</b>\nسبحان الله وبحمده، سبحان الله العظيم",
                markup=keyboard(rows))
        return
