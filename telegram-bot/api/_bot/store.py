# -*- coding: utf-8 -*-
"""تخزين دائم مجاني بدون تسجيل: jsonblob.com أساسي + kvdb.io احتياطي.
المؤشر يُحفظ داخل رابط الويبهوك نفسه حتى يبقى عبر كل الاستدعاءات (serverless)."""
import json
import re
import time
import requests

DEFAULT_STATE = {"v": 2, "owner": None, "sudo": [], "gbans": {}, "chats": {}, "created": 0}

# بعض الخوادم (Cloudflare) تحجب وكيل python-requests الافتراضي → نستخدم وكيل متصفح
_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def _http(method, url, **kw):
    headers = {"User-Agent": _UA, "Accept": "application/json"}
    headers.update(kw.pop("headers", None) or {})
    kw.setdefault("timeout", 15)
    return requests.request(method, url, headers=headers, **kw)


def _snip(r):
    t = re.sub(r"<[^>]+>", " ", getattr(r, "text", "") or "")
    return " ".join(t.split())[:60]

DEFAULT_SETTINGS = {
    "on": True,
    "locks": {"links": True},  # حذف الروابط تلقائياً افتراضياً (حماية فورية)
    "welcome_on": True,
    "welcome": "",
    "goodbye_on": False,
    "goodbye": "",
    "rules": "",
    "admin_only": False,    # وضع المشرفين: البوت يرد على المشرفين فقط
    "captcha": False,
    "flood_on": True,
    "flood_n": 7,
    "flood_s": 8,
    "warn_limit": 3,
    "warn_action": "mute",  # mute | ban | kick
    "badwords_on": True,   # فلتر السب مفعّل افتراضياً (قابلة للتعديل: اضف كلمة / احذف كلمة)
    "badwords": [],
    "replies_on": True,
    "replies": {},          # كلمة -> رد
    "force_sub_on": False,
    "force_sub": "",
    "del_service": True,
    "clean_warns": True,
    "fun": True,
}


def new_chat():
    # نسخة عميقة حتى لا تتشارك المجموعات نفس كائنات الإعدادات (locks/badwords…)
    return {"settings": json.loads(json.dumps(DEFAULT_SETTINGS)), "users": {}, "captcha_pending": {},
            "game": None, "bot_msgs": [], "admins": {"ids": [], "ts": 0},
            "msgs": 0, "flood": {}, "married": {}, "proposals": {}, "wizards": {}}


def new_user(name="", username=""):
    return {"n": name[:40], "u": (username or "")[:32], "m": 0, "x": 0, "w": 0,
            "a": 0, "g": 0, "l": 0, "t": "", "sp": 0, "d": 0, "ts": 0}


