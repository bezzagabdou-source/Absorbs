# -*- coding: utf-8 -*-
"""محرك الردود الخارق: نص/وسائط، ردود عشوائية متعددة، متغيرات، تفعيل/تعطيل، إحصائيات.
الأوامر: اضف رد، احذف رد، عدل رد، الردود، مسح الردود، تفعيل رد، تعطيل رد، بحث رد، ردود عشوائية.
"""
import random
import re
import time

from .helpers import esc, mention, fullname, uname, norm, take, need_group, need_admin, keyboard, btn, is_error

MAX_REPLIES = 300


def _store(ctx):
    return ctx.settings.setdefault("replies2", {})


def _norm_entry(v):
    """توحيد صيغة الرد (دعم الصيغة القديمة نصاً)."""
    if isinstance(v, str):
        return {"t": [v], "media": None, "on": True, "hits": 0, "mode": "auto"}
    if isinstance(v, dict):
        v.setdefault("t", [])
        v.setdefault("media", None)
        v.setdefault("on", True)
        v.setdefault("hits", 0)
        v.setdefault("mode", "auto")
        return v
    return {"t": [], "media": None, "on": True, "hits": 0, "mode": "auto"}


def _media_of(msg):
    """استخراج وسائط الرسالة لحفظها كرد."""
    if not msg:
        return None
    if msg.get("photo"):
        return {"type": "photo", "id": msg["photo"][-1]["file_id"], "cap": msg.get("caption", "")}
    if msg.get("sticker"):
        return {"type": "sticker", "id": msg["sticker"]["file_id"]}
    if msg.get("animation"):
        return {"type": "animation", "id": msg["animation"]["file_id"], "cap": msg.get("caption", "")}
    if msg.get("video"):
        return {"type": "video", "id": msg["video"]["file_id"], "cap": msg.get("caption", "")}
    if msg.get("voice"):
        return {"type": "voice", "id": msg["voice"]["file_id"]}
    if msg.get("audio"):
        return {"type": "audio", "id": msg["audio"]["file_id"], "cap": msg.get("caption", "")}
    if msg.get("document"):
        return {"type": "document", "id": msg["document"]["file_id"], "cap": msg.get("caption", "")}
    if msg.get("video_note"):
        return {"type": "video_note", "id": msg["video_note"]["file_id"]}
    return None


def fill_vars(text, ctx):
    u = ctx.user
    now = time.time()
    repl = {
        "{name}": mention(u),
        "{fullname}": esc(fullname(u)),
        "{username}": ("@" + u["username"]) if u.get("username") else fullname(u),
        "{id}": str(u.get("id", "")),
        "{group}": esc(ctx.chat.get("title", "المجموعة")),
        "{date}": time.strftime("%Y-%m-%d", time.gmtime(now)),
        "{time}": time.strftime("%H:%M", time.gmtime(now)),
        "{mention}": mention(u),
    }
    for k, v in repl.items():
        text = text.replace(k, v)
    # {random:خيار1|خيار2|خيار3}
    def _rand(m):
        opts = [o.strip() for o in m.group(1).split("|") if o.strip()]
        return random.choice(opts) if opts else ""
    text = re.sub(r"\{random:([^}]+)\}", _rand, text)
    return text


