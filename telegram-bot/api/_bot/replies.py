# -*- coding: utf-8 -*-
"""محرك الردود الخارق: نص/وسائط، ردود عشوائية متعددة، متغيرات، تفعيل/تعطيل، إحصائيات.
الأوامر: اضف رد، احذف رد، عدل رد، الردود، مسح الردود، تفعيل رد، تعطيل رد، بحث رد، ردود عشوائية.
"""
import random
import re
import time

from .helpers import (esc, mention, fullname, uname, norm, take, need_group, need_admin,
                      keyboard, btn, is_error, starts_command, is_group_admin)

MAX_REPLIES = 300
WIZ_TTL = 300  # مهلة المعالج: 5 دقائق


def _store(ctx):
    return ctx.settings.setdefault("replies2", {})


def _norm_entry(v):
    """توحيد صيغة الرد (دعم الصيغة القديمة نصاً + عناصر مختلطة items)."""
    if isinstance(v, str):
        return {"t": [v], "media": None, "items": None, "on": True, "hits": 0, "mode": "auto"}
    if isinstance(v, dict):
        v.setdefault("t", [])
        v.setdefault("media", None)
        v.setdefault("items", None)
        v.setdefault("on", True)
        v.setdefault("hits", 0)
        v.setdefault("mode", "auto")
        return v
    return {"t": [], "media": None, "items": None, "on": True, "hits": 0, "mode": "auto"}


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
        trig_word = rest.strip()
        # ⭐ أسهل طريقة: رد على أي رسالة (نص/صورة/ملصق/صوت) + "اضف رد الكلمة" → تُحفظ فوراً
        if ctx.reply_msg and trig_word and "|" not in rest:
            trig = norm(trig_word)
            if len(reps) >= MAX_REPLIES and trig not in reps:
                ctx.reply(f"⚠️ وصلت الحد الأقصى ({MAX_REPLIES} رد). احذف بعضها أولاً.")
                return True
            media = _media_of(ctx.reply_msg)
            rtext = (ctx.reply_msg.get("text") or ctx.reply_msg.get("caption") or "").strip()
            entry = _norm_entry(reps.get(trig))
            if media:
                entry["media"] = media
                entry["items"] = [{"t": "", "media": media}]
                label = "وسائط 🎬"
            elif rtext:
                entry["t"] = [rtext]
                entry["items"] = [{"t": rtext, "media": None}]
                label = "نص 💬"
            else:
                ctx.reply("⚠️ الرسالة اللي رديت عليها ما فيها نص ولا وسائط. جرّب رسالة ثانية.")
                return True
            entry["on"] = True
            reps[trig] = entry
            ctx.dirty = ctx.force_save = True
            ctx.reply(f"✅ <b>تسجّل الرد!</b> ({label})\n🔑 الكلمة: <b>{esc(trig_word)}</b>\n\n"
                      f"جرّب درك: اكتب <code>{esc(trig_word)}</code> 😎")
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
                entry["items"] = [{"t": r, "media": None} for r in responses[:10]]
                reps[key] = entry
                ctx.dirty = ctx.force_save = True
                multi = f" ({len(responses)} ردود عشوائية 🎲)" if len(responses) > 1 else ""
                ctx.reply(f"✅ رد جديد{multi}: <b>{esc(trig)}</b>\n👁 معاينة: {esc(responses[0][:100])}\n\n"
                          f"💡 متغيرات: {{name}} {{username}} {{id}} {{group}} {{date}} {{time}}")
                return True
        # "اضف رد" وحدها → بطاقة تعليمات سهلة جداً + زر المعالج الاختياري
        if not trig_word:
            ctx.reply("💬 <b>أسهل طريقة تضيف رد (خطوة وحدة!):</b>\n\n"
                      "1️⃣ <b>رد على أي رسالة</b> (نص / صورة / ملصق / صوت) واكتب:\n"
                      "<code>اضف رد الكلمة</code>\n\n"
                      "2️⃣ ولا اكتبها مباشرة:\n<code>اضف رد الكلمة | الرد</code>\n"
                      "مثال: <code>اضف رد سلام | وعليكم السلام 🌹</code>\n\n"
                      "🧙 تحب نعاونك خطوة بخطوة؟ اضغط الزر 👇",
                      markup=keyboard([[btn("🧙 معالج تفاعلي", data="wiz:new")]]))
            return True
        # "اضف رد الكلمة" بلا رد وبلا | → معالج بكلمة جاهزة
        start_wizard(ctx, trigger=trig_word)
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
        ctx.reply(_replies_list_text(ctx),
                  markup=keyboard([[btn("➕ إضافة رد (معالج 🧙)", data="wiz:new")]]))
        return True

    # ---- مساعدة الردود ----
    rest = take(ctx, "مساعده الردود", "اوامر الردود", "الردود مساعدة")
    if rest is not None:
        ctx.reply(REPLIES_HELP)
        return True

    return False


