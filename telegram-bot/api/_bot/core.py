# -*- coding: utf-8 -*-
"""الموزّع الرئيسي: السياق، الصلاحيات، التوجيه، أوامر المطور، الوضع الإنلاين."""
import os
import random
import time
import traceback

from . import data
from .tg import TG
from .store import Store, get_chat, get_user, DEFAULT_SETTINGS
from .helpers import (norm, esc, mention, fullname, uname, keyboard, btn, is_error,
                      is_group_admin, admin_ids, need_owner, take)
from . import protection, admin, fun, games, music, tools, menus
from . import replies, economy, moregames, moretools, islam, social, features, smart

SLASH = {
    "start": "الاوامر", "help": "الاوامر", "id": "ايدي", "ping": "بنج",
    "ban": "حظر", "unban": "الغاء الحظر", "kick": "طرد", "mute": "كتم", "unmute": "رفع الكتم",
    "warn": "تحذير", "warns": "تحذيرات", "resetwarns": "مسح التحذيرات",
    "pin": "تثبيت", "unpin": "الغاء التثبيت", "purge": "مسح", "info": "كشف", "whois": "كشف",
    "admins": "المشرفين", "adminlist": "المشرفين", "rules": "القوانين", "setrules": "ضع قوانين",
    "setwelcome": "ضع ترحيب", "locks": "الاقفال", "settings": "الاعدادات", "top": "توب",
    "games": "العاب", "music": "يوت", "play": "يوت", "song": "يوت", "quran": "قران",
    "weather": "طقس", "translate": "ترجمة", "calc": "احسب", "wiki": "ويكي", "tts": "انطق",
    "sticker": "ملصق", "daily": "هدية", "rank": "رتبتي", "stats": "احصائياتي",
    "report": "تبليغ", "link": "رابط", "promote": "رفع مشرف", "demote": "تنزيل مشرف",
    "broadcast": "اذاعة", "gban": "حظر عام", "ungban": "الغاء الحظر العام", "status": "الحالة",
    "invite": "جهاتي", "invites": "توب الجهات", "resetinvites": "مسح جهاتي",
    "activate": "تفعيل", "deactivate": "تعطيل", "about": "السورس",
}


class Ctx:
    def __init__(self, update, tg, state, store):
        self.update = update
        self.tg = tg
        self.state = state
        self.store = store
        self.dirty = False
        self.force_save = False
        self.handled = False
        cq = update.get("callback_query")
        self.is_callback = bool(cq)
        self.is_edit = "edited_message" in update
        if cq:
            self.msg = cq.get("message") or {}
            self.user = cq.get("from") or {}
        else:
            self.msg = update.get("message") or update.get("edited_message") or {}
            self.user = self.msg.get("from") or {}
        self.user_id = self.user.get("id", 0)
        self.chat = self.msg.get("chat") or {}
        self.chat_id = self.chat.get("id") or self.user_id
        self.is_group = self.chat.get("type") in ("group", "supergroup")
        self.text = "" if cq else (self.msg.get("text") or self.msg.get("caption") or "")
        self.reply_msg = self.msg.get("reply_to_message")
        self.words = self.text.split()
        # أوامر ببادئة / أو ! (عربية أو إنجليزية): /حظر ، !حظر ، /ban
        if self.words and self.words[0][:1] in ("/", "!"):
            head = self.words[0][1:].split("@")[0]
            low = head.lower()
            if low in SLASH:
                self.words = SLASH[low].split() + self.words[1:]
            elif head:
                self.words = [head] + self.words[1:]
        self.nwords = [norm(w) for w in self.words]
        self.args = self.words[1:]
        self.rest = " ".join(self.args)
        self.chat_data = get_chat(state, self.chat_id) if self.chat_id else {"settings": dict(DEFAULT_SETTINGS), "users": {}}
        self.settings = self.chat_data.get("settings", DEFAULT_SETTINGS)
        env_owner = os.environ.get("OWNER_ID", "").strip()
        owner = int(env_owner) if env_owner.isdigit() else state.get("owner")
        self.is_owner = bool(owner) and self.user_id == owner
        self.is_sudo = self.user_id in state.get("sudo", [])

    def reply(self, text, markup=None, preview=False):
        mid = self.msg.get("message_id") if self.msg else None
        res = self.tg.send(self.chat_id, text, reply_to=mid, markup=markup, preview=preview)
        if isinstance(res, dict) and res.get("message_id") and self.is_group:
            self.chat_data.setdefault("bot_msgs", []).append(res["message_id"])
            self.chat_data["bot_msgs"] = self.chat_data["bot_msgs"][-120:]
        return res

    def notify(self, text):
        res = self.tg.send(self.chat_id, text)
        if isinstance(res, dict) and res.get("message_id"):
            self.chat_data.setdefault("bot_msgs", []).append(res["message_id"])
        return res


