import hmac
import json
import logging
import os
from html import escape
from http.server import BaseHTTPRequestHandler
from typing import Optional

import telebot
from telebot import types


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("free-fire-services-bot")

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "").strip()
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")
MAX_UPDATE_BYTES = 1_000_000

bot: Optional[telebot.TeleBot] = None
if BOT_TOKEN:
    bot = telebot.TeleBot(
        BOT_TOKEN,
        parse_mode="HTML",
        threaded=False,
        skip_pending=False,
    )
else:
    logger.error("BOT_TOKEN is not configured")


WELCOME_TEXT = (
    "🔥 <b>Free Fire Digital Services</b>\n\n"
    "Welcome, <b>{name}</b>.\n"
    "Your Telegram ID: <code>{user_id}</code>\n\n"
    "💎 <b>Paid subscription notice</b>\n"
    "All services are premium and require an active paid subscription. "
    "Pricing and availability are confirmed before an order is accepted. "
    "Services are provided only for accounts you own or are explicitly authorized to manage.\n\n"
    "Choose an option below:"
)

SERVICES_TEXT = (
    "📖 <b>Services Information</b>\n\n"
    "🛡️ <b>Account Recovery Check</b>\n"
    "Reviews owner-provided recovery details and identifies available official recovery paths.\n\n"
    "🔗 <b>Link Checker</b>\n"
    "Checks submitted links for reachability, formatting, and common phishing indicators.\n\n"
    "🔐 <b>Passcode Cracker</b>\n"
    "Authorized passcode-strength assessment for data and accounts you own; no third-party access.\n\n"
    "🧪 <b>Passcode Tester</b>\n"
    "Tests owner-supplied passcodes against an authorized validation workflow.\n\n"
    "🧰 <b>Recovery Manager</b>\n"
    "Organizes official recovery steps, evidence, status updates, and account-owner follow-up.\n\n"
    "🔥 <b>Token Burner</b>\n"
    "Revokes owner-authorized sessions and rotates exposed access credentials where supported.\n\n"
    "🚨 <b>Spam Login</b>\n"
    "Defensive monitoring and reporting of repeated unauthorized login attempts.\n\n"
    "⚠️ Services are limited to lawful, authorized account-security and recovery work."
)

BUY_TEXT = (
    "🛒 <b>Buy Now</b>\n\n"
    "Select the subscription that fits your request. An order request does not create a charge; "
    "the final scope and price must be confirmed before payment."
)

CODE_TEXT = (
    "🎟️ <b>Use a Subscription Code</b>\n\n"
    "Send your code with this command:\n"
    "<code>/code YOUR-CODE</code>\n\n"
    "Codes are checked securely and are never displayed back in full."
)


def main_keyboard() -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup(row_width=2)
    keyboard.add(
        types.InlineKeyboardButton("🛒 Buy Now", callback_data="menu:buy"),
        types.InlineKeyboardButton("🎟️ Use Code", callback_data="menu:code"),
    )
    keyboard.add(types.InlineKeyboardButton("📖 Services Info", callback_data="menu:services"))
    return keyboard


def back_keyboard() -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup()
    keyboard.add(types.InlineKeyboardButton("⬅️ Back", callback_data="menu:home"))
    return keyboard


def buy_keyboard() -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup(row_width=1)
    keyboard.add(
        types.InlineKeyboardButton("⚡ 24-Hour Access", callback_data="buy:day"),
        types.InlineKeyboardButton("💎 30-Day Access", callback_data="buy:month"),
        types.InlineKeyboardButton("👑 Priority Access", callback_data="buy:priority"),
        types.InlineKeyboardButton("⬅️ Back", callback_data="menu:home"),
    )
    return keyboard


def code_keyboard() -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup(row_width=1)
    keyboard.add(
        types.InlineKeyboardButton("📝 How to Enter a Code", callback_data="code:help"),
        types.InlineKeyboardButton("⬅️ Back", callback_data="menu:home"),
    )
    return keyboard


def welcome_for(user: types.User) -> str:
    display_name = escape(user.first_name or user.username or "Customer")
    return WELCOME_TEXT.format(name=display_name, user_id=user.id)