REPLIES_HELP = """💬 <b>نظام الردود الخارق:</b>

🧙 <b>اضف رد</b> — يفتح <b>المعالج التفاعلي</b> خطوة بخطوة (الأسهل!)
📷 يدعم: نص، صورة مع تعليق، ملصق، صوت، فيديو + ردود عشوائية متعددة
⚡ <b>اضف رد الكلمة</b> — معالج بكلمة جاهزة

➕ <b>اضف رد كلمة | الرد</b> — رد نصي سريع
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


def _send_item(ctx, text, media):
    """إرسال رد واحد: نص، أو وسائط (مع تعليق = نص معه)."""
    tg, cid = ctx.tg, ctx.chat_id
    rid = ctx.msg.get("message_id")
    text = fill_vars(text or "", ctx)
    if media:
        mt, mid = media["type"], media["id"]
        cap = fill_vars(media.get("cap", "") or "", ctx) or text
        cap = cap[:1020]
        if mt == "photo":
            tg.send_photo(cid, mid, caption=cap or None, reply_to=rid)
        elif mt == "sticker":
            tg.send_sticker(cid, mid, reply_to=rid)
        elif mt == "voice":
            tg.send_voice(cid, mid, reply_to=rid)
        elif mt == "audio":
            tg.send_audio(cid, mid, caption=cap or None, reply_to=rid)
        elif mt == "animation":
            tg.send_animation(cid, mid, caption=cap or None, reply_to=rid)
        elif mt == "video":
            tg.send_video(cid, mid, caption=cap or None, reply_to=rid)
        elif mt == "video_note":
            tg.send_video_note(cid, mid, reply_to=rid)
        elif mt == "document":
            tg.send_document(cid, mid, caption=cap or None, reply_to=rid)
        else:
            tg.call("send" + mt.capitalize(), {"chat_id": cid, mt: mid, "caption": cap,
                                               "parse_mode": "HTML", "reply_to_message_id": rid})
    elif text:
        ctx.reply(text)


def _send_reply(ctx, e):
    # الصيغة الجديدة: عناصر متعددة مختلطة (نص/صورة/وسائط) تُختار عشوائياً
    if e.get("items"):
        item = random.choice(e["items"])
        _send_item(ctx, item.get("t", ""), item.get("media"))
        return
    media = e.get("media")
    text = random.choice(e["t"]) if e.get("t") else ""
    _send_item(ctx, text, media)


# ===================== المعالج التفاعلي (وسيط إضافة الردود) =====================
WIZ_CANCEL = {"الغاء", "الغاء الامر", "الغ", "cancel", "وقف", "stop", "خروج", "الغاء الرد"}
WIZ_DONE = {"تم", "خلص", "حفظ", "done", "save", "كمل", "انتهيت", "تم الحفظ", "احفظ"}


def _wiz(ctx):
    return ctx.chat_data.setdefault("wizards", {})


def _wiz_clear(ctx):
    _wiz(ctx).pop(str(ctx.user_id), None)
    ctx.dirty = ctx.force_save = True


def _is_admin(ctx):
    return ctx.is_owner or ctx.is_sudo or (ctx.is_group and is_group_admin(ctx))


def start_wizard(ctx, trigger=None):
    """بدء معالج إضافة رد. إذا مُرّرت كلمة، ننتقل مباشرة لخطوة الرد."""
    if not _is_admin(ctx):
        ctx.reply("🔒 هذا الأمر للمشرفين والمالك فقط!")
        return
    w = {"step": "trigger", "trigger": "", "trigger_raw": "", "items": [], "ts": time.time()}
    if trigger:
        w["trigger"] = norm(trigger)
        w["trigger_raw"] = trigger
        w["step"] = "response"
    _wiz(ctx)[str(ctx.user_id)] = w
    ctx.dirty = ctx.force_save = True
    if w["step"] == "trigger":
        ctx.reply("🧙 <b>معالج إضافة رد</b>\n\n"
                  "📝 <b>الخطوة 1/2:</b> أرسل <b>الكلمة المفتاحية</b>\n"
                  "(الكلمة لي كي يكتبها عضو، يردّ عليه البوت تلقائياً)\n\n"
                  "مثال: <code>سلام</code> · <code>هلا</code> · <code>صباح الخير</code>\n\n"
                  "❌ للإلغاء: <code>الغاء</code>",
                  markup=keyboard([[btn("❌ إلغاء", data="wiz:cancel")]]))
    else:
        _wiz_ask_response(ctx, w)


def _wiz_ask_response(ctx, w):
    ctx.reply(f"✅ الكلمة: <b>{esc(w['trigger_raw'])}</b>\n\n"
              "📝 <b>الخطوة 2/2:</b> أرسل <b>الرد</b> (تقدر ترسل أكثر من رد!):\n\n"
              "💬 نص عادي\n"
              "📷 صورة — ومعها تعليق إذا حبيت نص معها\n"
              "🎬 ملصق / صوت / فيديو / متحركة / ملف\n"
              "🎲 أرسل عدة ردود → يختار البوت واحد عشوائي كل مرة\n\n"
              "🧩 متغيرات: {name} {username} {id} {group} {date} {time} {random:أ|ب}\n\n"
              "كي تكمل اكتب <b>تم</b> أو اضغط ✅",
              markup=keyboard([[btn("✅ تم / حفظ", data="wiz:done")],
                               [btn("❌ إلغاء", data="wiz:cancel")]]))


def wizard_step(ctx):
    """اعتراض رسائل المستخدم ذي المعالج النشط. True إذا استُهلكت الرسالة."""
    w = ctx.chat_data.get("wizards", {}).get(str(ctx.user_id))
    if not w:
        return False
    if time.time() - w.get("ts", 0) > WIZ_TTL:
        _wiz_clear(ctx)
        ctx.reply("⏱ انتهت مهلة المعالج (5 دقائق). اكتب <code>اضف رد</code> من جديد.")
        return True
    txt = (ctx.text or "").strip()
    n = norm(txt)
    if n in WIZ_CANCEL or txt.lower() in ("/cancel", "/stop"):
        _wiz_clear(ctx)
        ctx.reply("❌ تم إلغاء المعالج. ما تحفظ حتى رد.")
        return True
    w["ts"] = time.time()
    ctx.dirty = True
    if w["step"] == "trigger":
        return _wiz_trigger(ctx, w, txt)
    if w["step"] == "response":
        return _wiz_response(ctx, w, txt, n)
    return False


def _wiz_trigger(ctx, w, txt):
    if not txt:
        ctx.reply("📝 أرسل الكلمة المفتاحية كنص (مثال: سلام).\nأو <code>الغاء</code> للإلغاء.")
        return True
    if starts_command(txt):
        ctx.reply("⚠️ هذي كلمة أمر! أرسل كلمة عادية مثل: سلام، هلا، صباح.\nأو <code>الغاء</code> للإلغاء.")
        return True
    if len(txt) > 60:
        ctx.reply("⚠️ الكلمة طويلة بزاف. أرسل كلمة قصيرة (أقل من 60 حرف).")
        return True
    w["trigger"] = norm(txt)
    w["trigger_raw"] = txt
    w["step"] = "response"
    ctx.dirty = ctx.force_save = True
    _wiz_ask_response(ctx, w)
    return True


def _wiz_response(ctx, w, txt, n):
    media = _media_of(ctx.msg)
    if media:
        if len(w["items"]) >= 10:
            ctx.reply("⚠️ وصلت الحد الأقصى (10 ردود عشوائية). اكتب <b>تم</b> للحفظ.")
            return True
        w["items"].append({"t": "", "media": media})
        ctx.dirty = ctx.force_save = True
        label = {"photo": "صورة 📷", "sticker": "ملصق 🎭", "voice": "صوت 🎤", "audio": "موسيقى 🎵",
                 "video": "فيديو 🎬", "animation": "متحركة ✨", "document": "ملف 📎",
                 "video_note": "فيديو دائري 🔵"}.get(media["type"], media["type"])
        cap_note = " + تعليق 📝" if media.get("cap") else ""
        ctx.reply(f"📎 تزاد الرد: <b>{label}{cap_note}</b>! ({len(w['items'])} ردود)\n"
                  "زيد رد آخر، أو اكتب <b>تم</b> ✅",
                  markup=keyboard([[btn("✅ تم / حفظ", data="wiz:done")],
                                   [btn("❌ إلغاء", data="wiz:cancel")]]))
        return True
    if n in WIZ_DONE:
        return _wiz_finish(ctx, w)
    if txt:
        if len(w["items"]) >= 10:
            ctx.reply("⚠️ وصلت الحد الأقصى (10 ردود عشوائية). اكتب <b>تم</b> للحفظ.")
            return True
        w["items"].append({"t": txt, "media": None})
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"💬 تزاد الرد النصي! ({len(w['items'])} ردود)\n"
                  "زيد رد آخر (نص أو صورة 📷)، أو اكتب <b>تم</b> ✅",
                  markup=keyboard([[btn("✅ تم / حفظ", data="wiz:done")],
                                   [btn("❌ إلغاء", data="wiz:cancel")]]))
        return True
    ctx.reply("أرسل الرد: نص 💬 أو صورة/وسائط 📷، أو اكتب <b>تم</b> للحفظ.")
    return True


def _wiz_finish(ctx, w):
    if not _is_admin(ctx):
        _wiz_clear(ctx)
        ctx.reply("🔒 لازم تكون مشرف باش تحفظ الرد.")
        return True
    if not w.get("items"):
        ctx.reply("⚠️ ما زدت حتى رد! أرسل نص أو صورة أولاً، أو <code>الغاء</code>.")
        return True
    reps = _store(ctx)
    key = w["trigger"]
    if len(reps) >= MAX_REPLIES and key not in reps:
        _wiz_clear(ctx)
        ctx.reply(f"⚠️ وصلت الحد الأقصى ({MAX_REPLIES} رد). احذف بعضها أولاً.")
        return True
    entry = _norm_entry(reps.get(key))
    entry["items"] = w["items"]
    entry["t"] = [it["t"] for it in w["items"] if it.get("t")]
    entry["media"] = next((it["media"] for it in w["items"] if it.get("media")), None)
    entry["on"] = True
    reps[key] = entry
    trig_raw = w.get("trigger_raw", key)
    n_items = len(w["items"])
    _wiz_clear(ctx)
    ctx.dirty = ctx.force_save = True
    kinds = []
    if any(it.get("media") for it in w["items"]):
        kinds.append("وسائط 📷")
    if any(it.get("t") for it in w["items"]):
        kinds.append("نص 💬")
    ctx.reply(f"🎉 <b>تم حفظ الرد!</b>\n\n"
              f"🔑 الكلمة: <b>{esc(trig_raw)}</b>\n"
              f"📦 الردود: <b>{n_items}</b> {'(عشوائي 🎲)' if n_items > 1 else ''} — {' + '.join(kinds)}\n\n"
              f"جرّب درك: اكتب <code>{esc(trig_raw)}</code> 😎",
              markup=keyboard([[btn("➕ إضافة رد آخر", data="wiz:new")],
                               [btn("📋 الردود", data="wiz:list")]]))
    return True


def _replies_list_text(ctx):
    reps = _store(ctx)
    legacy = ctx.settings.get("replies", {})
    if not reps and not legacy:
        return ("💬 لا توجد ردود مخصصة بعد.\n"
                "اكتب <code>اضف رد</code> باش يفتح المعالج التفاعلي 🧙")
    lines = [f"💬 <b>الردود المخصصة ({len(reps) + len(legacy)}):\n</b>"]
    for k, v in list(reps.items())[:60]:
        e = _norm_entry(v)
        n_items = len(e["items"]) if e.get("items") else max(1, len(e["t"]))
        has_media = bool(e.get("media")) or (e.get("items") and any(it.get("media") for it in e["items"]))
        icon = "🎬" if has_media else "💬"
        status = "" if e["on"] else " ⛔"
        multi = f" 🎲{n_items}" if n_items > 1 else ""
        if e.get("items"):
            first = e["items"][0]
            preview = esc(first.get("t", "")[:40]) if first.get("t") else f"[{first.get('media', {}).get('type', 'وسائط')}]"
        elif e["t"]:
            preview = esc(e["t"][0][:40])
        else:
            preview = f"[{e['media']['type']}]" if e.get("media") else "—"
        lines.append(f"{icon} <b>{esc(k)}</b>{status}{multi} ← {preview} (×{e['hits']})")
    for k, v in list(legacy.items())[:20]:
        lines.append(f"💬 <b>{esc(k)}</b> ← {esc(str(v)[:40])}")
    return "\n".join(lines)[:4000]


def callback(ctx, parts):
    """أزرار المعالج: wiz:cancel / wiz:done / wiz:new / wiz:list."""
    tg, cid = ctx.tg, ctx.chat_id
    cq = ctx.update["callback_query"]
    action = parts[1] if len(parts) > 1 else ""
    w = ctx.chat_data.get("wizards", {}).get(str(ctx.user_id))
    if action == "cancel":
        _wiz_clear(ctx)
        tg.answer_callback(cq["id"], "تم الإلغاء")
        tg.edit(cid, cq["message"]["message_id"], "❌ تم إلغاء المعالج.")
        return
    if action == "done":
        if not w:
            tg.answer_callback(cq["id"], "ما كاين حتى معالج نشط. اكتب اضف رد.", alert=True)
            return
        tg.answer_callback(cq["id"])
        _wiz_finish(ctx, w)
        return
    if action == "new":
        tg.answer_callback(cq["id"])
        start_wizard(ctx)
        return
    if action == "list":
        tg.answer_callback(cq["id"])
        tg.send(cid, _replies_list_text(ctx),
                markup=keyboard([[btn("➕ إضافة رد", data="wiz:new")]]))
        return
    tg.answer_callback(cq["id"])
