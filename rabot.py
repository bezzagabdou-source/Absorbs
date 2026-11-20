#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
 R1HIMO SHOP  —  Telegram Digital Products Bot + Owner Control Panel
 --------------------------------------------------------------------------
 ملف واحد فقط (Single Source File) — يعمل بمكتبات بايثون القياسية فقط
 Python 3.8+  |  لا يحتاج أي pip install
 --------------------------------------------------------------------------
 التشغيل:
     export BOT_TOKEN="123456:ABC..."
     export OWNER_ID="123456789"
     export PANEL_PASSWORD="كلمة-مرور-قوية"
     python3 rabot.py

 المتغيرات الاختيارية:
     PORT            منفذ لوحة التحكم (افتراضي 8080)
     HOST            عنوان الاستماع (افتراضي 0.0.0.0)
     DB_PATH         مسار قاعدة البيانات (افتراضي rabot_data/rabot.db)
     PUBLIC_URL      رابط عام للوحة (لعرض روابط الدخول السريع)
     BOT_API_BASE    افتراضي https://api.telegram.org
 --------------------------------------------------------------------------
 المزايا:
   * بوت متجر منتجات رقمية: تعدد اللغات (عربي/إنجليزي)، سلة شراء فورية،
     تسليم تلقائي من المخزون، محفظة، شحن عبر Binance Pay، إحالات، إحصائيات.
   * أزرار ملونة (success/danger/primary) مطابقة للتصميم الأصلي.
   * لوحة تحكم كاملة للمالك فقط: كل زر، كل منتج، كل تصنيف، كل نص،
     كل إعداد، المستخدمون، الطلبات، الشحنات، البث الجماعي.
================================================================================
"""

import base64
import hashlib
import hmac
import html
import json
import logging
import math
import mimetypes
import os
import random
import re
import secrets
import socket
import sqlite3
import string
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APP_NAME = "R1HIMO SHOP"
APP_VERSION = "1.0.0"

BASE_DIR = os.path.dirname(os.path.abspath(__file__)) or os.getcwd()
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "rabot_data", "rabot.db")

def _load_dotenv():
    """Read KEY=VALUE from a .env next to the script (never overrides real env)."""
    path = os.path.join(BASE_DIR, ".env")
    if not os.path.isfile(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val
    except Exception:
        pass


_load_dotenv()

BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()
OWNER_ID_ENV = os.environ.get("OWNER_ID", "6818164226").strip()
PANEL_PASSWORD_ENV = os.environ.get("PANEL_PASSWORD", "").strip()
HOST = os.environ.get("HOST", "0.0.0.0").strip() or "0.0.0.0"
PORT = int(os.environ.get("PORT", "8080") or 8080)
DB_PATH = os.environ.get("DB_PATH", DEFAULT_DB_PATH).strip() or DEFAULT_DB_PATH
PUBLIC_URL = os.environ.get("PUBLIC_URL", "").strip().rstrip("/")
BOT_API_BASE = os.environ.get("BOT_API_BASE", "https://api.telegram.org").strip().rstrip("/")

CURRENCY = "$"

# Placeholder stock line written once at first run so every stock product is
# immediately sellable/deliverable. The owner replaces these from
# «المنتجات ← المخزون» with the real accounts/links.
DEMO_STOCK = "DEMO-ITEM-{n} | {name}"

# ============================================================================
#  LOGGING
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("rabot")
try:  # make Arabic log lines safe on odd terminals
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass


# ============================================================================
#  SMALL UTILITIES
# ============================================================================

def now_ts():
    return int(time.time())


def ts_str(ts=None):
    try:
        return datetime.fromtimestamp(int(ts or now_ts()), tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return "-"


def ts_from_iso(value, default=""):
    """ISO timestamp -> 'YYYY-MM-DD HH:MM' (safe for every screen)."""
    if not value:
        return default
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return default or str(value)[:16]


def esc(value):
    """Escape user content for Telegram HTML parse mode."""
    return html.escape("" if value is None else str(value), quote=False)


def money(value, currency=None):
    """12.5 -> $12.50  (design shows always 2 decimals)"""
    cur = CURRENCY if currency is None else currency
    try:
        return "%s%.2f" % (cur, float(value))
    except Exception:
        return "%s0.00" % cur


def to_int(value, default=0):
    try:
        return int(float(str(value).strip()))
    except Exception:
        return default


def to_float(value, default=0.0):
    try:
        return float(str(value).strip())
    except Exception:
        return default


def as_bool(value):
    return str(value).strip().lower() in ("1", "true", "yes", "on", "نعم")


def fill(template, mapping):
    """Safe {placeholder} substitution (no KeyError on stray braces)."""
    out = "" if template is None else str(template)
    for key, val in mapping.items():
        out = out.replace("{" + key + "}", "" if val is None else str(val))
    return out


_EMOJI_PREFIX_RE = re.compile(r"^[^0-9A-Za-z\u0600-\u06FF]+", re.UNICODE)


def strip_symbols(text):
    """'🏪 المنتجات' -> 'المنتجات'  (used to match reply-keyboard taps)."""
    return _EMOJI_PREFIX_RE.sub("", (text or "").strip()).strip()


def norm_key(text):
    return re.sub(r"\s+", " ", strip_symbols(text)).strip().lower()


def clip(text, limit=3800):
    text = "" if text is None else str(text)
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def rand_token(n=32):
    return secrets.token_urlsafe(n)


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# ---------------------------------------------------------------------------
#  Password hashing (PBKDF2-HMAC-SHA256, stdlib only)
# ---------------------------------------------------------------------------

PBKDF2_ROUNDS = 200_000


def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return "pbkdf2_sha256$%d$%s$%s" % (
        PBKDF2_ROUNDS,
        base64.b64encode(salt).decode(),
        base64.b64encode(dk).decode(),
    )


def verify_password(password, stored):
    try:
        algo, rounds, salt_b64, hash_b64 = str(stored).split("$")
        if algo != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        dk = hashlib.pbkdf2_hmac("sha256", (password or "").encode("utf-8"), salt, int(rounds))
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


def gen_password(length=12):
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    return "".join(random.choice(alphabet) for _ in range(length))


# ============================================================================
#  DEFAULT CONTENT  (كل نص قابل للتعديل من لوحة التحكم)
# ============================================================================

# النص الترحيبي مطابق تماماً للتصميم الأصلي (يمكن استبداله بالنص العربي من اللوحة)
WELCOME_DEFAULT = (
    "⭐️ Welcome to {store} ⭐️\n"
    "\n"
    "✈️ Your Trusted Digital Products Store!\n"
    "\n"
    "🟢 Available Products:\n"
    "{categories}\n"
    "🌟 And More!\n"
    "\n"
    "📧 For orders and support, contact:\n"
    "@{support}\n"
    "\n"
    "Choose a product from the Menu below and enjoy shopping with {store}!"
)

WELCOME_AR_DEFAULT = (
    "⭐️ مرحباً بك في {store} ⭐️\n"
    "\n"
    "✈️ متجرك الموثوق للمنتجات الرقمية!\n"
    "\n"
    "🟢 المنتجات المتوفرة:\n"
    "{categories}\n"
    "🌟 والمزيد!\n"
    "\n"
    "📧 للطلبات والدعم تواصل معنا:\n"
    "@{support}\n"
    "\n"
    "اختر منتجاً من القائمة بالأسفل واستمتع بالتسوق مع {store}!"
)

HELP_AR_DEFAULT = (
    "ⓘ <b>المساعدة</b>\n"
    "\n"
    "مرحباً بك في <b>{store}</b> 👋\n"
    "\n"
    "<b>كيف أشتري؟</b>\n"
    "1) اضغط <b>🏪 المنتجات</b> واختر المنتج.\n"
    "2) اضغط <b>🛒 شراء الآن</b>.\n"
    "3) إن كان رصيدك كافياً يُسلَّم الطلب فوراً، وإلا اشحن محفظتك أولاً.\n"
    "\n"
    "<b>كيف أشحن الرصيد؟</b>\n"
    "اضغط <b>💳 المحفظة</b> ← <b>شحن الرصيد</b> واتبع خطوات Binance Pay.\n"
    "\n"
    "<b>طرق الدفع المتاحة</b>\n"
    "• Binance Pay (USDT)\n"
    "\n"
    "<b>الدعم الفني</b>\n"
    "تواصل معنا: @{support}"
)

HELP_EN_DEFAULT = (
    "ⓘ <b>Help</b>\n"
    "\n"
    "Welcome to <b>{store}</b> 👋\n"
    "\n"
    "<b>How to buy?</b>\n"
    "1) Tap <b>🏪 Products</b> and pick an item.\n"
    "2) Tap <b>🛒 Buy now</b>.\n"
    "3) A sufficient balance delivers instantly, otherwise top up first.\n"
    "\n"
    "<b>How to top up?</b>\n"
    "Tap <b>💳 Wallet</b> ← <b>Top up</b> and follow the Binance Pay steps.\n"
    "\n"
    "<b>Payment methods</b>\n"
    "• Binance Pay (USDT)\n"
    "\n"
    "<b>Support</b>\n"
    "Contact us: @{support}"
)

POLICY_AR_DEFAULT = (
    "🛡 <b>سياسة البوت</b>\n"
    "\n"
    "<b>1) طبيعة المنتجات</b>\n"
    "جميع المنتجات رقمية (حسابات، روابط، مفاتيح) وتُسلَّم إلكترونياً بعد تأكيد الدفع.\n"
    "\n"
    "<b>2) الاسترجاع</b>\n"
    "لا يمكن استرجاع المنتجات الرقمية بعد تسليمها، إلا إذا كان المنتج معطلاً ولم يُستخدم.\n"
    "\n"
    "<b>3) الرصيد</b>\n"
    "الرصيد المودع غير قابل للاسترجاع نقداً، ويُستخدم للشراء داخل المتجر فقط.\n"
    "\n"
    "<b>4) الاستخدام المسؤول</b>\n"
    "يُمنع استخدام المنتجات في أي نشاط مخالف للقانون أو لشروط المنصة المورِّدة.\n"
    "\n"
    "<b>5) الدعم</b>\n"
    "أي مشكلة في الطلب تُعالج عبر الدعم خلال 24 ساعة: @{support}"
)

POLICY_EN_DEFAULT = (
    "🛡 <b>Bot policy</b>\n"
    "\n"
    "<b>1) Products</b>\n"
    "All products are digital (accounts, links, keys) and delivered electronically once payment is confirmed.\n"
    "\n"
    "<b>2) Refunds</b>\n"
    "Digital products cannot be refunded after delivery, unless the item is faulty and unused.\n"
    "\n"
    "<b>3) Balance</b>\n"
    "Deposited balance is non-withdrawable and usable for purchases inside the store only.\n"
    "\n"
    "<b>4) Responsible use</b>\n"
    "Using products for illegal activity or against supplier terms is forbidden.\n"
    "\n"
    "<b>5) Support</b>\n"
    "Any order issue is handled by support within 24 hours: @{support}"
)

API_AR_DEFAULT = (
    "🧩 <b>خدمات API</b>\n"
    "\n"
    "مفتاح API الخاص بك:\n"
    "<code>{api_key}</code>\n"
    "\n"
    "<b>نقاط النهاية</b>\n"
    "• <code>GET /api/v1/me</code> — بيانات الحساب والرصيد\n"
    "• <code>GET /api/v1/products</code> — قائمة المنتجات المتوفرة\n"
    "• <code>POST /api/v1/order</code> — إنشاء طلب جديد\n"
    "\n"
    "يُرسَل المفتاح في الترويسة: <code>X-API-Key</code>\n"
    "\n"
    "لطلب وصول API تواصل مع: @{support}"
)

API_EN_DEFAULT = (
    "🧩 <b>API services</b>\n"
    "\n"
    "Your API key:\n"
    "<code>{api_key}</code>\n"
    "\n"
    "<b>Endpoints</b>\n"
    "• <code>GET /api/v1/me</code> — account and balance\n"
    "• <code>GET /api/v1/products</code> — available products\n"
    "• <code>POST /api/v1/order</code> — create an order\n"
    "\n"
    "Send the key in the header: <code>X-API-Key</code>\n"
    "\n"
    "Request API access from: @{support}"
)

# نص تعليمات الدفع — مطابق للصور
BINANCE_STEPS_AR = (
    "Binance Pay\n"
    "\n"
    "1) افتح Binance ← Pay ← Transfer\n"
    "2) أرسل أي مبلغ بعملة USDT إلى معرّف Binance Pay\n"
    "3) انسخ معرّف المعاملة (TxID) من الإيصال\n"
    "4) الصق معرّف المعاملة هنا\n"
    "\n"
    "معرّف Binance Pay"
)
BINANCE_STEPS_EN = (
    "Binance Pay\n"
    "\n"
    "1) Open Binance ← Pay ← Transfer\n"
    "2) Send any amount of USDT to the Binance Pay ID\n"
    "3) Copy the transaction ID (TxID) from the receipt\n"
    "4) Paste the transaction ID here\n"
    "\n"
    "Binance Pay ID"
)
BINANCE_TXID_PROMPT_AR = (
    "الصق معرّف Binance (TxID) الآن.\n"
    "ابحث عن TxID في Binance ← Pay ← Transaction History ← افتح التحويل ← انسخ Transaction ID / Order ID.\n"
    "\n"
    "تنتهي هذه الجلسة خلال 30 دقيقة."
)
BINANCE_TXID_PROMPT_EN = (
    "Paste your Binance transaction ID (TxID) now.\n"
    "Find the TxID in Binance ← Pay ← Transaction History ← open the transfer ← copy Transaction ID / Order ID.\n"
    "\n"
    "This session expires in 30 minutes."
)


# ---------------------------------------------------------------------------
#  UI LABELS  (كل زر/عنوان قابل للتعديل من اللوحة عبر lbl_*)
# ---------------------------------------------------------------------------

LABEL_DEFAULTS = {
    "lbl_next":     ("التالي ▶️", "Next ▶️"),
    "lbl_prev":     ("◀️ السابق", "◀️ Previous"),
    "lbl_close":    ("إغلاق ❌", "Close ❌"),
    "lbl_back":     ("🔙 رجوع", "🔙 Back"),
    "lbl_buy":      ("🛒 شراء الآن", "🛒 Buy now"),
    "lbl_confirm":  ("✅ تأكيد الشراء", "✅ Confirm purchase"),
    "lbl_cancel":   ("❌ إلغاء", "❌ Cancel"),
    "lbl_cancelled": ("❌ تم الإلغاء.", "❌ Cancelled."),
    "lbl_main_menu": ("🏠 القائمة الرئيسية", "🏠 Main menu"),
    "lbl_search": ("🔎 البحث", "🔎 Search"),
    "lbl_search_prompt": ("🔎 أرسل اسم المنتج للبحث.", "🔎 Send a product name to search."),
    "lbl_search_title": ("نتائج البحث", "Search results"),
    "lbl_search_done": ("✅ تم البحث.", "✅ Search complete."),
    "lbl_search_empty": ("لا توجد نتائج.", "No results found."),
    "lbl_topup":    ("💳 شحن الرصيد", "💳 Top up"),
    "lbl_orders":   ("🧾 سجل الطلبات", "🧾 My orders"),
    "lbl_binance":  ("🟡 Binance Pay", "🟡 Binance Pay"),
    "lbl_support":  ("📩 الدعم الفني", "📩 Support"),
    "lbl_lang_ar":  ("🇩🇿 العربية", "🇩🇿 العربية"),
    "lbl_lang_en":  ("🇬🇧 English", "🇬🇧 English"),
    "lbl_in_stock": ("متوفر", "in stock"),
    "lbl_out":      ("غير متوفر", "out of stock"),
    "lbl_unlimited": ("غير محدود", "unlimited"),
    "lbl_page":     ("الصفحة {n}", "Page {n}"),
    "lbl_products_title": ("🛍️ جميع المنتجات", "🛍️ All Products"),
    "lbl_wallet_title":   ("💳 محفظتي", "💳 My wallet"),
    "lbl_profile_title":  ("👤 ملفي الشخصي", "👤 My profile"),
    "lbl_ref_title":      ("🎁 الإحالات", "🎁 Referrals"),
    "lbl_orders_title":   ("🧾 طلباتي", "🧾 My orders"),
    "lbl_withdraw":       ("💸 طلب سحب الأرباح", "💸 Request payout"),
}


def label(key, lang, **kw):
    """Return an editable UI label with settings override."""
    default_ar, default_en = LABEL_DEFAULTS.get(key, ("", ""))
    val_ar = store.get_setting(key + "_ar", default_ar)
    val_en = store.get_setting(key + "_en", default_en)
    val = val_ar if lang == "ar" else val_en
    if not val:
        val = default_en or default_ar or ""
    return fill(val, kw) if kw else val


# ============================================================================
#  DATABASE
# ============================================================================

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS categories (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    name_en   TEXT DEFAULT '',
    icon      TEXT DEFAULT '',
    emoji_id  TEXT DEFAULT '',
    sort      INTEGER DEFAULT 0,
    visible   INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER DEFAULT 0,
    name        TEXT NOT NULL,
    name_en     TEXT DEFAULT '',
    icon        TEXT DEFAULT '',
    emoji_id    TEXT DEFAULT '',
    price       REAL DEFAULT 0,
    stock_mode  TEXT DEFAULT 'auto',      -- auto | unlimited
    stock       INTEGER DEFAULT 0,
    description TEXT DEFAULT '',
    description_en TEXT DEFAULT '',
    feed        TEXT DEFAULT '',          -- legacy manual feed
    color       TEXT DEFAULT 'auto',      -- auto | success | danger | primary | default
    visible     INTEGER DEFAULT 1,
    sort        INTEGER DEFAULT 0,
    sold        INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS stock_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    content    TEXT NOT NULL,
    used       INTEGER DEFAULT 0,
    order_id   INTEGER DEFAULT 0,
    created_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS buttons (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label_ar   TEXT NOT NULL DEFAULT '',
    label_en   TEXT NOT NULL DEFAULT '',
    icon       TEXT DEFAULT '',
    emoji_id   TEXT DEFAULT '',
    color      TEXT DEFAULT 'primary',    -- success | danger | primary | default
    row        INTEGER DEFAULT 0,
    sort       INTEGER DEFAULT 0,
    action     TEXT DEFAULT 'products',
    payload    TEXT DEFAULT '',
    visible    INTEGER DEFAULT 1,
    owner_only INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id       INTEGER UNIQUE NOT NULL,
    username    TEXT DEFAULT '',
    first_name  TEXT DEFAULT '',
    lang        TEXT DEFAULT 'ar',
    balance     REAL DEFAULT 0,
    spent       REAL DEFAULT 0,
    banned      INTEGER DEFAULT 0,
    is_admin    INTEGER DEFAULT 0,
    referrer_id INTEGER DEFAULT 0,
    ref_earnings REAL DEFAULT 0,
    api_key     TEXT DEFAULT '',
    created_at  TEXT DEFAULT '',
    last_seen   TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    product_id  INTEGER NOT NULL,
    product_name TEXT DEFAULT '',
    qty         INTEGER DEFAULT 1,
    unit_price  REAL DEFAULT 0,
    total       REAL DEFAULT 0,
    status      TEXT DEFAULT 'pending',   -- pending | delivered | cancelled | refunded
    delivery    TEXT DEFAULT '',
    note        TEXT DEFAULT '',
    created_at  TEXT DEFAULT '',
    updated_at  TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS deposits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    amount      REAL DEFAULT 0,
    method      TEXT DEFAULT 'binance',
    txid        TEXT DEFAULT '',
    status      TEXT DEFAULT 'pending',   -- pending | approved | rejected
    note        TEXT DEFAULT '',
    created_at  TEXT DEFAULT '',
    reviewed_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS broadcasts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT DEFAULT '',
    sent       INTEGER DEFAULT 0,
    failed     INTEGER DEFAULT 0,
    created_at TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_products_cat   ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_user    ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_user  ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_product  ON stock_items(product_id, used);
"""


def default_settings():
    """All editable settings with their factory values."""
    return {
        # ---- identity ----
        "store_name": "R1HIMO SHOP",
        "support_username": "r1himo_dx",
        "default_lang": "ar",
        "owner_ids": OWNER_ID_ENV,
        "public_url": PUBLIC_URL,
        # ---- texts ----
        "welcome": WELCOME_DEFAULT,
        "welcome_ar": WELCOME_DEFAULT,
        "help_text_ar": HELP_AR_DEFAULT,
        "help_text_en": HELP_EN_DEFAULT,
        "policy_text_ar": POLICY_AR_DEFAULT,
        "policy_text_en": POLICY_EN_DEFAULT,
        "api_text_ar": API_AR_DEFAULT,
        "api_text_en": API_EN_DEFAULT,
        # ---- payments ----
        "binance_pay_id": "",                 # ← فارغ كما طُلب، يُضبط من اللوحة
        "binance_steps_ar": BINANCE_STEPS_AR,
        "binance_steps_en": BINANCE_STEPS_EN,
        "binance_prompt_ar": BINANCE_TXID_PROMPT_AR,
        "binance_prompt_en": BINANCE_TXID_PROMPT_EN,
        "deposit_min": "1",
        "deposit_session_minutes": "30",
        "auto_approve_deposits": "0",
        "payment_methods": "binance",
        # ---- economy ----
        "referral_percent": "10",
        "discount_percent": "0",
        "currency": CURRENCY,
        # ---- behaviour ----
        "page_size": "10",
        "style_enabled": "1",
        "mirror_rows": "0",
        "maintenance": "0",
        "maintenance_text_ar": "🛠 المتجر تحت الصيانة حالياً، نعود قريباً.",
        "maintenance_text_en": "🛠 Store is under maintenance, back soon.",
        "dm_owner_on_order": "1",
        "dm_owner_on_deposit": "1",
        # ---- panel ----
        "panel_title": "لوحة تحكم المتجر",
        "panel_eyebrow": "مساحة خاصة",
        "panel_subtitle": "أدخل كلمة المرور للمتابعة إلى لوحة إدارة المتجر.",
        "panel_password_hash": "",
        "panel_login_error": "تعذر تسجيل الدخول.",
        # ---- internals ----
        "seeded": "0",
        "tg_offset": "0",
        "bot_username": "",
    }


