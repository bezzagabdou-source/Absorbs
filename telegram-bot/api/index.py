# -*- coding: utf-8 -*-
"""Absorbs Bot — نقطة دخول Vercel (Python Serverless).
POST /api            → ويب هوك تيليجرام
GET  /setup?key=...  → إعداد تلقائي (ويب هوك + تخزين + أوامر)
GET  /health         → فحص الحالة
GET  /               → صفحة معلومات
"""
import hashlib
import json
import os
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _bot.core import handle_update, BOT_TITLE
from _bot.tg import TG
from _bot.store import Store

TOKEN = os.environ.get("BOT_TOKEN", "").strip()
_POINTER_CACHE = {"p": ""}


def _secret():
    return os.environ.get("WEBHOOK_SECRET", "").strip() or hashlib.sha256(("wh:" + TOKEN).encode()).hexdigest()[:32]


def _setup_key():
    return hashlib.sha256(TOKEN.encode()).hexdigest()[:24]


def _json_response(handler, obj, code=200):
    body = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _get_pointer(handler, qs, tg):
    p = (qs.get("p") or [""])[0]
    if p:
        _POINTER_CACHE["p"] = p
        return p
    if _POINTER_CACHE["p"]:
        return _POINTER_CACHE["p"]
    try:
        info = tg.webhook_info()
        url = info.get("url", "") if isinstance(info, dict) else ""
        if "p=" in url:
            p = parse_qs(urlparse(url).query).get("p", [""])[0]
            _POINTER_CACHE["p"] = p
            return p
    except Exception:
        pass
    return ""


def do_setup(qs, host):
    if not TOKEN:
        return {"ok": False, "error": "BOT_TOKEN غير مضبوط في متغيرات البيئة"}
    key = (qs.get("key") or [""])[0]
    if key != _setup_key():
        return {"ok": False, "error": "مفتاح غير صحيح"}
    tg = TG(TOKEN)
    me = tg.get_me()
    if not isinstance(me, dict) or me.get("_error"):
        return {"ok": False, "error": "توكن غير صالح", "detail": me}
    base = f"https://{host}"
    reset = (qs.get("reset") or ["0"])[0] == "1"

    # استخراج/إنشاء التخزين
    pointer = ""
    if not reset:
        info = tg.webhook_info()
        old_url = info.get("url", "") if isinstance(info, dict) else ""
        if "p=" in old_url:
            pointer = parse_qs(urlparse(old_url).query).get("p", [""])[0]
    if pointer:
        st = Store(pointer)
        state = st.load()
        if not state.get("chats") and not state.get("created"):
            pointer = ""  # مخزن تالف
    if not pointer:
        pointer = Store.provision()
    store = Store(pointer)
    state = store.load()
    state["bot_id"] = me.get("id")
    state["bot_username"] = me.get("username")
    if not state.get("created"):
        import time
        state["created"] = int(time.time())
    store.save(state)

    # الويب هوك
    wh_url = base + "/api" + (("?p=" + quote(pointer, safe="")) if pointer else "")
    res = tg.set_webhook(wh_url, _secret(), drop=False)

    # أوامر البوت (أسماء إنجليزية + وصف عربي)
    commands = [
        {"command": "start", "description": "🚀 بدء البوت والقائمة الرئيسية"},
        {"command": "help", "description": "📋 كل الأوامر والمزايا"},
        {"command": "music", "description": "🎵 تحميل أغنية: /music اسم الأغنية"},
        {"command": "play", "description": "🎵 تشغيل أغنية من يوتيوب"},
        {"command": "quran", "description": "🕌 القرآن: /quran الكهف"},
        {"command": "games", "description": "🎮 قاعة الألعاب"},
        {"command": "locks", "description": "🔐 لوحة أقفال الحماية (مشرفين)"},
        {"command": "settings", "description": "⚙️ إعدادات المجموعة (مشرفين)"},
        {"command": "rules", "description": "📜 قوانين المجموعة"},
        {"command": "id", "description": "🆔 معلوماتك ومعرفك"},
        {"command": "ban", "description": "🔨 حظر عضو (مشرفين)"},
        {"command": "mute", "description": "🔇 كتم عضو (مشرفين)"},
        {"command": "warn", "description": "️ تحذير عضو (مشرفين)"},
        {"command": "pin", "description": "📌 تثبيت رسالة (مشرفين)"},
        {"command": "purge", "description": "🧹 مسح الرسائل (مشرفين)"},
        {"command": "weather", "description": "🌦 الطقس: /weather الجزائر"},
        {"command": "translate", "description": "🌐 ترجمة النصوص"},
        {"command": "calc", "description": "🧮 حاسبة علمية"},
        {"command": "wiki", "description": "📚 ويكيبيديا"},
        {"command": "daily", "description": "🎁 هدية النقاط اليومية"},
        {"command": "top", "description": "🏆 المتصدرون"},
        {"command": "invite", "description": "👥 جهاتي — كم عضو أضفت"},
        {"command": "ping", "description": "🏓 فحص سرعة البوت"},
        {"command": "status", "description": "📊 حالة البوت (المطور)"},
    ]
    tg.set_commands(commands)
    tg.set_commands(commands, scope={"type": "all_group_chats"})
    tg.set_description(
        "⚡ Absorbs — البوت العربي الأسطوري!\n🛡 حماية المجموعات 👮 إدارة كاملة 🎵 أغاني يوتيوب "
        "🎮 ألعاب ومسابقات 👥 نظام الجهات 🕌 قرآن وأذكار 🧰 أدوات ذكية\nأضفني لمجموعتك وارفعني مشرفاً ثم اكتب: تفعيل",
        short="⚡ حماية + أغاني + ألعاب + 200 ميزة")

    return {"ok": True, "bot": {"id": me.get("id"), "username": me.get("username"), "name": me.get("first_name")},
            "webhook": wh_url, "webhook_result": res, "storage": pointer or "⚠️ لا يوجد تخزين دائم",
            "storage_ok": bool(pointer), "setup_key_hint": "احفظ مفتاح الإعداد لاستعادته لاحقاً"}


