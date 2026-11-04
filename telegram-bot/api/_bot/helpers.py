# -*- coding: utf-8 -*-
"""أدوات مساعدة: تطبيع النص العربي، الصلاحيات، التنسيق."""
import html
import re
import time

AR_DIAC = re.compile(r"[\u064B-\u065F\u0670\u0640]")
URL_RE = re.compile(r"(https?://\S+|www\.\S+|t\.me/\S+|[\w-]+\.(com|net|org|io|me|ly|tv|info|xyz|site|online|app|dev|link|live|shop|store|co|dz|sa|eg|ae|ma)\b)", re.I)
MENTION_RE = re.compile(r"@\w{4,}")


def norm(text):
    """تطبيع الأمر العربي: إزالة التشكيل والتطويل وتوحيد الألف والهمزات."""
    if not text:
        return ""
    t = text.strip().lower()
    t = AR_DIAC.sub("", t)
    t = t.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ٱ", "ا")
    t = t.replace("ى", "ي").replace("ئ", "ي").replace("ؤ", "و").replace("ة", "ه")
    t = re.sub(r"\s+", " ", t)
    return t


def esc(s):
    return html.escape(str(s or ""), quote=False)


def mention(user, name=None):
    n = esc(name or user.get("first_name") or "مستخدم")
    return f'<a href="tg://user?id={user.get("id")}">{n}</a>'


def uname(user):
    if user.get("username"):
        return "@" + user["username"]
    return (user.get("first_name", "") + " " + user.get("last_name", "")).strip() or str(user.get("id"))


def fullname(user):
    return (user.get("first_name", "") + " " + user.get("last_name", "")).strip() or "مستخدم"


def parse_duration(s):
    """30m / 2h / 3d / 45 -> ثواني. الافتراضي بالدقائق."""
    if not s:
        return 3600
    s = str(s).strip().lower()
    m = re.match(r"^(\d+)\s*(s|ث|m|د|h|س|d|ي|w|اسبوع)?$", s)
    if not m:
        return 3600
    n = int(m.group(1))
    unit = m.group(2) or "m"
    mult = {"s": 1, "ث": 1, "m": 60, "د": 60, "h": 3600, "س": 3600,
            "d": 86400, "ي": 86400, "w": 604800, "اسبوع": 604800}[unit]
    return max(30, min(n * mult, 366 * 86400))


def fmt_duration(sec):
    sec = int(sec)
    if sec < 60:
        return f"{sec} ثانية"
    if sec < 3600:
        return f"{sec // 60} دقيقة"
    if sec < 86400:
        return f"{sec // 3600} ساعة"
    return f"{sec // 86400} يوم"


def fmt_time(ts):
    if not ts:
        return "—"
    return time.strftime("%Y-%m-%d %H:%M", time.gmtime(ts)) + " UTC"


def bar(n, total, width=10):
    if total <= 0:
        return "░" * width
    filled = min(width, int(n / total * width))
    return "█" * filled + "░" * (width - filled)


RANKS = [
    (0, "🌱 عضو جديد"), (50, "🌿 عضو نشيط"), (150, "⭐ عضو مميز"),
    (400, "🔥 نجم المجموعة"), (800, "💎 شخصية لامعة"), (1500, "👑 ملك الدردشة"),
    (2500, "🐉 أسطورة حية"), (4000, "⚡ إمبراطور المجموعة"), (6000, "🌌 كائن أسطوري"),
]


def rank_of(xp):
    r = RANKS[0][1]
    for need, name in RANKS:
        if xp >= need:
            r = name
    return r


def next_rank(xp):
    for need, name in RANKS:
        if xp < need:
            return need, name
    return None, None


def keyboard(rows):
    return {"inline_keyboard": rows}


def btn(text, data=None, url=None):
    b = {"text": text}
    if data:
        b["callback_data"] = data
    if url:
        b["url"] = url
    return b


def is_error(res):
    return isinstance(res, dict) and "_error" in res


def err_text(res):
    e = str(res.get("_error", "")) if isinstance(res, dict) else ""
    if "not enough rights" in e or "CHAT_ADMIN_REQUIRED" in e:
        return "⚠️ أحتاج صلاحيات مشرف كاملة (حذف، حظر، تقييد، تثبيت) لأقوم بذلك."
    if "user is an administrator" in e or "can't remove chat owner" in e:
        return "🛡 لا أستطيع معاقبة مشرف أو مالك المجموعة."
    if "message to delete not found" in e or "message can't be deleted" in e:
        return "⚠️ لا أستطيع حذف هذه الرسالة (قديمة جداً أو ليست لدي صلاحية)."
    return f"⚠️ تعذر التنفيذ: {esc(e[:150])}"