def handle_update(update, token, pointer):
    tg = TG(token)
    store = Store(pointer)
    state = store.load()
    if state.get("bot_id"):
        tg.me = {"id": state["bot_id"], "username": state.get("bot_username", ""), "first_name": BOT_TITLE}
    ctx = Ctx(update, tg, state, store)
    try:
        dispatch(ctx)
    except Exception:
        traceback.print_exc()
    # الحفظ
    if ctx.dirty or ctx.force_save:
        if ctx.force_save or ctx.handled or time.time() - state.get("saved", 0) >= 4:
            store.save(state)
    return True


BOT_TITLE = "Absorbs"


def dispatch(ctx):
    u = ctx.update
    if "callback_query" in u:
        return handle_callback(ctx)
    if "inline_query" in u:
        return handle_inline(ctx)
    if "my_chat_member" in u:
        return handle_my_member(ctx)
    if "chat_member" in u:
        return  # نتجاهل لتقليل الضجيج
    if not ctx.msg:
        return

    # رسائل خدمية
    if ctx.msg.get("new_chat_members"):
        if ctx.is_group:
            protection.handle_join(ctx)
            ctx.force_save = True
        return
    if ctx.msg.get("left_chat_member"):
        if ctx.is_group:
            protection.handle_leave(ctx)
            ctx.force_save = True
        return
    service_keys = ("new_chat_title", "new_chat_photo", "delete_chat_photo", "pinned_message",
                    "group_chat_created", "supergroup_chat_created", "channel_chat_created")
    if any(k in ctx.msg for k in service_keys):
        if ctx.is_group and ctx.settings.get("del_service", True) and ctx.settings.get("on", True):
            ctx.tg.delete(ctx.chat_id, ctx.msg["message_id"])
        return

    # رسالة معدلة
    if ctx.is_edit:
        if ctx.is_group and ctx.settings.get("locks", {}).get("edits") and not is_group_admin(ctx):
            ctx.tg.delete(ctx.chat_id, ctx.msg["message_id"])
        return

    if not ctx.user or ctx.user.get("is_bot"):
        return

    # رسائل القنوات في المجموعة
    if ctx.msg.get("sender_chat") and ctx.user_id != 1087968824:
        if ctx.is_group and ctx.settings.get("locks", {}).get("channels"):
            ctx.tg.delete(ctx.chat_id, ctx.msg["message_id"])
        return

    privileged = ctx.is_owner or ctx.is_sudo or (ctx.is_group and is_group_admin(ctx))

    if ctx.is_group:
        # إحصائيات + نقاط
        if ctx.settings.get("on", True):
            cu = get_user(ctx.chat_data, ctx.user)
            now = time.time()
            cu["m"] = cu.get("m", 0) + 1
            if now - cu.get("l", 0) >= 5:
                gain = 2 if economy.boost_active(cu) else 1
                cu["x"] = cu.get("x", 0) + gain
            cu["l"] = now
            ctx.chat_data["msgs"] = ctx.chat_data.get("msgs", 0) + 1
            ctx.dirty = True
            protection.sweep_captcha(ctx)
            if not privileged:
                if protection.check_force_sub(ctx):
                    ctx.force_save = True
                    return
                if protection.check_message(ctx):
                    ctx.force_save = True
                    return
            if not ctx.settings.get("on", True):
                # البوت معطل: فقط تفعيل
                if ctx.nwords and ctx.nwords[0] == "تفعيل" and privileged:
                    admin.handle(ctx)
                    ctx.force_save = True
                return
            if ctx.settings.get("admin_only") and not privileged:
                return
    else:
        # الخاص: الملكية تُحسم بمفتاح سري فقط (ليس بأول /start)
        if not ctx.state.get("owner") and not os.environ.get("OWNER_ID"):
            if ctx.nwords and ctx.nwords[0] in ("الاوامر", "start", "بدايه"):
                ctx.reply("👑 <b>ملكية البوت محمية بمفتاح سري.</b>\n\n"
                          "لتصبح المطور أرسل:\n<code>مفتاح المطور YOUR_SECRET_KEY</code>\n\n"
                          "🔑 المفتاح عند مالك البوت فقط. من يملكه يتحكم بكل شيء.")

    # معالج الردود التفاعلي (وسيط) — يعترض نص/وسائط المستخدم ذي المعالج النشط
    if replies.wizard_step(ctx):
        ctx.handled = True
        ctx.force_save = True
        return

    if not ctx.text:
        # وسائط بلا نص: ملصق/صورة بدون أمر → لا شيء
        return

    # ألعاب نصية
    if ctx.is_group and (games.check_answer(ctx) or moregames.check_answer(ctx)):
        ctx.force_save = True
        return

    # أوامر الأقفال: قفل X / فتح X
    if ctx.nwords and ctx.nwords[0] in ("قفل", "فتح") and len(ctx.nwords) >= 2:
        if ctx.is_group:
            key = protection.lock_key(" ".join(ctx.words[1:]))
            if key:
                if not (ctx.is_owner or ctx.is_sudo or is_group_admin(ctx)):
                    ctx.reply("🔒 أوامر الأقفال للمشرفين فقط!")
                    return
                locks = ctx.settings.setdefault("locks", {})
                on = ctx.nwords[0] == "قفل"
                if key == "all":
                    locks["all"] = on
                    ctx.tg.mute_all(ctx.chat_id, on)
                else:
                    locks[key] = on
                ctx.dirty = ctx.force_save = True
                name = protection.LOCK_NAMES_AR.get(key, key)
                ctx.reply(f"{'🔒 تم قفل' if on else '🔓 تم فتح'} <b>{name}</b>.")
                return

    # أوامر المطور
    if owner_commands(ctx):
        ctx.handled = True
        ctx.force_save = True
        return

    # الوحدات
    for module in (menus, replies, admin, economy, social, features, fun, moregames, games, music, tools, moretools, islam, smart):
        if module.handle(ctx):
            ctx.handled = True
            if ctx.is_group:
                ctx.force_save = True
            return

    # ردود تلقائية (المخصصة الغنية أولاً ثم المدمجة)
    if ctx.settings.get("on", True):
        if replies.auto_reply(ctx) or fun.auto_reply(ctx):
            ctx.handled = True
            return

    # الخاص: تلميح
    if not ctx.is_group and len(ctx.text) < 60:
        ctx.reply("⚡ أنا <b>Absorbs</b>! اكتب <b>الاوامر</b> 📋 لتشوف كل قوايا، أو <b>يوت اسم أغنية</b> 🎵")