class Store:
    """pointer: 'jb:<url>' أو 'kv:<bucket>' أو '' (بلا تخزين)."""

    def __init__(self, pointer=""):
        self.pointer = pointer or ""
        self.ok = bool(pointer)
        self.last_error = ""

    # ----- إنشاء مخزن جديد (مع تحقق فعلي من الكتابة) -----
    @staticmethod
    def _prov_jsonblob():
        r = _http("POST", "https://jsonblob.com/api/jsonBlob", json={"init": True},
                  headers={"Content-Type": "application/json"})
        loc = r.headers.get("Location") or r.headers.get("location") or ""
        xid = r.headers.get("x-jsonblob") or r.headers.get("X-jsonblob") or ""
        blob = (loc.rstrip("/").split("/")[-1] if loc else "") or xid
        if r.status_code in (200, 201) and blob:
            return "jb:" + blob
        raise RuntimeError("HTTP %s loc=%s %s" % (r.status_code, bool(loc), _snip(r)))

    @staticmethod
    def _prov_superjsonblob():
        r = _http("POST", "https://superjsonblob.com/api/jsonBlob", json={"init": True},
                  headers={"Content-Type": "application/json"})
        loc = r.headers.get("Location") or r.headers.get("location") or ""
        blob = loc.rstrip("/").split("/")[-1] if loc else ""
        if not blob:
            try:
                blob = r.json().get("id", "")
            except Exception:
                blob = ""
        if r.status_code in (200, 201) and blob:
            return "sj:" + blob
        raise RuntimeError("HTTP %s %s" % (r.status_code, _snip(r)))

    @staticmethod
    def _prov_pantry():
        r = _http("POST", "https://getpantry.cloud/apiv1/pantry/create",
                  json={"name": "absorbs-bot", "description": "telegram bot state"},
                  headers={"Content-Type": "application/json"})
        if r.status_code in (200, 201):
            try:
                data = r.json()
                pid = data.get("pantryId") or data.get("pantry_id") or data.get("id") or ""
            except Exception:
                pid = r.text.strip().strip('"')
            if pid:
                return "pt:" + pid
        raise RuntimeError("HTTP %s %s" % (r.status_code, _snip(r)))

    @staticmethod
    def _prov_kvdb():
        r = _http("POST", "https://kvdb.io", data={"email": "absorbs.bot@proton.me"})
        if r.status_code in (200, 201) and r.text.strip():
            return "kv:" + r.text.strip().split("/")[-1]
        raise RuntimeError("HTTP %s %s" % (r.status_code, _snip(r)))

    @staticmethod
    def provision(debug=None):
        """يجرّب عدة خوادم ويتحقق من الكتابة+القراءة قبل اعتماد أيّ منها."""
        for name, maker in (("jsonblob", Store._prov_jsonblob), ("superjsonblob", Store._prov_superjsonblob),
                            ("pantry", Store._prov_pantry), ("kvdb", Store._prov_kvdb)):
            entry = {"backend": name}
            try:
                pointer = maker()
                entry["pointer"] = pointer
                if not pointer:
                    entry["error"] = "create failed"
                    if debug is not None:
                        debug.append(entry)
                    continue
                st = Store(pointer)
                probe = {"v": 2, "created": int(time.time()), "chats": {}, "sudo": [],
                         "gbans": {}, "_probe": "absorbs-ok"}
                if st.save(probe):
                    back = st.load()
                    if back.get("_probe") == "absorbs-ok":
                        entry["ok"] = True
                        if debug is not None:
                            debug.append(entry)
                        return pointer
                    entry["error"] = "read-back mismatch"
                else:
                    entry["error"] = "save: " + (st.last_error or "failed")
            except Exception as e:
                entry["error"] = str(e)[:160]
            if debug is not None:
                debug.append(entry)
        return ""

    def _url(self):
        if self.pointer.startswith("jb:"):
            return f"https://jsonblob.com/api/jsonBlob/{self.pointer[3:]}"
        if self.pointer.startswith("sj:"):
            return f"https://superjsonblob.com/api/jsonBlob/{self.pointer[3:]}"
        if self.pointer.startswith("kv:"):
            return f"https://kvdb.io/{self.pointer[3:]}/state"
        if self.pointer.startswith("pt:"):
            return f"https://getpantry.cloud/apiv1/pantry/{self.pointer[3:]}/basket/state"
        return None

    def _write_method(self):
        return "POST" if self.pointer.startswith("pt:") else "PUT"

    def load(self):
        url = self._url()
        if not url:
            return json.loads(json.dumps(DEFAULT_STATE))
        for attempt in range(2):
            try:
                r = _http("GET", url, timeout=12)
                if r.status_code == 200:
                    data = r.json()
                    # تأكد أنه حالة حقيقية وليس جسم خطأ مثل {"message":"Not Found"}
                    if isinstance(data, dict) and ("chats" in data or "v" in data or "created" in data):
                        data.setdefault("chats", {})
                        data.setdefault("sudo", [])
                        data.setdefault("gbans", {})
                        return data
                self.last_error = f"HTTP {r.status_code}"
            except Exception as e:
                self.last_error = str(e)[:120]
                time.sleep(0.4)
        return json.loads(json.dumps(DEFAULT_STATE))

    def save(self, state):
        url = self._url()
        if not url:
            return False
        state["saved"] = int(time.time())
        body = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        # حماية من تضخم البيانات
        if len(body.encode("utf-8")) > 900_000:
            prune(state)
            body = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        method = self._write_method()
        for attempt in range(2):
            try:
                r = _http(method, url, data=body.encode("utf-8"),
                          headers={"Content-Type": "application/json"})
                if r.status_code in (200, 201, 204):
                    return True
                self.last_error = f"HTTP {r.status_code}"
            except Exception as e:
                self.last_error = str(e)[:120]
                time.sleep(0.4)
        return False

    def write_ok(self):
        """اختبار كتابة حقيقي: يحفظ الحالة الحالية ويعيد قراءتها."""
        try:
            state = self.load()
            marker = int(time.time())
            state["_wtest"] = marker
            if not self.save(state):
                return False, self.last_error or "save failed"
            back = self.load()
            if back.get("_wtest") == marker:
                return True, "ok"
            return False, "read-back mismatch"
        except Exception as e:
            return False, str(e)[:120]


def prune(state):
    """تقليم المستخدمين غير النشطين عند تضخم البيانات."""
    now = time.time()
    for chat in state.get("chats", {}).values():
        users = chat.get("users", {})
        if len(users) > 150:
            drop = [uid for uid, u in users.items()
                    if u.get("m", 0) < 3 and now - u.get("l", 0) > 14 * 86400]
            for uid in drop:
                users.pop(uid, None)
        chat["bot_msgs"] = chat.get("bot_msgs", [])[-80:]
        chat["flood"] = {}


def get_chat(state, chat_id):
    key = str(chat_id)
    if key not in state["chats"]:
        state["chats"][key] = new_chat()
    ch = state["chats"][key]
    # ضمان الحقول الجديدة عند الترقية
    for k, v in DEFAULT_SETTINGS.items():
        ch["settings"].setdefault(k, json.loads(json.dumps(v)))
    for k, v in new_chat().items():
        ch.setdefault(k, v)
    return ch


def get_user(chat, user):
    uid = str(user.get("id"))
    if uid not in chat["users"]:
        chat["users"][uid] = new_user(user.get("first_name", ""), user.get("username", ""))
    u = chat["users"][uid]
    if user.get("first_name"):
        u["n"] = (user.get("first_name", "") + " " + user.get("last_name", "")).strip()[:40]
    if user.get("username"):
        u["u"] = user["username"][:32]
    return u
