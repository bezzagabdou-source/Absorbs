# -*- coding: utf-8 -*-
"""أوامر الإدارة: عقوبات، رفع/تنزيل مشرف، تثبيت، مسح، إعدادات المجموعة."""
import time

from .helpers import (esc, mention, uname, fullname, take, need_admin, need_group, need_owner,
                      resolve_target, can_punish, parse_duration, fmt_duration, fmt_time,
                      keyboard, btn, is_error, err_text, admin_ids, is_group_admin, rank_of)
from .store import get_user
from .protection import LOCKS, LOCK_NAMES_AR, lock_key, add_warn


def handle(ctx):
    if not ctx.words:
        return False
    tg, cid = ctx.tg, ctx.chat_id

    # ================= العقوبات =================
    rest = take(ctx, "حظر", "طرد", "بان", "kick", "ban")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        is_ban = ctx.nwords[0] in ("حظر", "بان", "ban")
        target, err = resolve_target(ctx)
        if err:
            ctx.reply(err)
            return True
        ok, why = can_punish(ctx, target["id"])
        if not ok:
            ctx.reply(why)
            return True
        parts = ctx.args
        reason = " ".join(parts[1:]) if parts and (parts[0].startswith("@") or parts[0].lstrip("-").isdigit()) else " ".join(parts)
        if is_ban:
            res = tg.ban(cid, target["id"])
            verb = "🔨 تم حظر"
        else:
            res = tg.ban(cid, target["id"])
            tg.unban(cid, target["id"])
            verb = "👢 تم طرد"
        if is_error(res):
            ctx.reply(err_text(res))
            return True
        ctx.reply(f"{verb} {mention(target)}" + (f"\n📝 السبب: {esc(reason)}" if reason else ""))
        return True

    rest = take(ctx, "الغاء الحظر", "رفع الحظر", "فك الحظر", "unban")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            # السماح بمعرف رقمي حتى لو غير معروف
            if ctx.args and ctx.args[0].lstrip("-").isdigit():
                target = {"id": int(ctx.args[0]), "first_name": ctx.args[0]}
            else:
                ctx.reply(err)
                return True
        res = tg.unban(cid, target["id"])
        ctx.reply(f"✅ تم فك الحظر عن {mention(target)}" if not is_error(res) else err_text(res))
        return True

    rest = take(ctx, "كتم", "اسكات", "mute")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply(err)
            return True
        ok, why = can_punish(ctx, target["id"])
        if not ok:
            ctx.reply(why)
            return True
        dur_arg = None
        if ctx.reply_msg:
            if ctx.args and any(c.isdigit() for c in ctx.args[0]):
                dur_arg = ctx.args[0]
        elif len(ctx.args) > 1 and any(c.isdigit() for c in ctx.args[1]):
            dur_arg = ctx.args[1]
        sec = parse_duration(dur_arg) if dur_arg else 3600
        res = tg.restrict(cid, target["id"], {"can_send_messages": False}, until=int(time.time() + sec))
        if is_error(res):
            ctx.reply(err_text(res))
            return True
        ctx.reply(f"🔇 تم كتم {mention(target)} لمدة <b>{fmt_duration(sec)}</b>")
        return True

    rest = take(ctx, "رفع الكتم", "الغاء الكتم", "فك الكتم", "unmute")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply(err)
            return True
        perms = {"can_send_messages": True, "can_send_audios": True, "can_send_documents": True,
                 "can_send_photos": True, "can_send_videos": True, "can_send_video_notes": True,
                 "can_send_voice_notes": True, "can_send_polls": True, "can_send_other_messages": True,
                 "can_add_web_page_previews": True}
        res = tg.restrict(cid, target["id"], perms)
        ctx.reply(f"🔊 تم فك الكتم عن {mention(target)}" if not is_error(res) else err_text(res))
        return True

    rest = take(ctx, "تقييد", "restrict")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply(err)
            return True
        ok, why = can_punish(ctx, target["id"])
        if not ok:
            ctx.reply(why)
            return True
        sec = parse_duration(ctx.args[-1]) if ctx.args and any(c.isdigit() for c in ctx.args[-1]) else 3600
        res = tg.restrict(cid, target["id"], {"can_send_messages": True, "can_send_audios": False,
                                              "can_send_documents": False, "can_send_photos": False,
                                              "can_send_videos": False, "can_send_video_notes": False,
                                              "can_send_voice_notes": False, "can_send_polls": False,
                                              "can_send_other_messages": False, "can_add_web_page_previews": False},
                            until=int(time.time() + sec))
        ctx.reply(f"🔗 تم تقييد وسائط {mention(target)} لمدة {fmt_duration(sec)}" if not is_error(res) else err_text(res))
        return True

    rest = take(ctx, "تحذير", "انذار", "warn")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply(err)
            return True
        ok, why = can_punish(ctx, target["id"])
        if not ok:
            ctx.reply(why)
            return True
        reason = rest
        if ctx.args and (ctx.args[0].startswith("@") or ctx.args[0].lstrip("-").isdigit()):
            reason = " ".join(ctx.args[1:])
        add_warn(ctx, target["id"], target, reason or "بدون سبب")
        return True

    rest = take(ctx, "تحذيرات", "تحذيراتي", "warns")
    if rest is not None:
        if not need_group(ctx):
            return True
        if ctx.nwords[0] == "تحذيراتي" or not (ctx.reply_msg or ctx.args):
            target = ctx.user
        else:
            if not need_admin(ctx):
                return True
            target, err = resolve_target(ctx)
            if err:
                ctx.reply(err)
                return True
        u = ctx.chat_data["users"].get(str(target["id"]), {})
        ctx.reply(f"⚠️ تحذيرات {mention(target)}: <b>{u.get('w', 0)}/{ctx.settings.get('warn_limit', 3)}</b>")
        return True

    rest = take(ctx, "مسح التحذيرات", "مسح تحذيرات", "تصفير التحذيرات", "resetwarns")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply(err)
            return True
        u = get_user(ctx.chat_data, target)
        u["w"] = 0
        ctx.dirty = True
        ctx.reply(f"✅ تم تصفير تحذيرات {mention(target)}")
        return True

    # ================= المشرفون =================
    rest = take(ctx, "رفع مشرف", "رفع ادمن", "promote")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply(err)
            return True
        title = rest
        if ctx.args and (ctx.args[0].startswith("@") or ctx.args[0].lstrip("-").isdigit()):
            title = " ".join(ctx.args[1:])
        res = tg.promote(cid, target["id"], title or "مشرف")
        if is_error(res):
            ctx.reply(err_text(res))
            return True
        ctx.chat_data["admins"] = {"ids": [], "ts": 0}
        ctx.dirty = True
        ctx.reply(f"⬆️ تمت ترقية {mention(target)} إلى مشرف 👮" + (f" بلقب: {esc(title)}" if title else ""))
        return True

    rest = take(ctx, "تنزيل مشرف", "تنزيل ادمن", "demote")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply(err)
            return True
        res = tg.demote(cid, target["id"])
        ctx.chat_data["admins"] = {"ids": [], "ts": 0}
        ctx.dirty = True
        ctx.reply(f"⬇️ تم تنزيل {mention(target)} من الإشراف" if not is_error(res) else err_text(res))
        return True

    rest = take(ctx, "ضع لقب", "تعيين لقب", "settitle")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply(err)
            return True
        title = rest
        if ctx.args and (ctx.args[0].startswith("@") or ctx.args[0].lstrip("-").isdigit()):
            title = " ".join(ctx.args[1:])
        if title:
            res = tg.set_title(cid, target["id"], title)
            if not is_error(res):
                ctx.reply(f"🏷 لقب {mention(target)} الجديد: <b>{esc(title)}</b>")
            else:
                u = get_user(ctx.chat_data, target)
                u["t"] = title[:24]
                ctx.dirty = True
                ctx.reply(f"🏷 حفظت لقب {mention(target)}: <b>{esc(title)}</b> (لقب داخلي في البوت)")
        return True

    rest = take(ctx, "المشرفين", "الادمنيه", "الادمنية", "adminlist", "admins")
    if rest is not None:
        if not need_group(ctx):
            return True
        admin_ids(ctx)
        names = ctx.chat_data.get("admins", {}).get("names", [])
        if not names:
            ctx.reply("⚠️ تعذر جلب قائمة المشرفين — هل أنا مشرف هنا؟")
            return True
        lines = ["👮 <b>مشرفو المجموعة:</b>\n"]
        for a in names:
            icon = "👑" if a["s"] == "creator" else "🛡"
            t = f" — {esc(a['title'])}" if a.get("title") else ""
            lines.append(f"{icon} {esc(a['n'])} {('@' + a['u']) if a.get('u') else ''}{t}")
        ctx.reply("\n".join(lines))
        return True

    # ================= التثبيت والمسح =================
    rest = take(ctx, "تثبيت", "pin")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        if not ctx.reply_msg:
            ctx.reply("↩️ رد على الرسالة التي تريد تثبيتها.")
            return True
        res = tg.pin(cid, ctx.reply_msg["message_id"], notify="اشعار" in ctx.nwords or "notify" in ctx.nwords)
        ctx.reply("📌 تم التثبيت!" if not is_error(res) else err_text(res))
        return True

    rest = take(ctx, "الغاء التثبيت", "الغاء تثبيت", "unpin")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        if ctx.reply_msg:
            tg.unpin(cid, ctx.reply_msg["message_id"])
        else:
            tg.unpin(cid)
        ctx.reply("📌 تم إلغاء التثبيت.")
        return True

    rest = take(ctx, "مسح الرسائل", "تنظيف الرسائل", "purge")
    if rest is None and ctx.nwords and ctx.nwords[0] == "مسح":
        # "مسح" وحده أو "مسح 50" فقط — لا يبتلع "مسح جهاتي" وغيرها
        if len(ctx.nwords) == 1 or (len(ctx.nwords) == 2 and ctx.nwords[1].isdigit()):
            rest = take(ctx, "مسح")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        # مسح N رسالة، أو من رسالة مردود عليها إلى هنا
        count = 0
        if ctx.args and ctx.args[0].isdigit():
            count = min(int(ctx.args[0]), 200)
            start = ctx.msg["message_id"]
            ids = list(range(start - count, start + 1))
        elif ctx.reply_msg:
            start = ctx.reply_msg["message_id"]
            end = ctx.msg["message_id"]
            if end - start > 300:
                ctx.reply("⚠️ النطاق كبير جداً (الحد 300 رسالة).")
                return True
            ids = list(range(start, end + 1))
        else:
            ctx.reply("🗑 الاستخدام: <b>مسح 50</b> أو رد على رسالة واكتب <b>مسح</b> لحذف ما بينها.")
            return True
        deleted = 0
        for mid in ids:
            r = tg.delete(cid, mid)
            if not is_error(r):
                deleted += 1
        note = tg.send(cid, f"🧹 تم مسح <b>{deleted}</b> رسالة.")
        if isinstance(note, dict) and note.get("message_id"):
            ctx.chat_data.setdefault("bot_msgs", []).append(note["message_id"])
        return True

    rest = take(ctx, "تنظيف", "تنظيف البوت")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        n = 0
        for mid in ctx.chat_data.get("bot_msgs", [])[-100:]:
            if not is_error(tg.delete(cid, mid)):
                n += 1
        ctx.chat_data["bot_msgs"] = []
        ctx.dirty = True
        ctx.reply(f"🧹 تم تنظيف {n} من رسائل البوت القديمة.")
        return True

    # ================= إعدادات المجموعة =================
    rest = take(ctx, "تفعيل البوت", "activate")
    if rest is None and ctx.nwords == ["تفعيل"]:
        rest = take(ctx, "تفعيل")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        ctx.settings["on"] = True
        ctx.dirty = True
        me = tg.get_me()
        my = tg.get_member(cid, me["id"]) if isinstance(me, dict) else {}
        if isinstance(my, dict) and my.get("status") != "administrator":
            ctx.reply("⚡ البوت مفعّل!\n⚠️ لكن ارفعني <b>مشرفاً</b> بصلاحيات (حذف، حظر، تقييد، تثبيت) لأحمي المجموعة فعلياً.")
        else:
            ctx.reply("⚡ <b>تم التفعيل!</b> الحماية شغالة الآن 🛡\n\n"
                      "جرّب:\n• <b>الاقفال</b> — لوحة الحماية\n• <b>ضع قوانين</b> نص\n• <b>ضع ترحيب</b> نص\n• <b>الاوامر</b> — كل المزايا")
        return True

    rest = take(ctx, "تعطيل البوت")
    if rest is None and ctx.nwords == ["تعطيل"]:
        rest = take(ctx, "تعطيل")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        ctx.settings["on"] = False
        ctx.dirty = True
        ctx.reply("😴 تم تعطيل البوت في هذه المجموعة. اكتب (تفعيل) للعودة.")
        return True

    rest = take(ctx, "وضع المشرفين", "تفعيل وضع المشرفين")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        ctx.settings["admin_only"] = True
        ctx.dirty = True
        ctx.reply("👮 <b>وضع المشرفين مفعّل:</b> أوامر البوت وردوده في هذه المجموعة للمشرفين والمالك فقط.\n(الحماية تبقى تطبق على الجميع)")
        return True

    rest = take(ctx, "الغاء وضع المشرفين", "تعطيل وضع المشرفين")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        ctx.settings["admin_only"] = False
        ctx.dirty = True
        ctx.reply("🌍 تم إلغاء وضع المشرفين — الجميع يستطيع استخدام البوت مجدداً.")
        return True

    rest = take(ctx, "ضع قوانين", "وضع قوانين", "setrules")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        if not rest:
            ctx.reply("📜Usage: ضع قوانين <النص>")
            return True
        ctx.settings["rules"] = rest[:1500]
        ctx.dirty = True
        ctx.reply("📜 تم حفظ قوانين المجموعة! الأعضاء يكتبون (القوانين) لقراءتها.")
        return True

    rest = take(ctx, "ضع ترحيب", "وضع ترحيب", "setwelcome")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        if not rest:
            ctx.reply("👋 الاستخدام: ضع ترحيب <النص>\nالمتغيرات: {name} {group} {rules}")
            return True
        ctx.settings["welcome"] = rest[:800]
        ctx.settings["welcome_on"] = True
        ctx.dirty = True
        ctx.reply("👋 تم حفظ الترحيب!")
        return True

    rest = take(ctx, "ضع وداع", "setgoodbye")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        ctx.settings["goodbye"] = rest[:500]
        ctx.settings["goodbye_on"] = bool(rest)
        ctx.dirty = True
        ctx.reply("👋 تم حفظ رسالة الوداع." if rest else "تم تعطيل الوداع.")
        return True

    for word, key, label in [("الترحيب", "welcome_on", "الترحيب"), ("الوداع", "goodbye_on", "الوداع"),
                             ("الكابتشا", "captcha", "الكابتشا"), ("التحقق", "captcha", "التحقق"),
                             ("مكافحه السبام", "flood_on", "مكافحة السبام")]:
        rest = take(ctx, "تفعيل " + word, "تعطيل " + word)
        if rest is not None:
            if not need_group(ctx) or not need_admin(ctx):
                return True
            on = ctx.nwords[0] == "تفعيل"
            ctx.settings[key] = on
            ctx.dirty = True
            ctx.reply(f"{'✅ تم تفعيل' if on else '⛔ تم تعطيل'} {label}.")
            return True

    rest = take(ctx, "ضع حد التحذيرات", "حد التحذيرات")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        if rest.isdigit() and 1 <= int(rest) <= 10:
            ctx.settings["warn_limit"] = int(rest)
            ctx.dirty = True
            ctx.reply(f"⚠️ حد التحذيرات الآن: <b>{rest}</b>")
        else:
            ctx.reply(f"⚠️ الحالي: {ctx.settings.get('warn_limit', 3)} — غيّره: ضع حد التحذيرات 5")
        return True

    rest = take(ctx, "ضع حد السبام", "حد السبام")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        if rest.isdigit() and 3 <= int(rest) <= 30:
            ctx.settings["flood_n"] = int(rest)
            ctx.dirty = True
            ctx.reply(f"🌊 حد السبام: <b>{rest}</b> رسائل خلال {ctx.settings.get('flood_s', 8)} ثواني.")
        else:
            ctx.reply(f"🌊 الحالي: {ctx.settings.get('flood_n', 7)} — غيّره: ضع حد السبام 5")
        return True

    rest = take(ctx, "عقوبه التحذيرات", "عقوبة التحذيرات")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        m = {"كتم": "mute", "حظر": "ban", "طرد": "kick"}
        if rest in m:
            ctx.settings["warn_action"] = m[rest]
            ctx.dirty = True
            ctx.reply(f"⚖️ عقوبة الوصول لحد التحذيرات: <b>{rest}</b>")
        else:
            ctx.reply("⚖️ اختر: عقوبة التحذيرات كتم | حظر | طرد")
        return True

    rest = take(ctx, "اضف كلمه", "اضف كلمة", "addword")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        if rest:
            ctx.settings.setdefault("badwords", []).append(rest[:40])
            ctx.settings["badwords_on"] = True
            ctx.dirty = True
            ctx.reply(f"🚫 أُضيفت كلمة ممنوعة: <b>{esc(rest)}</b>")
        return True

    rest = take(ctx, "احذف كلمه", "احذف كلمة", "delword")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        bw = ctx.settings.get("badwords", [])
        if rest in bw:
            bw.remove(rest)
            ctx.dirty = True
            ctx.reply("✅ حُذفت الكلمة من القائمة.")
        else:
            ctx.reply("🔍 الكلمة غير موجودة. اكتب (قائمة السب) للعرض.")
        return True

    rest = take(ctx, "قائمه السب", "قائمة السب", "الكلمات الممنوعه")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        bw = ctx.settings.get("badwords", [])
        ctx.reply("🚫 الكلمات المخصصة: " + (esc("، ".join(bw)) if bw else "لا توجد — أضف بـ (اضف كلمة ...)"))
        return True

    rest = take(ctx, "اضف رد", "addreply")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        if "|" in rest:
            trig, resp = rest.split("|", 1)
            trig, resp = trig.strip(), resp.strip()
            if trig and resp:
                from .helpers import norm as _n
                ctx.settings.setdefault("replies", {})[_n(trig)] = resp[:700]
                ctx.settings["replies_on"] = True
                ctx.dirty = True
                ctx.reply(f"✅ رد جديد: <b>{esc(trig)}</b> ← {esc(resp[:80])}")
                return True
        ctx.reply("💬 الاستخدام: اضف رد الكلمة | الرد\nمثال: اضف رد هلا | هلا بيك يا غالي 🌹")
        return True

    rest = take(ctx, "احذف رد", "delreply")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        from .helpers import norm as _n
        reps = ctx.settings.get("replies", {})
        k = _n(rest.strip())
        if k in reps:
            reps.pop(k)
            ctx.dirty = True
            ctx.reply("✅ حُذف الرد.")
        else:
            ctx.reply("🔍 لا يوجد رد بهذه الكلمة. اكتب (الردود).")
        return True

    rest = take(ctx, "الردود", "ردود المجموعه")
    if rest is not None:
        if not need_group(ctx):
            return True
        reps = ctx.settings.get("replies", {})
        if not reps:
            ctx.reply("💬 لا توجد ردود مخصصة. أضف: اضف رد الكلمة | الرد")
        else:
            lines = [f"• <b>{esc(k)}</b> ← {esc(v[:60])}" for k, v in list(reps.items())[:40]]
            ctx.reply("💬 <b>الردود المخصصة:</b>\n" + "\n".join(lines))
        return True

    rest = take(ctx, "تفعيل الردود", "تعطيل الردود")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        on = ctx.nwords[0] == "تفعيل"
        ctx.settings["replies_on"] = on
        ctx.dirty = True
        ctx.reply(f"{'✅ الردود التلقائية مفعلة' if on else '⛔ الردود التلقائية معطلة'}.")
        return True

    rest = take(ctx, "ضع قناه الاشتراك", "ضع قناة الاشتراك", "setchannel")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        ch = rest.strip().lstrip("@").split("/")[-1]
        if ch:
            ctx.settings["force_sub"] = ch
            ctx.settings["force_sub_on"] = True
            ctx.dirty = True
            ctx.reply(f"📢 الاشتراك الإجباري في @{esc(ch)} مفعّل!\n⚠️ اجعلني مشرفاً في القناة لأتحقق من الأعضاء.")
        return True

    rest = take(ctx, "تفعيل الاشتراك", "تعطيل الاشتراك")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        on = ctx.nwords[0] == "تفعيل"
        ctx.settings["force_sub_on"] = on
        ctx.dirty = True
        ctx.reply(f"{'✅ الاشتراك الإجباري مفعّل' if on else '⛔ الاشتراك الإجباري معطّل'}.")
        return True

    # ================= معلومات =================
    rest = take(ctx, "ايدي", "ايد", "id", "معلوماتي")
    if rest is not None:
        target = ctx.user
        if ctx.reply_msg and ctx.reply_msg.get("from"):
            target = ctx.reply_msg["from"]
        u = ctx.chat_data["users"].get(str(target["id"]), {})
        lines = [f"🆔 <b>المعلومات:</b>",
                 f"👤 الاسم: {esc(fullname(target))}",
                 f"🔗 المعرف: {('@' + target['username']) if target.get('username') else 'لا يوجد'}",
                 f"🔢 الآيدي: <code>{target['id']}</code>"]
        if ctx.is_group:
            lines.append(f"💬 المجموعة: <code>{cid}</code>")
            if u:
                lines += [f"✉️ الرسائل: {u.get('m', 0)}", f"⭐ النقاط: {u.get('x', 0)}",
                          f"🏅 الرتبة: {rank_of(u.get('x', 0))}", f"👥 جهاتي: {u.get('a', 0)}",
                          f"⚠️ التحذيرات: {u.get('w', 0)}"]
        ctx.reply("\n".join(lines))
        return True

    rest = take(ctx, "كشف", "من هو", "whois", "info")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply(err)
            return True
        u = ctx.chat_data["users"].get(str(target["id"]), {})
        member = tg.get_member(cid, target["id"])
        status = member.get("status", "غير معروف") if isinstance(member, dict) else "غير معروف"
        smap = {"creator": "👑 مالك", "administrator": "🛡 مشرف", "member": "👤 عضو",
                "restricted": "🔗 مقيد", "left": "🚪 غادر", "kicked": "⛔ محظور"}
        lines = ["🔎 <b>كشف العضو:</b>",
                 f"👤 {esc(fullname(target))} — {mention(target)}",
                 f"🔗 {('@' + target['username']) if target.get('username') else 'بلا معرف'}",
                 f"🆔 <code>{target['id']}</code>",
                 f"📊 الحالة: {smap.get(status, status)}",
                 f"✉️ الرسائل: {u.get('m', 0)} | ⭐ النقاط: {u.get('x', 0)}",
                 f"👥 أضاف: {u.get('a', 0)} عضو | ⚠️ تحذيرات: {u.get('w', 0)}",
                 f"🏅 الرتبة: {rank_of(u.get('x', 0))}",
                 f"🕐 آخر ظهور: {fmt_time(u.get('l'))}"]
        if u.get("t"):
            lines.append(f"🏷 اللقب: {esc(u['t'])}")
        ctx.reply("\n".join(lines))
        return True

    rest = take(ctx, "معلومات المجموعه", "معلومات المجموعة", "chatinfo", "المجموعة")
    if rest is not None:
        if not need_group(ctx):
            return True
        chat = tg.get_chat(cid)
        count = tg.get_member_count(cid)
        lines = [f"👥 <b>{esc(chat.get('title', ''))}</b>",
                 f"🆔 <code>{cid}</code>",
                 f"👤 الأعضاء: <b>{count if isinstance(count, int) else '?'}</b>",
                 f"✉️ رسائل مسجلة: {ctx.chat_data.get('msgs', 0)}",
                 f"🛡 الأقفال المفعلة: {sum(1 for v in ctx.settings.get('locks', {}).values() if v)}"]
        if chat.get("description"):
            lines.append(f"📝 الوصف: {esc(chat['description'][:200])}")
        if chat.get("invite_link"):
            lines.append(f"🔗 الرابط: {chat['invite_link']}")
        ctx.reply("\n".join(lines))
        return True

    rest = take(ctx, "تبليغ", "ابلاغ", "report", "ادمن", "@admin")
    if rest is not None:
        if not need_group(ctx):
            return True
        admin_ids(ctx)
        names = ctx.chat_data.get("admins", {}).get("names", [])
        tags = " ".join("@" + a["u"] for a in names if a.get("u") and a["s"] != "creator") or "يا مشرفين!"
        if not ctx.reply_msg:
            ctx.reply("↩️ رد على الرسالة المخالفة واكتب (تبليغ).")
            return True
        offender = ctx.reply_msg.get("from", {})
        ctx.reply(f"🚨 <b>تبليغ!</b> {tags}\nالمبلّغ: {mention(ctx.user)}\nالمخالف: {mention(offender) if offender else '؟'}\nالسبب: {esc(rest or 'بدون سبب')}")
        return True

    rest = take(ctx, "رابط", "الرابط", "link")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        chat = tg.get_chat(cid)
        link = chat.get("invite_link") if isinstance(chat, dict) else None
        if not link:
            link = tg.export_invite(cid)
        if isinstance(link, str):
            ctx.reply(f"🔗 رابط المجموعة:\n{link}")
        else:
            ctx.reply(err_text(link))
        return True

    rest = take(ctx, "قفل المجموعه", "قفل المجموعة", "اغلاق المجموعه", "lockall")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        res = tg.mute_all(cid, True)
        ctx.settings.setdefault("locks", {})["all"] = True
        ctx.dirty = True
        ctx.reply("🔒 تم قفل المجموعة — المشرفون فقط يتكلمون." if not is_error(res) else err_text(res))
        return True

    rest = take(ctx, "فتح المجموعه", "فتح المجموعة", "openall")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        res = tg.mute_all(cid, False)
        ctx.settings.setdefault("locks", {}).pop("all", None)
        ctx.dirty = True
        ctx.reply("🔓 تم فتح المجموعة — الجميع يتكلم." if not is_error(res) else err_text(res))
        return True

    return False