class Store:
    """Thread-safe SQLite access layer with a tiny settings cache."""

    def __init__(self, path):
        self.path = path
        parent = os.path.dirname(os.path.abspath(path))
        if parent and not os.path.isdir(parent):
            os.makedirs(parent, exist_ok=True)
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(path, check_same_thread=False, timeout=30.0)
        self.conn.row_factory = sqlite3.Row
        with self.lock:
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.execute("PRAGMA synchronous=NORMAL")
            self.conn.executescript(SCHEMA)
            self.conn.commit()
        self._settings = {}
        self._load_settings()
        self._seed()

    # -- settings cache -----------------------------------------------------
    def _load_settings(self):
        with self.lock:
            rows = self.conn.execute("SELECT key, value FROM settings").fetchall()
        self._settings = {r["key"]: (r["value"] if r["value"] is not None else "") for r in rows}

    def get_setting(self, key, default=""):
        val = self._settings.get(key)
        return default if val is None or val == "" else val

    def get(self, key, default=""):
        return self.get_setting(key, default)

    def get_int(self, key, default=0):
        return to_int(self.get_setting(key, default), default)

    def get_bool(self, key, default=False):
        val = self.get_setting(key, "1" if default else "0")
        return as_bool(val)

    def set_setting(self, key, value):
        value = "" if value is None else str(value)
        with self.lock:
            self.conn.execute(
                "INSERT INTO settings(key, value) VALUES(?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )
            self.conn.commit()
            self._settings[key] = value

    def set_settings(self, mapping):
        with self.lock:
            for key, value in mapping.items():
                value = "" if value is None else str(value)
                self.conn.execute(
                    "INSERT INTO settings(key, value) VALUES(?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (key, value),
                )
                self._settings[key] = value
            self.conn.commit()

    # -- generic helpers ----------------------------------------------------
    def q(self, sql, args=()):
        with self.lock:
            cur = self.conn.execute(sql, args)
            return [dict(r) for r in cur.fetchall()]

    def one(self, sql, args=()):
        rows = self.q(sql, args)
        return rows[0] if rows else None

    def scalar(self, sql, args=(), default=0):
        row = self.q(sql, args)
        if not row:
            return default
        val = list(row[0].values())[0]
        return default if val is None else val

    def ex(self, sql, args=()):
        with self.lock:
            cur = self.conn.execute(sql, args)
            self.conn.commit()
            return cur.lastrowid

    def execute_many(self, sql, seq):
        with self.lock:
            self.conn.executemany(sql, seq)
            self.conn.commit()

    # -- seed ---------------------------------------------------------------
    def _seed(self):
        if self.get_setting("seeded") == "1":
            self._ensure_offers_button()
            return
        defaults = default_settings()
        missing = {k: v for k, v in defaults.items() if k not in self._settings}
        if missing:
            self.set_settings(missing)

        if self.scalar("SELECT COUNT(*) FROM buttons") == 0:
            # التصميم الأصلي: صف1 أخضر (المنتجات يمين / الملف الشخصي يسار)
            #                 صف2 أزرق (المحفظة يمين / الإحالات يسار)
            #                 صف3 أزرق (المساعدة)  صف4 أحمر (سياسة البوت)
            seed_buttons = [
                # label_ar, label_en, icon, color, row, sort, action, payload, owner_only
                ("المنتجات", "Products", "🏪", "success", 0, 0, "products", "", 0),
                ("الملف الشخصي", "Profile", "👤", "success", 0, 1, "profile", "", 0),
                ("المحفظة", "Wallet", "💳", "primary", 1, 0, "wallet", "", 0),
                ("الإحالات", "Referrals", "🎁", "primary", 1, 1, "referrals", "", 0),
                ("المساعدة", "Help", "ⓘ", "primary", 2, 0, "help", "", 0),
                ("سياسة البوت", "Bot policy", "🛡", "danger", 3, 0, "policy", "", 0),
                ("لوحة التحكم", "Control panel", "⚙️", "danger", 4, 0, "admin", "", 1),
            ]
            for (ar_, en_, icon, color, row, sort, action, payload, owner_only) in seed_buttons:
                self.ex(
                    "INSERT INTO buttons(label_ar,label_en,icon,emoji_id,color,row,sort,action,payload,visible,owner_only)"
                    " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                    (ar_, en_, icon, "", color, row, sort, action, payload, 1, owner_only),
                )

        if self.scalar("SELECT COUNT(*) FROM categories") == 0:
            seed_categories = [
                ("Telegram Premium", "Telegram Premium", "⭐️", 1),
                ("Hotmail Accounts", "Hotmail Accounts", "📨", 2),
                ("OWL Proxy", "OWL Proxy", "🌐", 3),
                ("Gemini Links", "Gemini Links", "✨", 4),
                ("ExpressVPN Accounts", "ExpressVPN Accounts", "🛡️", 5),
                ("Netflix Login Links", "Netflix Login Links", "🎬", 6),
            ]
            for name, name_en, icon, sort in seed_categories:
                self.ex(
                    "INSERT INTO categories(name,name_en,icon,emoji_id,sort,visible) VALUES(?,?,?,?,?,1)",
                    (name, name_en, icon, "", sort),
                )

        if self.scalar("SELECT COUNT(*) FROM products") == 0:
            cats = {c["name"]: c["id"] for c in self.q("SELECT id, name FROM categories")}
            # name, cat, icon, price, stock_mode, stock, desc
            seed_products = [
                ("Telegram premium 3month", "Telegram Premium", "⭐️", 12.50, "unlimited", 0,
                 "اشتراك Telegram Premium لمدة 3 أشهر — يُسلَّم مباشرة بعد الشراء."),
                ("Telegram premium 6month", "Telegram Premium", "⭐️", 16.50, "unlimited", 0,
                 "اشتراك Telegram Premium لمدة 6 أشهر — يُسلَّم مباشرة بعد الشراء."),
                ("Telegram premium 12month", "Telegram Premium", "⭐️", 29.99, "unlimited", 0,
                 "اشتراك Telegram Premium لمدة 12 شهراً — يُسلَّم مباشرة بعد الشراء."),
                ("Hotmail Mail Accounts", "Hotmail Accounts", "📨", 0.05, "auto", 5,
                 "حسابات Hotmail جاهزة للاستخدام. يُسلَّم حساب واحد لكل قطعة."),
                ("Proxy 2GB", "OWL Proxy", "🌐", 0.25, "auto", 3,
                 "بروكسي بحجم 2GB — سرعة عالية واستقرار ممتاز."),
                ("Amazon Prime Video 6m", "Netflix Login Links", "📺", 1.50, "auto", 0,
                 "اشتراك Amazon Prime Video لمدة 6 أشهر."),
                ("OWL Proxy 200mb", "OWL Proxy", "🌐", 0.20, "auto", 2,
                 "بروكسي OWL بحجم 200MB — مناسب للاستخدام الخفيف."),
                ("Flexy Ooredoo 100AD", "Proxy 2GB", "⏰", 0.65, "auto", 0,
                 "عرض فليكسي أوريدو 100 دج."),
                ("Flexy Djezzy 100AD", "Proxy 2GB", "⏰", 0.65, "auto", 0,
                 "عرض فليكسي جيزي 100 دج."),
                ("Gemini Plus 12M [Credit Card Required]", "Gemini Links", "✨", 1.00, "auto", 4,
                 "رابط Gemini Plus لمدة 12 شهراً — يتطلب بطاقة بنكية."),
                ("EXPRESS VPN Account", "ExpressVPN Accounts", "🛡️", 0.50, "auto", 1,
                 "حساب ExpressVPN جاهز للاستخدام."),
                ("Netflix Phone login link", "Netflix Login Links", "🎬", 0.30, "auto", 0,
                 "رابط تسجيل دخول Netflix عبر الهاتف."),
            ]
            for idx, (name, cat, icon, price, mode, stock, desc) in enumerate(seed_products):
                pid = self.ex(
                    "INSERT INTO products(category_id,name,name_en,icon,emoji_id,price,stock_mode,stock,"
                    "description,description_en,feed,color,visible,sort,sold,created_at)"
                    " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (cats.get(cat, 0), name, name, icon, "", price, mode, stock,
                     desc, desc, "", "auto", 1, idx, 0, now_iso()),
                )
                # Demo stock: exactly `stock` deliverable units so the panel counts are real,
                # not a number the bot only pretends to have. Replace from the panel.
                if mode == "auto" and stock > 0:
                    self.ex("DELETE FROM stock_items WHERE product_id=?", (pid,))
                    for n in range(1, stock + 1):
                        self.ex(
                            "INSERT INTO stock_items(product_id,content,used,order_id,created_at)"
                            " VALUES(?,?,0,0,?)",
                            (pid, DEMO_STOCK % {"name": name, "n": n}, now_iso()),
                        )

        self.set_setting("seeded", "1")
        self._ensure_offers_button()
        log.info("Base de données initialisée: %d boutons, %d produits",
                 self.scalar("SELECT COUNT(*) FROM buttons"),
                 self.scalar("SELECT COUNT(*) FROM products"))

    def _ensure_offers_button(self):
        # A one-time migration: the owner can later edit or remove the button.
        if self.get_setting("offers_button_migrated") == "1":
            return
        with self.lock:
            try:
                self._begin_financial()
                marker = self.conn.execute("SELECT value FROM settings WHERE key=?" + self._financial_lock_suffix(), ("offers_button_migrated",)).fetchone()
                if not marker:
                    existing = self.conn.execute("SELECT id FROM buttons WHERE action=? LIMIT 1", ("offers",)).fetchone()
                    if not existing:
                        self.conn.execute("INSERT INTO buttons(label_ar,label_en,icon,emoji_id,color,row,sort,action,payload,visible,owner_only) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                                          ("الخصومات", "Discounts", "🏷", "", "success", 2, 1, "offers", "", 1, 0))
                    self.conn.execute("INSERT INTO settings(key,value) VALUES(?,?)", ("offers_button_migrated", "1"))
                self.conn.commit()
                self._settings["offers_button_migrated"] = "1"
            except Exception:
                self.conn.rollback()
                raise

    # ------------------------------------------------------------------
    #  BUTTONS
    # ------------------------------------------------------------------
    def buttons(self, include_hidden=False):
        sql = "SELECT * FROM buttons"
        if not include_hidden:
            sql += " WHERE visible=1"
        sql += " ORDER BY row ASC, sort ASC, id ASC"
        return self.q(sql)

    def get_button(self, bid):
        return self.one("SELECT * FROM buttons WHERE id=?", (bid,))

    def add_button(self, data):
        return self.ex(
            "INSERT INTO buttons(label_ar,label_en,icon,emoji_id,color,row,sort,action,payload,visible,owner_only)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (
                data.get("label_ar", "زر جديد"),
                data.get("label_en", data.get("label_ar", "New button")),
                data.get("icon", ""),
                data.get("emoji_id", ""),
                data.get("color", "primary"),
                to_int(data.get("row"), 0),
                to_int(data.get("sort"), 0),
                data.get("action", "products"),
                data.get("payload", ""),
                1 if as_bool(data.get("visible", 1)) else 0,
                1 if as_bool(data.get("owner_only", 0)) else 0,
            ),
        )

    def update_button(self, bid, data):
        cur = self.get_button(bid)
        if not cur:
            return False
        merged = dict(cur)
        merged.update({k: v for k, v in data.items() if k in merged})
        self.ex(
            "UPDATE buttons SET label_ar=?,label_en=?,icon=?,emoji_id=?,color=?,row=?,sort=?,"
            "action=?,payload=?,visible=?,owner_only=? WHERE id=?",
            (
                merged.get("label_ar", ""), merged.get("label_en", ""),
                merged.get("icon", ""), merged.get("emoji_id", ""),
                merged.get("color", "primary"), to_int(merged.get("row"), 0),
                to_int(merged.get("sort"), 0), merged.get("action", "products"),
                merged.get("payload", ""), 1 if as_bool(merged.get("visible", 1)) else 0,
                1 if as_bool(merged.get("owner_only", 0)) else 0, bid,
            ),
        )
        return True

    def delete_button(self, bid):
        self.ex("DELETE FROM buttons WHERE id=?", (bid,))
        return True

    # ------------------------------------------------------------------
    #  CATEGORIES / PRODUCTS
    # ------------------------------------------------------------------
    def categories(self, include_hidden=False):
        sql = "SELECT * FROM categories"
        if not include_hidden:
            sql += " WHERE visible=1"
        sql += " ORDER BY sort ASC, id ASC"
        return self.q(sql)

    def get_category(self, cid):
        return self.one("SELECT * FROM categories WHERE id=?", (cid,))

    def add_category(self, data):
        return self.ex(
            "INSERT INTO categories(name,name_en,icon,emoji_id,sort,visible) VALUES(?,?,?,?,?,?)",
            (
                data.get("name", "تصنيف جديد"), data.get("name_en", data.get("name", "")),
                data.get("icon", ""), data.get("emoji_id", ""),
                to_int(data.get("sort"), 0), 1 if as_bool(data.get("visible", 1)) else 0,
            ),
        )

    def update_category(self, cid, data):
        cur = self.get_category(cid)
        if not cur:
            return False
        merged = dict(cur)
        merged.update({k: v for k, v in data.items() if k in merged})
        self.ex(
            "UPDATE categories SET name=?,name_en=?,icon=?,emoji_id=?,sort=?,visible=? WHERE id=?",
            (
                merged.get("name", ""), merged.get("name_en", ""), merged.get("icon", ""),
                merged.get("emoji_id", ""), to_int(merged.get("sort"), 0),
                1 if as_bool(merged.get("visible", 1)) else 0, cid,
            ),
        )
        return True

    def delete_category(self, cid):
        self.ex("DELETE FROM categories WHERE id=?", (cid,))
        self.ex("UPDATE products SET category_id=0 WHERE category_id=?", (cid,))
        return True

    def products(self, include_hidden=False, category_id=None):
        sql = "SELECT * FROM products"
        where, args = [], []
        if not include_hidden:
            where.append("visible=1")
        if category_id is not None:
            where.append("category_id=?")
            args.append(category_id)
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY sort ASC, id ASC"
        return self.q(sql, tuple(args))

    def product_stock(self, product_id):
        return to_int(self.scalar(
            "SELECT COUNT(*) FROM stock_items WHERE product_id=? AND used=0", (product_id,), 0
        ), 0)

    def product_by_id(self, pid):
        row = self.one("SELECT * FROM products WHERE id=?", (pid,))
        if row:
            row["stock_live"] = self.product_stock(pid)
        return row

    def available_stock(self, product):
        if not product:
            return 0
        if product.get("stock_mode") == "unlimited":
            return 10 ** 9
        return self.product_stock(product["id"])

    def add_product(self, data):
        return self.ex(
            "INSERT INTO products(category_id,name,name_en,icon,emoji_id,price,stock_mode,stock,"
            "description,description_en,feed,color,visible,sort,sold,created_at)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                to_int(data.get("category_id"), 0), data.get("name", "منتج جديد"),
                data.get("name_en", data.get("name", "")), data.get("icon", ""),
                data.get("emoji_id", ""), to_float(data.get("price"), 0),
                data.get("stock_mode", "auto") if data.get("stock_mode") in ("auto", "unlimited") else "auto",
                to_int(data.get("stock"), 0), data.get("description", ""),
                data.get("description_en", data.get("description", "")),
                data.get("feed", ""),
                data.get("color", "auto"), 1 if as_bool(data.get("visible", 1)) else 0,
                to_int(data.get("sort"), 0), 0, now_iso(),
            ),
        )

    def update_product(self, pid, data):
        cur = self.one("SELECT * FROM products WHERE id=?", (pid,))
        if not cur:
            return False
        merged = dict(cur)
        merged.update({k: v for k, v in data.items() if k in merged})
        self.ex(
            "UPDATE products SET category_id=?,name=?,name_en=?,icon=?,emoji_id=?,price=?,"
            "stock_mode=?,stock=?,description=?,description_en=?,feed=?,color=?,visible=?,sort=?"
            " WHERE id=?",
            (
                to_int(merged.get("category_id"), 0), merged.get("name", ""),
                merged.get("name_en", ""), merged.get("icon", ""), merged.get("emoji_id", ""),
                to_float(merged.get("price"), 0),
                "unlimited" if merged.get("stock_mode") == "unlimited" else "auto",
                to_int(merged.get("stock"), 0), merged.get("description", ""),
                merged.get("description_en", ""), merged.get("feed", ""),
                merged.get("color", "auto"),
                1 if as_bool(merged.get("visible", 1)) else 0, to_int(merged.get("sort"), 0), pid,
            ),
        )
        return True

    def delete_product(self, pid):
        self.ex("DELETE FROM products WHERE id=?", (pid,))
        self.ex("DELETE FROM stock_items WHERE product_id=? AND used=0", (pid,))
        return True

    def add_stock_lines(self, product_id, lines):
        added = 0
        for line in lines:
            line = (line or "").strip()
            if not line:
                continue
            self.ex(
                "INSERT INTO stock_items(product_id,content,used,order_id,created_at) VALUES(?,?,0,0,?)",
                (product_id, line, now_iso()),
            )
            added += 1
        return added

    def stock_list(self, product_id, used=None):
        sql = "SELECT * FROM stock_items WHERE product_id=?"
        args = [product_id]
        if used is not None:
            sql += " AND used=?"
            args.append(1 if used else 0)
        sql += " ORDER BY id ASC"
        return self.q(sql, tuple(args))

    def take_stock(self, product_id, order_id):
        """Atomically claim one unused stock row for `order_id`.

        Single conditional UPDATE: SQLite serialises writes, so two concurrent
        buyers can never claim the same row. We then read back the row that
        this UPDATE actually stamped (order_id + used=1) — never a neighbour's.
        """
        with self.lock:
            try:
                cur = self.conn.execute(
                    "UPDATE stock_items SET used=1, order_id=? "
                    "WHERE id=(SELECT id FROM stock_items WHERE product_id=? AND used=0 "
                    "          ORDER BY id ASC LIMIT 1)",
                    (order_id, product_id),
                )
                if not cur.rowcount:
                    self.conn.rollback()
                    return None
                row = self.conn.execute(
                    "SELECT id, content FROM stock_items "
                    "WHERE order_id=? AND product_id=? AND used=1 "
                    "ORDER BY id DESC LIMIT 1",
                    (order_id, product_id),
                ).fetchone()
                self.conn.commit()
            except Exception:
                self.conn.rollback()
                raise
        return row["content"] if row else None

    def claim_stock_batch(self, product_id, order_id, qty):
        """Claim up to `qty` items atomically; returns the list actually claimed."""
        claimed = []
        for _ in range(max(0, qty)):
            item = self.take_stock(product_id, order_id)
            if item is None:
                break
            claimed.append(item)
        return claimed

    # ------------------------------------------------------------------
    #  USERS
    # ------------------------------------------------------------------
    def get_user(self, tg_id):
        return self.one("SELECT * FROM users WHERE tg_id=?", (tg_id,))

    def get_user_by_id(self, uid):
        return self.one("SELECT * FROM users WHERE id=?", (uid,))

    def get_or_create_user(self, tg_user):
        tg_id = int(tg_user["id"])
        user = self.get_user(tg_id)
        if user:
            username = (tg_user.get("username") or "").strip()
            first_name = (tg_user.get("first_name") or "").strip()
            updates, args = [], []
            if username and username != user.get("username"):
                updates.append("username=?")
                args.append(username)
            if first_name and first_name != user.get("first_name"):
                updates.append("first_name=?")
                args.append(first_name)
            updates.append("last_seen=?")
            args.append(now_iso())
            if updates:
                args.append(tg_id)
                self.ex("UPDATE users SET " + ",".join(updates) + " WHERE tg_id=?", tuple(args))
            return self.get_user(tg_id)

        lang = self.get_setting("default_lang", "ar")
        ref = 0
        self.ex(
            "INSERT INTO users(tg_id,username,first_name,lang,balance,spent,banned,is_admin,"
            "referrer_id,ref_earnings,api_key,created_at,last_seen)"
            " VALUES(?,?,?,?,0,0,0,0,0,0,?,?,?)",
            (
                tg_id, (tg_user.get("username") or ""), (tg_user.get("first_name") or ""),
                lang, "rk_" + rand_token(18), now_iso(), now_iso(),
            ),
        )
        user = self.get_user(tg_id)
        if OWNER_ID_ENV and str(tg_id) == OWNER_ID_ENV:
            self.ex("UPDATE users SET is_admin=1 WHERE tg_id=?", (tg_id,))
            user = self.get_user(tg_id)
        return user

    def update_user(self, tg_id, **fields):
        allowed = {"username", "first_name", "lang", "balance", "spent", "banned",
                   "is_admin", "referrer_id", "ref_earnings", "api_key"}
        sets, args = [], []
        for key, value in fields.items():
            if key in allowed:
                sets.append("%s=?" % key)
                args.append(value)
        if not sets:
            return
        args.append(tg_id)
        self.ex("UPDATE users SET " + ",".join(sets) + " WHERE tg_id=?", tuple(args))

    def adjust_balance(self, tg_id, delta):
        self.ex("UPDATE users SET balance = ROUND(balance + ?, 2) WHERE tg_id=?", (delta, tg_id))

    def debit_balance(self, tg_id, amount):
        """Atomically subtract `amount` only if the balance covers it.

        Returns True when the debit happened. A conditional UPDATE makes this
        safe against concurrent purchases racing on the same wallet.
        """
        amount = round(to_float(amount, 0), 2)
        if amount < 0:
            return False
        with self.lock:
            try:
                cur = self.conn.execute(
                    "UPDATE users SET balance = ROUND(balance - ?, 2), "
                    "spent = ROUND(spent + ?, 2) "
                    "WHERE tg_id=? AND balance >= ?",
                    (amount, amount, tg_id, amount),
                )
                self.conn.commit()
            except Exception:
                self.conn.rollback()
                raise
            return bool(cur.rowcount)

    def users_list(self, search="", limit=200, offset=0):
        sql = "SELECT * FROM users"
        args = []
        if search:
            sql += " WHERE username LIKE ? OR first_name LIKE ? OR CAST(tg_id AS TEXT) LIKE ?"
            like = "%" + search + "%"
            args += [like, like, like]
        sql += " ORDER BY id DESC LIMIT ? OFFSET ?"
        args += [limit, offset]
        return self.q(sql, tuple(args))

    def users_count(self):
        return self.scalar("SELECT COUNT(*) FROM users")

    def all_user_ids(self):
        return [r["tg_id"] for r in self.q("SELECT tg_id FROM users WHERE banned=0")]

    def _begin_financial(self):
        # SQLite obtains a write reservation before reading balances or stock.
        self.conn.execute("BEGIN IMMEDIATE")

    def _financial_lock_suffix(self):
        return ""

    def purchase_atomic(self, tg_id, product_id, qty, referral_percent):
        """Commit debit, order, stock and referral credit together, or none."""
        qty = to_int(qty, 0)
        if qty < 1 or qty > 100:
            return {"error": "invalid"}
        with self.lock:
            try:
                self._begin_financial()
                suffix = self._financial_lock_suffix()
                product = self.conn.execute("SELECT * FROM products WHERE id=?" + suffix, (product_id,)).fetchone()
                user = self.conn.execute("SELECT * FROM users WHERE tg_id=?" + suffix, (tg_id,)).fetchone()
                if not product or not user or not product["visible"]:
                    self.conn.rollback()
                    return {"error": "invalid"}
                product, user = dict(product), dict(user)
                price = round(to_float(product.get("price"), 0), 2)
                if not math.isfinite(price) or price < 0:
                    self.conn.rollback()
                    return {"error": "invalid"}
                price = discounted_price(price, self)
                total = round(price * qty, 2)
                if to_float(user.get("balance"), 0) < total:
                    self.conn.rollback()
                    return {"error": "balance", "product": product, "balance": user["balance"], "total": total}
                stock = self.conn.execute("SELECT id,content FROM stock_items WHERE product_id=? AND used=0 ORDER BY id LIMIT ?" + suffix,
                                          (product_id, qty)).fetchall()
                if (len(stock) < qty and (product.get("stock_mode") != "unlimited" or not (product.get("feed") or "").strip())) or any(not (row["content"] or "").strip() for row in stock):
                    self.conn.rollback()
                    return {"error": "stock"}
                cur = self.conn.execute("UPDATE users SET balance=ROUND(balance-?,2), spent=ROUND(spent+?,2) WHERE id=? AND balance>=?",
                                        (total, total, user["id"], total))
                if not cur.rowcount:
                    self.conn.rollback()
                    return {"error": "balance", "product": product, "balance": user["balance"], "total": total}
                now = now_iso()
                cur = self.conn.execute("INSERT INTO orders(user_id,product_id,product_name,qty,unit_price,total,status,delivery,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                    (user["id"], product_id, product["name"], qty, price, total, "pending", "", "", now, now))
                oid = cur.lastrowid
                delivery_parts = []
                for row in stock:
                    updated = self.conn.execute("UPDATE stock_items SET used=1,order_id=? WHERE id=? AND used=0", (oid, row["id"]))
                    if updated.rowcount != 1:
                        raise RuntimeError("stock claim conflict")
                    delivery_parts.append(row["content"])
                for i in range(len(stock), qty):
                    delivery_parts.append(fill(product["feed"], {"order": oid, "qty": qty, "index": i + 1,
                        "user": user.get("username") or tg_id, "date": now[:10], "store": self.get_setting("store_name", APP_NAME)}))
                delivery = "\n".join(x for x in delivery_parts if x).strip()
                if not delivery:
                    raise RuntimeError("empty delivery")
                self.conn.execute("UPDATE products SET sold=sold+? WHERE id=?", (qty, product_id))
                self.conn.execute("UPDATE orders SET status='delivered',delivery=?,updated_at=? WHERE id=?", (delivery, now, oid))
                referrer_id = to_int(user.get("referrer_id"), 0)
                commission = round(total * max(0, min(100, to_int(referral_percent, 0))) / 100.0, 2)
                if commission > 0 and referrer_id and referrer_id != user["id"]:
                    self.conn.execute("UPDATE users SET balance=ROUND(balance+?,2),ref_earnings=ROUND(ref_earnings+?,2) WHERE id=?", (commission, commission, referrer_id))
                self.conn.commit()
                return {"product": product, "user": user, "order_id": oid, "total": total, "delivery": delivery,
                        "balance_after": round(to_float(user["balance"], 0) - total, 2), "status": "delivered",
                        "referrer_id": referrer_id, "commission": commission}
            except Exception:
                self.conn.rollback()
                raise

    def deliver_pending_atomic(self, oid):
        """Complete a legacy pending order without racing a refund."""
        with self.lock:
            try:
                self._begin_financial()
                suffix = self._financial_lock_suffix()
                order = self.conn.execute("SELECT * FROM orders WHERE id=?" + suffix, (oid,)).fetchone()
                if not order or order["status"] != "pending":
                    self.conn.rollback()
                    return None
                order = dict(order)
                existing = (order.get("delivery") or "").strip()
                claimed = self.conn.execute("SELECT COUNT(*) AS n FROM stock_items WHERE order_id=? AND used=1", (oid,)).fetchone()["n"]
                if existing and not claimed:
                    # Older records may not link stock. Only a single-unit delivery
                    # can safely be considered complete without that evidence.
                    if order["qty"] != 1:
                        self.conn.rollback()
                        return None
                    claimed = 1
                if claimed and not existing:
                    self.conn.rollback()
                    return None
                needed = max(0, order["qty"] - claimed)
                stock = self.conn.execute("SELECT id,content FROM stock_items WHERE product_id=? AND used=0 ORDER BY id LIMIT ?" + suffix,
                                          (order["product_id"], needed)).fetchall()
                if len(stock) != needed or any(not (row["content"] or "").strip() for row in stock):
                    self.conn.rollback()
                    return None
                for row in stock:
                    self.conn.execute("UPDATE stock_items SET used=1,order_id=? WHERE id=? AND used=0", (oid, row["id"]))
                delivery = "\n".join(([existing] if existing else []) + [row["content"] for row in stock])
                if not delivery:
                    self.conn.rollback()
                    return None
                self.conn.execute("UPDATE orders SET status='delivered',delivery=?,updated_at=? WHERE id=?", (delivery, now_iso(), oid))
                if needed:
                    self.conn.execute("UPDATE products SET sold=sold+? WHERE id=?", (needed, order["product_id"]))
                self.conn.commit()
                return delivery
            except Exception:
                self.conn.rollback()
                raise

    def refund_order_atomic(self, oid, status):
        if status not in ("cancelled", "refunded"):
            return None
        with self.lock:
            try:
                self._begin_financial()
                order = self.conn.execute("SELECT * FROM orders WHERE id=?" + self._financial_lock_suffix(), (oid,)).fetchone()
                if not order or order["status"] in ("cancelled", "refunded"):
                    self.conn.rollback()
                    return None
                order = dict(order)
                total = to_float(order.get("total"), 0)
                if not math.isfinite(total) or total < 0:
                    raise ValueError("invalid order total")
                changed = self.conn.execute("UPDATE orders SET status=?,updated_at=? WHERE id=? AND status NOT IN ('cancelled','refunded')", (status, now_iso(), oid))
                if not changed.rowcount:
                    self.conn.rollback()
                    return None
                credit = self.conn.execute("UPDATE users SET balance=ROUND(balance+?,2),spent=MAX(0, ROUND(spent-?,2)) WHERE id=?",
                                          (order["total"], order["total"], order["user_id"]))
                if credit.rowcount != 1:
                    raise RuntimeError("order owner missing")
                self.conn.commit()
                return order
            except Exception:
                self.conn.rollback()
                raise


    # ------------------------------------------------------------------
    #  ORDERS / DEPOSITS
    # ------------------------------------------------------------------
    def create_order(self, user_id, product, qty=1):
        unit = to_float(product.get("price"), 0)
        total = round(unit * qty, 2)
        return self.ex(
            "INSERT INTO orders(user_id,product_id,product_name,qty,unit_price,total,status,"
            "delivery,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (user_id, product["id"], product["name"], qty, unit, total, "pending", "", "",
             now_iso(), now_iso()),
        )

    def get_order(self, oid):
        return self.one("SELECT * FROM orders WHERE id=?", (oid,))

    def update_order(self, oid, **fields):
        allowed = {"status", "delivery", "note", "total", "qty", "updated_at"}
        sets, args = [], []
        fields.setdefault("updated_at", now_iso())
        for key, value in fields.items():
            if key in allowed:
                sets.append("%s=?" % key)
                args.append(value)
        if not sets:
            return
        args.append(oid)
        self.ex("UPDATE orders SET " + ",".join(sets) + " WHERE id=?", tuple(args))

    def orders_list(self, limit=200, offset=0, status=None, user_id=None):
        sql = "SELECT o.*, u.username, u.first_name FROM orders o LEFT JOIN users u ON u.id=o.user_id"
        where, args = [], []
        if status:
            where.append("o.status=?")
            args.append(status)
        if user_id:
            where.append("o.user_id=?")
            args.append(user_id)
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY o.id DESC LIMIT ? OFFSET ?"
        args += [limit, offset]
        return self.q(sql, tuple(args))

    def user_orders(self, user_id, limit=20):
        return self.q("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT ?", (user_id, limit))

    def create_deposit(self, user_id, amount, method, txid, note=""):
        return self.ex(
            "INSERT INTO deposits(user_id,amount,method,txid,status,note,created_at,reviewed_at)"
            " VALUES(?,?,?,?,?,?,?,?)",
            (user_id, amount, method, txid, "pending", note, now_iso(), ""),
        )

    def deposits_list(self, limit=200, offset=0, status=None):
        sql = ("SELECT d.*, u.username, u.first_name, u.tg_id FROM deposits d "
               "LEFT JOIN users u ON u.id=d.user_id")
        args = []
        if status:
            sql += " WHERE d.status=?"
            args.append(status)
        sql += " ORDER BY d.id DESC LIMIT ? OFFSET ?"
        args += [limit, offset]
        return self.q(sql, tuple(args))

    def get_deposit(self, did):
        return self.one("SELECT * FROM deposits WHERE id=?", (did,))

    def review_deposit(self, did, status, note=""):
        if status not in ("approved", "rejected"):
            return None
        with self.lock:
            try:
                self._begin_financial()
                dep = self.conn.execute("SELECT * FROM deposits WHERE id=?" + self._financial_lock_suffix(), (did,)).fetchone()
                if not dep or dep["status"] != "pending":
                    self.conn.rollback()
                    return None
                dep = dict(dep)
                amount = to_float(dep.get("amount"), 0)
                if status == "approved" and (not math.isfinite(amount) or amount <= 0):
                    raise ValueError("invalid deposit amount")
                cur = self.conn.execute("UPDATE deposits SET status=?,note=?,reviewed_at=? WHERE id=? AND status='pending'",
                                        (status, note, now_iso(), did))
                if not cur.rowcount:
                    self.conn.rollback()
                    return None
                if status == "approved":
                    cur = self.conn.execute("UPDATE users SET balance=ROUND(balance+?,2) WHERE id=?", (dep["amount"], dep["user_id"]))
                    if cur.rowcount != 1:
                        raise RuntimeError("deposit owner missing")
                self.conn.commit()
                return dep
            except Exception:
                self.conn.rollback()
                raise

    # ------------------------------------------------------------------
    #  STATS
    # ------------------------------------------------------------------
    def stats(self):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return {
            "users": self.scalar("SELECT COUNT(*) FROM users"),
            "users_today": self.scalar("SELECT COUNT(*) FROM users WHERE created_at LIKE ?", (today + "%",)),
            "orders": self.scalar("SELECT COUNT(*) FROM orders"),
            "orders_today": self.scalar("SELECT COUNT(*) FROM orders WHERE created_at LIKE ?", (today + "%",)),
            "revenue": round(to_float(self.scalar(
                "SELECT COALESCE(SUM(total),0) FROM orders WHERE status='delivered'", (), 0)), 2),
            "revenue_today": round(to_float(self.scalar(
                "SELECT COALESCE(SUM(total),0) FROM orders WHERE status='delivered' AND created_at LIKE ?",
                (today + "%",), 0)), 2),
            "pending_deposits": self.scalar("SELECT COUNT(*) FROM deposits WHERE status='pending'"),
            "pending_orders": self.scalar("SELECT COUNT(*) FROM orders WHERE status='pending'"),
            "products": self.scalar("SELECT COUNT(*) FROM products"),
            "stock": self.scalar("SELECT COUNT(*) FROM stock_items WHERE used=0"),
            "deposits_total": round(to_float(self.scalar(
                "SELECT COALESCE(SUM(amount),0) FROM deposits WHERE status='approved'", (), 0)), 2),
        }