def do_health():
    if not TOKEN:
        return {"ok": False, "error": "BOT_TOKEN missing"}
    tg = TG(TOKEN)
    me = tg.get_me()
    info = tg.webhook_info()
    pointer = ""
    if isinstance(info, dict) and "p=" in info.get("url", ""):
        pointer = parse_qs(urlparse(info["url"]).query).get("p", [""])[0]
    storage_ok = False
    write_ok = False
    write_detail = "no pointer"
    if pointer:
        try:
            st = Store(pointer)
            write_ok, write_detail = st.write_ok()
            storage_ok = write_ok
        except Exception as e:
            write_detail = str(e)[:120]
    return {"ok": isinstance(me, dict) and not me.get("_error"),
            "bot": me if isinstance(me, dict) else str(me),
            "webhook": info, "storage_ok": storage_ok,
            "storage_write_ok": write_ok, "storage_write_detail": write_detail}


def do_storage(qs, host):
    """تشخيص وإصلاح التخزين: يتحقق من الكتابة، وإن فشلت ينشئ خادماً جديداً موثوقاً."""
    if not TOKEN:
        return {"ok": False, "error": "BOT_TOKEN missing"}
    key = (qs.get("key") or [""])[0]
    if key != _setup_key():
        return {"ok": False, "error": "مفتاح غير صحيح"}
    tg = TG(TOKEN)
    info = tg.webhook_info()
    old_url = info.get("url", "") if isinstance(info, dict) else ""
    pointer = parse_qs(urlparse(old_url).query).get("p", [""])[0] if "p=" in old_url else ""
    repair = (qs.get("repair") or ["0"])[0] == "1"
    report = {"old_pointer": pointer}
    cur_ok, cur_detail = (False, "no pointer")
    if pointer:
        cur_ok, cur_detail = Store(pointer).write_ok()
    report["current_write_ok"] = cur_ok
    report["current_detail"] = cur_detail
    if cur_ok and not repair:
        report["ok"] = True
        report["action"] = "none — التخزين سليم"
        return report
    new_pointer = Store.provision()
    report["new_pointer"] = new_pointer
    if not new_pointer:
        report["ok"] = False
        report["error"] = "لم ينجح أي خادم تخزين"
        return report
    st = Store(new_pointer)
    state = st.load()
    if pointer:
        old_state = Store(pointer).load()
        if old_state.get("chats"):
            state = old_state  # انقل البيانات الموجودة إن كانت قابلة للقراءة
    me = tg.get_me()
    if isinstance(me, dict):
        state["bot_id"] = me.get("id")
        state["bot_username"] = me.get("username")
    if not state.get("created"):
        state["created"] = int(time.time())
    state.pop("_probe", None)
    report["migrated_chats"] = len(state.get("chats", {}))
    report["saved"] = st.save(state)
    wok, wdetail = st.write_ok()
    report["new_write_ok"] = wok
    report["new_write_detail"] = wdetail
    if not wok:
        report["ok"] = False
        report["error"] = "الخادم الجديد لا يكتب"
        return report
    base = f"https://{host}"
    wh_url = base + "/api?p=" + quote(new_pointer, safe="")
    report["webhook"] = wh_url
    report["webhook_result"] = tg.set_webhook(wh_url, _secret(), drop=False)
    report["ok"] = True
    report["action"] = "repaired — تم إصلاح التخزين"
    return report


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _host(self):
        return self.headers.get("x-forwarded-host") or self.headers.get("host") or "arabic-super-bot.vercel.app"

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            action = (qs.get("action") or [""])[0]
            path = parsed.path.rstrip("/")
            if action == "setup" or path.endswith("/setup"):
                _json_response(self, do_setup(qs, self._host()))
            elif action == "health" or path.endswith("/health"):
                _json_response(self, do_health())
            elif action == "storage" or path.endswith("/storage"):
                _json_response(self, do_storage(qs, self._host()))
            else:
                _json_response(self, {"name": BOT_TITLE, "status": "legendary", "endpoints": ["/setup", "/health", "/api"],
                                      "features": "200+ ميزة: حماية، إدارة، أغاني يوتيوب، ألعاب، قرآن، أدوات"})
        except Exception as e:
            traceback.print_exc()
            _json_response(self, {"ok": False, "error": str(e)}, 500)

    def do_POST(self):
        try:
            if not TOKEN:
                _json_response(self, {"ok": False, "error": "BOT_TOKEN missing"}, 500)
                return
            # التحقق من سر الويب هوك
            got = self.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
            if got != _secret():
                _json_response(self, {"ok": False, "error": "bad secret"}, 403)
                return
            length = int(self.headers.get("Content-Length", 0) or 0)
            raw = self.rfile.read(length) if length else b"{}"
            update = json.loads(raw or b"{}")
            qs = parse_qs(urlparse(self.path).query)
            tg = TG(TOKEN)
            pointer = _get_pointer(self, qs, tg)
            handle_update(update, TOKEN, pointer)
            _json_response(self, {"ok": True})
        except Exception as e:
            traceback.print_exc()
            _json_response(self, {"ok": True, "warn": str(e)[:100]})