def resolve_target(ctx):
    """تحديد الضحية: بالرد أو @username أو id أو معرف مخزن."""
    if ctx.reply_msg and ctx.reply_msg.get("from"):
        f = ctx.reply_msg["from"]
        if not f.get("is_bot"):
            return f, None
        return f, None
    if ctx.args:
        a = ctx.args[0]
        if a.startswith("@"):
            un = a[1:].lower()
            for uid, u in ctx.chat_data.get("users", {}).items():
                if u.get("u", "").lower() == un:
                    return {"id": int(uid), "first_name": u.get("n", un), "username": u.get("u", "")}, None
            return None, f"🔍 لا أعرف {esc(a)} — لم يتكلم في المجموعة بعد. استخدم الرد على رسالته."
        if re.match(r"^-?\d+$", a):
            uid = a
            u = ctx.chat_data.get("users", {}).get(uid)
            if u:
                return {"id": int(uid), "first_name": u.get("n", ""), "username": u.get("u", "")}, None
            return {"id": int(uid), "first_name": uid}, None
    return None, "↩️ استخدم الأمر بالرد على رسالة العضو، أو اكتب معرفه @username."


def admin_ids(ctx):
    """قائمة معرفات المشرفين مع كاش 5 دقائق."""
    now = time.time()
    cache = ctx.chat_data.get("admins", {"ids": [], "ts": 0})
    if now - cache.get("ts", 0) > 300 or not cache.get("ids"):
        res = ctx.tg.get_admins(ctx.chat_id)
        if isinstance(res, list):
            ids = [a["user"]["id"] for a in res]
            cache = {"ids": ids, "ts": now,
                     "creator": next((a["user"]["id"] for a in res if a.get("status") == "creator"), None),
                     "names": [{"id": a["user"]["id"], "n": fullname(a["user"]),
                                "u": a["user"].get("username", ""), "s": a.get("status"),
                                "title": a.get("custom_title", "")} for a in res]}
            ctx.chat_data["admins"] = cache
            ctx.dirty = True
    return cache.get("ids", [])


def is_group_admin(ctx, user_id=None):
    uid = user_id or ctx.user_id
    if uid == 1087968824:  # مشرف مجهول
        return True
    return uid in admin_ids(ctx)


def is_creator(ctx, user_id=None):
    admin_ids(ctx)
    return (user_id or ctx.user_id) == ctx.chat_data.get("admins", {}).get("creator")


def can_punish(ctx, target_id):
    """لا عقوبات على المالك/المشرفين/المطور."""
    if target_id == ctx.user_id and not ctx.is_owner:
        pass
    if target_id in admin_ids(ctx):
        return False, "🛡 لا أستطيع معاقبة مشرف في المجموعة!"
    if target_id in ctx.state.get("sudo", []) or target_id == ctx.state.get("owner"):
        return False, "👑 هذا مطور البوت — لا يُعاقب!"
    me = ctx.tg.get_me()
    if isinstance(me, dict) and target_id == me.get("id"):
        return False, "🤖 لن أعاقب نفسي!"
    return True, ""


def pct(seed_parts):
    """نسبة ثابتة لليوم الواحد حسب البذرة."""
    import hashlib
    day = time.strftime("%Y-%m-%d")
    h = hashlib.md5(("|".join(str(p) for p in seed_parts) + "|" + day).encode()).hexdigest()
    return int(h[:8], 16) % 101


def take(ctx, *prefixes):
    """مطابقة بداية الأمر (كلمات مطبّعة). يعيد بقية النص الخام ويحدّث ctx.args."""
    nw = ctx.nwords
    for p in prefixes:
        pw = norm(p).split()
        if pw and nw[:len(pw)] == pw:
            ctx.args = ctx.words[len(pw):]
            ctx.rest = " ".join(ctx.args)
            return ctx.rest
    return None


def need_admin(ctx):
    """حارس أوامر الإدارة — يرد فقط للمشرفين والمالك والمطور."""
    if ctx.is_owner or ctx.is_sudo or not ctx.is_group or is_group_admin(ctx):
        return True
    ctx.reply("🔒 هذا الأمر للمشرفين والمالك فقط!")
    return False


def need_group(ctx):
    if ctx.is_group:
        return True
    ctx.reply("👥 هذا الأمر يعمل داخل المجموعات فقط.")
    return False


def need_owner(ctx):
    if ctx.is_owner or ctx.is_sudo:
        return True
    ctx.reply("👑 هذا الأمر للمطور فقط!")
    return False