# Global store (initialised in main / lazily for tests)
store = None  # type: ignore


def init_store(path=None):
    global store
    store = Store(path or DB_PATH)
    return store


# ============================================================================
#  TELEGRAM API CLIENT  (urllib only, with graceful capability fallbacks)
# ============================================================================

class TgError(Exception):
    def __init__(self, description, code=0, retry_after=0):
        super().__init__(description)
        self.description = description
        self.code = code
        self.retry_after = retry_after


class Telegram:
    def __init__(self, token, api_base=BOT_API_BASE):
        self.token = token
        self.api_base = api_base.rstrip("/")
        self.support_style = True
        self.support_emoji_icon = True
        self._lock = threading.Lock()

    # -- low level -------------------------------------------------------
    def call(self, method, timeout=30, **params):
        url = "%s/bot%s/%s" % (self.api_base, self.token, method)
        payload = {k: v for k, v in params.items() if v is not None}
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace") if exc.fp else ""
        except (urllib.error.URLError, socket.timeout, TimeoutError) as exc:
            raise TgError("network: %s" % exc, 0)
        except Exception as exc:  # pragma: no cover
            raise TgError("unexpected: %s" % exc, 0)

        try:
            parsed = json.loads(body) if body else {}
        except Exception:
            raise TgError("invalid json from telegram: %s" % body[:200], 0)

        if parsed.get("ok"):
            return parsed.get("result")

        desc = parsed.get("description") or "unknown telegram error"
        code = parsed.get("error_code") or 0
        retry_after = 0
        rp = parsed.get("parameters") or {}
        if isinstance(rp, dict):
            retry_after = to_int(rp.get("retry_after"), 0)
        raise TgError(desc, code, retry_after)

    def call_with_fallback(self, method, timeout=30, **params):
        """Retry without advanced button features if the API rejects them."""
        try:
            return self.call(method, timeout=timeout, **params)
        except TgError as exc:
            desc = (exc.description or "").lower()
            if any(k in desc for k in ("style", "button_style", "unsupported")):
                stripped = self._strip_markup_features(params, style=True)
                if stripped is not None:
                    log.warning("Button style not supported by API, falling back: %s", exc.description)
                    self.support_style = False
                    return self.call(method, timeout=timeout, **stripped)
            if any(k in desc for k in ("emoji", "icon_custom")):
                stripped = self._strip_markup_features(params, emoji=True)
                if stripped is not None:
                    log.warning("Custom emoji icon unsupported, falling back: %s", exc.description)
                    self.support_emoji_icon = False
                    return self.call(method, timeout=timeout, **stripped)
            raise

    @staticmethod
    def _strip_markup_features(params, style=False, emoji=False):
        if "reply_markup" not in params or not isinstance(params["reply_markup"], dict):
            return None
        markup = json.loads(json.dumps(params["reply_markup"]))
        found = False

        def clean_row(row):
            nonlocal found
            out = []
            for btn in row:
                if isinstance(btn, dict):
                    btn = dict(btn)
                    if style and "style" in btn:
                        btn.pop("style", None)
                        found = True
                    if emoji and "icon_custom_emoji_id" in btn:
                        btn.pop("icon_custom_emoji_id", None)
                        found = True
                out.append(btn)
            return out

        for key in ("keyboard", "inline_keyboard"):
            if isinstance(markup.get(key), list):
                markup[key] = [clean_row(r) for r in markup[key]]
        if not found:
            return None
        new_params = dict(params)
        new_params["reply_markup"] = markup
        return new_params

    # -- convenience -----------------------------------------------------
    def send_message(self, chat_id, text, reply_markup=None, parse_mode="HTML",
                     disable_preview=True, reply_to=None):
        validate_markup(reply_markup)
        return self.call_with_fallback(
            "sendMessage", chat_id=chat_id, text=clip(text), reply_markup=reply_markup,
            parse_mode=parse_mode, disable_web_page_preview=disable_preview,
            reply_to_message_id=reply_to,
        )

    def edit_message_text(self, chat_id, message_id, text, reply_markup=None, parse_mode="HTML"):
        validate_markup(reply_markup)
        return self.call_with_fallback(
            "editMessageText", chat_id=chat_id, message_id=message_id, text=clip(text),
            reply_markup=reply_markup, parse_mode=parse_mode,
            disable_web_page_preview=True,
        )

    def edit_message_reply_markup(self, chat_id, message_id, reply_markup):
        validate_markup(reply_markup)
        return self.call_with_fallback(
            "editMessageReplyMarkup", chat_id=chat_id, message_id=message_id,
            reply_markup=reply_markup,
        )

    def answer_callback(self, callback_id, text="", show_alert=False):
        try:
            return self.call("answerCallbackQuery", callback_query_id=callback_id,
                             text=text or None, show_alert=show_alert)
        except TgError as exc:
            log.debug("answerCallbackQuery failed: %s", exc)
            return None

    def delete_message(self, chat_id, message_id):
        try:
            return self.call("deleteMessage", chat_id=chat_id, message_id=message_id)
        except TgError:
            return None

    def get_me(self):
        return self.call("getMe")


tg = None  # type: ignore


def init_telegram(token):
    global tg
    tg = Telegram(token)
    return tg


# ============================================================================
#  KEYBOARD BUILDERS
# ============================================================================

COLOR_MAP = {"success", "danger", "primary", "default"}
STYLE_ENABLED = True


def _decorate(b, style=None, emoji_id=None):
    """Attach Telegram colour/emoji attributes to a ready button dict."""
    if style and style in COLOR_MAP and style != "default" and store.get_bool("style_enabled", True):
        b["style"] = style
    if emoji_id and store.get_bool("emoji_icons_enabled", True):
        b["icon_custom_emoji_id"] = emoji_id
    return b


def _btn(text, style=None, emoji_id=None, cb="", url=""):
    """Reply-keyboard / inline button.

    IMPORTANT: an inline keyboard button MUST carry either callback_data or url,
    otherwise Telegram rejects the whole message. Buttons built here are only
    ever used inside `inline_keyboard(...)`, so we always emit one of the two.
    """
    b = {"text": text}
    if url:
        b["url"] = url
    else:
        b["callback_data"] = (cb or "menu")[:64]
    return _decorate(b, style, emoji_id)


def _rbtn(text, style=None, emoji_id=None):
    """Reply-keyboard button (no callback_data allowed there)."""
    return _decorate({"text": text}, style, emoji_id)


def validate_markup(markup):
    """Enforce Telegram's button rules so a bad keyboard can never be sent.

    * inline buttons need exactly one of callback_data / url
    * reply buttons must not carry callback_data / url / style-less bodies
    * callback_data must be 1..64 bytes
    """
    if not isinstance(markup, dict):
        return
    inline_rows = markup.get("inline_keyboard")
    if isinstance(inline_rows, list):
        for row in inline_rows:
            for b in row:
                if not isinstance(b, dict):
                    raise ValueError("inline button must be an object")
                has_cb = "callback_data" in b
                has_url = "url" in b
                if has_cb == has_url:
                    raise ValueError("inline button needs exactly one of callback_data/url: %r"
                                     % b.get("text"))
                if has_cb:
                    data = str(b["callback_data"]).encode("utf-8")
                    if not 1 <= len(data) <= 64:
                        raise ValueError("callback_data must be 1-64 bytes: %r" % b["text"])
    reply_rows = markup.get("keyboard")
    if isinstance(reply_rows, list):
        for row in reply_rows:
            for b in row:
                if isinstance(b, dict) and ("callback_data" in b or "url" in b):
                    raise ValueError("reply keyboard buttons cannot carry callback_data/url")
        if not any(reply_rows):
            raise ValueError("reply keyboard cannot be empty")


def reply_keyboard(rows, persistent=True):
    return {
        "keyboard": rows,
        "resize_keyboard": True,
        "is_persistent": True if persistent else False,
    }


def inline_keyboard(rows):
    return {"inline_keyboard": rows}


def remove_keyboard():
    return {"remove_keyboard": True}


def render_button_label(b, lang):
    """'🏪 المنتجات' — icon + space + label (icon lands on the right in RTL)."""
    text = b.get("label_ar") if lang == "ar" else b.get("label_en")
    if not text:
        text = b.get("label_en") or b.get("label_ar") or ""
    icon = (b.get("icon") or "").strip()
    return ("%s %s" % (icon, text)).strip() if icon else text


def build_main_keyboard(user=None):
    """Reply keyboard, fully driven by the DB (owner can add/remove anything)."""
    lang = (user or {}).get("lang", store.get_setting("default_lang", "ar"))
    is_owner = user is not None and is_owner_user(user)
    buttons = store.buttons()
    rows_map = {}
    for b in buttons:
        if b.get("owner_only") and not is_owner:
            continue
        rows_map.setdefault(to_int(b.get("row"), 0), []).append(b)

    rows = []
    for row_index in sorted(rows_map):
        items = sorted(rows_map[row_index], key=lambda x: (to_int(x.get("sort"), 0), x["id"]))
        if store.get_bool("mirror_rows", False):
            items = list(reversed(items))
        row = []
        for b in items:
            row.append(_rbtn(render_button_label(b, lang), b.get("color"), b.get("emoji_id")))
        if row:
            rows.append(row)
    if not rows:  # never send an empty keyboard (Telegram rejects it)
        rows = [[_rbtn("🏪 " + label("lbl_products_title", lang))]]
    return reply_keyboard(rows)


def discount_percent(db=None):
    db = db or store
    return max(0, min(90, db.get_int("discount_percent", 0)))


def discounted_price(price, db=None):
    price = to_float(price, 0)
    result = round(price * (100 - discount_percent(db)) / 100, 2)
    return max(0.01, result) if price > 0 else result


def build_products_keyboard(page, products, total_pages, lang, page_size):
    """Product buttons: green when in stock, red when out of stock + pagination."""
    rows = []
    for p in products:
        stock = store.available_stock(p)
        mode = p.get("stock_mode") or "auto"
        price = money(discounted_price(p.get("price")), store.get_setting("currency", "$"))
        if mode == "unlimited":
            text = "%s %s [%s]" % (p.get("icon") or "", p.get("name") or "", price)
        else:
            text = "%s %s [%d][%s]" % (p.get("icon") or "", p.get("name") or "", stock, price)
        color = p.get("color") or "auto"
        if color == "auto":
            color = "success" if stock > 0 else "danger"
        rows.append([_btn(re.sub(r"\s+", " ", text).strip(), color, p.get("emoji_id"),
                          cb="view:%d:p:%d" % (p["id"], page))])

    nav = []
    if page > 0:
        nav.append(_btn(label("lbl_prev", lang), "default", None, cb="pg:%d" % (page - 1)))
    if page < total_pages - 1:
        nav.append(_btn(label("lbl_next", lang), "default", None, cb="pg:%d" % (page + 1)))
    if nav:
        rows.append(nav)
    rows.append([_btn("🏷 الخصومات" if lang == "ar" else "🏷 Discounts", "success", None, cb="offers"),
                 _btn(label("lbl_search", lang), "primary", None, cb="search")])
    rows.append([_btn(label("lbl_close", lang), "default", None, cb="close")])
    return inline_keyboard(rows)


def build_product_keyboard(product, lang, back="pg:0"):
    stock = store.available_stock(product)
    rows = []
    if stock > 0:
        rows.append([_btn(label("lbl_buy", lang), "success", None,
                          cb="confirm:%d" % product["id"])])
    else:
        rows.append([_btn(label("lbl_out", lang) + " ❌", "danger", None,
                          cb="topup")])
    rows.append([_btn(label("lbl_back", lang), "default", None, cb=back),
                 _btn(label("lbl_close", lang), "default", None, cb="close")])
    return inline_keyboard(rows)


def build_back_keyboard(lang, with_close=True):
    row = [_btn(label("lbl_back", lang), "default", None, cb="listen:0")]
    if with_close:
        row.append(_btn(label("lbl_close", lang), "default", None, cb="close"))
    return inline_keyboard([row])


# ============================================================================
#  OWNERSHIP HELPERS  (defined here so keyboard builders can use them)
# ============================================================================

def owner_ids():
    ids = set()
    for raw in (store.get_setting("owner_ids", "") or "").split(","):
        raw = raw.strip()
        if raw.isdigit():
            ids.add(int(raw))
    if OWNER_ID_ENV.isdigit():
        ids.add(int(OWNER_ID_ENV))
    return ids


def is_owner_user(user):
    if not user:
        return False
    if as_bool(user.get("is_admin")):
        return True
    return int(user.get("tg_id") or 0) in owner_ids()


# ============================================================================
#  RUNTIME STATE (multi-step conversations)
# ============================================================================

STATE = {}
STATE_LOCK = threading.RLock()
PENDING_BROADCAST = {}   # owner tg_id -> {"text": ...}  (waits for the next message)


def state_get(tg_id):
    with STATE_LOCK:
        st = STATE.get(tg_id)
    if not st:
        return None
    expires = st.get("expires", 0)
    if expires and time.time() > expires:
        state_clear(tg_id)
        return None
    return st


def state_set(tg_id, kind, **data):
    with STATE_LOCK:
        st = {"kind": kind, "expires": 0}
        st.update(data)
        STATE[tg_id] = st
    return st


def state_clear(tg_id):
    with STATE_LOCK:
        STATE.pop(tg_id, None)


def session_minutes():
    return max(1, store.get_int("deposit_session_minutes", 30))


# ============================================================================
#  LOCALISATION HELPERS
# ============================================================================

def t(key, lang, **kw):
    return label(key, lang, **kw)


def store_name():
    return store.get_setting("store_name", APP_NAME)


def support():
    return store.get_setting("support_username", "").lstrip("@")


def cur():
    return store.get_setting("currency", CURRENCY)


def price_str(value):
    return money(value, cur())


def lang_of(user):
    return (user or {}).get("lang") or store.get_setting("default_lang", "ar")


def welcome_text(lang):
    cats = store.categories()
    lines = []
    for c in cats:
        icon = (c.get("icon") or "").strip()
        name = (c.get("name") if lang == "ar" else (c.get("name_en") or c.get("name"))) or ""
        lines.append(("%s %s" % (icon, name)).strip() if icon else name)
    categories_block = "\n".join(lines) if lines else ""
    template = store.get_setting("welcome_ar" if lang == "ar" else "welcome", WELCOME_DEFAULT)
    return fill(template, {"store": store_name(), "support": support(),
                           "categories": categories_block})


def text_for(key_base, lang, extra=None):
    raw = store.get_setting("%s_%s" % (key_base, lang), "")
    if not raw:
        raw = store.get_setting(key_base + "_ar" if lang == "ar" else key_base + "_en", "")
    if not raw:
        raw = store.get_setting(key_base, "")
    mapping = {"store": store_name(), "support": support(),
               "currency": cur(), "owner": support()}
    if extra:
        mapping.update(extra)
    return fill(raw, mapping)


# ============================================================================
#  SENDING HELPERS
# ============================================================================

def safe_send(chat_id, text, reply_markup=None, reply_to=None):
    try:
        return tg.send_message(chat_id, text, reply_markup=reply_markup, reply_to=reply_to)
    except TgError as exc:
        log.warning("sendMessage to %s failed: %s", chat_id, exc.description)
        return None


def safe_edit(chat_id, message_id, text, reply_markup=None):
    try:
        return tg.edit_message_text(chat_id, message_id, text, reply_markup=reply_markup)
    except TgError as exc:
        if "not modified" in (exc.description or "").lower():
            return None
        log.debug("editMessageText failed: %s", exc.description)
        return safe_send(chat_id, text, reply_markup=reply_markup)


def notify_owner(text, reply_markup=None):
    for oid in owner_ids():
        safe_send(oid, text, reply_markup=reply_markup)


def panel_url():
    url = store.get_setting("public_url", "") or PUBLIC_URL
    return url.rstrip("/")


# ============================================================================
#  UI SCREENS
# ============================================================================

def send_main_menu(user, text=None, reply_to=None):
    lang = lang_of(user)
    body = text if text is not None else welcome_text(lang)
    return safe_send(user["tg_id"], body, build_main_keyboard(user), reply_to=reply_to)


def products_page(user, page=0, edit=None):
    lang = lang_of(user)
    per_page = max(3, store.get_int("page_size", 10))
    items = store.products()
    total = len(items)
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(0, min(page, total_pages - 1))
    chunk = items[page * per_page:(page + 1) * per_page]

    header = "<b>%s</b>\n%s" % (
        t("lbl_products_title", lang),
        t("lbl_page", lang, n=page + 1),
    )
    if not chunk:
        header = "<b>%s</b>\n\n%s" % (
            t("lbl_products_title", lang),
            "لا توجد منتجات متاحة حالياً." if lang == "ar" else "No products available right now.",
        )
    markup = build_products_keyboard(page, chunk, total_pages, lang, per_page)
    if edit:
        return safe_edit(user["tg_id"], edit, header, markup)
    return safe_send(user["tg_id"], header, markup)


def product_view(user, product_id, edit=None, back="pg:0"):
    lang = lang_of(user)
    p = store.product_by_id(product_id)
    if not p or not p.get("visible"):
        msg = "❌ المنتج غير متاح." if lang == "ar" else "❌ Product unavailable."
        if edit:
            return safe_edit(user["tg_id"], edit, msg)
        return safe_send(user["tg_id"], msg)

    stock = store.available_stock(p)
    mode = p.get("stock_mode") or "auto"
    if mode == "unlimited":
        stock_line = t("lbl_unlimited", lang)
    else:
        stock_line = "%d %s" % (stock, t("lbl_in_stock", lang)) if stock > 0 else t("lbl_out", lang)

    title = p.get("name") if lang == "ar" else (p.get("name_en") or p.get("name"))
    desc = p.get("description") if lang == "ar" else (p.get("description_en") or p.get("description"))
    icon = (p.get("icon") or "").strip()

    body = "%s <b>%s</b>\n" % (icon, esc(title))
    if desc:
        body += "\n%s\n" % esc(desc)
    discount = discount_percent()
    if discount:
        body += "\n🏷 %s %s%%: <s>%s</s>" % ("خصم" if lang == "ar" else "Discount", discount, price_str(p.get("price")))
    body += "\n💵 %s\n📦 %s" % (price_str(discounted_price(p.get("price"))), esc(stock_line))
    markup = build_product_keyboard(p, lang, back=back)
    if edit:
        return safe_edit(user["tg_id"], edit, body, markup)
    return safe_send(user["tg_id"], body, markup)


def profile_text(user):
    lang = lang_of(user)
    orders = store.user_orders(user["id"], 1000)
    delivered = len([o for o in orders if o["status"] == "delivered"])
    title = t("lbl_profile_title", lang)
    uname = ("@" + user["username"]) if user.get("username") else "—"
    lines = [
        "<b>%s</b>" % esc(title),
        "",
        "🪪 %s" % esc(user.get("first_name") or "—"),
        "🔗 %s" % esc(uname),
        "🆔 <code>%s</code>" % user["tg_id"],
        "",
        "💰 %s" % price_str(user.get("balance")),
        "🧾 %s: %d" % ("الطلبات" if lang == "ar" else "Orders", len(orders)),
        "✅ %s: %d" % ("المكتملة" if lang == "ar" else "Delivered", delivered),
        "📤 %s: %s" % ("إجمالي الشراء" if lang == "ar" else "Total spent", price_str(user.get("spent"))),
        "🎁 %s: %s" % ("أرباح الإحالة" if lang == "ar" else "Referral earnings",
                       price_str(user.get("ref_earnings"))),
        "",
        "📅 %s: %s" % ("تاريخ التسجيل" if lang == "ar" else "Joined",
                       ts_from_iso(user.get("created_at"), "-")),
    ]
    rows = [
        [_btn(t("lbl_orders", lang), "primary", None, cb="orders")],
        [_btn(t("lbl_topup", lang), "success", None, cb="topup")],
    ]
    return "\n".join(lines), inline_keyboard(rows)


def wallet_text(user):
    lang = lang_of(user)
    rows = [
        [_btn(t("lbl_topup", lang), "success", None, cb="topup")],
        [_btn(t("lbl_orders", lang), "primary", None, cb="orders")],
    ]
    body = "<b>%s</b>\n\n💰 %s: <b>%s</b>\n📤 %s: %s" % (
        esc(t("lbl_wallet_title", lang)),
        "الرصيد" if lang == "ar" else "Balance",
        price_str(user.get("balance")),
        "إجمالي الشراء" if lang == "ar" else "Total spent",
        price_str(user.get("spent")),
    )
    return body, inline_keyboard(rows)


def referrals_text(user):
    lang = lang_of(user)
    bot_username = store.get_setting("bot_username", "")
    link = ("https://t.me/%s?start=ref_%d" % (bot_username, user["tg_id"])) if bot_username else "—"
    invited = store.scalar("SELECT COUNT(*) FROM users WHERE referrer_id=?", (user["id"],))
    percent = store.get_int("referral_percent", 10)
    body = (
        "<b>%s</b>\n\n"
        "🔗 %s:\n<code>%s</code>\n\n"
        "👥 %s: %s\n"
        "💸 %s: %s%%\n"
        "🎁 %s: %s"
    ) % (
        esc(t("lbl_ref_title", lang)),
        "رابط الإحالة" if lang == "ar" else "Your invite link",
        esc(link),
        "المدعوون" if lang == "ar" else "Invited",
        invited,
        "نسبة الأرباح" if lang == "ar" else "Commission",
        percent,
        "أرباحك" if lang == "ar" else "Earnings",
        price_str(user.get("ref_earnings")),
    )
    rows = []
    if bot_username:
        share = "https://t.me/share/url?" + urllib.parse.urlencode({"url": link, "text": "انضم إلى متجرنا" if lang == "ar" else "Join our shop"})
        rows.append([_btn("📤 نشر رابط الإحالة" if lang == "ar" else "📤 Share invite link", "primary", None, url=share)])
    rows.append([_btn(t("lbl_back", lang), "default", None, cb="listen:0")])
    return body, inline_keyboard(rows)


def orders_text(user):
    lang = lang_of(user)
    rows = []
    for o in store.user_orders(user["id"], 10):
        rows.append([_btn("#%d · %s · %s" % (o["id"], o["product_name"], price_str(o["total"])),
                          "success" if o["status"] == "delivered" else "primary", None,
                          cb="order:%d" % o["id"])])
    rows.append([_btn(t("lbl_back", lang), "default", None, cb="listen:0")])
    if not store.user_orders(user["id"], 1):
        return ("<b>%s</b>\n\n%s" % (esc(t("lbl_orders_title", lang)),
                                     "لا توجد طلبات بعد." if lang == "ar" else "No orders yet."),
                build_back_keyboard(lang))
    return "<b>%s</b>" % esc(t("lbl_orders_title", lang)), inline_keyboard(rows)


# ============================================================================
#  PURCHASE
# ============================================================================

