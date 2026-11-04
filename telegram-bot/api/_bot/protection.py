# -*- coding: utf-8 -*-
"""الحماية: الأقفال، مكافحة السبام، الكابتشا، الترحيب، الاشتراك الإجباري."""
import random
import re
import time

from . import data
from .helpers import (URL_RE, MENTION_RE, norm, esc, mention, fullname, keyboard, btn,
                      is_error, admin_ids, is_group_admin)
from .store import get_user

# اسم القفل -> مرادفات الأمر
LOCKS = {
    "links": ["الروابط", "الرابط", "لينكات"],
    "usernames": ["المعرفات", "المعرف", "يوزرات"],
    "mentions": ["التاك", "المنشن", "التاق"],
    "forwards": ["التوجيه", "الفورورد", "اعاده التوجيه"],
    "photos": ["الصور", "الصوره"],
    "videos": ["الفيديو", "الفيديوهات", "مقاطع"],
    "gifs": ["المتحركات", "المتحركه", "جيف"],
    "stickers": ["الملصقات", "الستكرات", "ستيكر"],
    "voice": ["الصوت", "الصوتيات", "البصمات", "الاغاني"],
    "documents": ["الملفات", "المستندات"],
    "polls": ["الاستطلاعات", "التصويت"],
    "locations": ["المواقع", "الخرائط"],
    "contacts": ["جهات", "جهات الاتصال", "الارقام"],
    "bots": ["البوتات", "بوتات"],
    "long": ["الكلايش", "الرسائل الطويله"],
    "badwords": ["السب", "الشتم", "الشتيمه", "الكلمات"],
    "channels": ["القنوات", "قنوات"],
    "foreign": ["الاجنبيه", "الانجليزيه", "اللاتينيه"],
    "edits": ["التعديل", "تعديل"],
    "inline": ["الانلاين", "البوتات الانلاين"],
    "all": ["الكل", "المجموعه", "الدردشه", "الشات"],
}
LOCK_NAMES_AR = {
    "links": "الروابط", "usernames": "المعرفات", "mentions": "التاك", "forwards": "التوجيه",
    "photos": "الصور", "videos": "الفيديو", "gifs": "المتحركات", "stickers": "الملصقات",
    "voice": "الصوتيات", "documents": "الملفات", "polls": "الاستطلاعات", "locations": "المواقع",
    "contacts": "جهات الاتصال", "bots": "البوتات", "long": "الكلايش", "badwords": "السب",
    "channels": "القنوات", "foreign": "الأجنبية", "edits": "التعديل", "inline": "الإنلاين",
    "all": "الدردشة كاملة",
}


def lock_key(word):
    w = norm(word)
    for key, aliases in LOCKS.items():
        if w in [norm(a) for a in aliases] or w == key:
            return key
    return None


def msg_lock_type(msg):
    """نوع الرسالة لفحص الأقفال."""
    if msg.get("photo"):
        return "photos"
    if msg.get("video") or msg.get("video_note"):
        return "videos"
    if msg.get("animation"):
        return "gifs"
    if msg.get("sticker"):
        return "stickers"
    if msg.get("voice") or msg.get("audio"):
        return "voice"
    if msg.get("document"):
        return "documents"
    if msg.get("poll"):
        return "polls"
    if msg.get("location") or msg.get("venue"):
        return "locations"
    if msg.get("contact"):
        return "contacts"
    if msg.get("via_bot"):
        return "inline"
    return None


def text_of(msg):
    return msg.get("text") or msg.get("caption") or ""


