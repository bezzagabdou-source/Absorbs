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
    "🔥 <b>خدمات فري فاير الرقمية</b>\n\n"
    "مرحباً بك، <b>{name}</b>.\n"
    "معرّف تيليغرام الخاص بك: <code>{user_id}</code>\n\n"
    "💎 <b>تنبيه الاشتراك المدفوع</b>\n"
    "جميع الخدمات مدفوعة وتتطلب اشتراكاً فعالاً. "
    "يتم تأكيد السعر والتوفر قبل قبول أي طلب. "
    "تُقدَّم الخدمات فقط للحسابات التي تملكها أو لديك تفويض صريح لإدارتها.\n\n"
    "اختر من القائمة التالية:"
)

SERVICES_TEXT = (
    "📖 <b>معلومات الخدمات</b>\n\n"
    "🛡️ <b>فحص استرجاع الحساب</b>\n"
    "مراجعة بيانات الاسترجاع المقدمة من المالك وتحديد مسارات الاسترجاع الرسمية المتاحة.\n\n"
    "🔗 <b>فاحص الروابط</b>\n"
    "فحص الرابط والتأكد من صيغته وإمكانية الوصول إليه ورصد مؤشرات التصيد الشائعة.\n\n"
    "🔐 <b>فحص قوة رمز المرور</b>\n"
    "تقييم أمني مصرح به لقوة رمز المرور في الحسابات والبيانات التي تملكها فقط.\n\n"
    "🧪 <b>اختبار رمز المرور</b>\n"
    "اختبار رموز المرور التي يقدمها المالك ضمن آلية تحقق مصرح بها.\n\n"
    "🧰 <b>مدير الاسترجاع</b>\n"
    "تنظيم خطوات الاسترجاع الرسمية والأدلة وتحديثات الحالة ومتابعة مالك الحساب.\n\n"
    "🔥 <b>إلغاء الرموز والجلسات</b>\n"
    "إلغاء الجلسات المصرح بها وتغيير بيانات الوصول المكشوفة عندما تكون الخاصية متاحة.\n\n"
    "🚨 <b>مراقبة محاولات الدخول</b>\n"
    "رصد محاولات تسجيل الدخول غير المصرح بها والمتكررة والإبلاغ عنها.\n\n"
    "⚠️ تقتصر الخدمات على أعمال الحماية والاسترجاع القانونية والمصرح بها."
)

BUY_TEXT = (
    "🛒 <b>اشترِ الآن</b>\n\n"
    "اختر الاشتراك المناسب لطلبك. اختيار الخطة لا يؤدي إلى الخصم مباشرة؛ "
    "يجب تأكيد تفاصيل الخدمة والسعر النهائي قبل الدفع."
)

CODE_TEXT = (
    "🎟️ <b>استخدام رمز اشتراك</b>\n\n"
    "أرسل رمزك باستعمال الأمر التالي:\n"
    "<code>/code رمز-الاشتراك</code>\n\n"
    "يتم التحقق من الرموز بأمان ولا يتم عرضها كاملةً مرة أخرى."
)


def main_keyboard() -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup(row_width=2)
    keyboard.add(
        types.InlineKeyboardButton("🛒 اشترِ الآن", callback_data="menu:buy"),
        types.InlineKeyboardButton("🎟️ استخدام رمز", callback_data="menu:code"),
    )
    keyboard.add(types.InlineKeyboardButton("📖 معلومات الخدمات", callback_data="menu:services"))
    return keyboard


def back_keyboard() -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup()
    keyboard.add(types.InlineKeyboardButton("⬅️ رجوع", callback_data="menu:home"))
    return keyboard


def buy_keyboard() -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup(row_width=1)
    keyboard.add(
        types.InlineKeyboardButton("⚡ اشتراك 24 ساعة", callback_data="buy:day"),
        types.InlineKeyboardButton("💎 اشتراك 30 يوماً", callback_data="buy:month"),
        types.InlineKeyboardButton("👑 اشتراك الأولوية", callback_data="buy:priority"),
        types.InlineKeyboardButton("⬅️ رجوع", callback_data="menu:home"),
    )
    return keyboard


def code_keyboard() -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup(row_width=1)
    keyboard.add(
        types.InlineKeyboardButton("📝 طريقة إدخال الرمز", callback_data="code:help"),
        types.InlineKeyboardButton("⬅️ رجوع", callback_data="menu:home"),
    )
    return keyboard


def welcome_for(user: types.User) -> str:
    display_name = escape(user.first_name or user.username or "مستخدم")
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
                "❌ <b>صيغة الرمز غير صحيحة.</b>\n\nيجب أن يتكون رمز الاشتراك من 6 إلى 64 حرفاً.",
                reply_markup=back_keyboard(),
            )
            return

        masked = escape(submitted_code[:2] + "•" * min(max(len(submitted_code) - 4, 2), 12) + submitted_code[-2:])
        instance.send_message(
            message.chat.id,
            "⏳ <b>تم استلام الرمز</b>\n\n"
            f"المرجع: <code>{masked}</code>\n"
            "تم إرسال الرمز للتحقق الآمن. ستصلك النتيجة في هذه المحادثة بعد اكتمال التحقق.",
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
                "📝 <b>طريقة إدخال الرمز</b>\n\n"
                "1. ارجع إلى المحادثة.\n"
                "2. اكتب <code>/code</code> ثم مسافة واحدة ورمز اشتراكك.\n"
                "3. أرسل الرسالة وانتظر نتيجة التحقق.\n\n"
                "مثال: <code>/code ABCD-EFGH</code>",
                back_keyboard(),
            )
        elif data.startswith("buy:"):
            plans = {
                "buy:day": "⚡ اشتراك 24 ساعة",
                "buy:month": "💎 اشتراك 30 يوماً",
                "buy:priority": "👑 اشتراك الأولوية",
            }
            plan = plans.get(data)
            if plan is None:
                instance.answer_callback_query(call.id, "الخطة غير معروفة.", show_alert=True)
                return
            instance.answer_callback_query(call.id)
            edit_menu(
                call,
                f"✅ <b>تم اختيار {plan}</b>\n\n"
                "تم تسجيل اختيارك في هذه المحادثة. راجع قسم معلومات الخدمات ثم تواصل مع مسؤول الخدمة داخل البوت لتأكيد التفاصيل والتوفر والسعر النهائي قبل الدفع.\n\n"
                "لا ترسل كلمات المرور أو رموز التحقق المؤقتة أو مفاتيح الاسترجاع أو بيانات الدفع داخل المحادثة.",
                back_keyboard(),
            )
        else:
            instance.answer_callback_query(call.id, "هذا الخيار لم يعد متاحاً.", show_alert=True)

    @instance.message_handler(func=lambda _message: True, content_types=["text"])
    def handle_other_text(message: types.Message) -> None:
        instance.send_message(
            message.chat.id,
            "استعمل القائمة أدناه أو أرسل /start للبدء.",
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
        webhook_configured = False
        if bot is not None and PUBLIC_BASE_URL:
            try:
                webhook_configured = bool(
                    bot.set_webhook(
                        url=f"{PUBLIC_BASE_URL}/",
                        secret_token=WEBHOOK_SECRET or None,
                        max_connections=40,
                        drop_pending_updates=False,
                    )
                )
            except telebot.apihelper.ApiTelegramException:
                logger.exception("Telegram rejected webhook setup")

        self._send_json(
            200 if bot is not None else 503,
            {
                "ok": bot is not None,
                "service": "telegram-webhook",
                "configured": bot is not None,
                "webhook_configured": webhook_configured,
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