def deliver_order(user, product, qty=1):
    """Charge balance, take stock, deliver. Returns (ok, message)."""
    lang = lang_of(user)
    result = store.purchase_atomic(user["tg_id"], product["id"], qty, store.get_int("referral_percent", 10))
    error = result.get("error")
    if error == "invalid":
        return False, "❌ المنتج غير متاح." if lang == "ar" else "❌ Product unavailable."
    if error == "stock":
        return False, ("❌ نفد المخزون." if lang == "ar" else "❌ Out of stock.",
                       inline_keyboard([[_btn(t("lbl_back", lang), "default", None, cb="pg:0")]]))
    if error == "balance":
        body = ("⚠️ <b>%s</b>\n\n💰 %s\n💵 %s" % (
            "الرصيد غير كافٍ" if lang == "ar" else "Insufficient balance",
            price_str(result.get("balance", 0)), price_str(result.get("total", 0))))
        return False, (body, inline_keyboard([
            [_btn(t("lbl_topup", lang), "success", None, cb="topup")],
            [_btn(t("lbl_close", lang), "default", None, cb="close")]]))
    fresh = result["user"]
    p = result["product"]
    total = result["total"]
    balance_after = result["balance_after"]
    order_id = result["order_id"]
    delivery = result["delivery"]
    status = result["status"]
    manual = False
    if result.get("referrer_id") and result.get("commission"):
        ref_user = store.get_user_by_id(result["referrer_id"])
        if ref_user and ref_user["id"] != fresh["id"]:
            safe_send(ref_user["tg_id"], "🎁 <b>%s</b>\n\n+%s %s @%s" % (
                "عمولة إحالة جديدة" if lang_of(ref_user) == "ar" else "New referral commission",
                price_str(result["commission"]), "من" if lang_of(ref_user) == "ar" else "from",
                esc(fresh.get("username") or fresh.get("first_name") or fresh["tg_id"])))

    # confirmation to buyer
    head = "✅ <b>%s</b>" % ("تم تسليم طلبك" if status == "delivered" else "تم استلام طلبك")
    if lang != "ar":
        head = "✅ <b>%s</b>" % ("Order delivered" if status == "delivered" else "Order received")
    body = "%s #%d\n\n📦 %s ×%d\n💵 %s\n💰 %s: %s\n" % (
        head, order_id,
        esc(p.get("name")), qty,
        price_str(total),
        "الرصيد المتبقي" if lang == "ar" else "Balance left",
        price_str(balance_after),
    )
    if delivery:
        body += "\n<pre>%s</pre>" % html.escape(delivery, quote=False)
    if manual:
        body += ("\n\n⏳ طلبك قيد المعالجة، سيصلك التسليم هنا خلال دقائق.\n📩 الدعم: @%s" % support()
                 if lang == "ar" else
                 "\n\n⏳ Your order is being processed and will be delivered here shortly.\n📩 Support: @%s" % support())
    markup = inline_keyboard([[_btn(t("lbl_orders", lang), "primary", None, cb="orders")]])

    # owner notification
    if store.get_bool("dm_owner_on_order", True):
        notify_owner(
            "🧾 <b>%s</b>\n\n👤 %s (<code>%s</code>)\n📦 %s ×%d\n💵 %s\n%s %s" % (
                "طلب جديد" if manual else "بيع جديد",
                esc(fresh.get("first_name") or "-"), fresh["tg_id"],
                esc(p.get("name")), qty, price_str(total),
                "الحالة:" if manual else "تم التسليم تلقائياً —",
                "قيد المعالجة" if manual else "✅",
            )
        )
    return True, (body, markup)


# ============================================================================
#  DEPOSIT (BINANCE PAY)
# ============================================================================

def deposit_start(user):
    lang = lang_of(user)
    pay_id = store.get_setting("binance_pay_id", "").strip()
    if not pay_id:
        body = ("⚙️ <b>%s</b>\n\n%s" % (
            "الشحن غير متاح حالياً" if lang == "ar" else "Top-up unavailable",
            ("لم يتم إعداد معرّف الدفع بعد. تواصل مع الدعم: @%s" % support()) if lang == "ar"
            else ("The payment ID is not configured yet. Contact support: @%s" % support()),
        ))
        return safe_send(user["tg_id"], body, inline_keyboard([
            [_btn(t("lbl_support", lang), "primary", None, cb="support")],
            [_btn(t("lbl_close", lang), "default", None, cb="close")],
        ]))

    steps = store.get_setting("binance_steps_ar" if lang == "ar" else "binance_steps_en", "")
    if not steps:
        steps = BINANCE_STEPS_AR if lang == "ar" else BINANCE_STEPS_EN
    body = "%s\n<code>%s</code>" % (html.escape(steps, quote=False), esc(pay_id))
    state_set(user["tg_id"], "deposit_amount", expires=time.time() + session_minutes() * 60,
              lang=lang)
    kb = reply_keyboard([[_rbtn(t("lbl_cancel", lang), "danger")]])
    return safe_send(user["tg_id"], body, kb)


def deposit_ask_amount(user):
    lang = lang_of(user)
    body = ("💵 <b>%s</b>\n\n%s" % (
        "أدخل مبلغ الشحن" if lang == "ar" else "Enter the top-up amount",
        ("أرسل المبلغ بالدولار (مثال: 5)." if lang == "ar" else "Send the amount in USD (e.g. 5)."),
    ))
    return safe_send(user["tg_id"], body,
                     inline_keyboard([[_btn(t("lbl_cancel", lang), "danger", None, cb="cancel")]]))


def deposit_finish(user, txid, amount=None):
    lang = lang_of(user)
    depos_id = store.create_deposit(user["id"], to_float(amount, 0), "binance", txid)
    body = ("⏳ <b>%s</b>\n\n🧾 #%d\n💵 %s\n🔑 <code>%s</code>\n\n%s" % (
        "تم استلام طلب الشحن" if lang == "ar" else "Top-up request received",
        depos_id, price_str(amount), esc(txid),
        ("سيتم مراجعة المعاملة وإضافة الرصيد خلال دقائق." if lang == "ar"
         else "The transaction will be reviewed and credited shortly."),
    ))
    safe_send(user["tg_id"], body, build_main_keyboard(user))
    if store.get_bool("dm_owner_on_deposit", True):
        markup = inline_keyboard([[
            _btn("✅ موافقة", "success", None, cb="dep:ok:%d" % depos_id),
            _btn("❌ رفض", "danger", None, cb="dep:no:%d" % depos_id),
        ]])
        notify_owner(
            "💳 <b>%s</b>\n\n👤 %s (<code>%s</code>)\n💵 %s\n🔑 <code>%s</code>\n\n%s" % (
                "طلب شحن جديد", esc(user.get("first_name") or "-"), user["tg_id"],
                price_str(amount), esc(txid),
                "راجعه من لوحة التحكم ← الشحن.",
            ),
            markup,
        )
    state_clear(user["tg_id"])
    return depos_id


# ============================================================================
#  UPDATE DISPATCHER
# ============================================================================

COMMANDS = {
    "start": "menu",
    "menu": "menu",
    "products": "products",
    "product": "products",
    "search": "search",
    "offers": "offers",
    "profile": "profile",
    "wallet": "wallet",
    "deposit": "deposit",
    "topup": "deposit",
    "orders": "orders",
    "referrals": "referrals",
    "ref": "referrals",
    "help": "help",
    "policy": "policy",
    "rules": "policy",
    "lang": "lang",
    "language": "lang",
    "api": "api",
    "id": "whoami",
    "whoami": "whoami",
    "cancel": "cancel",
    "admin": "admin",
    "panel": "admin",
}


def on_update(update):
    try:
        if "message" in update:
            handle_message(update["message"])
        elif "callback_query" in update:
            handle_callback(update["callback_query"])
    except TgError as exc:
        log.warning("Telegram error while handling update: %s", exc.description)
    except Exception:
        log.error("Unhandled error:\n%s", traceback.format_exc())


# ----------------------------------------------------------------------------
#  MESSAGE HANDLER
# ----------------------------------------------------------------------------

def handle_message(msg):
    chat = msg.get("chat") or {}
    if chat.get("type") != "private":
        return
    frm = msg.get("from") or {}
    if not frm.get("id"):
        return

    text = (msg.get("text") or "").strip()
    user = store.get_or_create_user(frm)
    tg_id = user["tg_id"]
    lang = lang_of(user)

    if user.get("banned") and not is_owner_user(user):
        return safe_send(tg_id, "🚫 " + ("تم حظر حسابك." if lang == "ar" else "Your account is banned."))

    if store.get_bool("maintenance") and not is_owner_user(user):
        body = store.get_setting("maintenance_text_ar" if lang == "ar" else "maintenance_text_en", "")
        return safe_send(tg_id, body or "🛠 " + ("تحت الصيانة" if lang == "ar" else "Under maintenance"))

    # ---- deep link / referral / owner quick panel link -------------------
    if text.startswith("/start"):
        parts = text.split(maxsplit=1)
        payload = parts[1].strip() if len(parts) > 1 else ""
        if payload == "panel":
            state_clear(tg_id)
            PENDING_BROADCAST.pop(tg_id, None)
            if is_owner_user(user):
                return admin_home(user)
            return send_main_menu(user)
        if payload.startswith("ref_"):
            try:
                ref_tg = int(payload[4:])
            except Exception:
                ref_tg = 0
            if ref_tg and ref_tg != tg_id and not to_int(user.get("referrer_id"), 0):
                ref_user = store.get_user(ref_tg)
                if ref_user:
                    store.update_user(tg_id, referrer_id=ref_user["id"])
                    safe_send(ref_tg, "👥 <b>%s</b>\n\n%s @%s" % (
                        "انضم عضو جديد عبر رابطك" if lang_of(ref_user) == "ar" else "New member joined via your link",
                        "المستخدم:" if lang_of(ref_user) == "ar" else "User:",
                        esc(user.get("username") or user.get("first_name") or tg_id),
                    ))
                    user = store.get_user(tg_id)

    # Cancellation is recognized for both reply keyboards and slash commands,
    # including owner-customised labels. Never broadcast the cancel button.
    cancel_values = {norm_key(x) for x in ("/cancel", "إلغاء", "الغاء", "cancel", "❌ إلغاء",
                                              label("lbl_cancel", "ar"), label("lbl_cancel", "en"))}
    if norm_key(text) in cancel_values:
        return run_route(user, "cancel")

    # ---- active multi-step state ---------------------------------------
    st = state_get(tg_id)
    if st and not text.startswith("/"):
        handled = handle_state(user, st, text, msg)
        if handled:
            return

    if st and text.startswith("/"):
        state_clear(tg_id)
        st = None

    # ---- owner broadcast capture ---------------------------------------
    if tg_id in PENDING_BROADCAST and is_owner_user(user):
        if text.startswith("/"):
            PENDING_BROADCAST.pop(tg_id, None)
        elif not text:
            return safe_send(tg_id, "⚠️ أرسل نصاً أو اضغط إلغاء.")
        else:
            # Preview and explicit confirmation prevent accidental broadcasts.
            if len(text) > 4000:
                return safe_send(tg_id, "⚠️ النص طويل جداً؛ أرسل 4000 حرف أو أقل.")
            nonce = secrets.token_hex(6)
            PENDING_BROADCAST.pop(tg_id, None)
            state_set(tg_id, "broadcast_preview", text=text, nonce=nonce, expires=time.time() + 86400)
            preview = text[:400] + ("…" if len(text) > 400 else "")
            return safe_send(tg_id, "📣 <b>معاينة الإذاعة</b>\n\n%s\n\nإرسال النص كاملاً إلى المستخدمين؟" % esc(preview),
                inline_keyboard([[_btn("✅ تأكيد الإرسال", "success", None, cb="adm:send_broadcast:" + nonce),
                                  _btn(t("lbl_cancel", lang), "danger", None, cb="cancel")]]))

    # ---- commands --------------------------------------------------------
    if text.startswith("/"):
        cmd = text[1:].split()[0].split("@")[0].lower()
        route = COMMANDS.get(cmd)
        if route:
            payload = text.split(maxsplit=1)[1] if route == "search" and len(text.split(maxsplit=1)) > 1 else ""
            return run_route(user, route, payload)
        if cmd in ("reload",):
            return send_main_menu(user)
        return run_route(user, "menu")

    # ---- typed support handle (e.g. "r1himo_dx") ------------------------
    if support() and text.strip().lstrip("@").lower() == support().lower():
        return run_route(user, "support")

    # ---- reply-keyboard button taps (match by label from DB) ------------
    action, payload = match_button(text, lang, user)
    if action:
        if action == "admin" and not is_owner_user(user):
            return safe_send(tg_id, "⛔️ " + ("هذا الزر للمالك فقط." if lang == "ar" else "Owner only."))
        return run_route(user, action, payload)

    # ---- default: show menu ---------------------------------------------
    return run_route(user, "menu")


def match_button(text, lang, user=None):
    """Map a tapped reply-keyboard label back to its configured action."""
    wanted = norm_key(text)
    if not wanted:
        return None, ""
    for b in store.buttons():
        candidates = {
            norm_key(render_button_label(b, lang)),
            norm_key(render_button_label(b, "ar")),
            norm_key(render_button_label(b, "en")),
            norm_key(b.get("label_ar", "")),
            norm_key(b.get("label_en", "")),
        }
        if wanted in candidates:
            if user is not None and b.get("owner_only") and not is_owner_user(user):
                return "owner_denied", ""
            return (b.get("action") or "products"), (b.get("payload") or "")
    return None, ""


def handle_state(user, st, text, msg):
    tg_id = user["tg_id"]
    lang = lang_of(user)
    kind = st.get("kind")

    if kind == "admin_discount":
        if not is_owner_user(user):
            state_clear(tg_id)
            return True
        if not text.strip().isdigit() or not 0 <= int(text.strip()) <= 90:
            safe_send(tg_id, "⚠️ أرسل نسبة صحيحة بين 0 و90، أو /cancel للإلغاء.")
            return True
        percent = int(text.strip())
        store.set_setting("discount_percent", str(percent))
        state_clear(tg_id)
        safe_send(tg_id, "✅ تم ضبط الخصم العام على %d%%. 0 يلغي الخصم." % percent, build_main_keyboard(user))
        return True

    if kind == "search":
        if not text.strip():
            safe_send(tg_id, esc(t("lbl_search_prompt", lang)))
            return True
        state_clear(tg_id)
        show_search_results(user, text)
        return True

    if kind == "deposit_amount":
        if text.strip() in ("إلغاء", "الغاء", "cancel", "/cancel", "❌ إلغاء"):
            state_clear(tg_id)
            safe_send(tg_id, "❌ " + ("تم الإلغاء." if lang == "ar" else "Cancelled."),
                      build_main_keyboard(user))
            return True
        amount = to_float(re.sub(r"[^0-9.]", "", text), 0)
        minimum = to_float(store.get_setting("deposit_min", "1"), 1)
        if amount <= 0:
            safe_send(tg_id, "⚠️ " + ("أدخل مبلغاً صحيحاً." if lang == "ar" else "Enter a valid amount."))
            return True
        if amount < minimum:
            safe_send(tg_id, "⚠️ " + (("الحد الأدنى للشحن هو %s." % price_str(minimum)) if lang == "ar"
                                      else ("Minimum top-up is %s." % price_str(minimum))))
            return True
        state_set(tg_id, "deposit_txid", amount=amount,
                  expires=time.time() + session_minutes() * 60)
        prompt = store.get_setting("binance_prompt_ar" if lang == "ar" else "binance_prompt_en", "")
        if not prompt:
            prompt = BINANCE_TXID_PROMPT_AR if lang == "ar" else BINANCE_TXID_PROMPT_EN
        safe_send(tg_id, prompt, reply_keyboard([[_rbtn(t("lbl_cancel", lang), "danger")]]))
        return True

    if kind == "deposit_txid":
        if text.strip() in ("إلغاء", "الغاء", "cancel", "/cancel", "❌ إلغاء"):
            state_clear(tg_id)
            safe_send(tg_id, "❌ " + ("تم الإلغاء." if lang == "ar" else "Cancelled."),
                      build_main_keyboard(user))
            return True
        txid = text.strip()
        if len(txid) < 6:
            safe_send(tg_id, "⚠️ " + ("معرّف المعاملة غير صالح." if lang == "ar"
                                      else "Invalid transaction ID."))
            return True
        deposit_finish(user, txid, st.get("amount"))
        return True

    return False


def run_route(user, action, payload=""):
    """Single place mapping an action name to its screen."""
    lang = lang_of(user)
    action = (action or "menu").strip().lower()

    if action == "owner_denied":
        return safe_send(user["tg_id"], "⛔️ " + ("هذا الزر للمالك فقط." if lang == "ar" else "Owner only."))
    if action == "menu":
        return send_main_menu(user)
    if action == "products":
        return products_page(user, 0)
    if action == "offers":
        return show_offers(user)
    if action == "search":
        if payload.strip():
            return show_search_results(user, payload)
        state_set(user["tg_id"], "search", expires=time.time() + 1800)
        return safe_send(user["tg_id"], esc(t("lbl_search_prompt", lang)),
                         reply_keyboard([[_rbtn(t("lbl_cancel", lang), "danger")]]))
    if action == "profile":
        body, markup = profile_text(user)
        return safe_send(user["tg_id"], body, markup)
    if action == "wallet":
        body, markup = wallet_text(user)
        return safe_send(user["tg_id"], body, markup)
    if action == "referrals":
        body, markup = referrals_text(user)
        return safe_send(user["tg_id"], body, markup)
    if action == "orders":
        body, markup = orders_text(user)
        return safe_send(user["tg_id"], body, markup)
    if action == "deposit":
        return deposit_start(user)
    if action == "help":
        body = text_for("help_text", lang)
        return safe_send(user["tg_id"], body, build_back_keyboard(lang))
    if action == "policy":
        body = text_for("policy_text", lang)
        return safe_send(user["tg_id"], body, build_back_keyboard(lang))
    if action == "api":
        key = user.get("api_key") or ""
        body = text_for("api_text", lang, {"api_key": key})
        return safe_send(user["tg_id"], body, build_back_keyboard(lang))
    if action == "lang":
        return send_language_picker(user)
    if action == "whoami":
        return safe_send(user["tg_id"], "🆔 <code>%s</code>" % user["tg_id"])
    if action == "cancel":
        state_clear(user["tg_id"])
        PENDING_BROADCAST.pop(user["tg_id"], None)
        return send_main_menu(user, esc(t("lbl_cancelled", lang)))
    if action == "admin":
        if not is_owner_user(user):
            return safe_send(user["tg_id"], "⛔️ " + ("للمالك فقط." if lang == "ar" else "Owner only."))
        return admin_home(user)
    if action == "support":
        url = "https://t.me/" + support() if support() else ""
        if url:
            return safe_send(user["tg_id"], "📩 @%s" % support(), inline_keyboard([[
                _btn("📩 @" + support(), "primary", None, url="https://t.me/" + support())]]))
        return safe_send(user["tg_id"], "⚠️ " + ("لم يتم ضبط حساب الدعم." if lang == "ar"
                                                 else "Support account is not configured."))
    if action == "text":
        # payload = key of a custom text in settings (owner-defined buttons)
        body = store.get_setting(payload + "_" + lang, "") or store.get_setting(payload, "")
        if not body:
            body = "—"
        return safe_send(user["tg_id"], body, build_back_keyboard(lang))
    if action == "url":
        if payload:
            return safe_send(user["tg_id"], "🔗 %s" % esc(payload), inline_keyboard([[
                _btn("🔗 " + ("فتح الرابط" if lang == "ar" else "Open link"), "primary", None,
                     url=payload)]]))
        return run_route(user, "menu")
    if action == "category":
        cid = to_int(payload, 0)
        return category_products(user, cid)
    if action == "buy":
        pid = to_int(payload, 0)
        return product_view(user, pid)

    # unknown action -> menu (never crash)
    return send_main_menu(user)


def show_offers(user, edit=None):
    lang = lang_of(user)
    percent = discount_percent()
    body = ("🏷 الخصم الحالي: <b>%d%%</b> على المنتجات." if lang == "ar" else "🏷 Current discount: <b>%d%%</b> on products.") % percent
    if not percent:
        body += "\n" + ("لا توجد خصومات حالياً." if lang == "ar" else "No discounts right now.")
    markup = inline_keyboard([[_btn("🏪 المنتجات" if lang == "ar" else "🏪 Products", "primary", None, cb="pg:0")]])
    if edit:
        return safe_edit(user["tg_id"], edit, body, markup)
    return safe_send(user["tg_id"], body, markup)


def show_search_results(user, query):
    lang = lang_of(user)
    wanted = query.strip().casefold()[:100]
    items = [p for p in store.products() if wanted and
             wanted in ((p.get("name") or "") + " " + (p.get("name_en") or "")).casefold()][:20]
    rows = [[_btn("%s %s · %s" % (p.get("icon") or "", p.get("name") or "", price_str(discounted_price(p.get("price")))),
                  "success" if store.available_stock(p) > 0 else "danger", None,
                  cb="view:%d" % p["id"])] for p in items]
    rows.append([_btn(t("lbl_back", lang), "default", None, cb="listen:0")])
    title = "🔎 <b>%s</b>\n%s" % (esc(t("lbl_search_title", lang)), esc(query[:100]))
    if not items:
        title += "\n\n" + esc(t("lbl_search_empty", lang))
    # Restore the persistent main keyboard after the input prompt.
    safe_send(user["tg_id"], esc(t("lbl_search_done", lang)), build_main_keyboard(user))
    return safe_send(user["tg_id"], title, inline_keyboard(rows))


def send_language_picker(user):
    lang = lang_of(user)
    body = "🌐 <b>%s</b>" % ("اختر اللغة" if lang == "ar" else "Choose your language")
    markup = inline_keyboard([
        [_btn(label("lbl_lang_ar", "ar"), "success", None, cb="lang:ar"),
         _btn(label("lbl_lang_en", "en"), "primary", None, cb="lang:en")],
    ])
    return safe_send(user["tg_id"], body, markup)


def category_products(user, cid, edit=None):
    lang = lang_of(user)
    cat = store.get_category(cid) if cid else None
    items = store.products(category_id=cid) if cid else store.products()
    if not items:
        return safe_send(user["tg_id"], "—", build_back_keyboard(lang))
    rows = []
    for p in items:
        stock = store.available_stock(p)
        color = p.get("color") if p.get("color") not in (None, "", "auto") else (
            "success" if stock > 0 else "danger")
        text = "%s %s [%s]" % (p.get("icon") or "", p.get("name") or "",
                               price_str(discounted_price(p.get("price"))))
        rows.append([_btn(re.sub(r"\s+", " ", text).strip(), color, p.get("emoji_id"),
                          cb="view:%d:c:%d" % (p["id"], cid))])
    rows.append([_btn(t("lbl_back", lang), "default", None, cb="listen:0")])
    title = (cat.get("name") if cat else t("lbl_products_title", lang)) or ""
    body, markup = "<b>%s</b>" % esc(title), inline_keyboard(rows)
    if edit:
        return safe_edit(user["tg_id"], edit, body, markup)
    return safe_send(user["tg_id"], body, markup)


# ----------------------------------------------------------------------------
#  CALLBACK HANDLER
# ----------------------------------------------------------------------------

