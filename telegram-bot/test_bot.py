# -*- coding: utf-8 -*-
"""اختبار محلي شامل بمحاكاة Telegram API."""
import json
import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "api"))
os.environ["BOT_TOKEN"] = "123456:TEST"

from _bot import core, store
from _bot.core import Ctx, handle_update

CALLS = []
STATE = {"v": 2, "owner": 777, "sudo": [], "gbans": {}, "chats": {}, "created": int(time.time()), "bot_id": 999, "bot_username": "absorbs_bot"}


class FakeTG:
    def __init__(self, token):
        self.token = token
        self.me = {"id": 999, "username": "absorbs_bot", "first_name": "Absorbs"}

    def _rec(self, method, args, kw):
        CALLS.append((method, args, kw))
        if method == "send":
            return {"message_id": len(CALLS) + 1000, "chat": {"id": args[0] if args else kw.get("chat_id")}}
        if method == "get_admins":
            return [{"user": {"id": 777, "first_name": "Owner"}, "status": "creator"},
                    {"user": {"id": 555, "first_name": "Admin"}, "status": "administrator"}]
        if method == "get_chat":
            return {"id": args[0] if args else None, "title": "مجموعة الاختبار", "type": "supergroup"}
        if method == "get_member":
            return {"status": "member", "user": {"id": args[1] if len(args) > 1 else None}}
        if method == "get_member_count":
            return 42
        if method == "webhook_info":
            return {"url": "https://x/api", "pending_update_count": 0}
        if method == "get_me":
            return self.me
        return True

    def __getattr__(self, name):
        return lambda *a, **k: self._rec(name, a, k)


core.TG = FakeTG
store.DEFAULT_SETTINGS["flood_on"] = False  # نوقف السبام مؤقتاً للاختبار
store.Store.load = lambda self: json.loads(json.dumps(STATE))
store.Store.save = lambda self, s: STATE.update(json.loads(json.dumps(s))) or True


def msg_update(text, uid=111, chat_id=-100123, chat_type="supergroup", reply=None, uname="tester", mid=None):
    m = {"message_id": mid or len(CALLS) + 1, "date": int(time.time()),
         "from": {"id": uid, "first_name": "Tester", "username": uname, "is_bot": False},
         "chat": {"id": chat_id, "type": chat_type, "title": "Test"}}
    if text:
        m["text"] = text
    if reply:
        m["reply_to_message"] = reply
    return {"update_id": 1, "message": m}


def run(update):
    CALLS.clear()
    handle_update(update, "123456:TEST", "")
    return list(CALLS)


def texts(calls):
    out = []
    for m, a, k in calls:
        if m == "send":
            out.append(a[1] if len(a) > 1 else k.get("text", ""))
        elif m == "edit":
            out.append(a[2] if len(a) > 2 else k.get("text", ""))
    return out


def check(name, cond):
    print(("✅" if cond else "❌") + " " + name)
    if not cond:
        raise AssertionError(name)


# 1) جهاتي
calls = run(msg_update("جهاتي", uid=111))
check("جهاتي يرد", any("جهاتك" in t for t in texts(calls)))

# إضافة عضو تزيد العداد
join = msg_update("", uid=111)
join["message"]["new_chat_members"] = [{"id": 222, "first_name": "New", "is_bot": False}]
run(join)
calls = run(msg_update("جهاتي", uid=111))
check("عداد الجهات يزيد", any("<b>1</b>" in t for t in texts(calls)))

calls = run(msg_update("مسح جهاتي", uid=111))
check("مسح جهاتي", any("تم مسح جهاتك" in t for t in texts(calls)))

# 2) صلاحيات: عضو عادي يحاول حظر
reply = {"message_id": 5, "from": {"id": 222, "first_name": "Victim"}, "chat": {"id": -100123}}
calls = run(msg_update("حظر", uid=111, reply=reply))
check("عضو عادي ممنوع من الحظر", any("للمشرفين" in t for t in texts(calls)))