def handle(ctx):
    if not ctx.words:
        return False
    tg, cid = ctx.tg, ctx.chat_id

    # ---- إضافة رد ----
    rest = take(ctx, "اضف رد", "أضف رد", "اضافة رد", "إضافة رد", "addreply")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        reps = _store(ctx)
        # رد بالوسائط: الرد على وسائط + "اضف رد الكلمة"
        media = _media_of(ctx.reply_msg)
        if media and "|" not in rest and rest.strip():
            trig = norm(rest.strip())
            if len(reps) >= MAX_REPLIES and trig not in reps:
                ctx.reply(f"⚠️ وصلت الحد الأقصى ({MAX_REPLIES} رد). احذف بعضها أولاً.")
                return True
            entry = _norm_entry(reps.get(trig))
            entry["media"] = media
            reps[trig] = entry
            ctx.dirty = ctx.force_save = True
            ctx.reply(f"✅ أضفت رداً بالوسائط ({media['type']}) للكلمة: <b>{esc(rest.strip())}</b> 🎬")
            return True
        if "|" in rest:
            trig, resp = rest.split("|", 1)
            trig, resp = trig.strip(), resp.strip()
            if trig and resp:
                key = norm(trig)
                if len(reps) >= MAX_REPLIES and key not in reps:
                    ctx.reply(f"⚠️ وصلت الحد الأقصى ({MAX_REPLIES} رد).")
                    return True
                responses = [r.strip() for r in resp.split("||") if r.strip()]
                entry = _norm_entry(reps.get(key))
                entry["t"] = responses[:10]
                reps[key] = entry
                ctx.dirty = ctx.force_save = True
                multi = f" ({len(responses)} ردود عشوائية 🎲)" if len(responses) > 1 else ""
                ctx.reply(f"✅ رد جديد{multi}: <b>{esc(trig)}</b>\n👁 معاينة: {esc(responses[0][:100])}\n\n"
                          f"💡 متغيرات: {{name}} {{username}} {{id}} {{group}} {{date}} {{time}}")
                return True
        ctx.reply("💬 <b>طرق إضافة رد:</b>\n\n"
                  "1️⃣ نصي: <code>اضف رد هلا | هلا بيك {name} 🌹</code>\n"
                  "2️⃣ عشوائي: <code>اضف رد صباح | صباح النور ☀️ || صباح الورد 🌹 || يا هلا 🌟</code>\n"
                  "3️⃣ وسائط: رد على صورة/ملصق/صوت واكتب <code>اضف رد الكلمة</code>\n\n"
                  "🧩 المتغيرات: {name} {username} {id} {group} {date} {time} {random:أ|ب|ج}")
        return True

    # ---- حذف رد ----
    rest = take(ctx, "احذف رد", "حذف رد", "delreply", "امسح رد")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        reps = _store(ctx)
        key = norm(rest.strip())
        if key in reps:
            reps.pop(key)
            ctx.dirty = ctx.force_save = True
            ctx.reply(f"🗑 حُذف الرد: <b>{esc(rest.strip())}</b>")
        else:
            ctx.reply(f"🔍 لا يوجد رد بالكلمة <b>{esc(rest.strip())}</b>. اكتب (الردود) للعرض.")
        return True

    # ---- تعديل رد ----
    rest = take(ctx, "عدل رد", "تعديل رد", "editreply")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        reps = _store(ctx)
        if "|" in rest:
            trig, resp = rest.split("|", 1)
            key = norm(trig.strip())
            if key in reps:
                entry = _norm_entry(reps[key])
                entry["t"] = [r.strip() for r in resp.split("||") if r.strip()][:10]
                reps[key] = entry
                ctx.dirty = ctx.force_save = True
                ctx.reply(f"✏️ عُدّل الرد: <b>{esc(trig.strip())}</b>")
            else:
                ctx.reply("🔍 الرد غير موجود. أضفه أولاً بـ (اضف رد).")
        else:
            ctx.reply("✏️ الاستخدام: عدل رد الكلمة | الرد الجديد")
        return True

    # ---- مسح كل الردود ----
    rest = take(ctx, "مسح الردود", "حذف الردود", "clearreplies")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        n = len(_store(ctx))
        ctx.settings["replies2"] = {}
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"🗑 مُسحت كل الردود ({n} رد).")
        return True

    # ---- تفعيل/تعطيل رد ----
    for pref, on in [("تفعيل رد", True), ("تعطيل رد", False)]:
        rest = take(ctx, pref)
        if rest is not None:
            if not need_group(ctx) or not need_admin(ctx):
                return True
            reps = _store(ctx)
            key = norm(rest.strip())
            if key in reps:
                _norm_entry(reps[key])["on"] = on
                ctx.dirty = ctx.force_save = True
                ctx.reply(f"{'✅ فُعّل' if on else '⛔ عُطّل'} الرد: <b>{esc(rest.strip())}</b>")
            else:
                ctx.reply("🔍 الرد غير موجود.")
            return True

    # ---- بحث رد ----
    rest = take(ctx, "بحث رد", "ابحث رد")
    if rest is not None:
        if not need_group(ctx):
            return True
        reps = _store(ctx)
        q = norm(rest.strip())
        found = [k for k in reps if q in k]
        if found:
            ctx.reply("🔎 ردود مطابقة:\n" + "\n".join(f"• <b>{esc(k)}</b>" for k in found[:30]))
        else:
            ctx.reply("🔍 لا توجد ردود مطابقة.")
        return True

    # ---- قائمة الردود ----
    rest = take(ctx, "الردود", "قائمه الردود", "قائمة الردود", "replies")
    if rest is not None:
        if not need_group(ctx):
            return True
        reps = _store(ctx)
        legacy = ctx.settings.get("replies", {})
        if not reps and not legacy:
            ctx.reply("💬 لا توجد ردود مخصصة بعد.\nأضف: <code>اضف رد هلا | هلا بيك {name} 🌹</code>\n\nاكتب (اضف رد) لكل الطرق.")
            return True
        lines = [f"💬 <b>الردود المخصصة ({len(reps) + len(legacy)}):</b>\n"]
        for k, v in list(reps.items())[:60]:
            e = _norm_entry(v)
            icon = "🎬" if e["media"] else "💬"
            status = "" if e["on"] else " ⛔"
            multi = f" 🎲{len(e['t'])}" if len(e["t"]) > 1 else ""
            preview = esc(e["t"][0][:40]) if e["t"] else f"[{e['media']['type']}]"
            lines.append(f"{icon} <b>{esc(k)}</b>{status}{multi} ← {preview} (×{e['hits']})")
        for k, v in list(legacy.items())[:20]:
            lines.append(f"💬 <b>{esc(k)}</b> ← {esc(str(v)[:40])}")
        ctx.reply("\n".join(lines)[:4000])
        return True

    # ---- مساعدة الردود ----
    rest = take(ctx, "مساعده الردود", "اوامر الردود", "الردود مساعدة")
    if rest is not None:
        ctx.reply(REPLIES_HELP)
        return True

    return False