def handle_callback(cb):
    data = cb.get("data") or ""
    frm = cb.get("from") or {}
    msg = cb.get("message") or {}
    chat_id = (msg.get("chat") or {}).get("id") or frm.get("id")
    message_id = msg.get("message_id")
    cb_id = cb.get("id")

    if not frm.get("id"):
        return
    user = store.get_or_create_user(frm)
    lang = lang_of(user)
    tg.answer_callback(cb_id)

    if user.get("banned") and not is_owner_user(user):
        return
    if store.get_bool("maintenance") and not is_owner_user(user):
        return

    parts = data.split(":")
    head = parts[0] if parts else ""

    # ---- products pagination ----
    if head == "pg":
        page = to_int(parts[1] if len(parts) > 1 else 0, 0)
        return products_page(user, page, edit=message_id)

    if head == "close":
        return tg.delete_message(chat_id, message_id)

    if head == "menu":
        return send_main_menu(user)

    if head in ("view", "buy"):
        back = "pg:0"
        if len(parts) > 3 and parts[2] in ("p", "c"):
            back = ("pg:" if parts[2] == "p" else "cat:") + str(max(0, to_int(parts[3], 0)))
        return product_view(user, to_int(parts[1] if len(parts) > 1 else 0, 0), edit=message_id, back=back)

    if head == "cat":
        return category_products(user, to_int(parts[1] if len(parts) > 1 else 0, 0), edit=message_id)

    if head == "confirm":
        pid = to_int(parts[1] if len(parts) > 1 else 0, 0)
        p = store.product_by_id(pid)
        if not p:
            return safe_edit(chat_id, message_id, "❌")
        ok, payload = deliver_order(user, p, 1)
        if isinstance(payload, tuple) and len(payload) == 2:
            body, markup = payload
        else:
            body = str(payload)
            markup = inline_keyboard([[_btn(t("lbl_close", lang), "default")]])
        if message_id:
            return safe_edit(chat_id, message_id, body, markup)
        return safe_send(chat_id, body, markup)

    if head == "offers":
        return show_offers(user, edit=message_id)

    if head == "search":
        return run_route(user, "search")

    if head == "topup":
        return deposit_start(user)

    if head == "wallet":
        body, markup = wallet_text(user)
        return safe_send(chat_id, body, markup)

    if head == "orders":
        body, markup = orders_text(user)
        return safe_send(chat_id, body, markup)

    if head == "lang":
        new_lang = parts[1] if len(parts) > 1 else "ar"
        if new_lang not in ("ar", "en"):
            new_lang = "ar"
        store.update_user(user["tg_id"], lang=new_lang)
        user = store.get_user(user["tg_id"])
        return send_main_menu(user, "✅ " + ("تم تغيير اللغة." if new_lang == "ar"
                                            else "Language updated."))

    if head == "help":
        return safe_send(chat_id, text_for("help_text", lang), build_back_keyboard(lang))

    if head == "policy":
        return safe_send(chat_id, text_for("policy_text", lang), build_back_keyboard(lang))

    # ---- deposit approval (owner only) ----
    if head == "dep":
        if not is_owner_user(user):
            return
        action = parts[1] if len(parts) > 1 else ""
        did = to_int(parts[2] if len(parts) > 2 else 0, 0)
        dep = store.get_deposit(did)
        if not dep:
            return
        if action == "ok":
            dep = store.review_deposit(did, "approved", "approved via bot")
            if not dep:
                return safe_edit(chat_id, message_id, "⚠️ تمت مراجعة طلب الشحن مسبقاً.")
            target = store.get_user_by_id(dep["user_id"])
            if target:
                safe_send(target["tg_id"], "✅ <b>%s</b>\n\n+%s\n💰 %s: %s" % (
                    "تم شحن رصيدك" if lang_of(target) == "ar" else "Your balance was credited",
                    price_str(dep["amount"]),
                    "الرصيد الجديد" if lang_of(target) == "ar" else "New balance",
                    price_str(store.get_user(target["tg_id"]).get("balance")),
                ), build_main_keyboard(store.get_user(target["tg_id"])))
            return safe_edit(chat_id, message_id, "✅ #%d — %s" % (did, price_str(dep["amount"])))
        if action == "no":
            dep = store.review_deposit(did, "rejected", "rejected via bot")
            if not dep:
                return safe_edit(chat_id, message_id, "⚠️ تمت مراجعة طلب الشحن مسبقاً.")
            target = store.get_user_by_id(dep["user_id"])
            if target:
                safe_send(target["tg_id"], "❌ <b>%s</b>" % (
                    "تم رفض طلب الشحن #%d. تواصل مع الدعم: @%s" % (did, support())
                    if lang_of(target) == "ar" else
                    "Top-up request #%d was rejected. Contact support: @%s" % (did, support())))
            return safe_edit(chat_id, message_id, "❌ #%d" % did)

    if head == "listen":
        # Telegram cannot attach a reply keyboard to an edited inline message.
        # Close the old screen and send a compact menu with the persistent keyboard.
        if message_id:
            tg.delete_message(chat_id, message_id)
        return send_main_menu(user, esc(t("lbl_main_menu", lang)))

    if head == "order":
        oid = to_int(parts[1] if len(parts) > 1 else 0, 0)
        o = store.get_order(oid)
        if not o or o["user_id"] != user["id"]:
            return None
        status_txt = {"pending": "⏳ قيد المعالجة", "delivered": "✅ مُسلَّم",
                      "cancelled": "❌ ملغى", "refunded": "💸 مُسترجع"}.get(o["status"], o["status"])
        body = "🧾 <b>الطلب #%d</b>\n\n📦 %s ×%d\n💵 %s\n🚦 %s\n📅 %s" % (
            o["id"], esc(o["product_name"]), o["qty"], price_str(o["total"]),
            esc(status_txt), esc(ts_from_iso(o.get("created_at"), "-")))
        if o.get("delivery"):
            body += "\n\n<pre>%s</pre>" % html.escape(o["delivery"], quote=False)
        return safe_send(chat_id, body, build_back_keyboard(lang))

    if head == "cancel":
        if message_id:
            tg.delete_message(chat_id, message_id)
        return run_route(user, "cancel")

    if head == "support":
        if support():
            return tg.answer_callback(cb_id, "@" + support())
        return None

    # ---- owner panel quick actions ----
    if head == "adm":
        if not is_owner_user(user):
            return
        action = parts[1] if len(parts) > 1 else "refresh"
        if action == "discount":
            state_clear(user["tg_id"])
            PENDING_BROADCAST.pop(user["tg_id"], None)
            state_set(user["tg_id"], "admin_discount", expires=time.time() + 1800)
            return safe_send(chat_id, "🏷 الخصم العام الحالي %d%%. أرسل نسبة من 0 إلى 90 (0 للإيقاف)." % discount_percent(),
                             reply_keyboard([[_rbtn("❌ إلغاء", "danger")]]))
        if action == "broadcast":
            state_clear(user["tg_id"])
            PENDING_BROADCAST[user["tg_id"]] = {"text": ""}
            return safe_send(chat_id, "📣 <b>أرسل نص الرسالة الآن</b>\n\n"
                                      "سيتم إرسالها لكل المستخدمين. للإلغاء: /cancel",
                             reply_keyboard([[_rbtn("❌ إلغاء", "danger")]]))
        if action == "send_broadcast":
            job = state_get(user["tg_id"])
            nonce = parts[2] if len(parts) > 2 else ""
            if not job or job.get("kind") not in ("broadcast_preview", "broadcast_progress") or not job.get("text") or not nonce or not hmac.compare_digest(job.get("nonce", ""), nonce):
                return safe_send(chat_id, "⚠️ هذه المعاينة منتهية أو لا توجد إذاعة بانتظار التأكيد.", build_main_keyboard(user))
            job["kind"] = "broadcast_progress"
            job["nonce"] = secrets.token_hex(6)  # old confirmation is single use
            if message_id:
                safe_edit(chat_id, message_id, "📣 جارٍ إرسال الدفعة...")
            return run_broadcast_batch(user, job)
        if action == "deposits":
            pending = store.deposits_list(limit=10, status="pending")
            if not pending:
                return safe_send(chat_id, "✅ لا شحنات بانتظار المراجعة.")
            for d in pending[:5]:
                safe_send(chat_id, "💳 <b>#%d</b>\n👤 %s\n💵 %s\n🔑 <code>%s</code>" % (
                    d["id"], esc(d.get("username") or d.get("first_name") or "-"),
                    price_str(d["amount"]), esc(d.get("txid") or "-")),
                    inline_keyboard([[
                        _btn("✅ موافقة", "success", None, cb="dep:ok:%d" % d["id"]),
                        _btn("❌ رفض", "danger", None, cb="dep:no:%d" % d["id"]),
                    ]]))
            return None
        return admin_home(user, edit=message_id)


# ============================================================================
#  OWNER ADMIN (inside Telegram)  — اللوحة الكاملة موجودة في الويب،
#  وهذه واجهة سريعة للمالك من داخل البوت نفسه.
# ============================================================================

def admin_home(user, edit=None):
    if not is_owner_user(user):
        return
    s = store.stats()
    url = panel_url()
    body = (
        "⚙️ <b>لوحة تحكم المالك</b>\n\n"
        "👥 المستخدمون: <b>%d</b>\n"
        "🧾 الطلبات: <b>%d</b>\n"
        "💰 المبيعات: <b>%s</b>\n"
        "💳 شحنات بانتظار المراجعة: <b>%d</b>\n"
        "📦 منتجات: <b>%d</b>\n"
        "🗂 مخزون متاح: <b>%d</b>\n"
    ) % (s["users"], s["orders"], price_str(s["revenue"]), s["pending_deposits"],
         s["products"], s["stock"])
    if url:
        body += "\n🌐 <a href=\"%s/panel\">افتح لوحة التحكم الكاملة</a>" % esc(url)
    else:
        body += "\n🌐 اضبط <code>PUBLIC_URL</code> لفتح اللوحة الكاملة."

    rows = [
        [_btn("📣 إرسال جماعي", "primary", None, cb="adm:broadcast"),
         _btn("💳 الشحنات", "success", None, cb="adm:deposits")],
        [_btn("🏷 ضبط الخصم", "success", None, cb="adm:discount")],
        [_btn("🔄 تحديث", "default", None, cb="adm:refresh"),
         _btn("🏪 المتجر", "default", None, cb="menu")],
    ]
    if url:
        rows.insert(1, [_btn("🌐 لوحة الويب", "primary", None, url=url + "/panel")])
        rows.insert(2, [_btn("📦 المنتجات", "primary", None, url=url + "/panel/products"),
                        _btn("🧾 الطلبات", "primary", None, url=url + "/panel/orders")])
        rows.insert(3, [_btn("👥 المستخدمون", "primary", None, url=url + "/panel/users"),
                        _btn("✏️ الأزرار", "primary", None, url=url + "/panel/buttons")])
    markup = inline_keyboard(rows)
    if edit:
        return safe_edit(user["tg_id"], edit, body, markup)
    return safe_send(user["tg_id"], body, markup)


def _broadcast_one(uid, text):
    # Plain text accepts <, &, etc.; a short timeout keeps serverless batches bounded.
    for attempt in range(2):
        try:
            tg.call("sendMessage", timeout=5, chat_id=uid, text=text, disable_web_page_preview=True)
            return True
        except TgError as exc:
            if exc.code == 429 and 0 < exc.retry_after <= 5 and attempt == 0:
                time.sleep(exc.retry_after)
                continue
            log.warning("broadcast to %s failed: %s", uid, exc.description)
            return False
        except Exception:
            log.exception("broadcast send failed")
            return False
    return False


def run_broadcast_batch(owner, job):
    # The cursor and nonce persist across Vercel requests. Large broadcasts are
    # continued by the owner so no background thread is killed at request end.
    rows = store.q("SELECT tg_id FROM users WHERE banned=0 AND tg_id>? ORDER BY tg_id LIMIT 21", (job.get("cursor", 0),))
    for row in rows[:20]:
        uid = row["tg_id"]
        ok = _broadcast_one(uid, job["text"])
        job["sent" if ok else "failed"] = job.get("sent" if ok else "failed", 0) + 1
        job["cursor"] = uid
    sent, failed = job.get("sent", 0), job.get("failed", 0)
    if len(rows) > 20:
        return safe_send(owner["tg_id"], "📣 تم إرسال دفعة. ✅ %d · ❌ %d\nاضغط للمتابعة أو الإلغاء." % (sent, failed),
                         inline_keyboard([[_btn("▶️ متابعة الإذاعة", "success", None, cb="adm:send_broadcast:" + job["nonce"]),
                                           _btn("❌ إيقاف", "danger", None, cb="cancel")]]))
    store.ex("INSERT INTO broadcasts(text,sent,failed,created_at) VALUES(?,?,?,?)",
             (job["text"], sent, failed, now_iso()))
    state_clear(owner["tg_id"])
    return safe_send(owner["tg_id"], "📣 <b>انتهى الإرسال</b>\n\n✅ %d\n❌ %d" % (sent, failed), build_main_keyboard(owner))


# ============================================================================
#  LONG-POLLING LOOP
# ============================================================================

class Poller(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True, name="tg-poller")
        self.offset = store.get_int("tg_offset", 0)
        self.stop_flag = threading.Event()
        self.conflict_count = 0

    def run(self):
        log.info("🚀 بدء استقبال التحديثات (long polling)...")
        while not self.stop_flag.is_set():
            try:
                updates = tg.call(
                    "getUpdates", timeout=45,
                    offset=(self.offset or None), limit=100,
                    allowed_updates=["message", "callback_query"],
                )
            except TgError as exc:
                desc = (exc.description or "").lower()
                if exc.code == 409 or "conflict" in desc or "terminated by other" in desc:
                    self.conflict_count += 1
                    wait = 3 if self.conflict_count < 4 else 10
                    log.error("تعارض في الاتصال (409): يعمل بنسخة أخرى من نفس البوت. "
                              "أوقف النسخة الأخرى. إعادة المحاولة خلال %ds", wait)
                    time.sleep(wait)
                    continue
                if exc.code == 429:
                    time.sleep(max(1, exc.retry_after or 3))
                    continue
                if exc.code == 401:
                    log.error("❌ توكن البوت غير صحيح (401 Unauthorized). تحقق من BOT_TOKEN.")
                    time.sleep(10)
                    continue
                if desc.startswith("network") or "timed out" in desc:
                    time.sleep(1)
                    continue
                log.warning("getUpdates: %s", exc.description)
                time.sleep(2)
                continue
            except Exception:
                log.error("Poller error:\n%s", traceback.format_exc())
                time.sleep(2)
                continue

            if not isinstance(updates, list):
                time.sleep(1)
                continue
            self.conflict_count = 0
            for upd in updates:
                try:
                    self.offset = max(self.offset, to_int(upd.get("update_id"), 0) + 1)
                except Exception:
                    pass
                on_update(upd)
            if updates:
                store.set_setting("tg_offset", str(self.offset))


# ============================================================================
#  WEB CONTROL PANEL — design tokens (sampled from the reference screenshots)
# ============================================================================

PALETTE = {
    "page_bg":      "#1d2f23",   # الخلفية الداكنة
    "card":         "#ffffff",   # البطاقة البيضاء
    "title":        "#314a35",   # العنوان الأخضر الغامق
    "button":       "#33533c",   # الزر الأساسي
    "gold":         "#9a7c3e",   # الذهبي (مساحة خاصة)
    "error_bg":     "#fbf0ed",   # خلفية الخطأ
    "error_text":   "#9a5247",   # نص الخطأ
    "muted":        "#98a198",   # النص الرمادي
    "soft":         "#eef4ea",   # مربع الأيقونة
    "border":       "#e3e8e2",
    "green":        "#55af53",   # أخضر أزرار تيليغرام
    "blue":         "#3b86f7",   # أزرق
    "red":          "#e4553f",   # أحمر
}

PANEL_CSS = """
:root{
  --page:#1d2f23; --card:#ffffff; --title:#314a35; --btn:#33533c; --gold:#9a7c3e;
  --errbg:#fbf0ed; --errtx:#9a5247; --muted:#98a198; --soft:#eef4ea; --border:#e3e8e2;
  --green:#55af53; --blue:#3b86f7; --red:#e4553f; --radius:16px;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{min-height:100%}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Cairo","Tajawal",Roboto,Arial,sans-serif;
  background:var(--page); color:#1b2b20; -webkit-font-smoothing:antialiased; line-height:1.6;
}
body.dark{background:#16241b}
a{color:inherit;text-decoration:none}
.wrap{max-width:1180px;margin:0 auto;padding:18px 14px 60px}
.topbar{display:flex;align-items:center;gap:12px;padding:14px 4px 22px;color:#e9f0e8;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:19px;letter-spacing:.2px}
.brand .dot{width:34px;height:34px;border-radius:11px;background:linear-gradient(145deg,#8fbf8c,#557e59);
  display:grid;place-items:center;font-size:16px}
.topbar .spacer{flex:1}
.topbar .pill{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.14);
  color:#dfe9dd;padding:6px 12px;border-radius:999px;font-size:12.5px}
.topbar a.pill:hover{background:rgba(255,255,255,.16)}

/* ---------- login card (exact reference look) ---------- */
.login-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.login-card{width:100%;max-width:420px;background:var(--card);border-radius:24px;padding:26px 22px 22px;
  box-shadow:0 24px 60px rgba(0,0,0,.28);position:relative}
.login-close{position:absolute;top:18px;left:18px;width:42px;height:42px;border-radius:13px;
  border:1px solid var(--border);background:#fff;color:#9aa79b;display:grid;place-items:center;
  font-size:19px;line-height:1}
.login-badge{width:86px;height:86px;margin:6px auto 20px;border-radius:26px;background:var(--soft);
  display:grid;place-items:center}
.login-badge svg{width:36px;height:36px;stroke:#4f7752;fill:none;stroke-width:2.1}
.eyebrow{display:flex;align-items:center;justify-content:center;gap:10px;color:var(--gold);
  font-weight:700;font-size:13.5px;letter-spacing:.2px}
.eyebrow .dash{width:34px;height:3px;border-radius:3px;background:var(--gold)}
.login-title{text-align:center;color:var(--title);font-size:30px;font-weight:900;margin:8px 0 6px}
.login-sub{text-align:center;color:var(--muted);font-size:13.5px;margin-bottom:22px}
label.fld{display:block;font-size:13.5px;font-weight:700;color:#5d6b60;margin:0 0 7px;text-align:right}
input[type=password],input[type=text],input[type=number],input[type=url],select,textarea{
  width:100%;border:1px solid var(--border);background:#fff;border-radius:12px;padding:13px 15px;
  font-size:15px;color:#22302a;font-family:inherit;outline:none;transition:.15s}
input:focus,select:focus,textarea:focus{border-color:#9dbf9f;box-shadow:0 0 0 3px rgba(85,126,89,.12)}
.err{background:var(--errbg);color:var(--errtx);border-radius:11px;padding:12px 15px;font-size:13px;
  text-align:right;margin:12px 0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;width:100%;
  background:var(--btn);color:#fff;border:0;border-radius:13px;padding:15px 18px;font-size:16px;
  font-weight:800;cursor:pointer;font-family:inherit;transition:.15s}
.btn:hover{filter:brightness(1.08)}
.btn:active{transform:translateY(1px)}
.btn.sm{width:auto;padding:9px 14px;font-size:13.5px;border-radius:10px}
.btn.ghost{background:#eef2ec;color:#3b4f40}
.btn.green{background:var(--green)}
.btn.blue{background:var(--blue)}
.btn.red{background:var(--red)}
.btn.gold{background:var(--gold)}
.btn.warn{background:#c8892d}
.btn.danger-ghost{background:#fdeeeb;color:#b0452f}

/* ---------- app shell ---------- */
.layout{display:grid;grid-template-columns:240px 1fr;gap:16px;align-items:start}
.side{background:#223528;border:1px solid rgba(255,255,255,.07);border-radius:18px;padding:12px;
  position:sticky;top:16px;max-height:calc(100vh - 32px);overflow:auto}
.side a{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:11px;
  color:#cfdccb;font-size:13.5px;font-weight:600;margin-bottom:3px}
.side a:hover{background:rgba(255,255,255,.07);color:#fff}
.side a.active{background:#3a5a41;color:#fff}
.side .grp{color:#7d9480;font-size:11px;text-transform:uppercase;letter-spacing:.08em;
  padding:12px 12px 6px;font-weight:800}
.main{min-width:0}
.card{background:var(--card);border-radius:18px;padding:20px;box-shadow:0 8px 26px rgba(0,0,0,.10);
  margin-bottom:16px}
.card.tight{padding:14px 16px}
h1.page{color:#fff;font-size:22px;font-weight:900;margin-bottom:14px;letter-spacing:.2px}
h2.sec{color:var(--title);font-size:16.5px;font-weight:900;margin-bottom:12px;display:flex;
  align-items:center;gap:8px}
.muted{color:var(--muted);font-size:12.8px}
.grid{display:grid;gap:12px}
.grid.c2{grid-template-columns:repeat(2,minmax(0,1fr))}
.grid.c3{grid-template-columns:repeat(3,minmax(0,1fr))}
.grid.c4{grid-template-columns:repeat(4,minmax(0,1fr))}
@media(max-width:900px){.layout{grid-template-columns:1fr}.side{position:static;max-height:none}
  .grid.c4,.grid.c3{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.grid.c2,.grid.c3,.grid.c4{grid-template-columns:1fr}}
.stat{background:#fff;border-radius:16px;padding:16px;border:1px solid var(--border)}
.stat .k{color:var(--muted);font-size:12px;font-weight:700}
.stat .v{color:var(--title);font-size:23px;font-weight:900;margin-top:3px;direction:ltr;text-align:right}
table{width:100%;border-collapse:collapse;font-size:13.3px}
th{text-align:right;color:#7b8a7e;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;
  padding:8px 10px;border-bottom:1px solid var(--border);font-weight:800}
td{padding:10px;border-bottom:1px solid #f1f4f0;vertical-align:middle}
tr:last-child td{border-bottom:0}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11.5px;font-weight:800}
.b-gray{background:#eef2ec;color:#5d6b60}
.b-green{background:#e6f4e4;color:#3e7a3c}
.b-red{background:#fdeae7;color:#b0452f}
.b-blue{background:#e7f0fe;color:#2f6bd6}
.b-gold{background:#f7efdd;color:#8a6d33}
.row{display:flex;gap:9px;flex-wrap:wrap;align-items:center}
.row.end{justify-content:flex-end}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;
  margin-bottom:12px}
.sw{display:inline-flex;border-radius:11px;overflow:hidden;border:1px solid var(--border)}
.sw button{border:0;background:#fff;padding:9px 14px;font-family:inherit;font-size:13px;
  font-weight:800;cursor:pointer;color:#5d6b60}
.sw button.on{color:#fff}
.sw button[data-c=success].on{background:var(--green)}
.sw button[data-c=primary].on{background:var(--blue)}
.sw button[data-c=danger].on{background:var(--red)}
.sw button[data-c=default].on{background:#8b9a8d}
.chip{background:#f2f6f1;border:1px solid var(--border);border-radius:10px;padding:6px 10px;
  font-size:12.5px;font-weight:700;color:#4c5d50;cursor:pointer}
.chip:hover{background:#e8f0e7}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.tabs a{padding:8px 14px;border-radius:10px;background:rgba(255,255,255,.09);color:#dbe7d8;
  font-size:13px;font-weight:700}
.tabs a.active{background:#fff;color:var(--title)}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#22352a;color:#fff;
  padding:12px 20px;border-radius:12px;font-size:13.5px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.3);
  z-index:99}
.helptext{color:var(--muted);font-size:12px;margin-top:5px}
details{border:1px solid var(--border);border-radius:12px;padding:10px 14px;margin-bottom:9px;background:#fbfdfa}
details summary{cursor:pointer;font-weight:800;color:var(--title);font-size:14px}
details[open] summary{margin-bottom:10px}
.kb-preview{background:#dfe8dc;padding:12px;border-radius:14px;display:grid;gap:7px}
.kb-row{display:flex;gap:7px}
.kb-b{flex:1;text-align:center;padding:10px 6px;border-radius:10px;color:#fff;font-size:13px;
  font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kb-success{background:var(--green)}.kb-primary{background:var(--blue)}
.kb-danger{background:var(--red)}.kb-default{background:#8b9a8d}
.kb-inline{background:#f4f8f2;padding:12px;border-radius:14px;display:grid;gap:6px}
.kb-inline .kb-b{font-size:12.5px}
.empty{text-align:center;color:var(--muted);padding:26px;font-size:13px}
.formgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
@media(max-width:640px){.formgrid{grid-template-columns:1fr}}
.f{display:flex;flex-direction:column;gap:5px}
.f.full{grid-column:1/-1}
.f label{font-size:12.5px;font-weight:800;color:#57685b}
.f small{color:var(--muted);font-size:11.5px}
textarea{min-height:90px;resize:vertical;line-height:1.55}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;direction:ltr;
  text-align:left;background:#f5f8f4;padding:10px 12px;border-radius:10px;overflow:auto}
.tag{font-size:11px;background:#eef4ea;color:#4f7752;border-radius:6px;padding:2px 7px;font-weight:800}
"""

PANEL_JS = """
function paint(btn){
  document.querySelectorAll('.sw button[data-g="'+btn.dataset.g+'"]').forEach(function(b){
    b.classList.toggle('on', b===btn);
  });
  var hidden=document.getElementById(btn.dataset.g);
  if(hidden) hidden.value=btn.dataset.c;
}
document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('.sw button').forEach(function(b){
    b.addEventListener('click',function(){paint(b)});
  });
});
function confirmSubmit(msg){return confirm(msg||'تأكيد العملية؟')}
"""


def html_page(title, body, extra_head="", dark=False, show_bar=True):
    return (
        "<!DOCTYPE html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<meta name=\"theme-color\" content=\"%(page)s\">"
        "<title>%(title)s</title><style>%(css)s</style>%(head)s</head>"
        "<body class=\"%(cls)s\">%(body)s<script>%(js)s</script></body></html>"
    ) % {
        "page": PALETTE["page_bg"], "title": html.escape(title), "css": PANEL_CSS,
        "head": extra_head, "body": body, "js": PANEL_JS,
        "cls": "dark" if dark else "",
    }


LOCK_SVG = (
    '<svg viewBox="0 0 24 24"><rect x="4" y="10.5" width="16" height="10.5" rx="2.6"/>'
    '<path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"/><circle cx="12" cy="15.8" r="1.1" fill="#4f7752" '
    'stroke="none"/></svg>'
)


def login_html(error="", notice=""):
    s = store
    title = s.get_setting("panel_title", "لوحة تحكم المتجر")
    eyebrow = s.get_setting("panel_eyebrow", "مساحة خاصة")
    subtitle = s.get_setting("panel_subtitle", "")
    err_box = ('<div class="err">%s</div>' % html.escape(error)) if error else ""
    note_box = ('<div class="err" style="background:#eef4ea;color:#4f7752">%s</div>' % html.escape(notice)) if notice else ""
    body = """
<div class="login-shell"><div class="login-card">
  <div class="login-close">✕</div>
  <div class="login-badge">%(lock)s</div>
  <div class="eyebrow">%(eyebrow)s <span class="dash"></span></div>
  <h1 class="login-title">%(title)s</h1>
  <div class="login-sub">%(subtitle)s</div>
  %(note)s
  <form method="post" action="/login">
    <label class="fld">كلمة المرور</label>
    <input type="password" name="password" autocomplete="current-password" required autofocus>
    %(err)s
    <button class="btn" type="submit" style="margin-top:14px">
      <span style="font-size:18px">‹</span> دخول لوحة التحكم
    </button>
  </form>
</div></div>""" % {"lock": LOCK_SVG, "eyebrow": html.escape(eyebrow), "title": html.escape(title),
                   "subtitle": html.escape(subtitle), "err": err_box, "note": note_box}
    return html_page(title, body)


# ============================================================================
#  PANEL SHELL
# ============================================================================

PANEL_NAV = [
    ("nav-core", [
        ("/panel", "📊 لوحة المعلومات", "home"),
        ("/panel/buttons", "🔘 أزرار البوت", "buttons"),
        ("/panel/products", "📦 المنتجات", "products"),
        ("/panel/categories", "🗂 التصنيفات", "categories"),
    ]),
    ("nav-ops", [
        ("/panel/orders", "🧾 الطلبات", "orders"),
        ("/panel/deposits", "💳 الشحنات", "deposits"),
        ("/panel/users", "👥 المستخدمون", "users"),
        ("/panel/broadcast", "📣 الإرسال الجماعي", "broadcast"),
    ]),
    ("nav-content", [
        ("/panel/texts", "📝 النصوص والرسائل", "texts"),
        ("/panel/payments", "💰 الدفع والمحفظة", "payments"),
        ("/panel/settings", "⚙️ الإعدادات", "settings"),
    ]),
]


def panel_shell(active, content, title=""):
    nav_parts = []
    for group, items in PANEL_NAV:
        parts = ['<div class="grp">%s</div>' % {
            "nav-core": "المتجر", "nav-ops": "العمليات", "nav-content": "المحتوى"
        }[group]]
        for href, text, key in items:
            cls = "active" if key == active else ""
            parts.append('<a class="%s" href="%s">%s</a>' % (cls, href, html.escape(text)))
        nav_parts.append("".join(parts))

    stats = store.stats()
    top = """
<div class="topbar">
  <div class="brand"><span class="dot">🏪</span><span>%(store)s</span></div>
  <span class="pill">المالك</span>
  <div class="spacer"></div>
  <span class="pill">🟢 يعمل</span>
  <span class="pill">👥 %(users)d</span>
  <span class="pill">🧾 %(orders)d</span>
  <a class="pill" href="/logout">خروج</a>
</div>""" % {"store": html.escape(store_name()), "users": stats["users"], "orders": stats["orders"]}

    body = """<div class="wrap">%s<div class="layout">
<div class="side">%s</div>
<div class="main"><h1 class="page">%s</h1>%s</div>
</div></div>""" % (top, "".join(nav_parts), html.escape(title), content)
    return html_page("%s — %s" % (store_name(), title), body)