# مشرف يحظر
calls = run(msg_update("حظر", uid=555, reply=reply))
check("مشرف يحظر", any("تم حظر" in t for t in texts(calls)))

# كتم بمدة
calls = run(msg_update("كتم 30m", uid=555, reply=reply))
check("كتم 30 دقيقة", any("30 دقيقة" in t for t in texts(calls)))

# 3) أقفال
calls = run(msg_update("قفل الروابط", uid=555))
check("قفل الروابط", any("تم قفل" in t for t in texts(calls)))
link_msg = msg_update("زوروا https://spam.com الآن", uid=111)
calls = run(link_msg)
check("حذف الرابط", any(m == "delete" for m, a, k in calls))
calls = run(msg_update("فتح الروابط", uid=555))

# 4) وضع المشرفين
calls = run(msg_update("وضع المشرفين", uid=555))
check("تفعيل وضع المشرفين", any("وضع المشرفين مفعّل" in t for t in texts(calls)))
calls = run(msg_update("نكتة", uid=111))
check("عضو عادي لا يحصل رد في وضع المشرفين", len(texts(calls)) == 0)
calls = run(msg_update("نكتة", uid=555))
check("مشرف يحصل على نكتة", len(texts(calls)) >= 1)
run(msg_update("الغاء وضع المشرفين", uid=555))

# 5) ألعاب
calls = run(msg_update("كويز", uid=111))
check("كويز يرسل سؤال", any("سؤال معرفي" in t for t in texts(calls)))
calls = run(msg_update("خمن", uid=111))
check("لعبة تخمين", any("التخمين" in t for t in texts(calls)))
calls = run(msg_update("اكس او", uid=111))
check("XO", any("إكس أو" in t for t in texts(calls)))

# 6) ردود تلقائية
calls = run(msg_update("السلام عليكم", uid=111))
check("رد سلام", any("وعليكم السلام" in t for t in texts(calls)))

# 7) نقاط وهدية
calls = run(msg_update("نقاطي", uid=111))
check("نقاطي", any("نقاطك" in t for t in texts(calls)))
calls = run(msg_update("هدية", uid=111))
check("هدية يومية", any("هدية" in t or "نقطة" in t for t in texts(calls)))

# 8) زخرفة
calls = run(msg_update("زخرفة محمد", uid=111))
check("زخرفة", any("زخرفة النص" in t for t in texts(calls)))

# 9) نسب
calls = run(msg_update("نسبة الحب", uid=111, reply=reply))
check("نسبة الحب", any("نسبة الحب" in t for t in texts(calls)))

# 10) زواج
calls = run(msg_update("زواج", uid=111, reply=reply))
check("زواج", any("زواج" in t or "قران" in t or "مبروك" in t for t in texts(calls)))
calls = run(msg_update("طلاق", uid=111))
check("طلاق", any("طلاق" in t or "انفصال" in t for t in texts(calls)))

# 11) أوامر المطور
calls = run(msg_update("الحالة", uid=777, chat_id=777, chat_type="private"))
check("الحالة للمطور", any("حالة البوت" in t for t in texts(calls)))

# 12) القائمة
calls = run(msg_update("الاوامر", uid=111))
check("قائمة الاوامر", any("الأسطوري" in t for t in texts(calls)))

# 13) القوانين
run(msg_update("ضع قوانين ممنوع السب", uid=555))
calls = run(msg_update("القوانين", uid=111))
check("القوانين", any("ممنوع السب" in t for t in texts(calls)))

# 14) رد مخصص
run(msg_update("اضف رد هلا | هلا بيك", uid=555))
calls = run(msg_update("هلا", uid=111))
check("رد مخصص", any("هلا بيك" in t for t in texts(calls)))

# 15) كابتشا
run(msg_update("تفعيل الكابتشا", uid=555))
join2 = msg_update("", uid=111)
join2["message"]["new_chat_members"] = [{"id": 333, "first_name": "Captcha", "is_bot": False}]
calls = run(join2)
check("كابتشا للعضو الجديد", any("تحقق" in t for t in texts(calls)))