REPLIES_HELP = """💬 <b>نظام الردود الخارق:</b>

➕ <b>اضف رد كلمة | الرد</b> — رد نصي
🎲 <b>اضف رد كلمة | رد1 || رد2 || رد3</b> — رد عشوائي
🎬 رد على صورة/ملصق/صوت + <b>اضف رد كلمة</b> — رد بالوسائط
🗑 <b>احذف رد كلمة</b> — حذف
✏️ <b>عدل رد كلمة | الجديد</b> — تعديل
📋 <b>الردود</b> — عرض الكل + الإحصائيات
🔎 <b>بحث رد كلمة</b> — بحث
✅ <b>تفعيل رد كلمة</b> / ⛔ <b>تعطيل رد كلمة</b>
🧹 <b>مسح الردود</b> — حذف الكل

🧩 <b>المتغيرات:</b>
{name} = منشن العضو · {username} = معرفه · {id} = آيديه
{group} = اسم المجموعة · {date} · {time}
{random:أ|ب|ج} = اختيار عشوائي

💡 مثال: <code>اضف رد هلا | هلا {name}! نورت {group} يوم {date} 🌹</code>"""


def auto_reply(ctx):
    """محاولة الرد التلقائي. يعيد True إذا ردّ."""
    if not ctx.settings.get("replies_on", True):
        return False
    n = norm(ctx.text)
    if not n:
        return False
    reps = ctx.settings.get("replies2", {})
    # الردود الغنية أولاً
    for trig, v in reps.items():
        e = _norm_entry(v)
        if not e["on"]:
            continue
        matched = (n == trig or n.startswith(trig + " ") or (" " + trig + " ") in (" " + n + " "))
        if matched:
            e["hits"] = e.get("hits", 0) + 1
            ctx.dirty = True
            _send_reply(ctx, e)
            return True
    # الردود القديمة (نصية)
    for trig, resp in ctx.settings.get("replies", {}).items():
        tn = norm(trig)
        if n == tn or n.startswith(tn + " ") or (" " + tn + " ") in (" " + n + " "):
            ctx.reply(fill_vars(str(resp), ctx))
            return True
    return False


def _send_reply(ctx, e):
    tg, cid = ctx.tg, ctx.chat_id
    media = e.get("media")
    text = fill_vars(random.choice(e["t"]), ctx) if e.get("t") else ""
    if media:
        mt, mid = media["type"], media["id"]
        cap = fill_vars(media.get("cap", "") or text, ctx)
        if mt == "photo":
            tg.send_photo(cid, mid, caption=cap or None, reply_to=ctx.msg.get("message_id"))
        elif mt == "sticker":
            tg.send_sticker(cid, mid, reply_to=ctx.msg.get("message_id"))
        elif mt == "voice":
            tg.send_voice(cid, mid, reply_to=ctx.msg.get("message_id"))
        elif mt == "audio":
            tg.send_audio(cid, mid, caption=cap or None, reply_to=ctx.msg.get("message_id"))
        else:
            tg.call("send" + mt.capitalize().replace("_note", "Note"),
                    {"chat_id": cid, mt: mid, "caption": cap[:1020], "parse_mode": "HTML",
                     "reply_to_message_id": ctx.msg.get("message_id")})
        if text and mt not in ("sticker", "voice", "video_note"):
            pass
    elif text:
        ctx.reply(text)