def check_message(ctx):
    """يفحص رسالة عضو عادي. يعيد True إذا حُذفت/عوقب (توقف المعالجة)."""
    msg, st = ctx.msg, ctx.settings
    tg, cid, uid = ctx.tg, ctx.chat_id, ctx.user_id
    locks = st.get("locks", {})
    now = time.time()

    # الحظر العام
    if str(uid) in ctx.state.get("gbans", {}):
        tg.delete(cid, msg["message_id"])
        tg.ban(cid, uid)
        return True

    # مشرف مجهول / قناة
    if msg.get("sender_chat") and locks.get("channels"):
        tg.delete(cid, msg["message_id"])
        return True

    # التوجيه
    fwd = msg.get("forward_origin") or msg.get("forward_from") or msg.get("forward_from_chat") or msg.get("forward_date")
    if fwd and locks.get("forwards"):
        return _punish_content(ctx, "التوجيه مقفل هنا 🔒")
    if fwd and locks.get("channels"):
        fo = msg.get("forward_origin", {})
        if (isinstance(fo, dict) and fo.get("type") == "channel") or msg.get("forward_from_chat", {}).get("type") == "channel":
            return _punish_content(ctx, "التوجيه من القنوات مقفل 🔒")

    # نوع الوسائط
    lt = msg_lock_type(msg)
    if lt and locks.get(lt):
        return _punish_content(ctx, f"{LOCK_NAMES_AR.get(lt, lt)} مقفلة هنا 🔒")
    if lt and locks.get("all"):
        return _punish_content(ctx, "الدردشة مقفلة — مشرفين فقط 🔒")

    text = text_of(msg)
    ntext = norm(text)

    # نص كامل مقفل
    if locks.get("all") and text and not lt:
        return _punish_content(ctx, "الدردشة مقفلة — مشرفين فقط 🔒")

    # الروابط
    if locks.get("links") and text and URL_RE.search(text):
        return _punish_content(ctx, "الروابط ممنوعة هنا 🚫", warn=True)
    # المعرفات
    if locks.get("usernames") and text and MENTION_RE.search(text):
        return _punish_content(ctx, "المعرفات ممنوعة هنا 🚫", warn=True)
    # التاك
    if locks.get("mentions") and text:
        ents = msg.get("entities", []) + msg.get("caption_entities", [])
        if any(e.get("type") in ("mention", "text_mention") for e in ents):
            return _punish_content(ctx, "التاك مقفل هنا 🔕")
    # الكلايش
    if locks.get("long") and len(text) > 700:
        return _punish_content(ctx, "الرسائل الطويلة ممنوعة (700+ حرف) 📏")
    # الأجنبية
    if locks.get("foreign") and text:
        letters = re.findall(r"[a-zA-Z]", text)
        ar_letters = re.findall(r"[\u0600-\u06FF]", text)
        if len(letters) > 12 and len(letters) > len(ar_letters) * 2:
            return _punish_content(ctx, "الرسائل الأجنبية مقفلة — تكلم بالعربية 🌙")
    # السب
    if (locks.get("badwords") or st.get("badwords_on")) and text:
        words = data.INSULT_WORDS + st.get("badwords", [])
        if any(norm(w) in ntext for w in words if w):
            return _punish_content(ctx, "ممنوع السب والشتم! احترم الجميع 🚫", warn=True)

    # مكافحة التكرار (السبام)
    if st.get("flood_on", True):
        fl = ctx.chat_data.setdefault("flood", {})
        times = [t for t in fl.get(str(uid), []) if now - t < st.get("flood_s", 8)]
        times.append(now)
        fl[str(uid)] = times[-15:]
        ctx.dirty = True
        if len(times) >= st.get("flood_n", 7):
            fl[str(uid)] = []
            tg.delete(cid, msg["message_id"])
            until = int(now + 300)
            tg.restrict(cid, uid, {"can_send_messages": False}, until=until)
            ctx.notify(f"🌊 {mention(ctx.user)} توقف عن السبام! كتم 5 دقائق تلقائياً.")
            return True
    return False


def _punish_content(ctx, reason, warn=False):
    tg, cid = ctx.tg, ctx.chat_id
    tg.delete(cid, ctx.msg["message_id"])
    # تنبيه واحد نظيف: نحذف التنبيه السابق قبل إرسال جديد
    old = ctx.chat_data.get("last_notice")
    if old:
        tg.delete(cid, old)
    res = tg.send(cid, f"🛡 {mention(ctx.user)}: {reason}")
    if isinstance(res, dict) and res.get("message_id"):
        ctx.chat_data["last_notice"] = res["message_id"]
    ctx.dirty = True
    if warn:
        add_warn(ctx, ctx.user_id, ctx.user, reason, silent=True)
    return True