# 16) سبام
STATE["chats"]["-100123"]["settings"]["flood_on"] = True
STATE["chats"]["-100123"]["flood"] = {}
allcalls = []
for i in range(8):
    allcalls += run(msg_update(f"رسالة {i}", uid=444))
check("كتم السبام", any(m == "restrict" for m, a, k in allcalls) or any("سبام" in t for t in texts(allcalls)))
STATE["chats"]["-100123"]["settings"]["flood_on"] = False  # نوقفه مجدداً لاختبارات الميزات الجديدة
STATE["chats"]["-100123"]["flood"] = {}

# 17) callback كويز
STATE["chats"]["-100123"]["game"] = {"type": "quiz", "qid": 4242, "correct": 1, "q": "س", "ts": time.time()}
cq = {"update_id": 2, "callback_query": {"id": "cq1", "from": {"id": 111, "first_name": "T"},
      "message": {"message_id": 50, "chat": {"id": -100123, "type": "supergroup"}}, "data": "quiz:4242:1"}}
calls = run(cq)
check("إجابة كويز صحيحة", any("ربح" in t for t in texts(calls)))

# 18) slash commands
calls = run(msg_update("/help", uid=111))
check("/help", any("الأسطوري" in t for t in texts(calls)))
calls = run(msg_update("/id", uid=111))
check("/id", any("الآيدي" in t for t in texts(calls)))

# ================= الميزات الجديدة (500+) =================
print("\n--- الميزات الجديدة ---")

# ---- الردود الغنية (تحتاج مشرف uid=555) ----
calls = run(msg_update("اضف رد هلا | أهلاً {name} نورت {group} 🌹", uid=555))
check("اضف رد غني", any("✅" in t for t in texts(calls)))
calls = run(msg_update("هلا", uid=111))
check("رد غني بالمتغيرات", any("أهلاً" in t and "Test" in t for t in texts(calls)))
calls = run(msg_update("اضف رد عشوائي | رد1 || رد2 || رد3", uid=555))
check("رد عشوائي متعدد", any("✅" in t for t in texts(calls)))
calls = run(msg_update("الردود", uid=555))
check("قائمة الردود", any("هلا" in t and "🎲" in t for t in texts(calls)))
calls = run(msg_update("عدل رد هلا | جديد {name}", uid=555))
check("عدل رد", any("✏️" in t for t in texts(calls)))
calls = run(msg_update("تعطيل رد هلا", uid=555))
check("تعطيل رد", any("⛔" in t for t in texts(calls)))
calls = run(msg_update("تفعيل رد هلا", uid=555))
check("تفعيل رد", any("✅" in t for t in texts(calls)))
calls = run(msg_update("بحث رد هلا", uid=555))
check("بحث رد", any("هلا" in t for t in texts(calls)))
calls = run(msg_update("احذف رد هلا", uid=555))
check("احذف رد غني", any("🗑" in t for t in texts(calls)))

# ---- الاقتصاد ----
calls = run(msg_update("المتجر", uid=111))
check("المتجر", any("متجر الأساطير" in t for t in texts(calls)))
calls = run(msg_update("عمل", uid=111))
check("عمل", any("ربحت" in t or "تعبت" in t for t in texts(calls)))
calls = run(msg_update("بنك", uid=111))
check("بنك", any("البنك" in t for t in texts(calls)))
calls = run(msg_update("ايداع 50", uid=111))
check("ايداع", any("أودعت" in t or "🔢" in t for t in texts(calls)))
calls = run(msg_update("مقتنياتي", uid=111))
check("مقتنياتي", any("مقتنيات" in t for t in texts(calls)))