def handle_callback(ctx):
    cq = ctx.update["callback_query"]
    data_str = cq.get("data", "")
    parts = data_str.split(":")
    if not parts:
        return
    # وضع المشرفين يمنع الألعاب والتسلية لغير المشرفين
    if ctx.is_group and ctx.settings.get("admin_only"):
        if not (ctx.is_owner or ctx.is_sudo or is_group_admin(ctx)):
            if parts[0] in ("quiz", "xo", "rps", "yt", "tasbih", "help", "panel", "lock", "set"):
                ctx.tg.answer_callback(cq["id"], "🔒 وضع المشرفين مفعّل — للمشرفين فقط.", alert=True)
                return
    try:
        if parts[0] == "cap":
            protection.handle_captcha_callback(ctx, parts)
        elif parts[0] in ("help", "panel", "lock", "set", "unlockall", "fs", "tasbih"):
            menus.callback(ctx, parts)
        elif parts[0] in ("quiz", "rps", "xo"):
            games.callback(ctx, parts)
        elif parts[0] == "feat":
            features.callback(ctx, parts)
        elif parts[0] == "wiz":
            replies.callback(ctx, parts)
        elif parts[0] == "yt":
            music.callback(ctx, parts)
        else:
            ctx.tg.answer_callback(cq["id"])
    except Exception:
        traceback.print_exc()
        ctx.tg.answer_callback(cq["id"], "⚠️ حدث خطأ، جرّب مجدداً.", alert=False)
    ctx.force_save = True