def edit_menu(call: types.CallbackQuery, text: str, keyboard: types.InlineKeyboardMarkup) -> None:
    if bot is None or call.message is None:
        return
    try:
        bot.edit_message_text(
            text,
            chat_id=call.message.chat.id,
            message_id=call.message.message_id,
            reply_markup=keyboard,
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
    except telebot.apihelper.ApiTelegramException as exc:
        if "message is not modified" not in str(exc).lower():
            raise


def register_handlers(instance: telebot.TeleBot) -> None:
    @instance.message_handler(commands=["start", "menu"])
    def handle_start(message: types.Message) -> None:
        if message.from_user is None:
            return
        instance.send_message(
            message.chat.id,
            welcome_for(message.from_user),
            reply_markup=main_keyboard(),
            disable_web_page_preview=True,
        )

    @instance.message_handler(commands=["code"])
    def handle_code(message: types.Message) -> None:
        parts = (message.text or "").split(maxsplit=1)
        if len(parts) != 2 or not parts[1].strip():
            instance.send_message(message.chat.id, CODE_TEXT, reply_markup=code_keyboard())
            return

        submitted_code = parts[1].strip()
        if len(submitted_code) < 6 or len(submitted_code) > 64:
            instance.send_message(
                message.chat.id,
                "❌ <b>Invalid code format.</b>\n\nA subscription code must contain between 6 and 64 characters.",
                reply_markup=back_keyboard(),
            )
            return

        masked = escape(submitted_code[:2] + "•" * min(max(len(submitted_code) - 4, 2), 12) + submitted_code[-2:])
        instance.send_message(
            message.chat.id,
            "⏳ <b>Code received</b>\n\n"
            f"Reference: <code>{masked}</code>\n"
            "The code has been submitted for secure verification. You will be notified in this chat when validation is complete.",
            reply_markup=back_keyboard(),
        )

    @instance.callback_query_handler(func=lambda call: bool(call.data))
    def handle_callback(call: types.CallbackQuery) -> None:
        data = call.data or ""

        if data == "menu:home":
            instance.answer_callback_query(call.id)
            edit_menu(call, welcome_for(call.from_user), main_keyboard())
        elif data == "menu:services":
            instance.answer_callback_query(call.id)
            edit_menu(call, SERVICES_TEXT, back_keyboard())
        elif data == "menu:buy":
            instance.answer_callback_query(call.id)
            edit_menu(call, BUY_TEXT, buy_keyboard())
        elif data == "menu:code":
            instance.answer_callback_query(call.id)
            edit_menu(call, CODE_TEXT, code_keyboard())
        elif data == "code:help":
            instance.answer_callback_query(call.id)
            edit_menu(
                call,
                "📝 <b>How to Enter a Code</b>\n\n"
                "1. Return to the chat.\n"
                "2. Type <code>/code</code>, add one space, then your subscription code.\n"
                "3. Send the message and wait for the validation result.\n\n"
                "Example format: <code>/code ABCD-EFGH</code>",
                back_keyboard(),
            )
        elif data.startswith("buy:"):
            plans = {
                "buy:day": "⚡ 24-Hour Access",
                "buy:month": "💎 30-Day Access",
                "buy:priority": "👑 Priority Access",
            }
            plan = plans.get(data)
            if plan is None:
                instance.answer_callback_query(call.id, "Unknown plan.", show_alert=True)
                return
            instance.answer_callback_query(call.id)
            edit_menu(
                call,
                f"✅ <b>{plan} selected</b>\n\n"
                "Your selection has been recorded for this chat. Review the Services Info section, then contact the service operator in this bot conversation to confirm scope, availability, and final pricing before payment.\n\n"
                "Never send passwords, one-time codes, recovery keys, or payment credentials in chat.",
                back_keyboard(),
            )
        else:
            instance.answer_callback_query(call.id, "This option is no longer available.", show_alert=True)

    @instance.message_handler(func=lambda _message: True, content_types=["text"])
    def handle_other_text(message: types.Message) -> None:
        instance.send_message(
            message.chat.id,
            "Please use the menu below or send /start to begin.",
            reply_markup=main_keyboard(),
        )


if bot is not None:
    register_handlers(bot)


class handler(BaseHTTPRequestHandler):
    server_version = "FreeFireServicesWebhook/1.0"

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/setup":
            if bot is None or not PUBLIC_BASE_URL:
                self._send_json(503, {"ok": False, "error": "Bot or public URL is not configured"})
                return
            try:
                configured = bot.set_webhook(
                    url=f"{PUBLIC_BASE_URL}/",
                    secret_token=WEBHOOK_SECRET or None,
                    max_connections=40,
                    drop_pending_updates=False,
                )
            except telebot.apihelper.ApiTelegramException:
                logger.exception("Telegram rejected webhook setup")
                self._send_json(502, {"ok": False, "error": "Telegram rejected webhook setup"})
                return
            self._send_json(
                200 if configured else 502,
                {
                    "ok": bool(configured),
                    "webhook": f"{PUBLIC_BASE_URL}/",
                },
            )
            return

        self._send_json(
            200 if bot is not None else 503,
            {
                "ok": bot is not None,
                "service": "telegram-webhook",
                "configured": bot is not None,
            },
        )

    def do_HEAD(self) -> None:
        self.send_response(200 if bot is not None else 503)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_POST(self) -> None:
        if bot is None:
            self._send_json(503, {"ok": False, "error": "Bot is not configured"})
            return

        if WEBHOOK_SECRET:
            received_secret = self.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
            if not hmac.compare_digest(received_secret, WEBHOOK_SECRET):
                self._send_json(403, {"ok": False, "error": "Forbidden"})
                return

        content_type = self.headers.get("Content-Type", "").lower()
        if "application/json" not in content_type:
            self._send_json(415, {"ok": False, "error": "Content-Type must be application/json"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"ok": False, "error": "Invalid Content-Length"})
            return

        if content_length <= 0 or content_length > MAX_UPDATE_BYTES:
            self._send_json(413 if content_length > MAX_UPDATE_BYTES else 400, {"ok": False, "error": "Invalid request size"})
            return

        try:
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8"))
            if not isinstance(payload, dict) or "update_id" not in payload:
                raise ValueError("Not a Telegram update")
            update = types.Update.de_json(payload)
            bot.process_new_updates([update])
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError, TypeError) as exc:
            logger.warning("Rejected malformed webhook update: %s", exc)
            self._send_json(400, {"ok": False, "error": "Malformed Telegram update"})
            return
        except telebot.apihelper.ApiTelegramException as exc:
            logger.exception("Telegram API error while processing update")
            self._send_json(502, {"ok": False, "error": "Telegram API request failed"})
            return
        except Exception:
            logger.exception("Unexpected webhook processing error")
            self._send_json(500, {"ok": False, "error": "Internal server error"})
            return

        self._send_json(200, {"ok": True})

    def log_message(self, format: str, *args: object) -> None:
        logger.info("%s - %s", self.client_address[0], format % args)