def field(label_text, name, value="", kind="text", placeholder="", help_text="", full=False,
          options=None, rows=4, required=False):
    """Render one form control."""
    cls = "f full" if full else "f"
    val = "" if value is None else str(value)
    req = " required" if required else ""
    if kind == "textarea":
        ctrl = '<textarea name="%s" placeholder="%s"%s>%s</textarea>' % (
            name, html.escape(placeholder), req, html.escape(val))
    elif kind == "select":
        opts = []
        for opt_value, opt_label in (options or []):
            sel = " selected" if str(opt_value) == val else ""
            opts.append('<option value="%s"%s>%s</option>' % (
                html.escape(str(opt_value)), sel, html.escape(str(opt_label))))
        ctrl = '<select name="%s">%s</select>' % (name, "".join(opts))
    else:
        ctrl = '<input type="%s" name="%s" value="%s" placeholder="%s"%s>' % (
            kind, name, html.escape(val), html.escape(placeholder), req)
    help_html = '<small>%s</small>' % html.escape(help_text) if help_text else ""
    return '<div class="%s"><label>%s</label>%s%s</div>' % (
        cls, html.escape(label_text), ctrl, help_html)


def color_picker(group, value):
    """Colored segmented control matching Telegram's success/danger/primary."""
    value = value if value in ("success", "primary", "danger", "default") else "primary"
    parts = []
    for code, label_text in (("success", "أخضر"), ("primary", "أزرق"),
                             ("danger", "أحمر"), ("default", "افتراضي")):
        cls = "on" if code == value else ""
        parts.append('<button type="button" data-g="%s" data-c="%s" class="%s">%s</button>' % (
            group, code, cls, label_text))
    return ('<div class="sw">%s</div><input type="hidden" name="%s" id="%s" value="%s">'
            % ("".join(parts), group, group, value))


def btn_class(color):
    return "kb-" + (color if color in ("success", "primary", "danger") else "default")


def flash(msg, kind="ok"):
    color = "#eef4ea" if kind == "ok" else "#fdeeeb"
    text = "#3e7a3c" if kind == "ok" else "#b0452f"
    return '<div class="card tight" style="background:%s;color:%s;font-weight:800">%s</div>' % (
        color, text, html.escape(msg))


# ============================================================================
#  PANEL: DASHBOARD
# ============================================================================

def page_dashboard(qs, flash_msg=None):
    s = store.stats()
    bot_username = store.get_setting("bot_username", "")
    content = []
    if flash_msg:
        content.append(flash(flash_msg))
    if os.environ.get("RABOT_SERVERLESS") == "1":
        content.append('''<div class="card"><form method="post" action="/panel/activate-bot">
          <button class="btn green" type="submit">🤖 تفعيل البوت على تيليغرام</button>
          </form></div>''')
    content.append("""
<div class="grid c4">
  <div class="stat"><div class="k">المستخدمون</div><div class="v">%d</div>
    <div class="muted">+%d اليوم</div></div>
  <div class="stat"><div class="k">الطلبات</div><div class="v">%d</div>
    <div class="muted">+%d اليوم</div></div>
  <div class="stat"><div class="k">المبيعات</div><div class="v">%s</div>
    <div class="muted">%s اليوم</div></div>
  <div class="stat"><div class="k">بانتظار المراجعة</div><div class="v">%d</div>
    <div class="muted">شحنات</div></div>
</div>""" % (s["users"], s["users_today"], s["orders"], s["orders_today"],
             price_str(s["revenue"]), price_str(s["revenue_today"]), s["pending_deposits"]))

    content.append("""
<div class="grid c4" style="margin-top:12px">
  <div class="stat"><div class="k">المنتجات</div><div class="v">%d</div></div>
  <div class="stat"><div class="k">مخزون متاح</div><div class="v">%d</div></div>
  <div class="stat"><div class="k">إجمالي الشحنات المقبولة</div><div class="v">%s</div></div>
  <div class="stat"><div class="k">طلبات معلقة</div><div class="v">%d</div></div>
</div>""" % (s["products"], s["stock"], price_str(s["deposits_total"]), s["pending_orders"]))

    recent_orders = store.orders_list(limit=6)
    rows = "".join(
        "<tr><td>#%d</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % (
            o["id"], html.escape(o["product_name"] or "-"),
            html.escape(o.get("username") or o.get("first_name") or str(o["user_id"])),
            price_str(o["total"]),
            '<span class="badge %s">%s</span>' % (
                "b-green" if o["status"] == "delivered" else "b-gold", o["status"]),
        ) for o in recent_orders
    ) or '<tr><td colspan="5" class="empty">لا توجد طلبات بعد</td></tr>'

    warning = ""
    if not store.get_setting("binance_pay_id"):
        warning = ('<div class="err" style="margin-bottom:12px">⚠️ معرّف Binance Pay غير مُعد بعد — '
                   'الشحن معطّل للمستخدمين. <a href="/panel/payments" style="text-decoration:underline">'
                   'اضبطه الآن</a></div>')
    if not store.get_setting("panel_password_hash"):
        warning += ('<div class="err" style="margin-bottom:12px">⚠️ لم يتم تعيين كلمة مرور للوحة بعد. '
                    '<a href="/panel/settings" style="text-decoration:underline">عيّنها الآن</a></div>')

    content.append('<div class="card"><h2 class="sec">🧾 آخر الطلبات</h2>%s<table>'
                   '<tr><th>#</th><th>المنتج</th><th>المستخدم</th><th>المبلغ</th><th>الحالة</th></tr>'
                   '%s</table></div>' % (warning, rows))

    quick = """
<div class="card"><h2 class="sec">⚡ إجراءات سريعة</h2>
<div class="row">
  <a class="btn sm ghost" href="/panel/buttons">🔘 تعديل الأزرار</a>
  <a class="btn sm ghost" href="/panel/products">📦 إضافة منتج</a>
  <a class="btn sm ghost" href="/panel/texts">📝 تعديل نص الترحيب</a>
  <a class="btn sm ghost" href="/panel/broadcast">📣 إرسال جماعي</a>
  <a class="btn sm ghost" href="/bot-preview" target="_blank">📱 معاينة الأزرار</a>
</div></div>"""
    content.append(quick)

    if bot_username:
        token = store.get_setting("bot_username", "")
        content.append(
            '<div class="card"><h2 class="sec">🔗 روابط سريعة</h2>'
            '<div class="mono">https://t.me/%s?start=panel</div>'
            '<div class="helptext">افتح هذا الرابط من تيليغرام ليدخل المالك إلى لوحة التحكم '
            'داخل البوت مباشرة.</div></div>' % html.escape(token))
    return panel_shell("home", "".join(content), "لوحة المعلومات")


# ============================================================================
#  PANEL: BUTTONS
# ============================================================================

BUTTON_ACTIONS = [
    ("products", "عرض المنتجات"),
    ("search", "البحث عن منتج"),
    ("offers", "عرض الخصومات"),
    ("profile", "الملف الشخصي"),
    ("wallet", "المحفظة"),
    ("referrals", "الإحالات"),
    ("help", "المساعدة"),
    ("policy", "سياسة البوت"),
    ("deposit", "شحن الرصيد"),
    ("orders", "سجل الطلبات"),
    ("lang", "تغيير اللغة"),
    ("api", "خدمات API"),
    ("support", "الدعم الفني"),
    ("admin", "لوحة التحكم (للمالك)"),
    ("category", "فتح تصنيف (اكتب رقمه في الحقل)"),
    ("text", "نص مخصص (اكتب مفتاح الإعداد)"),
    ("url", "رابط (اكتب الرابط)"),
    ("menu", "القائمة الرئيسية"),
]


def render_keyboard_preview(lang="ar"):
    """Live preview of the reply keyboard exactly as Telegram draws it."""
    is_owner = True
    rows_map = {}
    for b in store.buttons():
        if b.get("owner_only") and not is_owner:
            continue
        rows_map.setdefault(to_int(b.get("row"), 0), []).append(b)
    out = []
    for row_index in sorted(rows_map):
        items = sorted(rows_map[row_index], key=lambda x: (to_int(x.get("sort"), 0), x["id"]))
        if store.get_bool("mirror_rows", False):
            items = list(reversed(items))
        cells = "".join(
            '<div class="kb-b %s">%s</div>' % (
                btn_class(b.get("color")),
                html.escape(render_button_label(b, lang)),
            ) for b in items
        )
        out.append('<div class="kb-row">%s</div>' % cells)
    return '<div class="kb-preview">%s</div>' % "".join(out) if out else '<div class="empty">لا أزرار</div>'


def page_buttons(qs, flash_msg=None):
    content = []
    if flash_msg:
        content.append(flash(flash_msg))

    content.append("""
<div class="card"><h2 class="sec">📱 معاينة مباشرة (كما تظهر في تيليغرام)</h2>
%s
<div class="helptext" style="margin-top:8px">الألوان: 🟢 success · 🔵 primary · 🔴 danger — نفس ألوان التصميم الأصلي.</div>
</div>""" % render_keyboard_preview("ar"))

    # add / edit form
    edit_id = to_int(qs.get("edit", [0])[0], 0)
    editing = store.get_button(edit_id) if edit_id else None
    rows_available = sorted({to_int(b.get("row"), 0) for b in store.buttons()} | {0, 1, 2, 3, 4, 5})

    form = """
<div class="card">
  <h2 class="sec">{heading}</h2>
  <form method="post" action="/panel/buttons/save">
    <input type="hidden" name="id" value="{edit_id}">
    <div class="formgrid">
      {label_ar}
      {label_en}
      {icon}
      {emoji_id}
      {row}
      {sort}
      {action}
      {payload}
      {visible}
      {owner_only}
      {custom_text_ar}
      {custom_text_en}
    </div>
    <div class="f full" style="margin-top:12px"><label>اللون</label>{color}</div>
    <div class="row end" style="margin-top:16px">
      {cancel}
      <button class="btn sm green" type="submit">💾 حفظ</button>
    </div>
  </form>
</div>""".format(
        heading=("✏️ تعديل الزر" if editing else "➕ إضافة زر جديد"),
        edit_id=edit_id,
        label_ar=field("النص بالعربية", "label_ar", (editing or {}).get("label_ar", ""),
                       required=True, placeholder="المنتجات"),
        label_en=field("النص بالإنجليزية", "label_en", (editing or {}).get("label_en", ""),
                       placeholder="Products"),
        icon=field("الأيقونة (إيموجي)", "icon", (editing or {}).get("icon", ""),
                   placeholder="🏪",
                   help_text="الإيموجي تظهر يمين النص في العربية (كما في التصميم)"),
        emoji_id=field("معرّف إيموجي مخصص", "emoji_id", (editing or {}).get("emoji_id", ""),
                       help_text="اختياري — إيموجي بريميوم"),
        row=field("الصف", "row", (editing or {}).get("row", 0), kind="select",
                  options=[(r, "الصف %d" % (r + 1)) for r in rows_available]),
        sort=field("الترتيب داخل الصف", "sort", (editing or {}).get("sort", 0), kind="number",
                   help_text="0 = يمين الصف، 1 = الذي بعده"),
        action=field("الإجراء", "action", (editing or {}).get("action", "products"),
                     kind="select", options=BUTTON_ACTIONS),
        payload=field("بيانات الإجراء", "payload", (editing or {}).get("payload", ""),
                      help_text="رقم تصنيف / مفتاح نص / رابط حسب الإجراء"),
        visible=field("ظاهر", "visible", (editing or {}).get("visible", 1), kind="select",
                      options=[(1, "نعم"), (0, "لا (مخفي)")]),
        owner_only=field("للمالك فقط", "owner_only", (editing or {}).get("owner_only", 0),
                         kind="select",
                         options=[(0, "لا — للجميع"), (1, "نعم — للمالك فقط")]),
        custom_text_ar=field("نص مخصص بالعربية (لإجراء نص مخصص)", "custom_text_ar",
            store.get_setting(((editing or {}).get("payload") or "") + "_ar", "") if editing and editing.get("action") == "text" else "", kind="textarea"),
        custom_text_en=field("نص مخصص بالإنجليزية", "custom_text_en",
            store.get_setting(((editing or {}).get("payload") or "") + "_en", "") if editing and editing.get("action") == "text" else "", kind="textarea"),
        color=color_picker("color", (editing or {}).get("color", "primary")),
        cancel=('<a class="btn sm ghost" href="/panel/buttons">إلغاء</a>' if editing else ""),
    )

    rows = []
    for b in store.buttons(include_hidden=True):
        rows.append("""
<tr>
  <td><span class="tag">%d</span></td>
  <td><b>%s</b><div class="muted">%s</div></td>
  <td>%s %s</td>
  <td><span class="badge %s">%s</span></td>
  <td>%d · %d</td>
  <td>%s</td>
  <td class="row">
    <a class="btn sm ghost" href="/panel/buttons?edit=%d">تعديل</a>
    <form method="post" action="/panel/buttons/delete" onsubmit="return confirmSubmit('حذف هذا الزر؟')">
      <input type="hidden" name="id" value="%d">
      <button class="btn sm danger-ghost" type="submit">حذف</button>
    </form>
  </td>
</tr>""" % (
            b["id"], html.escape(b.get("label_ar") or "-"), html.escape(b.get("label_en") or "-"),
            html.escape(b.get("icon") or ""), html.escape(b.get("label_ar") or ""),
            "b-green" if b.get("color") == "success" else ("b-red" if b.get("color") == "danger"
                                                           else ("b-blue" if b.get("color") == "primary" else "b-gray")),
            html.escape(b.get("color") or "default"),
            to_int(b.get("row"), 0) + 1, to_int(b.get("sort"), 0),
            "👁 ظاهر" if b.get("visible") else "🚫 مخفي",
            b["id"], b["id"],
        ))

    table = """
<div class="card"><h2 class="sec">🔘 كل الأزرار</h2>
<table>
<tr><th>#</th><th>النص</th><th>يظهر كـ</th><th>اللون</th><th>الصف·الترتيب</th><th>الحالة</th><th></th></tr>
%s</table></div>""" % ("".join(rows) or '<tr><td colspan="7" class="empty">لا أزرار</td></tr>')

    content += [form, table]
    return panel_shell("buttons", "".join(content), "أزرار البوت")


def page_buttons_save(form):
    bid = to_int(form.get("id", [""])[0], 0)
    data = {
        "label_ar": (form.get("label_ar", [""])[0] or "").strip(),
        "label_en": (form.get("label_en", [""])[0] or "").strip(),
        "icon": (form.get("icon", [""])[0] or "").strip(),
        "emoji_id": (form.get("emoji_id", [""])[0] or "").strip(),
        "color": (form.get("color", ["primary"])[0] or "primary").strip(),
        "row": (form.get("row", ["0"])[0] or "0").strip(),
        "sort": (form.get("sort", ["0"])[0] or "0").strip(),
        "action": (form.get("action", ["products"])[0] or "products").strip(),
        "payload": (form.get("payload", [""])[0] or "").strip(),
        "visible": (form.get("visible", ["1"])[0] or "1").strip(),
        "owner_only": (form.get("owner_only", ["0"])[0] or "0").strip(),
    }
    if not data["label_ar"]:
        return "/panel/buttons", "❌ النص العربي مطلوب", "err"
    if data["color"] not in COLOR_MAP:
        data["color"] = "primary"
    if data["action"] not in {item[0] for item in BUTTON_ACTIONS}:
        return "/panel/buttons", "❌ إجراء غير صالح", "err"
    if data["action"] == "url" and not data["payload"].startswith("https://"):
        return "/panel/buttons", "❌ يجب أن يبدأ الرابط بـ https://", "err"
    if data["action"] == "text":
        if not data["payload"]:
            data["payload"] = "custom_" + secrets.token_hex(8)
        if not re.fullmatch(r"custom_[A-Za-z0-9_]{1,80}", data["payload"]):
            return "/panel/buttons", "❌ مفتاح النص يجب أن يبدأ بـ custom_ ويحتوي أحرفاً وأرقاماً فقط", "err"
        store.set_settings({data["payload"] + "_ar": form.get("custom_text_ar", [""])[0],
                            data["payload"] + "_en": form.get("custom_text_en", [""])[0]})
    if bid:
        store.update_button(bid, data)
        return "/panel/buttons", "✅ تم تحديث الزر", "ok"
    store.add_button(data)
    return "/panel/buttons", "✅ تمت إضافة الزر", "ok"


def page_buttons_delete(form):
    bid = to_int(form.get("id", [""])[0], 0)
    if bid:
        store.delete_button(bid)
    return "/panel/buttons", "🗑 تم حذف الزر", "ok"


# ============================================================================
#  PANEL: PRODUCTS
# ============================================================================

def product_color_for(p):
    color = p.get("color") or "auto"
    if color == "auto" or color not in COLOR_MAP:
        stock = store.available_stock(p)
        return "success" if stock > 0 else "danger"
    return color


def page_products(qs, flash_msg=None):
    content = []
    if flash_msg:
        content.append(flash(flash_msg))

    edit_id = to_int(qs.get("edit", [0])[0], 0)
    editing = store.product_by_id(edit_id) if edit_id else None
    cats = store.categories(include_hidden=True)
    cat_options = [(0, "بدون تصنيف")] + [(c["id"], c["name"]) for c in cats]

    form = """
<div class="card">
  <h2 class="sec">{heading}</h2>
  <form method="post" action="/panel/products/save">
    <input type="hidden" name="id" value="{edit_id}">
    <div class="formgrid">
      {name}{name_en}{icon}{emoji_id}{price}{category}{stock_mode}{stock}{sort}{visible}
    </div>
    <div class="f full" style="margin-top:12px"><label>لون الزر</label>{color}
      <small>auto = أخضر تلقائياً عند توفر المخزون وأحمر عند نفادِه.</small></div>
    <div class="formgrid" style="margin-top:12px">
      {desc}{desc_en}{feed}
    </div>
    <div class="row end" style="margin-top:16px">
      {cancel}<button class="btn sm green" type="submit">💾 حفظ المنتج</button>
    </div>
  </form>
</div>""".format(
        heading=("✏️ تعديل المنتج: " + html.escape(editing["name"])) if editing
                else "➕ إضافة منتج جديد",
        edit_id=edit_id,
        name=field("الاسم (عربي/أساسي)", "name", (editing or {}).get("name", ""), required=True),
        name_en=field("الاسم بالإنجليزية", "name_en", (editing or {}).get("name_en", "")),
        icon=field("الأيقونة", "icon", (editing or {}).get("icon", ""), placeholder="⭐️"),
        emoji_id=field("معرّف إيموجي مخصص", "emoji_id", (editing or {}).get("emoji_id", "")),
        price=field("السعر", "price", (editing or {}).get("price", ""), kind="number"),
        category=field("التصنيف", "category_id", (editing or {}).get("category_id", 0),
                       kind="select", options=cat_options),
        stock_mode=field("نوع المخزون", "stock_mode", (editing or {}).get("stock_mode", "auto"),
                         kind="select",
                         options=[("auto", "مخزون (تسليم تلقائي)"),
                                  ("unlimited", "غير محدود")]),
        stock=field("كمية إضافية للمخزون", "stock", 0, kind="number",
                    help_text="تُضاف كعناصر DEMO عند الحفظ — استخدم مدير المخزون بالأسفل "
                              "لعناصر حقيقية"),
        sort=field("الترتيب", "sort", (editing or {}).get("sort", 0), kind="number"),
        visible=field("ظاهر", "visible", (editing or {}).get("visible", 1), kind="select",
                      options=[(1, "نعم"), (0, "لا")]),
        color=color_picker("color", (editing or {}).get("color", "auto")),
        desc=field("الوصف (عربي)", "description", (editing or {}).get("description", ""),
                   kind="textarea", full=True),
        desc_en=field("الوصف بالإنجليزية", "description_en",
                      (editing or {}).get("description_en", ""), kind="textarea", full=True),
        feed=field("نص التسليم التلقائي (اختياري)", "feed", (editing or {}).get("feed", ""),
                   kind="textarea", full=True,
                   help_text="نص/كود يُسلَّم فوراً لكل عملية شراء (يدعم {order}). "
                             "للروابط والأكواد والمنتجات غير المحدودة. اتركه فارغاً "
                             "للتسليم من المخزون أو يدوياً."),
        cancel=('<a class="btn sm ghost" href="/panel/products">إلغاء</a>' if editing else ""),
    )

    # stock manager for the edited product
    stock_block = ""
    if editing:
        available = store.stock_list(editing["id"], used=0)
        used = store.stock_list(editing["id"], used=1)
        stock_block = """
<div class="card">
  <h2 class="sec">🗂 مخزون: %s</h2>
  <div class="row" style="margin-bottom:12px">
    <span class="badge b-green">متاح: %d</span>
    <span class="badge b-gray">مُسلَّم: %d</span>
    <span class="badge b-blue">إجمالي: %d</span>
  </div>
  <form method="post" action="/panel/stock/save">
    <input type="hidden" name="product_id" value="%d">
    <div class="f"><label>أضف عناصر (سطر لكل عنصر)</label>
      <textarea name="lines" placeholder="user@hotmail.com:Pass123&#10;user2@hotmail.com:Pass456"></textarea>
      <small>كل سطر = قطعة واحدة تُسلَّم تلقائياً عند البيع.</small>
    </div>
    <div class="row" style="margin-top:10px"><button class="btn sm green" type="submit">➕ إضافة للمخزون</button></div>
  </form>
  <details style="margin-top:14px"><summary>عرض العناصر المتاحة (%d)</summary>
    <div class="mono" style="max-height:220px;overflow:auto">%s</div>
  </details>
  <details><summary>عرض العناصر المُسلَّمة (%d)</summary>
    <div class="mono" style="max-height:220px;overflow:auto">%s</div>
  </details>
  <form method="post" action="/panel/stock/clear" onsubmit="return confirmSubmit('حذف كل المخزون المتاح لهذا المنتج؟')" style="margin-top:10px">
    <input type="hidden" name="product_id" value="%d">
    <button class="btn sm danger-ghost" type="submit">🗑 حذف المخزون المتاح</button>
  </form>
</div>""" % (
            html.escape(editing["name"]), len(available), len(used), len(available) + len(used),
            editing["id"], len(available),
            html.escape("\n".join(x["content"] for x in available)) or "—",
            len(used),
            html.escape("\n".join(x["content"] for x in used)) or "—",
            editing["id"],
        )

    body_rows = []
    for p in store.products(include_hidden=True):
        stock = store.available_stock(p)
        stock_txt = "♾" if p.get("stock_mode") == "unlimited" else str(stock)
        cat = store.get_category(p.get("category_id") or 0)
        body_rows.append("""
<tr>
  <td><span class="tag">{id}</span></td>
  <td><b>{icon} {name}</b><div class="muted">{name_en}</div></td>
  <td>{cat}</td>
  <td style="direction:ltr;text-align:right"><b>{price}</b></td>
  <td><span class="badge {stock_cls}">{stock}</span></td>
  <td>{vis_badge}</td>
  <td>{sold}</td>
  <td class="row">
    <a class="btn sm ghost" href="/panel/products?edit={id}">تعديل</a>
    <form method="post" action="/panel/products/delete" onsubmit="return confirmSubmit('حذف المنتج؟')">
      <input type="hidden" name="id" value="{id}"><button class="btn sm danger-ghost">حذف</button>
    </form>
  </td>
</tr>""".format(
            id=p["id"], icon=html.escape(p.get("icon") or ""), name=html.escape(p["name"]),
            name_en=html.escape(p.get("name_en") or ""),
            cat=html.escape((cat or {}).get("name") or "—"),
            price=price_str(p.get("price")),
            stock_cls="b-red" if product_color_for(p) == "danger" else "b-green", stock=stock_txt,
            vis_badge='<span class="badge %s">%s</span>' % (
                "b-blue" if p.get("visible") else "b-gray",
                "👁 ظاهر" if p.get("visible") else "🚫 مخفي"),
            sold=to_int(p.get("sold"), 0),
        ))

    table = """
<div class="card"><h2 class="sec">📦 كل المنتجات (%d)</h2>
<table>
<tr><th>#</th><th>المنتج</th><th>التصنيف</th><th>السعر</th><th>المخزون</th><th>الظهور</th><th>مبيع</th><th></th></tr>
%s</table></div>""" % (len(body_rows), "".join(body_rows) or
                        '<tr><td colspan="8" class="empty">لا منتجات</td></tr>')

    content += [form, stock_block, table]
    return panel_shell("products", "".join(content), "المنتجات")


def page_products_save(form):
    pid = to_int(form.get("id", [""])[0], 0)
    data = {
        "name": (form.get("name", [""])[0] or "").strip(),
        "name_en": (form.get("name_en", [""])[0] or "").strip(),
        "icon": (form.get("icon", [""])[0] or "").strip(),
        "emoji_id": (form.get("emoji_id", [""])[0] or "").strip(),
        "price": (form.get("price", ["0"])[0] or "0").strip(),
        "category_id": (form.get("category_id", ["0"])[0] or "0").strip(),
        "stock_mode": (form.get("stock_mode", ["auto"])[0] or "auto").strip(),
        "stock": (form.get("stock", ["0"])[0] or "0").strip(),
        "sort": (form.get("sort", ["0"])[0] or "0").strip(),
        "visible": (form.get("visible", ["1"])[0] or "1").strip(),
        "description": (form.get("description", [""])[0] or "").strip(),
        "description_en": (form.get("description_en", [""])[0] or "").strip(),
        "feed": (form.get("feed", [""])[0] or "").strip(),
        "color": (form.get("color", ["auto"])[0] or "auto").strip(),
    }
    if not data["name"]:
        return "/panel/products", "❌ الاسم مطلوب", "err"
    if data["color"] not in COLOR_MAP and data["color"] != "auto":
        data["color"] = "auto"
    if pid:
        store.update_product(pid, data)
        return "/panel/products?edit=%d" % pid, "✅ تم تحديث المنتج", "ok"
    new_id = store.add_product(data)
    return "/panel/products?edit=%d" % new_id, "✅ تمت إضافة المنتج — أضف له مخزوناً الآن", "ok"


def page_products_delete(form):
    pid = to_int(form.get("id", [""])[0], 0)
    if pid:
        store.delete_product(pid)
    return "/panel/products", "🗑 تم حذف المنتج", "ok"