def add_warn(ctx, target_id, target_user, reason="بدون سبب", silent=False):
    u = get_user(ctx.chat_data, {"id": target_id, "first_name": target_user.get("first_name", "")})
    u["w"] = u.get("w", 0) + 1
    ctx.dirty = True
    limit = ctx.settings.get("warn_limit", 3)
    name = mention(target_user)
    if u["w"] >= limit:
        action = ctx.settings.get("warn_action", "mute")
        u["w"] = 0
        if action == "ban":
            ctx.tg.ban(ctx.chat_id, target_id)
            act = "🔨 حظر نهائي"
        elif action == "kick":
            ctx.tg.ban(ctx.chat_id, target_id)
            ctx.tg.unban(ctx.chat_id, target_id)
            act = "👢 طرد"
        else:
            ctx.tg.restrict(ctx.chat_id, target_id, {"can_send_messages": False},
                            until=int(time.time() + 3600))
            act = "🔇 كتم ساعة"
        ctx.notify(f"⛔ {name} وصل حد التحذيرات ({limit}) → {act}\nالسبب الأخير: {esc(reason)}")
        return u["w"], act
    if not silent:
        ctx.notify(f"⚠️ تحذير لـ {name} ({u['w']}/{limit})\nالسبب: {esc(reason)}")
    return u["w"], None


# ---------- الانضمام والمغادرة ----------
def handle_join(ctx):
    msg = ctx.msg
    tg, cid = ctx.tg, ctx.chat_id
    members = msg.get("new_chat_members", [])
    inviter = msg.get("from", {})
    me = tg.get_me()
    for m in members:
        if m.get("is_bot"):
            # طرد البوتات إلا إذا أضافها مشرف
            if ctx.settings.get("locks", {}).get("bots") and not is_group_admin(ctx, inviter.get("id")):
                tg.ban(cid, m["id"])
                ctx.notify(f"🤖 طردت البوت {esc(m.get('first_name',''))} — إضافة البوتات مقفلة.")
            if me and m["id"] == me.get("id"):
                tg.send(cid, "⚡ <b>وصل الأسطورة!</b>\n\nارفعني مشرفاً بكل الصلاحيات ثم اكتب <b>تفعيل</b> لأبدأ الحماية.\nاكتب <b>الاوامر</b> لاستكشاف قوايا 🚀")
            continue
        # جهاتي: عدّ الأعضاء المضافين
        if inviter and not inviter.get("is_bot") and inviter.get("id") != m["id"]:
            iu = get_user(ctx.chat_data, inviter)
            iu["a"] = iu.get("a", 0) + 1
            ctx.dirty = True
        # كابتشا
        if ctx.settings.get("captcha"):
            start_captcha(ctx, m)
            continue
        send_welcome(ctx, m)
    if ctx.settings.get("del_service", True):
        tg.delete(cid, msg["message_id"])


def send_welcome(ctx, m):
    if not ctx.settings.get("welcome_on", True):
        return
    tpl = ctx.settings.get("welcome") or (
        "🌟 أهلاً وسهلاً {name}!\nنورت <b>{group}</b> ✨\n\n"
        "📜 اقرأ القوانين: اكتب (القوانين)\n🎮 جرّب الألعاب: اكتب (العاب)\n🎵 الأغاني: اكتب (يوت اسم الأغنية)")
    chat = ctx.tg.get_chat(ctx.chat_id)
    gname = chat.get("title", "المجموعة") if isinstance(chat, dict) else "المجموعة"
    text = (tpl.replace("{name}", mention(m)).replace("{group}", esc(gname))
            .replace("{rules}", esc(ctx.settings.get("rules", "لا توجد قوانين بعد"))))
    rows = []
    if ctx.settings.get("rules"):
        rows.append([btn("📜 القوانين", data="help:rules")])
    res = ctx.tg.send(ctx.chat_id, text, markup=keyboard(rows) if rows else None)
    if isinstance(res, dict) and res.get("message_id"):
        ctx.chat_data.setdefault("bot_msgs", []).append(res["message_id"])


def start_captcha(ctx, m):
    tg, cid = ctx.tg, ctx.chat_id
    tg.restrict(cid, m["id"], {"can_send_messages": False})
    a, b = random.randint(2, 9), random.randint(2, 9)
    answer = a + b
    opts = sorted(random.sample([answer, answer + random.randint(1, 4), answer - random.randint(1, 3),
                                 answer + random.randint(5, 9)], 4))
    rows = [[btn(str(o), data=f"cap:{m['id']}:{o}:{answer}") for o in opts]]
    res = tg.send(cid, f"🔐 تحقق من دخولك يا {mention(m)}!\n"
                       f"كم ناتج <b>{a} + {b}</b>؟ اضغط الإجابة الصحيحة خلال 5 دقائق وإلا سيتم طردك.",
                  markup=keyboard(rows))
    if isinstance(res, dict) and res.get("message_id"):
        ctx.chat_data.setdefault("captcha_pending", {})[str(m["id"])] = {
            "ts": time.time(), "msg": res["message_id"], "name": fullname(m)}
        ctx.dirty = True