def handle_my_member(ctx):
    u = ctx.update["my_chat_member"]
    chat = u.get("chat", {})
    new = u.get("new_chat_member", {})
    status = new.get("status")
    if chat.get("type") in ("group", "supergroup"):
        if status in ("administrator", "member"):
            ctx.tg.send(chat["id"], "⚡ <b>Absorbs وصل!</b> 🛡🎮🎵\n\n"
                        "اجعلني مشرفاً بكل الصلاحيات ثم اكتب <b>تفعيل</b>.\n"
                        "اكتب <b>الاوامر</b> لاستكشاف 200+ ميزة 🚀")
        elif status in ("left", "kicked"):
            ctx.state.get("chats", {}).pop(str(chat["id"]), None)
            ctx.dirty = ctx.force_save = True


def owner_commands(ctx):
    # الحالة
    rest = take(ctx, "الحاله", "الحالة", "status")
    if rest is not None:
        if not (ctx.is_owner or ctx.is_sudo):
            ctx.reply("🟢 البوت يعمل بكامل قوته!\n⚡ الاستضافة: Vercel\n📋 اكتب (الاوامر) للمزايا.")
            return True
        chats = ctx.state.get("chats", {})
        users = sum(len(c.get("users", {})) for c in chats.values())
        info = ctx.tg.webhook_info()
        pending = info.get("pending_update_count", 0) if isinstance(info, dict) else "?"
        ctx.reply(f"📊 <b>حالة البوت:</b>\n🟢 يعمل | ⚡ Vercel\n"
                  f"👥 مجموعات/محادثات: {len(chats)}\n👤 مستخدمون مسجلون: {users}\n"
                  f"📥 تحديثات معلقة: {pending}\n💾 التخزين: {'✅ متصل' if ctx.store.ok else '⚠️ غير متصل'}\n"
                  f"🕐 منذ: {time.strftime('%Y-%m-%d', time.gmtime(ctx.state.get('created', 0)))}")
        return True

    rest = take(ctx, "اذاعه", "اذاعة", "broadcast")
    if rest is not None:
        if not need_owner(ctx):
            return True
        if not rest:
            ctx.reply("📢 الاستخدام: اذاعة <النص>")
            return True
        sent = 0
        for cid in list(ctx.state.get("chats", {}).keys())[:300]:
            r = ctx.tg.send(int(cid), f"📢 <b>إعلان من المطور:</b>\n\n{esc(rest)}")
            if not is_error(r):
                sent += 1
            time.sleep(0.05)
        ctx.reply(f"📢 وصلت الإذاعة إلى <b>{sent}</b> محادثة.")
        return True

    rest = take(ctx, "حظر عام", "gban")
    if rest is not None:
        if not need_owner(ctx):
            return True
        target = ctx.reply_msg.get("from") if ctx.reply_msg else None
        if not target and ctx.args and ctx.args[0].lstrip("-").isdigit():
            target = {"id": int(ctx.args[0]), "first_name": ctx.args[0]}
        if not target:
            ctx.reply("↩️ رد على رسالة العضو أو اكتب معرفه الرقمي.")
            return True
        ctx.state.setdefault("gbans", {})[str(target["id"])] = rest or "مخالف عام"
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"🌍 تم الحظر العام لـ {mention(target)} — سيُطرد من كل المجموعات.")
        return True

    rest = take(ctx, "الغاء الحظر العام", "ungban")
    if rest is not None:
        if not need_owner(ctx):
            return True
        target = ctx.reply_msg.get("from") if ctx.reply_msg else None
        uid = str(target["id"]) if target else (ctx.args[0] if ctx.args and ctx.args[0].lstrip("-").isdigit() else None)
        if uid and uid in ctx.state.get("gbans", {}):
            ctx.state["gbans"].pop(uid)
            ctx.dirty = ctx.force_save = True
            ctx.reply("✅ تم إلغاء الحظر العام.")
        else:
            ctx.reply("🔍 غير موجود في قائمة الحظر العام.")
        return True

    rest = take(ctx, "رفع مطور", "تنزيل مطور")
    if rest is not None:
        if not need_owner(ctx):
            return True
        target = ctx.reply_msg.get("from") if ctx.reply_msg else None
        if not target and ctx.args and ctx.args[0].lstrip("-").isdigit():
            target = {"id": int(ctx.args[0]), "first_name": ctx.args[0]}
        if not target:
            ctx.reply("↩️ رد على رسالة المستخدم.")
            return True
        sudo = ctx.state.setdefault("sudo", [])
        if ctx.nwords[0] == "رفع":
            if target["id"] not in sudo:
                sudo.append(target["id"])
            ctx.reply(f"👑 {mention(target)} أصبح مطوراً مساعداً!")
        else:
            if target["id"] in sudo:
                sudo.remove(target["id"])
            ctx.reply(f"✅ تم تنزيل {mention(target)} من المطورين.")
        ctx.dirty = ctx.force_save = True
        return True

    rest = take(ctx, "المطور", "مطور")
    if rest is not None:
        owner = ctx.state.get("owner")
        if owner:
            ctx.reply(f"👑 مطور البوت: <a href='tg://user?id={owner}'>المطور</a>\n🆔 <code>{owner}</code>")
        else:
            ctx.reply("👑 لم يُعيّن مطور بعد — أرسل (مفتاح المطور YOUR_KEY) في الخاص لتصبح المطور.")
        return True

    # استعادة الملكية بمفتاح الإعداد
    rest = take(ctx, "مفتاح المطور")
    if rest is not None:
        import hashlib
        expect = hashlib.sha256(ctx.tg.token.encode()).hexdigest()[:24]
        if rest.strip() == expect:
            ctx.state["owner"] = ctx.user_id
            ctx.dirty = ctx.force_save = True
            ctx.reply(f"👑 <b>مبروك! أصبحت مطور البوت</b> {mention(ctx.user)} 🎉\n\n"
                      "أوامرك الخاصة:\n• <b>اذاعة نص</b> — رسالة لكل المجموعات\n• <b>حظر عام</b> بالرد — حظر من الكل\n"
                      "• <b>رفع مطور</b> بالرد — مطور مساعد\n• <b>الحالة</b> — إحصائيات البوت\n\n"
                      "اكتب (الاوامر) لاستكشاف كل شيء 🚀")
        else:
            ctx.reply("🔑 مفتاح غير صحيح.")
        return True

    return False


