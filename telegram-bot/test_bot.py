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

print("\n🎉 كل الاختبارات نجحت! البوت جاهز للنشر.")