def sweep_captcha(ctx):
    """طرد من تجاوز مهلة الكابتشا (يُستدعى مع كل تحديث)."""
    pend = ctx.chat_data.get("captcha_pending", {})
    now = time.time()
    for uid in list(pend.keys()):
        info = pend[uid]
        if now - info.get("ts", 0) > 300:
            ctx.tg.ban(ctx.chat_id, int(uid))
            ctx.tg.unban(ctx.chat_id, int(uid))
            ctx.tg.delete(ctx.chat_id, info.get("msg"))
            pend.pop(uid, None)
            ctx.dirty = True


def handle_captcha_callback(ctx, parts):
    # cap:uid:chosen:answer
    try:
        uid, chosen, answer = int(parts[1]), int(parts[2]), int(parts[3])
    except (ValueError, IndexError):
        return
    cq = ctx.update["callback_query"]
    if cq["from"]["id"] != uid:
        ctx.tg.answer_callback(cq["id"], "❌ هذا التحقق ليس لك!", alert=True)
        return
    pend = ctx.chat_data.get("captcha_pending", {})
    if chosen != answer:
        ctx.tg.answer_callback(cq["id"], "❌ إجابة خاطئة! حاول مجدداً.", alert=True)
        return
    perms = {"can_send_messages": True, "can_send_audios": True, "can_send_documents": True,
             "can_send_photos": True, "can_send_videos": True, "can_send_video_notes": True,
             "can_send_voice_notes": True, "can_send_polls": True, "can_send_other_messages": True,
             "can_add_web_page_previews": True, "can_invite_users": True}
    ctx.tg.restrict(ctx.chat_id, uid, perms)
    info = pend.pop(str(uid), {})
    ctx.dirty = True
    ctx.tg.delete(ctx.chat_id, info.get("msg") or cq["message"]["message_id"])
    ctx.tg.answer_callback(cq["id"], "✅ تم التحقق! أهلاً بك.", alert=False)
    send_welcome(ctx, cq["from"])


def handle_leave(ctx):
    m = ctx.msg.get("left_chat_member", {})
    ctx.chat_data.get("captcha_pending", {}).pop(str(m.get("id")), None)
    if ctx.settings.get("goodbye_on"):
        tpl = ctx.settings.get("goodbye") or "👋 وداعاً {name}… سنفتقدك! 💙"
        ctx.tg.send(ctx.chat_id, tpl.replace("{name}", esc(fullname(m))))
    if ctx.settings.get("del_service", True):
        ctx.tg.delete(ctx.chat_id, ctx.msg["message_id"])


def check_force_sub(ctx):
    """الاشتراك الإجباري في قناة. يعيد True إذا مُنعت الرسالة."""
    st = ctx.settings
    if not st.get("force_sub_on") or not st.get("force_sub"):
        return False
    if is_group_admin(ctx):
        return False
    ch = st["force_sub"].strip().lstrip("@")
    u = ctx.chat_data["users"].get(str(ctx.user_id), {})
    now = time.time()
    if u.get("fs_ok") and now - u["fs_ok"] < 600:
        return False
    res = ctx.tg.get_member("@" + ch, ctx.user_id)
    if isinstance(res, dict) and res.get("status") in ("member", "administrator", "creator", "restricted"):
        u["fs_ok"] = now
        ctx.dirty = True
        return False
    ctx.tg.delete(ctx.chat_id, ctx.msg["message_id"])
    old = ctx.chat_data.get("fs_notice")
    if old:
        ctx.tg.delete(ctx.chat_id, old)
    res = ctx.tg.send(ctx.chat_id,
                      f"📢 {mention(ctx.user)}: يجب الاشتراك في القناة أولاً لتتكلم هنا!",
                      markup=keyboard([[btn("📢 اشترك الآن", url=f"https://t.me/{ch}")],
                                       [btn("✅ تحققت، اشتركت", data="fs:check")]]))
    if isinstance(res, dict) and res.get("message_id"):
        ctx.chat_data["fs_notice"] = res["message_id"]
        ctx.dirty = True
    return True