def handle_inline(ctx):
    iq = ctx.update["inline_query"]
    q = (iq.get("query") or "").strip()
    results = []
    try:
        if q:
            try:
                songs = music._yt_search(q, 4)
                for i, s in enumerate(songs):
                    results.append({
                        "type": "article", "id": f"yt{i}", "title": s["title"][:60],
                        "description": f"🎵 {s['channel'][:40]} — اضغط للإرسال",
                        "input_message_content": {"message_text": f"🎵 <b>{esc(s['title'])}</b>\n▶️ {s['url']}\n\n⚡ أرسلها في مجموعة البوت لتحميلها: يوت {esc(s['title'][:40])}",
                                                  "parse_mode": "HTML"},
                        "reply_markup": {"inline_keyboard": [[{"text": "▶️ يوتيوب", "url": s["url"]}]]},
                    })
            except Exception:
                pass
            from .fun import decorate
            results.append({"type": "article", "id": "dec", "title": f"✨ زخرفة: {q[:30]}",
                            "description": "اضغط لإرسال النص مزخرفاً",
                            "input_message_content": {"message_text": decorate(q[:50]), "parse_mode": "HTML"}})
        if not results:
            results.append({"type": "article", "id": "help", "title": "⚡ Absorbs — البوت الأسطوري",
                            "description": "حماية + أغاني + ألعاب + 200 ميزة",
                            "input_message_content": {"message_text": "⚡ <b>Absorbs Bot</b>\n🛡 حماية 🎵 أغاني 🎮 ألعاب\nاكتب (الاوامر) في مجموعة البوت 🚀", "parse_mode": "HTML"}})
        ctx.tg.answer_inline(iq["id"], results[:10], cache=30)
    except Exception:
        traceback.print_exc()
