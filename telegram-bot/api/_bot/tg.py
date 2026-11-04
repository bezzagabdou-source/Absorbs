# -*- coding: utf-8 -*-
"""عميل Telegram Bot API خفيف وسريع."""
import io
import json
import time
import requests

API = "https://api.telegram.org"
FILE_API = "https://api.telegram.org/file/bot"


class TG:
    def __init__(self, token):
        self.token = token
        self.base = f"{API}/bot{token}"
        self.s = requests.Session()
        self.me = None

    def call(self, method, payload=None, timeout=25, files=None):
        try:
            if files is not None:
                r = self.s.post(f"{self.base}/{method}", data=payload or {}, files=files, timeout=timeout)
            else:
                r = self.s.post(f"{self.base}/{method}", json=payload or {}, timeout=timeout)
            data = r.json()
            if data.get("ok"):
                return data.get("result")
            # إعادة محاولة واحدة عند تحديد المعدل
            if r.status_code == 429:
                wait = min(int(data.get("parameters", {}).get("retry_after", 2)), 8)
                time.sleep(wait + 0.3)
                r = self.s.post(f"{self.base}/{method}", json=payload or {}, timeout=timeout)
                data = r.json()
                if data.get("ok"):
                    return data.get("result")
            return {"_error": data.get("description", "unknown"), "_code": data.get("error_code")}
        except Exception as e:
            return {"_error": str(e)}

    # ---------- إرسال ----------
    def send(self, chat_id, text, reply_to=None, markup=None, preview=False, protect=False):
        p = {"chat_id": chat_id, "text": text[:4090], "parse_mode": "HTML",
             "disable_web_page_preview": not preview}
        if reply_to:
            p["reply_to_message_id"] = reply_to
            p["allow_sending_without_reply"] = True
        if markup:
            p["reply_markup"] = json.dumps(markup, ensure_ascii=False)
        if protect:
            p["protect_content"] = True
        res = self.call("sendMessage", p)
        if isinstance(res, dict) and res.get("_error") and "parse" in str(res.get("_error", "")).lower():
            p.pop("parse_mode", None)
            res = self.call("sendMessage", p)
        return res

    def edit(self, chat_id, message_id, text, markup=None):
        p = {"chat_id": chat_id, "message_id": message_id, "text": text[:4090],
             "parse_mode": "HTML", "disable_web_page_preview": True}
        if markup:
            p["reply_markup"] = json.dumps(markup, ensure_ascii=False)
        return self.call("editMessageText", p)

    def edit_markup(self, chat_id, message_id, markup):
        return self.call("editMessageReplyMarkup", {
            "chat_id": chat_id, "message_id": message_id,
            "reply_markup": json.dumps(markup, ensure_ascii=False)})

    def delete(self, chat_id, message_id):
        return self.call("deleteMessage", {"chat_id": chat_id, "message_id": message_id})

    def answer_callback(self, cq_id, text="", alert=False):
        return self.call("answerCallbackQuery", {
            "callback_query_id": cq_id, "text": text[:190], "show_alert": alert})

    def send_photo(self, chat_id, photo, caption=None, reply_to=None, markup=None):
        p = {"chat_id": chat_id, "caption": (caption or "")[:1020], "parse_mode": "HTML"}
        if reply_to:
            p["reply_to_message_id"] = reply_to
        if markup:
            p["reply_markup"] = json.dumps(markup, ensure_ascii=False)
        if isinstance(photo, (bytes, io.BytesIO)):
            bio = photo if isinstance(photo, io.BytesIO) else io.BytesIO(photo)
            p.pop("parse_mode", None)
            return self.call("sendPhoto", p, files={"photo": ("photo.jpg", bio)}, timeout=60)
        p["photo"] = photo
        return self.call("sendPhoto", p, timeout=45)

    def send_audio(self, chat_id, audio, title=None, performer=None, caption=None,
                   thumb=None, reply_to=None, duration=None):
        p = {"chat_id": chat_id, "caption": (caption or "")[:1020], "parse_mode": "HTML"}
        if title:
            p["title"] = title[:64]
        if performer:
            p["performer"] = performer[:64]
        if duration:
            p["duration"] = int(duration)
        if reply_to:
            p["reply_to_message_id"] = reply_to
            p["allow_sending_without_reply"] = True
        if isinstance(audio, (bytes, io.BytesIO)):
            bio = audio if isinstance(audio, io.BytesIO) else io.BytesIO(audio)
            files = {"audio": ("audio.mp3", bio, "audio/mpeg")}
            if thumb and isinstance(thumb, bytes):
                files["thumbnail"] = ("thumb.jpg", io.BytesIO(thumb), "image/jpeg")
            return self.call("sendAudio", p, files=files, timeout=180)
        p["audio"] = audio
        if thumb and isinstance(thumb, str):
            p["thumbnail"] = thumb
        return self.call("sendAudio", p, timeout=120)

    def send_voice(self, chat_id, voice, caption=None, reply_to=None):
        p = {"chat_id": chat_id}
        if caption:
            p["caption"] = caption[:1020]
            p["parse_mode"] = "HTML"
        if reply_to:
            p["reply_to_message_id"] = reply_to
        if isinstance(voice, (bytes, io.BytesIO)):
            bio = voice if isinstance(voice, io.BytesIO) else io.BytesIO(voice)
            return self.call("sendVoice", p, files={"voice": ("voice.mp3", bio, "audio/mpeg")}, timeout=90)
        p["voice"] = voice
        return self.call("sendVoice", p, timeout=60)

    def send_sticker(self, chat_id, sticker, reply_to=None):
        p = {"chat_id": chat_id}
        if reply_to:
            p["reply_to_message_id"] = reply_to
        if isinstance(sticker, (bytes, io.BytesIO)):
            bio = sticker if isinstance(sticker, io.BytesIO) else io.BytesIO(sticker)
            return self.call("sendSticker", p, files={"sticker": ("sticker.webp", bio, "image/webp")}, timeout=60)
        p["sticker"] = sticker
        return self.call("sendSticker", p)

    def send_dice(self, chat_id, emoji="🎲", reply_to=None):
        p = {"chat_id": chat_id, "emoji": emoji}
        if reply_to:
            p["reply_to_message_id"] = reply_to
        return self.call("sendDice", p)

    def send_action(self, chat_id, action="typing"):
        return self.call("sendChatAction", {"chat_id": chat_id, "action": action})

    # ---------- إدارة ----------
    def get_me(self):
        if not self.me:
            self.me = self.call("getMe")
        return self.me

    def get_chat(self, chat_id):
        return self.call("getChat", {"chat_id": chat_id})

    def get_admins(self, chat_id):
        return self.call("getChatAdministrators", {"chat_id": chat_id})

    def get_member(self, chat_id, user_id):
        return self.call("getChatMember", {"chat_id": chat_id, "user_id": user_id})

    def get_member_count(self, chat_id):
        return self.call("getChatMemberCount", {"chat_id": chat_id})

    def ban(self, chat_id, user_id, until=None, revoke=True):
        p = {"chat_id": chat_id, "user_id": user_id, "revoke_messages": revoke}
        if until:
            p["until_date"] = int(until)
        return self.call("banChatMember", p)

    def unban(self, chat_id, user_id):
        return self.call("unbanChatMember", {"chat_id": chat_id, "user_id": user_id, "only_if_banned": True})

    def restrict(self, chat_id, user_id, perms, until=None):
        p = {"chat_id": chat_id, "user_id": user_id,
             "permissions": json.dumps(perms), "use_independent_chat_permissions": False}
        if until:
            p["until_date"] = int(until)
        return self.call("restrictChatMember", p)

    def promote(self, chat_id, user_id, title="", perms=None):
        p = {"chat_id": chat_id, "user_id": user_id, "title": title[:16]}
        base = perms or {"can_manage_chat": True, "can_delete_messages": True,
                         "can_restrict_members": True, "can_invite_users": True,
                         "can_pin_messages": True, "can_manage_video_chats": False,
                         "is_anonymous": False, "can_promote_members": False,
                         "can_change_info": False}
        p.update(base)
        return self.call("promoteChatMember", p)

    def demote(self, chat_id, user_id):
        return self.promote(chat_id, user_id, "", {k: False for k in
                ["can_manage_chat", "can_delete_messages", "can_restrict_members", "can_invite_users",
                 "can_pin_messages", "can_manage_video_chats", "is_anonymous", "can_promote_members",
                 "can_change_info", "can_post_messages", "can_edit_messages"]})

    def set_title(self, chat_id, user_id, title):
        return self.call("setChatAdministratorCustomTitle", {"chat_id": chat_id, "user_id": user_id, "title": title[:16]})

    def pin(self, chat_id, message_id, notify=False):
        return self.call("pinChatMessage", {"chat_id": chat_id, "message_id": message_id, "disable_notification": not notify})

    def unpin(self, chat_id, message_id=None):
        p = {"chat_id": chat_id}
        if message_id:
            p["message_id"] = message_id
        return self.call("unpinChatMessage", p)

    def unpin_all(self, chat_id):
        return self.call("unpinAllChatMessages", {"chat_id": chat_id})

    def set_permissions(self, chat_id, perms, independent=False):
        return self.call("setChatPermissions", {"chat_id": chat_id, "permissions": json.dumps(perms),
                                                "use_independent_chat_permissions": independent})

    def mute_all(self, chat_id, locked=True):
        """قفل/فتح الدردشة لكل الأعضاء عبر أذونات المجموعة."""
        perms = {"can_send_messages": not locked, "can_send_audios": not locked,
                 "can_send_documents": not locked, "can_send_photos": not locked,
                 "can_send_videos": not locked, "can_send_video_notes": not locked,
                 "can_send_voice_notes": not locked, "can_send_polls": not locked,
                 "can_send_other_messages": not locked, "can_add_web_page_previews": not locked,
                 "can_invite_users": not locked, "can_pin_messages": not locked,
                 "can_change_info": False}
        return self.set_permissions(chat_id, perms, independent=True)

    def export_invite(self, chat_id):
        return self.call("exportChatInviteLink", {"chat_id": chat_id})

    def create_invite(self, chat_id, name="", limit=0, expire=None):
        p = {"chat_id": chat_id}
        if name:
            p["name"] = name[:32]
        if limit:
            p["member_limit"] = limit
        if expire:
            p["expire_date"] = int(expire)
        return self.call("createChatInviteLink", p)

    def leave(self, chat_id):
        return self.call("leaveChat", {"chat_id": chat_id})

    def get_file(self, file_id):
        return self.call("getFile", {"file_id": file_id})

    def download(self, file_path, max_bytes=50 * 1024 * 1024):
        try:
            r = self.s.get(f"{FILE_API}{self.token}/{file_path}", timeout=60, stream=True)
            buf = io.BytesIO()
            total = 0
            for chunk in r.iter_content(65536):
                total += len(chunk)
                if total > max_bytes:
                    return None
                buf.write(chunk)
            return buf.getvalue()
        except Exception:
            return None

    def set_webhook(self, url, secret, drop=False):
        return self.call("setWebhook", {
            "url": url, "secret_token": secret, "max_connections": 8,
            "drop_pending_updates": drop,
            "allowed_updates": json.dumps(["message", "edited_message", "callback_query",
                                           "inline_query", "chat_member", "my_chat_member"])})

    def webhook_info(self):
        return self.call("getWebhookInfo")

    def set_commands(self, commands, scope=None, lang="ar"):
        p = {"commands": json.dumps(commands, ensure_ascii=False), "language_code": lang}
        if scope:
            p["scope"] = json.dumps(scope)
        return self.call("setMyCommands", p)

    def set_description(self, text, short=None):
        self.call("setMyDescription", {"description": text[:512], "language_code": "ar"})
        if short:
            self.call("setMyShortDescription", {"short_description": short[:120], "language_code": "ar"})

    def answer_inline(self, iq_id, results, cache=10, personal=True):
        return self.call("answerInlineQuery", {
            "inline_query_id": iq_id, "results": json.dumps(results, ensure_ascii=False),
            "cache_time": cache, "is_personal": personal})