# ---- الاجتماعي ----
calls = run(msg_update("ملفي", uid=111))
check("ملفي", any("ملف" in t for t in texts(calls)))
calls = run(msg_update("ضع نبذة أنا مطور البوت", uid=111))
check("ضع نبذة", any("حُفظت نبذتك" in t for t in texts(calls)))
calls = run(msg_update("سمعتي", uid=111))
check("سمعتي", any("سمعة" in t for t in texts(calls)))
calls = run(msg_update("انجازاتي", uid=111))
check("انجازاتي", any("إنجازاتك" in t for t in texts(calls)))
calls = run(msg_update("اصدقائي", uid=111))
check("اصدقائي", any("أصدقاء" in t for t in texts(calls)))
calls = run(msg_update("توب الثراء", uid=111))
check("توب الثراء", any("أغنى" in t for t in texts(calls)))

# ---- ألعاب إضافية ----
calls = run(msg_update("شنق", uid=111))
check("شنق", any("الشنق" in t for t in texts(calls)))
calls = run(msg_update("سلسلة", uid=111))
check("سلسلة", any("سلسلة الكلمات" in t for t in texts(calls)))
calls = run(msg_update("ذاكرة", uid=111))
check("ذاكرة", any("الذاكرة" in t for t in texts(calls)))
calls = run(msg_update("خمن الفيلم", uid=111))
check("خمن الفيلم", any("الفيلم" in t for t in texts(calls)))
calls = run(msg_update("مليونير", uid=111))
check("مليونير", any("من سيربح" in t for t in texts(calls)))

# ---- أدوات إضافية ----
calls = run(msg_update("كلمة مرور 16", uid=111))
check("كلمة مرور", any("كلمة مرور قوية" in t for t in texts(calls)))
calls = run(msg_update("تشفير sha256 test", uid=111))
check("تشفير", any("🔒" in t for t in texts(calls)))
calls = run(msg_update("ترميز base64 hello", uid=111))
check("ترميز base64", any("الترميز" in t for t in texts(calls)))
calls = run(msg_update("حول 100 كم ميل", uid=111))
check("تحويل وحدات", any("📏" in t and "ميل" in t for t in texts(calls)))
calls = run(msg_update("لون عشوائي", uid=111))
check("لون عشوائي", any("لون عشوائي" in t for t in texts(calls)))
calls = run(msg_update("احفظ هذه ملاحظة تجريبية", uid=111))
check("احفظ ملاحظة", any("حُفظت ملاحظتك" in t for t in texts(calls)))
calls = run(msg_update("ملاحظاتي", uid=111))
check("ملاحظاتي", any("ملاحظاتك" in t for t in texts(calls)))

# ---- إسلاميات موسعة ----
calls = run(msg_update("اسماء الله", uid=111))
check("اسماء الله", any("أسماء الله الحسنى" in t for t in texts(calls)))
calls = run(msg_update("اسماء الله 2", uid=111))
check("اسم الله رقم", any("الرحمن" in t for t in texts(calls)))
calls = run(msg_update("حديث", uid=111))
check("حديث", any("قال" in t and "ﷺ" in t for t in texts(calls)))
calls = run(msg_update("اذكار النوم", uid=111))
check("اذكار النوم", any("أذكار النوم" in t for t in texts(calls)))
calls = run(msg_update("ختمتي", uid=111))
check("ختمتي", any("ختمتك" in t for t in texts(calls)))

# ---- سجل الميزات ----
calls = run(msg_update("الميزات", uid=111))
check("الميزات 500+", any("560+ ميزة" in t for t in texts(calls)))

# ---- أزرار الميزات (callback) ----
def cq_update(data):
    return {"update_id": 3, "callback_query": {"id": "cqf", "from": {"id": 111, "first_name": "T"},
            "message": {"message_id": 60, "chat": {"id": -100123, "type": "supergroup"}}, "data": data}}
calls = run(cq_update("feat:0"))
check("زر فئة الميزات", any("الحماية" in t for t in texts(calls)))
calls = run(cq_update("feat:back"))
check("زر رجوع الميزات", any("560+ ميزة" in t for t in texts(calls)))

print("\n🎉 كل الاختبارات نجحت! البوت جاهز للنشر.")