def page_stock_save(form):
    pid = to_int(form.get("product_id", ["0"])[0], 0)
    raw = (form.get("lines", [""])[0] or "").replace("\r", "")
    lines = [ln for ln in raw.split("\n") if ln.strip()]
    added = store.add_stock_lines(pid, lines) if pid else 0
    return "/panel/products?edit=%d" % pid, "✅ تمت إضافة %d عنصر للمخزون" % added, "ok"


def page_stock_clear(form):
    pid = to_int(form.get("product_id", ["0"])[0], 0)
    if pid:
        store.ex("DELETE FROM stock_items WHERE product_id=? AND used=0", (pid,))
    return "/panel/products?edit=%d" % pid, "🗑 تم حذف المخزون المتاح", "ok"


# ============================================================================
#  PANEL: CATEGORIES
# ============================================================================

def page_categories(qs, flash_msg=None):
    content = []
    if flash_msg:
        content.append(flash(flash_msg))
    edit_id = to_int(qs.get("edit", [0])[0], 0)
    editing = store.get_category(edit_id) if edit_id else None

    form = """
<div class="card"><h2 class="sec">%s</h2>
<form method="post" action="/panel/categories/save">
  <input type="hidden" name="id" value="%d">
  <div class="formgrid">
    %s %s %s %s %s %s
  </div>
  <div class="row end" style="margin-top:14px">
    %s<button class="btn sm green">💾 حفظ</button>
  </div>
</form></div>""" % (
        ("✏️ تعديل التصنيف" if editing else "➕ إضافة تصنيف"),
        edit_id,
        field("الاسم", "name", (editing or {}).get("name", ""), required=True),
        field("الاسم بالإنجليزية", "name_en", (editing or {}).get("name_en", "")),
        field("الأيقونة", "icon", (editing or {}).get("icon", ""), placeholder="⭐️",
              help_text="تظهر في رسالة الترحيب وقائمة المنتجات"),
        field("معرّف إيموجي مخصص", "emoji_id", (editing or {}).get("emoji_id", "")),
        field("الترتيب", "sort", (editing or {}).get("sort", 0), kind="number"),
        field("ظاهر", "visible", (editing or {}).get("visible", 1), kind="select",
              options=[(1, "نعم"), (0, "لا")]),
        '<a class="btn sm ghost" href="/panel/categories">إلغاء</a>' if editing else "",
    )

    rows = []
    for c in store.categories(include_hidden=True):
        count = store.scalar("SELECT COUNT(*) FROM products WHERE category_id=?", (c["id"],))
        rows.append("""
<tr><td><span class="tag">%d</span></td><td><b>%s %s</b></td>
<td>%s</td><td>%d</td>
<td><span class="badge %s">%s</span></td>
<td class="row">
  <a class="btn sm ghost" href="/panel/categories?edit=%d">تعديل</a>
  <form method="post" action="/panel/categories/delete" onsubmit="return confirmSubmit('حذف التصنيف؟')">
    <input type="hidden" name="id" value="%d"><button class="btn sm danger-ghost">حذف</button></form>
</td></tr>""" % (
            c["id"], html.escape(c.get("icon") or ""), html.escape(c["name"]),
            html.escape(c.get("name_en") or "-"), count,
            "b-green" if c.get("visible") else "b-gray",
            "ظاهر" if c.get("visible") else "مخفي",
            c["id"], c["id"],
        ))

    table = """
<div class="card"><h2 class="sec">🗂 التصنيفات</h2>
<table><tr><th>#</th><th>الاسم</th><th>EN</th><th>منتجات</th><th>الحالة</th><th></th></tr>
%s</table>
<div class="helptext">التصنيفات تظهر في رسالة الترحيب تلقائياً تحت «المنتجات المتوفرة».</div></div>""" % (
        "".join(rows) or '<tr><td colspan="6" class="empty">لا تصنيفات</td></tr>')

    content += [form, table]
    return panel_shell("categories", "".join(content), "التصنيفات")


def page_categories_save(form):
    cid = to_int(form.get("id", [""])[0], 0)
    data = {
        "name": (form.get("name", [""])[0] or "").strip(),
        "name_en": (form.get("name_en", [""])[0] or "").strip(),
        "icon": (form.get("icon", [""])[0] or "").strip(),
        "emoji_id": (form.get("emoji_id", [""])[0] or "").strip(),
        "sort": (form.get("sort", ["0"])[0] or "0").strip(),
        "visible": (form.get("visible", ["1"])[0] or "1").strip(),
    }
    if not data["name"]:
        return "/panel/categories", "❌ الاسم مطلوب", "err"
    if cid:
        store.update_category(cid, data)
        return "/panel/categories", "✅ تم تحديث التصنيف", "ok"
    store.add_category(data)
    return "/panel/categories", "✅ تمت إضافة التصنيف", "ok"


def page_categories_delete(form):
    cid = to_int(form.get("id", [""])[0], 0)
    if cid:
        store.delete_category(cid)
    return "/panel/categories", "🗑 تم حذف التصنيف", "ok"


# ============================================================================
#  PANEL: ORDERS
# ============================================================================

ORDER_STATUS = {
    "pending": ("قيد المعالجة", "b-gold"),
    "delivered": ("مُسلَّم", "b-green"),
    "cancelled": ("ملغى", "b-gray"),
    "refunded": ("مُسترجع", "b-red"),
}


def page_orders(qs, flash_msg=None):
    content = []
    if flash_msg:
        content.append(flash(flash_msg))
    status = (qs.get("status", [""])[0] or "").strip()
    page_no = max(1, to_int((qs.get("p", ["1"])[0] or "1"), 1))
    per = 25
    orders = store.orders_list(limit=per, offset=(page_no - 1) * per, status=status or None)

    tabs = ['<a class="%s" href="/panel/orders">الكل</a>' % ("active" if not status else "")]
    for code, (txt, _) in ORDER_STATUS.items():
        tabs.append('<a class="%s" href="/panel/orders?status=%s">%s</a>' % (
            "active" if status == code else "", code, txt))

    rows = []
    for o in orders:
        st_txt, st_cls = ORDER_STATUS.get(o["status"], (o["status"], "b-gray"))
        rows.append("""
<tr>
  <td><b>#%d</b><div class="muted">%s</div></td>
  <td>%s</td>
  <td>%s</td>
  <td>%s</td>
  <td>%s</td>
  <td><span class="badge %s">%s</span></td>
  <td class="row">
    <form method="post" action="/panel/orders/action" class="row">
      <input type="hidden" name="id" value="%d">
      <select name="action" style="padding:7px 10px;font-size:12px;width:auto">
        <option value="deliver">تسليم يدوي</option>
        <option value="cancel">إلغاء</option>
        <option value="refund">استرجاع المبلغ</option>
        <option value="delete">حذف</option>
      </select>
      <button class="btn sm ghost">تنفيذ</button>
    </form>
  </td>
</tr>""" % (
            o["id"], ts_from_iso(o.get("created_at"), "-"),
            html.escape(o["product_name"] or "-"),
            html.escape(o.get("username") or o.get("first_name") or str(o["user_id"])),
            price_str(o["total"]),
            html.escape(clip(o.get("delivery") or "-", 26)),
            st_cls, html.escape(st_txt),
            o["id"],
        ))

    table = """
<div class="tabs">%s</div>
<div class="card"><h2 class="sec">🧾 الطلبات (%d)</h2>
<table><tr><th>#</th><th>المنتج</th><th>المستخدم</th><th>المبلغ</th><th>التسليم</th><th>الحالة</th><th>إجراء</th></tr>
%s</table>
<div class="row" style="margin-top:12px;justify-content:space-between">
  <a class="btn sm ghost" href="?status=%s&p=%d">‹ السابق</a>
  <span class="muted">صفحة %d</span>
  <a class="btn sm ghost" href="?status=%s&p=%d">التالي ›</a>
</div></div>""" % (
        "".join(tabs), len(rows), "".join(rows) or '<tr><td colspan="7" class="empty">لا طلبات</td></tr>',
        status, max(1, page_no - 1), page_no, status, page_no + 1,
    )
    content.append(table)
    return panel_shell("orders", "".join(content), "الطلبات")


def page_orders_action(form):
    oid = to_int(form.get("id", ["0"])[0], 0)
    action = (form.get("action", [""])[0] or "").strip()
    order = store.get_order(oid)
    if not order:
        return "/panel/orders", "❌ الطلب غير موجود", "err"
    user = store.get_user_by_id(order["user_id"])

    if action == "deliver":
        delivery = store.deliver_pending_atomic(oid)
        if not delivery:
            return "/panel/orders", "❌ الطلب غير معلّق أو لا يوجد مخزون كافٍ للتسليم", "err"
        if user:
            safe_send(user["tg_id"], "✅ <b>تم تسليم طلبك #%d</b>\n\n<pre>%s</pre>" % (
                oid, html.escape(delivery, quote=False)), build_main_keyboard(user))
        return "/panel/orders", "✅ تم التسليم اليدوي #%d" % oid, "ok"

    if action in ("cancel", "refund"):
        order = store.refund_order_atomic(oid, "cancelled" if action == "cancel" else "refunded")
        if not order:
            return "/panel/orders", "❌ تم إرجاع مبلغ هذا الطلب مسبقاً", "err"
        user = store.get_user_by_id(order["user_id"])

    if action == "cancel":
        if user:
            safe_send(user["tg_id"], "❌ <b>تم إلغاء طلبك #%d</b>\n\n💰 %s: %s" % (
                oid, "تم إرجاع المبلغ للمحفظة" if lang_of(user) == "ar" else "Refunded to wallet",
                price_str(store.get_user(user["tg_id"]).get("balance"))), build_main_keyboard(
                store.get_user(user["tg_id"])))
        return "/panel/orders", "❌ تم إلغاء الطلب #%d" % oid, "ok"

    if action == "refund":
        if user:
            safe_send(user["tg_id"], "💸 <b>%s #%d</b>\n\n+%s" % (
                "تم استرجاع مبلغ طلبك" if lang_of(user) == "ar" else "Order refunded",
                oid, price_str(order["total"])), build_main_keyboard(store.get_user(user["tg_id"])))
        return "/panel/orders", "💸 تم الاسترجاع #%d" % oid, "ok"

    if action == "delete":
        store.ex("DELETE FROM orders WHERE id=?", (oid,))
        return "/panel/orders", "🗑 تم حذف الطلب #%d" % oid, "ok"

    return "/panel/orders", "❌ إجراء غير معروف", "err"


# ============================================================================
#  PANEL: DEPOSITS
# ============================================================================

def page_deposits(qs, flash_msg=None):
    content = []
    if flash_msg:
        content.append(flash(flash_msg))
    status = (qs.get("status", [""])[0] or "").strip()
    deps = store.deposits_list(limit=100, status=status or None)

    tabs = ['<a class="%s" href="/panel/deposits">الكل</a>' % ("active" if not status else "")]
    for code, txt in (("pending", "بانتظار المراجعة"), ("approved", "مقبولة"), ("rejected", "مرفوضة")):
        tabs.append('<a class="%s" href="/panel/deposits?status=%s">%s</a>' % (
            "active" if status == code else "", code, txt))

    rows = []
    for d in deps:
        badge = {"pending": ("b-gold", "بانتظار"), "approved": ("b-green", "مقبول"),
                 "rejected": ("b-red", "مرفوض")}.get(d["status"], ("b-gray", d["status"]))
        actions = ""
        if d["status"] == "pending":
            actions = """
<form method="post" action="/panel/deposits/action" class="row">
  <input type="hidden" name="id" value="%d">
  <button class="btn sm green" name="action" value="approve">موافقة</button>
  <button class="btn sm danger-ghost" name="action" value="reject">رفض</button>
</form>""" % d["id"]
        rows.append("""
<tr>
  <td><b>#%d</b><div class="muted">%s</div></td>
  <td>%s<div class="muted">%s</div></td>
  <td><b>%s</b></td>
  <td class="mono" style="max-width:220px">%s</td>
  <td><span class="badge %s">%s</span></td>
  <td>%s</td>
</tr>""" % (
            d["id"], ts_from_iso(d.get("created_at"), "-"),
            html.escape(d.get("username") or d.get("first_name") or "-"),
            html.escape(str(d.get("tg_id") or d.get("user_id"))),
            price_str(d["amount"]), html.escape(d.get("txid") or "-"),
            badge[0], badge[1], actions,
        ))

    content.append("""
<div class="tabs">%s</div>
<div class="card"><h2 class="sec">💳 الشحنات</h2>
<table><tr><th>#</th><th>المستخدم</th><th>المبلغ</th><th>TxID</th><th>الحالة</th><th></th></tr>
%s</table>
<div class="helptext">الموافقة تضيف المبلغ لرصيد المستخدم فوراً وتُعلمه في تيليغرام.</div></div>""" % (
        "".join(tabs), "".join(rows) or '<tr><td colspan="6" class="empty">لا شحنات</td></tr>'))
    return panel_shell("deposits", "".join(content), "الشحنات")


def page_deposits_action(form):
    did = to_int(form.get("id", ["0"])[0], 0)
    action = (form.get("action", [""])[0] or "").strip()
    dep = store.get_deposit(did)
    if not dep:
        return "/panel/deposits", "❌ الشحنة غير موجودة", "err"
    if action == "approve":
        dep = store.review_deposit(did, "approved", "panel")
        if not dep:
            return "/panel/deposits", "❌ تمت مراجعة طلب الشحن مسبقاً", "err"
        target = store.get_user_by_id(dep["user_id"])
        if target:
            fresh = store.get_user(target["tg_id"])
            safe_send(target["tg_id"], "✅ <b>%s</b>\n\n+%s\n💰 %s: %s" % (
                "تم شحن رصيدك بنجاح" if lang_of(fresh) == "ar" else "Wallet credited",
                price_str(dep["amount"]),
                "الرصيد الجديد" if lang_of(fresh) == "ar" else "New balance",
                price_str(fresh.get("balance"))), build_main_keyboard(fresh))
        return "/panel/deposits", "✅ تمت الموافقة على #%d" % did, "ok"
    if action == "reject":
        dep = store.review_deposit(did, "rejected", "panel")
        if not dep:
            return "/panel/deposits", "❌ تمت مراجعة طلب الشحن مسبقاً", "err"
        target = store.get_user_by_id(dep["user_id"])
        if target:
            safe_send(target["tg_id"], "❌ <b>%s</b>\n\n%s" % (
                "تم رفض طلب الشحن #%d" % did if lang_of(target) == "ar"
                else "Top-up #%d rejected" % did,
                ("تواصل مع الدعم: @%s" % support()) if lang_of(target) == "ar"
                else ("Contact support: @%s" % support())))
        return "/panel/deposits", "❌ تم رفض #%d" % did, "ok"
    return "/panel/deposits", "❌ إجراء غير معروف", "err"


# ============================================================================
#  PANEL: USERS
# ============================================================================

def page_users(qs, flash_msg=None):
    content = []
    if flash_msg:
        content.append(flash(flash_msg))
    search = (qs.get("q", [""])[0] or "").strip()
    users = store.users_list(search=search, limit=200)

    rows = []
    for u in users:
        rows.append("""
<tr>
  <td><span class="tag">%d</span></td>
  <td><b>%s</b><div class="muted">@%s</div></td>
  <td class="mono">%s</td>
  <td><b>%s</b></td>
  <td>%s</td>
  <td>%s</td>
  <td><span class="badge %s">%s</span></td>
  <td><span class="badge %s">%s</span></td>
  <td class="row">
    <form method="post" action="/panel/users/action" class="row">
      <input type="hidden" name="tg_id" value="%d">
      <select name="action" style="padding:7px 9px;font-size:12px;width:auto">
        <option value="balance">تعديل الرصيد</option>
        <option value="ban">حظر</option>
        <option value="unban">إلغاء الحظر</option>
        <option value="admin">منح إدارة</option>
        <option value="noadmin">سحب الإدارة</option>
        <option value="message">إرسال رسالة</option>
      </select>
      <input type="text" name="value" placeholder="قيمة" style="width:90px;padding:7px 9px;font-size:12px">
      <button class="btn sm ghost">تنفيذ</button>
    </form>
  </td>
</tr>""" % (
            u["id"], html.escape(u.get("first_name") or "-"), html.escape(u.get("username") or "-"),
            u["tg_id"], price_str(u.get("balance")), price_str(u.get("spent")),
            html.escape(ts_from_iso(u.get("created_at"), "-")),
            "b-blue" if u.get("lang") == "en" else "b-gray", (u.get("lang") or "ar").upper(),
            "b-red" if u.get("banned") else ("b-green" if u.get("is_admin") else "b-gray"),
            "محظور" if u.get("banned") else ("مالك" if u.get("is_admin") else "نشط"),
            u["tg_id"],
        ))

    content.append("""
<div class="card">
  <div class="toolbar">
    <h2 class="sec" style="margin:0">👥 المستخدمون (%d)</h2>
    <form method="get" action="/panel/users" class="row">
      <input type="text" name="q" value="%s" placeholder="بحث بالاسم/المعرّف" style="width:220px">
      <button class="btn sm ghost">بحث</button>
    </form>
  </div>
  <table><tr><th>#</th><th>الاسم</th><th>TG ID</th><th>الرصيد</th><th>الشراء</th><th>التسجيل</th>
  <th>اللغة</th><th>الحالة</th><th>إجراء</th></tr>
  %s</table>
</div>""" % (len(rows), html.escape(search),
             "".join(rows) or '<tr><td colspan="9" class="empty">لا مستخدمون</td></tr>'))
    return panel_shell("users", "".join(content), "المستخدمون")


def page_users_action(form):
    tg_id = to_int(form.get("tg_id", ["0"])[0], 0)
    action = (form.get("action", [""])[0] or "").strip()
    value = (form.get("value", [""])[0] or "").strip()
    user = store.get_user(tg_id)
    if not user:
        return "/panel/users", "❌ المستخدم غير موجود", "err"

    if action == "balance":
        if to_float(value, None) is None:
            return "/panel/users", "❌ قيمة غير صالحة", "err"
        store.adjust_balance(tg_id, to_float(value, 0))
        fresh = store.get_user(tg_id)
        safe_send(tg_id, "💰 <b>%s</b>\n\n%s: %s" % (
            "تم تحديث رصيدك" if lang_of(fresh) == "ar" else "Balance updated",
            "الرصيد الجديد" if lang_of(fresh) == "ar" else "New balance",
            price_str(fresh.get("balance"))), build_main_keyboard(fresh))
        return "/panel/users", "✅ تم تعديل الرصيد", "ok"
    if action == "ban":
        store.update_user(tg_id, banned=1)
        return "/panel/users", "🚫 تم حظر المستخدم", "ok"
    if action == "unban":
        store.update_user(tg_id, banned=0)
        return "/panel/users", "✅ تم إلغاء الحظر", "ok"
    if action == "admin":
        store.update_user(tg_id, is_admin=1)
        return "/panel/users", "✅ تم منح صلاحية الإدارة", "ok"
    if action == "noadmin":
        store.update_user(tg_id, is_admin=0)
        return "/panel/users", "✅ تم سحب صلاحية الإدارة", "ok"
    if action == "message":
        if value:
            safe_send(tg_id, "📩 <b>%s</b>\n\n%s" % (esc(store_name()), html.escape(value)))
            return "/panel/users", "✅ تم إرسال الرسالة", "ok"
        return "/panel/users", "❌ اكتب نص الرسالة في الحقل", "err"
    return "/panel/users", "❌ إجراء غير معروف", "err"


# ============================================================================
#  PANEL: TEXTS
# ============================================================================

TEXT_FIELDS = [
    ("welcome", "رسالة الترحيب (/start) — تدعم {store} و{support} و{categories}", "textarea"),
    ("welcome_ar", "رسالة الترحيب (عربي) — تُستخدم إن كانت غير فارغة", "textarea"),
    ("help_text_ar", "المساعدة (عربي)", "textarea"),
    ("help_text_en", "المساعدة (إنجليزي)", "textarea"),
    ("policy_text_ar", "سياسة البوت (عربي)", "textarea"),
    ("policy_text_en", "سياسة البوت (إنجليزي)", "textarea"),
    ("api_text_ar", "خدمات API (عربي) — يدعم {api_key}", "textarea"),
    ("api_text_en", "خدمات API (إنجليزي)", "textarea"),
    ("maintenance_text_ar", "رسالة الصيانة (عربي)", "text"),
    ("maintenance_text_en", "رسالة الصيانة (إنجليزي)", "text"),
]


def page_texts(qs, flash_msg=None):
    content = []
    if flash_msg:
        content.append(flash(flash_msg))
    parts = []
    for key, desc, kind in TEXT_FIELDS:
        parts.append('<div class="f full" style="margin-bottom:14px"><label>%s</label>%s'
                     '<small><code>%s</code></small></div>' % (
                         html.escape(desc),
                         field("", key, store.get_setting(key, ""), kind=kind).replace(
                             '<label></label>', ''),
                         key))
    content.append("""
<div class="card"><h2 class="sec">📝 النصوص والرسائل</h2>
<div class="helptext" style="margin-bottom:12px">
  يمكن استخدام المتغيرات: <code>{store}</code> اسم المتجر، <code>{support}</code> حساب الدعم،
  <code>{categories}</code> قائمة التصنيفات، <code>{api_key}</code> مفتاح API.
  يدعم HTML: <code>&lt;b&gt;</code> <code>&lt;i&gt;</code> <code>&lt;code&gt;</code> <code>&lt;pre&gt;</code>.
</div>
<form method="post" action="/panel/texts/save">
%s
<div class="row end" style="margin-top:12px"><button class="btn sm green">💾 حفظ النصوص</button></div>
</form></div>""" % "".join(parts))

    labels = []
    for key, (default_ar, default_en) in LABEL_DEFAULTS.items():
        labels.append(field("", "lbl_ar__" + key, store.get_setting(key + "_ar", default_ar),
                            help_text="عربي · " + key))
        labels.append(field("", "lbl_en__" + key, store.get_setting(key + "_en", default_en),
                            help_text="إنجليزي · " + key))
    content.append("""
<div class="card"><h2 class="sec">🔤 نصوص الأزرار والرسائل القصيرة</h2>
<form method="post" action="/panel/texts/save_labels">
<div class="formgrid">%s</div>
<div class="row end" style="margin-top:12px"><button class="btn sm green">💾 حفظ النصوص</button></div>
</form></div>""" % "".join(labels))
    return panel_shell("texts", "".join(content), "النصوص والرسائل")


def page_texts_save(form):
    updates = {}
    for key, _, _ in TEXT_FIELDS:
        if key in form:
            updates[key] = form[key][0]
    if "welcome" in updates and "welcome_ar" in updates:
        # keep them in sync when the owner edits only one of them
        pass
    store.set_settings(updates)
    return "/panel/texts", "✅ تم حفظ النصوص", "ok"


def page_texts_save_labels(form):
    updates = {}
    for key in LABEL_DEFAULTS:
        for lang in ("ar", "en"):
            field_name = "lbl_%s__%s" % (lang, key)
            if field_name in form:
                updates[key + "_" + lang] = form[field_name][0]
    store.set_settings(updates)
    return "/panel/texts", "✅ تم حفظ نصوص الأزرار", "ok"


# ============================================================================
#  PANEL: PAYMENTS
# ============================================================================

def page_payments(qs, flash_msg=None):
    content = []
    if flash_msg:
        content.append(flash(flash_msg))
    content.append("""
<div class="card"><h2 class="sec">💰 الدفع والمحفظة</h2>
<form method="post" action="/panel/payments/save">
  <div class="formgrid">
    %s
    %s
    %s
  </div>
  <div class="f full" style="margin-top:12px"><label>خطوات الدفع (عربي)</label>
    <textarea name="binance_steps_ar">%s</textarea>
    <small>{pay_id} يُستبدل تلقائياً بمعرّف Binance Pay إن أضفته.</small></div>
  <div class="f full"><label>خطوات الدفع (إنجليزي)</label>
    <textarea name="binance_steps_en">%s</textarea></div>
  <div class="formgrid" style="margin-top:12px">
    %s
    %s
  </div>
  <div class="row end" style="margin-top:14px"><button class="btn sm green">💾 حفظ</button></div>
</form></div>""" % (
        field("معرّف Binance Pay", "binance_pay_id", store.get_setting("binance_pay_id", ""),
              help_text="اتركه فارغاً لإيقاف الشحن — يظهر للمستخدم تلقائياً عند الشحن"),
        field("الحد الأدنى للشحن", "deposit_min", store.get_setting("deposit_min", "1"),
              kind="number"),
        field("مدة الجلسة (دقائق)", "deposit_session_minutes",
              store.get_setting("deposit_session_minutes", "30"), kind="number"),
        html.escape(store.get_setting("binance_steps_ar", BINANCE_STEPS_AR)),
        html.escape(store.get_setting("binance_steps_en", BINANCE_STEPS_EN)),
        field("نص طلب TxID (عربي)", "binance_prompt_ar",
              store.get_setting("binance_prompt_ar", BINANCE_TXID_PROMPT_AR), kind="textarea"),
        field("نص طلب TxID (إنجليزي)", "binance_prompt_en",
              store.get_setting("binance_prompt_en", BINANCE_TXID_PROMPT_EN), kind="textarea"),
    ))

    methods = store.get_setting("payment_methods", "binance")
    content.append("""
<div class="card"><h2 class="sec">🧾 طرق الدفع</h2>
<form method="post" action="/panel/payments/methods">
  <div class="grid c2">
    <label class="row" style="gap:8px"><input type="checkbox" name="binance" value="1" style="width:auto"
      %s> Binance Pay (USDT)</label>
    <label class="row" style="gap:8px"><input type="checkbox" name="manual" value="1" style="width:auto"
      %s> تحويل يدوي / دعم مباشر</label>
  </div>
  <div class="row end" style="margin-top:14px"><button class="btn sm green">💾 حفظ الطرق</button></div>
</form></div>""" % ("checked" if "binance" in methods else "",
                    "checked" if "manual" in methods else ""))
    return panel_shell("payments", "".join(content), "الدفع والمحفظة")


def page_payments_save(form):
    updates = {}
    for key in ("binance_pay_id", "deposit_min", "deposit_session_minutes",
                "binance_steps_ar", "binance_steps_en",
                "binance_prompt_ar", "binance_prompt_en"):
        if key in form:
            updates[key] = form[key][0]
    store.set_settings(updates)
    return "/panel/payments", "✅ تم حفظ إعدادات الدفع", "ok"


def page_payments_methods(form):
    chosen = [m for m in ("binance", "manual") if m in form]
    store.set_setting("payment_methods", ",".join(chosen))
    return "/panel/payments", "✅ تم تحديث طرق الدفع", "ok"


# ============================================================================
#  PANEL: SETTINGS
# ============================================================================

def page_settings(qs, flash_msg=None):
    content = []
    if flash_msg:
        content.append(flash(flash_msg))
    content.append("""
<div class="card"><h2 class="sec">⚙️ إعدادات المتجر</h2>
<form method="post" action="/panel/settings/save">
  <div class="formgrid">
    %s
    %s
    %s
    %s
    %s
    %s
    %s
    %s
    %s
    %s
    %s
    %s
    %s
  </div>
  <div class="row end" style="margin-top:14px"><button class="btn sm green">💾 حفظ الإعدادات</button></div>
</form></div>""" % (
        field("اسم المتجر", "store_name", store.get_setting("store_name", APP_NAME), required=True),
        field("حساب الدعم (بدون @)", "support_username",
              store.get_setting("support_username", "")),
        field("اللغة الافتراضية", "default_lang", store.get_setting("default_lang", "ar"),
              kind="select", options=[("ar", "العربية"), ("en", "English")]),
        field("العملة", "currency", store.get_setting("currency", "$")),
        field("عدد المنتجات في الصفحة", "page_size", store.get_setting("page_size", "10"),
              kind="number"),
        field("نسبة أرباح الإحالة %", "referral_percent",
              store.get_setting("referral_percent", "10"), kind="number"),
        field("الخصم العام % (من 0 إلى 90)", "discount_percent", str(discount_percent()), kind="number"),
        field("ألوان أزرار تيليغرام", "style_enabled",
              store.get_setting("style_enabled", "1"), kind="select",
              options=[("1", "مفعّلة (success/danger/primary)"), ("0", "معطّلة")],
              help_text="اتركها مفعّلة للحصول على الألوان كما في التصميم"),
        field("ترتيب الأزرار من اليمين", "mirror_rows",
              store.get_setting("mirror_rows", "0"), kind="select",
              options=[("0", "عادي (0 = يمين)"), ("1", "معكوس (0 = يسار)")]),
        field("وضع الصيانة", "maintenance", store.get_setting("maintenance", "0"), kind="select",
              options=[("0", "المتجر يعمل"), ("1", "صيانة")]),
        field("إشعار المالك عند البيع", "dm_owner_on_order",
              store.get_setting("dm_owner_on_order", "1"), kind="select",
              options=[("1", "نعم"), ("0", "لا")]),
        field("إشعار المالك عند الشحن", "dm_owner_on_deposit",
              store.get_setting("dm_owner_on_deposit", "1"), kind="select",
              options=[("1", "نعم"), ("0", "لا")]),
        field("رابط اللوحة العام (PUBLIC_URL)", "public_url",
              store.get_setting("public_url", ""), kind="url",
              help_text="يُستخدم لعرض روابط سريعة داخل البوت"),
    ))

    owners = store.get_setting("owner_ids", "") or str(OWNER_ID_ENV)
    content.append("""
<div class="card"><h2 class="sec">👑 المالك والصلاحيات</h2>
<form method="post" action="/panel/settings/owners">
  <div class="f"><label>معرّفات المالك (مفصولة بفاصلة)</label>
    <input type="text" name="owner_ids" value="%s" placeholder="123456789,987654321">
    <small>يمكنك إضافة مالكين إضافيين. المالك يرى «لوحة التحكم» في البوت ويدخل الويب.</small>
  </div>
  <div class="row end" style="margin-top:12px"><button class="btn sm green">💾 حفظ المالكين</button></div>
</form></div>""" % html.escape(owners))

    content.append("""
<div class="card"><h2 class="sec">🔐 كلمة مرور اللوحة</h2>
<form method="post" action="/panel/settings/password">
  <div class="formgrid">
    %s
    %s
  </div>
  <div class="row end" style="margin-top:12px"><button class="btn sm green">🔒 تحديث كلمة المرور</button></div>
</form>
<div class="helptext">كلمة المرور تُخزَّن مشفَّرة (PBKDF2-SHA256). تُغيَّر عبر متغيّر البيئة
<code>PANEL_PASSWORD</code> عند أول تشغيل فقط.</div></div>""" % (
        field("كلمة المرور الحالية", "current", "", kind="password"),
        field("كلمة المرور الجديدة", "new", "", kind="password",
              help_text="8 أحرف على الأقل"),
    ))

    content.append("""
<div class="card"><h2 class="sec">🧬 النظام</h2>
<div class="grid c2">
  <div class="stat"><div class="k">الإصدار</div><div class="v">%s</div></div>
  <div class="stat"><div class="k">قاعدة البيانات</div><div class="v" style="font-size:13px">%s</div></div>
</div>
<div class="row" style="margin-top:12px">
  <a class="btn sm ghost" href="/panel/export">⬇️ تصدير نسخة احتياطية</a>
  <a class="btn sm ghost" href="/bot-preview" target="_blank">📱 معاينة الأزرار</a>
  <a class="btn sm ghost" href="/healthz" target="_blank">🩺 فحص الحالة</a>
</div></div>""" % (APP_VERSION, html.escape(DB_PATH)))
    return panel_shell("settings", "".join(content), "الإعدادات")


def page_settings_save(form):
    keys = ["store_name", "support_username", "default_lang", "currency", "page_size",
            "referral_percent", "discount_percent", "style_enabled", "mirror_rows", "maintenance",
            "dm_owner_on_order", "dm_owner_on_deposit", "public_url"]
    updates = {k: form[k][0] for k in keys if k in form}
    if "discount_percent" in updates:
        value = updates["discount_percent"].strip()
        if not value.isdigit() or not 0 <= int(value) <= 90:
            return "/panel/settings", "❌ نسبة الخصم يجب أن تكون بين 0 و90", "err"
        updates["discount_percent"] = str(int(value))
    if updates.get("support_username"):
        updates["support_username"] = updates["support_username"].strip().lstrip("@")
    store.set_settings(updates)
    return "/panel/settings", "✅ تم حفظ الإعدادات", "ok"


def page_settings_owners(form):
    store.set_setting("owner_ids", (form.get("owner_ids", [""])[0] or "").strip())
    return "/panel/settings", "✅ تم تحديث قائمة المالكين", "ok"


def page_settings_password(form):
    current = form.get("current", [""])[0] or ""
    new = form.get("new", [""])[0] or ""
    if not check_panel_password(current):
        return "/panel/settings", "❌ كلمة المرور الحالية غير صحيحة", "err"
    if len(new) < 8:
        return "/panel/settings", "❌ كلمة المرور الجديدة قصيرة (8 أحرف على الأقل)", "err"
    store.set_setting("panel_password_hash", hash_password(new))
    return "/panel/settings", "✅ تم تحديث كلمة المرور", "ok"


def page_export():
    """Download a JSON snapshot of the whole store."""
    data = {
        "exported_at": now_iso(),
        "settings": store.q("SELECT key, value FROM settings"),
        "categories": store.q("SELECT * FROM categories"),
        "products": store.q("SELECT * FROM products"),
        "buttons": store.q("SELECT * FROM buttons"),
        "users": store.q("SELECT tg_id,username,first_name,lang,balance,spent,banned,created_at FROM users"),
        "orders": store.q("SELECT * FROM orders ORDER BY id DESC LIMIT 2000"),
        "deposits": store.q("SELECT * FROM deposits ORDER BY id DESC LIMIT 2000"),
    }
    for row in data["settings"]:
        if row["key"] == "panel_password_hash":
            row["value"] = "***"
    return json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")


# ============================================================================
#  PANEL: BROADCAST
# ============================================================================

def page_broadcast(qs, flash_msg=None):
    content = []
    if flash_msg:
        content.append(flash(flash_msg))
    history = store.q("SELECT * FROM broadcasts ORDER BY id DESC LIMIT 12")
    rows = "".join(
        "<tr><td>#%d</td><td>%s</td><td><span class='badge b-green'>%d</span></td>"
        "<td><span class='badge b-red'>%d</span></td><td>%s</td></tr>" % (
            b["id"], html.escape(clip(b["text"], 60)), b["sent"], b["failed"],
            ts_from_iso(b.get("created_at"), "-")
        ) for b in history
    ) or '<tr><td colspan="5" class="empty">لا عمليات سابقة</td></tr>'

    content.append("""
<div class="card"><h2 class="sec">📣 إرسال جماعي لكل المستخدمين</h2>
<form method="post" action="/panel/broadcast/send" onsubmit="return confirmSubmit('هل تريد إرسال الرسالة لكل المستخدمين؟')">
  <div class="f"><label>نص الرسالة</label>
    <textarea name="text" placeholder="🔥 عروض جديدة اليوم!" required></textarea>
    <small>يدعم HTML. سيتم الإرسال لكل المستخدمين غير المحظورين (%d مستخدم).</small>
  </div>
  <div class="row end" style="margin-top:12px">
    <button class="btn sm green" type="submit">🚀 إرسال الآن</button>
  </div>
</form></div>""" % store.users_count())

    content.append("""
<div class="card"><h2 class="sec">🗂 آخر عمليات الإرسال</h2>
<table><tr><th>#</th><th>النص</th><th>نجح</th><th>فشل</th><th>التاريخ</th></tr>%s</table></div>""" % rows)
    return panel_shell("broadcast", "".join(content), "الإرسال الجماعي")


def page_broadcast_send(form):
    text = (form.get("text", [""])[0] or "").strip()
    if not text or len(text) > 4000:
        return "/panel/broadcast", "❌ أدخل نصاً بين 1 و4000 حرف", "err"
    ids = store.all_user_ids()
    if len(ids) > 20:
        return "/panel/broadcast", "⚠️ للإذاعات الكبيرة استخدم /admin في البوت لإرسال دفعات متتابعة", "err"
    sent = sum(1 for uid in ids if _broadcast_one(uid, text))
    failed = len(ids) - sent
    store.ex("INSERT INTO broadcasts(text,sent,failed,created_at) VALUES(?,?,?,?)", (text, sent, failed, now_iso()))
    return "/panel/broadcast", "📣 تم الإرسال: ✅ %d · ❌ %d" % (sent, failed), "ok"


# ============================================================================
#  BOT PREVIEW  (approximates the Telegram chat with the real keyboard)
# ============================================================================

def page_bot_preview(qs):
    """Render the welcome message + reply keyboard as it looks in Telegram."""
    lang = (qs.get("lang", ["ar"])[0] or "ar")
    if lang not in ("ar", "en"):
        lang = "ar"
    text = welcome_text(lang)

    kb_rows = []
    rows_map = {}
    for b in store.buttons():
        rows_map.setdefault(to_int(b.get("row"), 0), []).append(b)
    for row_index in sorted(rows_map):
        items = sorted(rows_map[row_index], key=lambda x: (to_int(x.get("sort"), 0), x["id"]))
        if store.get_bool("mirror_rows", False):
            items = list(reversed(items))
        kb_rows.append('<div class="kb-row">' + "".join(
            '<div class="kb-b ' + btn_class(b.get("color")) + '">' +
            html.escape(render_button_label(b, lang)) + '</div>'
            for b in items) + '</div>')

    msg_html = html.escape(text).replace("\n", "<br>")
    initials = html.escape("".join(w[:1] for w in store_name().split())[:3] or "SH")

    css = (
        "<style>"
        ".tg{width:100%;max-width:432px;margin:0 auto;background:#c9dcc4;border-radius:24px;"
        "overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.3)}"
        ".tg-top{background:#8fae8b;padding:12px 14px;display:flex;align-items:center;gap:10px}"
        ".tg-title{background:rgba(255,255,255,.78);border-radius:16px;padding:6px 16px;flex:1;"
        "text-align:center;line-height:1.25}"
        ".tg-title b{color:#22302a;font-size:14px}"
        ".tg-title span{font-size:10px;color:#5d6b60}"
        ".tg-ava{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#7ab8e8,#a58ae0);"
        "display:grid;place-items:center;font-size:10px;color:#fff;font-weight:900}"
        ".tg-body{padding:14px}"
        ".tg-msg{background:#fff;border-radius:16px;padding:15px 17px;font-size:14px;line-height:1.8;"
        "color:#1b2b20;box-shadow:0 1px 3px rgba(0,0,0,.09);word-wrap:break-word}"
        ".tg-kb{padding:0 10px 14px;display:grid;gap:7px}"
        "</style>"
    )

    page = (
        '<div class="login-shell" style="align-items:flex-start">'
        '<div style="width:100%;max-width:470px">'
        '<div class="tg">'
        '<div class="tg-top"><span style="font-size:19px;color:#31432f">&#8249;</span>'
        '<div class="tg-title"><b>' + html.escape(store_name()) + '</b><br><span>bot</span></div>'
        '<div class="tg-ava">' + initials + '</div></div>'
        '<div class="tg-body"><div class="tg-msg">' + msg_html + '</div></div>'
        '<div class="tg-kb">' + "".join(kb_rows) + '</div>'
        '</div>'
        '<div class="row" style="justify-content:center;margin-top:14px">'
        '<a class="btn sm ghost" href="/bot-preview?lang=ar">🇩🇿 عربي</a>'
        '<a class="btn sm ghost" href="/bot-preview?lang=en">🇬🇧 English</a>'
        '<a class="btn sm ghost" href="/panel/buttons">✏️ تعديل الأزرار</a>'
        '<a class="btn sm ghost" href="/panel">↩ رجوع</a>'
        '</div></div></div>'
    )
    return html_page("معاينة — " + store_name(), page, extra_head=css)


# ============================================================================
#  SESSIONS  (server-side, HttpOnly cookie)
# ============================================================================

SESSIONS = {}
SESSION_LOCK = threading.RLock()
SESSION_TTL = 60 * 60 * 12  # 12h


def session_create():
    token = rand_token(32)
    with SESSION_LOCK:
        SESSIONS[token] = {"created": time.time(), "last": time.time()}
    return token


def session_valid(token):
    if not token:
        return False
    with SESSION_LOCK:
        info = SESSIONS.get(token)
        if not info:
            return False
        if time.time() - info["last"] > SESSION_TTL:
            SESSIONS.pop(token, None)
            return False
        info["last"] = time.time()
        return True


def session_destroy(token):
    with SESSION_LOCK:
        SESSIONS.pop(token, None)


def check_panel_password(password):
    stored = store.get_setting("panel_password_hash", "")
    if not stored:
        # fall back to the env password until one is set from the panel
        return bool(PANEL_PASSWORD_ENV) and hmac.compare_digest(password or "", PANEL_PASSWORD_ENV)
    return verify_password(password or "", stored)


# ============================================================================
#  HTTP HANDLER
# ============================================================================

GET_ROUTES = {
    "/panel": page_dashboard,
    "/panel/buttons": page_buttons,
    "/panel/products": page_products,
    "/panel/categories": page_categories,
    "/panel/orders": page_orders,
    "/panel/deposits": page_deposits,
    "/panel/users": page_users,
    "/panel/texts": page_texts,
    "/panel/payments": page_payments,
    "/panel/settings": page_settings,
    "/panel/broadcast": page_broadcast,
}

POST_ROUTES = {
    "/panel/buttons/save": page_buttons_save,
    "/panel/buttons/delete": page_buttons_delete,
    "/panel/products/save": page_products_save,
    "/panel/products/delete": page_products_delete,
    "/panel/stock/save": page_stock_save,
    "/panel/stock/clear": page_stock_clear,
    "/panel/categories/save": page_categories_save,
    "/panel/categories/delete": page_categories_delete,
    "/panel/orders/action": page_orders_action,
    "/panel/deposits/action": page_deposits_action,
    "/panel/users/action": page_users_action,
    "/panel/texts/save": page_texts_save,
    "/panel/texts/save_labels": page_texts_save_labels,
    "/panel/payments/save": page_payments_save,
    "/panel/payments/methods": page_payments_methods,
    "/panel/settings/save": page_settings_save,
    "/panel/settings/owners": page_settings_owners,
    "/panel/settings/password": page_settings_password,
    "/panel/broadcast/send": page_broadcast_send,
}

LOGIN_ATTEMPTS = {}          # ip -> [timestamps]
LOGIN_LOCK = threading.RLock()
LOGIN_MAX_ATTEMPTS = 8
LOGIN_WINDOW = 600           # 10 minutes


def login_throttled(ip):
    now = time.time()
    with LOGIN_LOCK:
        hits = [t for t in LOGIN_ATTEMPTS.get(ip, []) if now - t < LOGIN_WINDOW]
        LOGIN_ATTEMPTS[ip] = hits
        return len(hits) >= LOGIN_MAX_ATTEMPTS


def login_failed(ip):
    with LOGIN_LOCK:
        LOGIN_ATTEMPTS.setdefault(ip, []).append(time.time())


def login_ok(ip):
    with LOGIN_LOCK:
        LOGIN_ATTEMPTS.pop(ip, None)


FLASHES = {}
FLASH_LOCK = threading.RLock()


def flash_push(token, msg, kind="ok"):
    with FLASH_LOCK:
        FLASHES.setdefault(token, []).append((msg, kind))


def flash_pop(token):
    with FLASH_LOCK:
        items = FLASHES.pop(token, [])
    return items


class Handler(BaseHTTPRequestHandler):
    server_version = "R1HimoShop/" + APP_VERSION
    protocol_version = "HTTP/1.1"

    # ---------- plumbing ----------
    def log_message(self, fmt, *args):
        log.debug("%s - %s", self.address_string(), fmt % args)

    def _cookie(self, name):
        raw = self.headers.get("Cookie") or ""
        for part in raw.split(";"):
            if "=" in part:
                key, _, value = part.partition("=")
                if key.strip() == name:
                    return value.strip()
        return ""

    def _send(self, code, body, ctype="text/html; charset=utf-8", extra_headers=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Content-Security-Policy", "frame-ancestors 'none'")
        for key, value in (extra_headers or []):
            self.send_header(key, value)
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def _redirect(self, location, cookie=None, flash=None):
        headers = [("Location", location)]
        if cookie:
            headers.append(("Set-Cookie", cookie))
        token = self._cookie("rs_session")
        if flash and token:
            flash_push(token, flash[0], flash[1] if len(flash) > 1 else "ok")
        self.send_response(302)
        for key, value in headers:
            self.send_header(key, value)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _is_https(self):
        """True when the request arrived over HTTPS (direct or via proxy)."""
        proto = (self.headers.get("X-Forwarded-Proto") or "").split(",")[0].strip().lower()
        if proto:
            return proto == "https"
        return False

    def _cookie_flags(self):
        return "; Secure" if self._is_https() else ""

    def _authed(self):
        return session_valid(self._cookie("rs_session"))

    def _read_form(self):
        length = to_int(self.headers.get("Content-Length"), 0)
        if length <= 0:
            return {}
        if length > 4 * 1024 * 1024:
            return {}
        raw = self.rfile.read(length).decode("utf-8", "replace")
        return urllib.parse.parse_qs(raw, keep_blank_values=True)

    # ---------- routes ----------
    def do_GET(self):
        try:
            self._do_get()
        except Exception:
            log.error("GET %s failed:\n%s", self.path, traceback.format_exc())
            self._safe_error_page()

    def do_POST(self):
        try:
            self._do_post()
        except Exception:
            log.error("POST %s failed:\n%s", self.path, traceback.format_exc())
            self._safe_error_page()

    def _safe_error_page(self):
        try:
            self._send(500, html_page("خطأ", '<div class="login-shell"><div class="card">'
                                             '<h1 class="login-title">حدث خطأ</h1>'
                                             '<p class="login-sub">أعد المحاولة.</p>'
                                             '<a class="btn" href="/panel">رجوع</a></div></div>'))
        except Exception:
            pass

    def _do_get(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        qs = urllib.parse.parse_qs(parsed.query)

        if path in ("/", "/login"):
            if self._authed():
                return self._redirect("/panel")
            notice = ""
            if path == "/" and not store.get_setting("panel_password_hash") and not PANEL_PASSWORD_ENV:
                notice = "لم تُضبط كلمة مرور بعد. عيّن متغيّر البيئة PANEL_PASSWORD ثم أعد التشغيل."
            return self._send(200, login_html(notice=notice))

        if path in ("/healthz", "/health"):
            return self._send(200, json.dumps({
                "ok": True, "app": APP_NAME, "version": APP_VERSION,
                "bot": store.get_setting("bot_username", ""),
                "users": store.users_count(), "time": now_iso(),
            }, ensure_ascii=False), "application/json; charset=utf-8")

        if path == "/bot-preview":
            if not self._authed():
                return self._redirect("/")
            return self._send(200, page_bot_preview(qs))

        if path == "/api/v1/products":
            items = []
            for p in store.products():
                items.append({"id": p["id"], "name": p["name"],
                              "price": to_float(p.get("price"), 0),
                              "stock": ("unlimited" if p.get("stock_mode") == "unlimited"
                                        else store.available_stock(p))})
            return self._send(200, json.dumps({"ok": True, "products": items},
                                              ensure_ascii=False),
                              "application/json; charset=utf-8")

        if path == "/panel/export":
            if not self._authed():
                return self._redirect("/")
            return self._send(200, page_export(), "application/json; charset=utf-8",
                              [("Content-Disposition", "attachment; filename=rabot-backup.json")])

        if path in GET_ROUTES:
            if not self._authed():
                return self._redirect("/")
            token = self._cookie("rs_session")
            flashes = flash_pop(token)
            msg = flashes[0][0] if flashes else None
            if path == "/panel" and flashes and flashes[0][1] == "err":
                msg = None
            try:
                html_out = GET_ROUTES[path](qs, flash_msg=msg)
            except Exception:
                log.error("panel render error:\n%s", traceback.format_exc())
                html_out = panel_shell("home", flash("❌ حدث خطأ أثناء عرض الصفحة"), "خطأ")
            return self._send(200, html_out)

        return self._send(404, html_page("404", '<div class="login-shell"><div class="card">'
                                                '<h1 class="login-title">404</h1>'
                                                '<p class="login-sub">الصفحة غير موجودة</p>'
                                                '<a class="btn" href="/">رجوع</a></div></div>'))

    def _do_post(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        form = self._read_form()

        if path == "/login":
            client_ip = self.client_address[0] if self.client_address else "?"
            if login_throttled(client_ip):
                return self._send(429, login_html(error="محاولات كثيرة. انتظر 10 دقائق ثم أعد المحاولة."))
            password = (form.get("password", [""])[0] or "")
            if check_panel_password(password):
                login_ok(client_ip)
                token = session_create()
                return self._redirect(
                    "/panel",
                    cookie="rs_session=%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=%d%s"
                           % (token, SESSION_TTL, self._cookie_flags()))
            login_failed(client_ip)
            return self._send(200, login_html(error=store.get_setting(
                "panel_login_error", "تعذر تسجيل الدخول.")))
        if path == "/logout":
            session_destroy(self._cookie("rs_session"))
            return self._redirect("/", cookie="rs_session=; Path=/; Max-Age=0" + self._cookie_flags())

        if path not in POST_ROUTES:
            return self._send(404, "not found")
        if not self._authed():
            return self._redirect("/")

        try:
            result = POST_ROUTES[path](form)
        except Exception:
            log.error("panel action error:\n%s", traceback.format_exc())
            return self._redirect("/panel")

        if isinstance(result, tuple):
            location = result[0]
            if len(result) == 2:
                msg, kind = result[1], "ok"
            else:
                msg, kind = result[1], result[2]
            return self._redirect(location, flash=(msg, kind))
        return self._redirect("/panel")


# ============================================================================
#  BOOTSTRAP
# ============================================================================

def panel_token():
    """Deterministic short token used in the owner's quick-login link."""
    secret = store.get_setting("panel_password_hash", "") or BOT_TOKEN or "rabot"
    return hmac.new(secret.encode(), b"panel", hashlib.sha256).hexdigest()[:10]


def banner():
    line = "=" * 62
    log.info(line)
    log.info(" %s v%s", APP_NAME, APP_VERSION)
    log.info(" Telegram bot + owner control panel (single-file Python)")
    log.info(line)
    log.info(" DB            : %s", DB_PATH)
    log.info(" Panel         : http://%s:%d/panel", HOST, PORT)
    if not BOT_TOKEN:
        log.warning(" BOT_TOKEN غير مضبوط — البوت لن يعمل (اللوحة تعمل).")
    if not store.get_setting("panel_password_hash") and not PANEL_PASSWORD_ENV:
        log.warning(" PANEL_PASSWORD غير مضبوط — لن يمكن الدخول للوحة.")
    if not store.get_setting("owner_ids") and not OWNER_ID_ENV:
        log.warning(" OWNER_ID غير مضبوط — لن يظهر زر لوحة التحكم لأي مستخدم.")
    log.info(line)


def main():
    init_store(DB_PATH)

    # import-time defaults that depend on env
    if not store.get_setting("owner_ids") and OWNER_ID_ENV:
        store.set_setting("owner_ids", OWNER_ID_ENV)
    if not store.get_setting("public_url") and PUBLIC_URL:
        store.set_setting("public_url", PUBLIC_URL)

    # bootstrap the panel password from the environment once
    if not store.get_setting("panel_password_hash") and PANEL_PASSWORD_ENV:
        store.set_setting("panel_password_hash", hash_password(PANEL_PASSWORD_ENV))

    banner()

    server = None
    try:
        ThreadingHTTPServer.allow_reuse_address = True
        server = ThreadingHTTPServer((HOST, PORT), Handler)
        server.daemon_threads = True
        threading.Thread(target=server.serve_forever, name="panel-http", daemon=True).start()
        log.info("✅ لوحة التحكم تعمل على المنفذ %d", PORT)
    except OSError as exc:
        log.error("❌ تعذر تشغيل اللوحة على المنفذ %d: %s", PORT, exc)
        server = None

    if BOT_TOKEN:
        global tg
        init_telegram(BOT_TOKEN)
        try:
            me = tg.get_me()
            username = me.get("username") or ""
            store.set_setting("bot_username", username)
            log.info("✅ البوت متصل: @%s", username)
        except TgError as exc:
            log.error("❌ تعذر الاتصال بتيليغرام: %s", exc.description)
            if exc.code == 401:
                log.error("   تحقق من BOT_TOKEN.")
        poller = Poller()
        poller.start()
    else:
        log.warning("⚠️ تم تشغيل اللوحة فقط بدون بوت (BOT_TOKEN فارغ).")

    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        log.info("إيقاف...")
        if server:
            server.shutdown()


if __name__ == "__main__":
    main()
