#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""R1HIMO SHOP — بوت مستقل بلوحة إدارة داخل تيليغرام فقط.
Python 3.8+، مكتبات Python القياسية وSQLite، ولا يحتاج موقعاً أو Vercel.
ضع BOT_TOKEN و OWNER_ID كمتغيرات بيئة ثم شغّل: python3 r1himo-bot-only.py
يجب ضبط OWNER_ID الخاص بمالك البوت؛ لا توجد هوية مالك افتراضية.
استخدم توكن بوت جديد وقاعدة بيانات منفصلة، ولا تشغل نفس التوكن في مكانين.
البيانات محلية داخل rabot_data؛ لا تستخدم أموالاً حقيقية قبل مراجعة واختبار شاملين.
"""

import hmac
import html
import json
import logging
import math
import os
import re
import secrets
import socket
import sqlite3
import sys
import tempfile
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

APP_NAME = "R1HIMO SHOP"
APP_VERSION = "1.0.0"

BASE_DIR = os.path.dirname(os.path.abspath(__file__)) or os.getcwd()
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "r1himo_bot_data", "store.db")

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
OWNER_ID_ENV = os.environ.get("OWNER_ID", "").strip()
DB_PATH = os.environ.get("DB_PATH", DEFAULT_DB_PATH).strip() or DEFAULT_DB_PATH
BOT_API_BASE = os.environ.get("BOT_API_BASE", "https://api.telegram.org").strip().rstrip("/")
REQUIRED_CHANNEL_1 = os.environ.get("REQUIRED_CHANNEL_1", "rahimo_store").strip().lstrip("@")
REQUIRED_CHANNEL_2 = os.environ.get("REQUIRED_CHANNEL_2", "rahim_vrf").strip().lstrip("@")
EVENT_CHAT_ID = os.environ.get("EVENT_CHAT_ID", "-1004365740808").strip()

CURRENCY = "$"

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

API_AR_DEFAULT = "🧩 خدمة API غير متاحة في هذه النسخة المستقلة."
API_EN_DEFAULT = "🧩 API service is not available in this standalone version."

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

CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS vip_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    nonce TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL,
    days INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
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
        "required_channel_1": REQUIRED_CHANNEL_1,
        "required_channel_2": REQUIRED_CHANNEL_2,
        "event_chat_id": EVENT_CHAT_ID,
        "default_lang": "ar",
        "owner_ids": OWNER_ID_ENV,
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
        "binance_pay_id": "1234077002",
        "bep20_address": "0xe64b863710576bc32063cde2039b9477888dc481",
        "trc20_address": "TCm3uFLkPdi7yV6qBhJFLtSvYDsKjhNVqg",
        "vip_enabled": "0", "vip_price": "0", "vip_days": "30", "vip_percent": "0",
        "binance_steps_ar": BINANCE_STEPS_AR,
        "binance_steps_en": BINANCE_STEPS_EN,
        "binance_prompt_ar": BINANCE_TXID_PROMPT_AR,
        "binance_prompt_en": BINANCE_TXID_PROMPT_EN,
        "deposit_min": "1",
        "deposit_session_minutes": "30",
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

        # المنتجات والمخزون يضيفهما المالك يدوياً؛ لا نبيع بيانات تجريبية.

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
        if product.get("stock_mode") == "unlimited" and (product.get("feed") or "").strip():
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
        items = [(product_id, line.strip(), now_iso()) for line in lines if line and line.strip()]
        if not items:
            return 0
        with self.lock:
            try:
                self._begin_financial()
                self.conn.executemany(
                    "INSERT INTO stock_items(product_id,content,used,order_id,created_at) VALUES(?,?,0,0,?)", items)
                self.conn.commit()
                return len(items)
            except Exception:
                self.conn.rollback()
                raise

    def add_stock_unit(self, product_id, content):
        # One message is exactly one stock unit, even with multiple lines.
        if not content or not content.strip():
            raise ValueError("المحتوى فارغ")
        return self.ex("INSERT INTO stock_items(product_id,content,used,order_id,created_at) VALUES(?,?,0,0,?)",
                       (product_id, content, now_iso()))

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

    def purchase_atomic(self, tg_id, product_id, qty, referral_percent, expected_total=None):
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
                price = unit_price(product, user, qty, self)
                total = round(price * qty, 2)
                if expected_total is not None and abs(total - expected_total) > 0.001:
                    self.conn.rollback()
                    return {'error': 'price_changed'}
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
                delivery = "\n".join(x for x in delivery_parts if x)
                if not delivery.strip():
                    raise RuntimeError("empty delivery")
                if len(html.escape(delivery, quote=False)) > 3000:
                    self.conn.rollback()
                    return {"error": "delivery_too_long"}
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

    def purchase_vip_atomic(self, tg_id, nonce, expected_price, expected_days, expected_percent):
        with self.lock:
            try:
                self._begin_financial()
                user = self.conn.execute('SELECT * FROM users WHERE tg_id=?' + self._financial_lock_suffix(), (tg_id,)).fetchone()
                if not user or not self.get_bool('vip_enabled'):
                    self.conn.rollback(); return {'error':'disabled'}
                price = round(to_float(self.get_setting('vip_price', '0'), 0), 2)
                days = self.get_int('vip_days', 30)
                percent = self.get_int('vip_percent', 0)
                if not math.isfinite(price) or price < 0.01 or days < 1 or days > 3650 or not 1 <= percent <= 90:
                    self.conn.rollback(); return {'error':'disabled'}
                if price != expected_price or days != expected_days or percent != expected_percent:
                    self.conn.rollback(); return {'error':'changed'}
                if self.conn.execute('SELECT id FROM vip_purchases WHERE nonce=?', (nonce,)).fetchone():
                    self.conn.rollback(); return {'error':'duplicate'}
                if to_float(user['balance'], 0) < price:
                    self.conn.rollback(); return {'error':'balance'}
                key = 'vip_until_%s' % tg_id
                row = self.conn.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
                expiry = max(int(time.time()), to_int(row['value'], 0) if row else 0) + days * 86400
                cur = self.conn.execute('UPDATE users SET balance=ROUND(balance-?,2),spent=ROUND(spent+?,2) WHERE tg_id=? AND balance>=?', (price, price, tg_id, price))
                if cur.rowcount != 1: raise RuntimeError('VIP balance update failed')
                self.conn.execute('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, str(expiry)))
                self.conn.execute('INSERT INTO vip_purchases(user_id,nonce,amount,days,expires_at,created_at) VALUES(?,?,?,?,?,?)', (user['id'],nonce,price,days,expiry,now_iso()))
                self.conn.commit()
                self._settings[key] = str(expiry)
                return {'expires_at':expiry}
            except Exception:
                self.conn.rollback(); raise

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


def vip_until(tg_id, db=None):
    return to_int((db or store).get_setting('vip_until_%s' % tg_id, '0'), 0)


def unit_price(product, user, qty=1, db=None):
    db = db or store
    base = max(0, to_float(product.get('price'), 0))
    percent = discount_percent(db)
    if user and vip_until(user['tg_id'], db) > time.time():
        percent = max(percent, min(90, max(0, db.get_int('vip_percent', 0))))
    price = round(base * (100 - percent) / 100, 2)
    minimum = db.get_int('bulk_min_%s' % product['id'], 0)
    bulk_raw = db.get_setting('bulk_price_%s' % product['id'], '')
    bulk = to_float(bulk_raw, -1)
    if minimum >= 2 and qty >= minimum and math.isfinite(bulk) and bulk >= 0:
        price = min(price, bulk)
    return max(0.01, price) if base > 0 else 0


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
        rows.append([_btn('🛒 شراء كمية' if lang == 'ar' else '🛒 Buy quantity', 'primary', None, cb='qty:%d' % product['id'])])
    else:
        rows.append([_btn(label("lbl_out", lang) + " ❌", "danger", None,
                          cb="topup")])
    rows.append([_btn('⭐ إضافة / إزالة من المفضلة' if lang == 'ar' else '⭐ Toggle favorite', 'primary', None, cb='favorite:%d' % product['id'])])
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


def required_channels():
    # The owner can adjust these defaults through /admin; invalid configuration
    # fails closed rather than silently bypassing mandatory membership.
    channels = []
    for key, default in (("required_channel_1", REQUIRED_CHANNEL_1), ("required_channel_2", REQUIRED_CHANNEL_2)):
        value = store.get_setting(key, default).strip().lstrip("@")
        if value.lower() == "off":
            continue
        if not re.fullmatch(r"[A-Za-z0-9_]{5,32}", value):
            return None
        if value.lower() not in [v.lower() for v in channels]:
            channels.append(value)
    return channels


def membership_check(tg_id):
    channels = required_channels()
    if channels is None:
        return False, True
    for channel in channels:
        try:
            result = tg.call("getChatMember", timeout=6, chat_id="@" + channel, user_id=tg_id)
            if not isinstance(result, dict):
                return False, True
            status = result.get("status")
            if status not in ("creator", "administrator", "member") and not (status == "restricted" and result.get("is_member") is True):
                return False, False
        except TgError as exc:
            log.warning("Membership check unavailable for @%s (code %s)", channel, exc.code)
            return False, True
        except Exception:
            log.warning("Membership check unavailable for @%s", channel)
            return False, True
    return True, False


def show_join_required(user, error=False, edit=None):
    lang = lang_of(user)
    channels = required_channels() or []
    message = ("🔒 <b>اشترك في القناتين أولاً</b>\n\nبعد الاشتراك اضغط «تحقق» لاستعمال البوت." if lang == "ar" else
               "🔒 <b>Join the required channels first</b>\n\nThen press Verify to use the bot.")
    if error:
        message += ("\n\n⚠️ تعذر التحقق الآن. يلزم إضافة البوت مشرفاً في القناتين، ثم حاول مجدداً." if lang == "ar" else
                    "\n\n⚠️ Verification is unavailable. The bot must be an administrator in both channels; try again.")
    rows = [[_btn("📣 الاشتراك في @" + channel, "primary", None, url="https://t.me/" + channel)] for channel in channels]
    rows.append([_btn("✅ تحقق" if lang == "ar" else "✅ Verify", "success", None, cb="joincheck")])
    markup = inline_keyboard(rows)
    if edit:
        return safe_edit(user['tg_id'], edit, message, markup)
    return safe_send(user['tg_id'], message, markup)


def record_referral(user, ref_tg):
    tg_id = user["tg_id"]
    if ref_tg and ref_tg != tg_id and not to_int(user.get("referrer_id"), 0):
        ref_user = store.get_user(ref_tg)
        if ref_user:
            store.update_user(tg_id, referrer_id=ref_user["id"])
            safe_send(ref_tg, "👥 <b>%s</b>\n\n%s @%s" % (
                "انضم عضو جديد عبر رابطك" if lang_of(ref_user) == "ar" else "New member joined via your link",
                "المستخدم:" if lang_of(ref_user) == "ar" else "User:",
                esc(user.get("username") or user.get("first_name") or tg_id)))
            return store.get_user(tg_id)
    return user


def finish_join_referral(user):
    pending = state_get(user["tg_id"])
    if pending and pending.get("kind") == "join_referral":
        user = record_referral(user, to_int(pending.get("ref_tg"), 0))
        state_clear(user["tg_id"])
    return user


def mask_user_id(tg_id):
    value = str(tg_id)
    return value[:3] + "***" + value[-4:] if len(value) >= 8 else "***" + value[-2:]


def notify_public_event(kind, user, product=None, qty=1, deposit=None):
    chat = store.get_setting("event_chat_id", EVENT_CHAT_ID).strip()
    if not re.fullmatch(r"-?[0-9]{1,20}", chat) or chat in ("0", "-0"):
        return
    if kind == "purchase":
        body = "✨<b>New purchase</b>\n<blockquote>🆔 User: %s\n📦 Product: <b>%s</b>\n📊 Quantity: %d</blockquote>" % (esc(mask_user_id(user["tg_id"])), esc((product or {}).get("name", "—")[:150]), qty)
    elif kind == "deposit" and deposit:
        body = "💰<b>New deposit</b>\n<blockquote>🆔 User: %s\n💵 Amount: <b>%.3f USDT</b>\n💳 Method: %s</blockquote>" % (esc(mask_user_id(user["tg_id"])), to_float(deposit.get("amount"), 0), esc((deposit.get("method") or "Binance Pay").replace("binance", "Binance Pay")))
    else:
        return
    try:
        tg.call("sendMessage", timeout=6, chat_id=int(chat), text=body, parse_mode="HTML", disable_web_page_preview=True)
    except Exception:
        # A failed public notification must never undo or duplicate a payment.
        log.warning("تعذر إرسال إشعار النشاط إلى الشات؛ تحقق من صلاحيات البوت.")


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
    if mode == "unlimited" and (p.get("feed") or "").strip():
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
    body += "\n💵 %s\n📦 %s" % (price_str(unit_price(p, user)), esc(stock_line))
    bulk_min = store.get_int('bulk_min_%s' % p['id'], 0)
    if bulk_min >= 2 and store.get_setting('bulk_price_%s' % p['id'], ''):
        body += "\n📦 جملة: %d+ · %s / قطعة" % (bulk_min, price_str(unit_price(p, user, bulk_min)))
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
        [_btn('👑 VIP', 'primary', None, cb='vip'), _btn('⭐ المفضلة' if lang == 'ar' else '⭐ Favorites', 'primary', None, cb='favorites')],
    ]
    return "\n".join(lines), inline_keyboard(rows)


def wallet_text(user):
    lang = lang_of(user)
    rows = [
        [_btn(t("lbl_topup", lang), "success", None, cb="topup")],
        [_btn(t("lbl_orders", lang), "primary", None, cb="orders")],
        [_btn('👑 VIP', 'primary', None, cb='vip')],
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

def deliver_order(user, product, qty=1, expected_total=None):
    """Charge balance, take stock, deliver. Returns (ok, message)."""
    lang = lang_of(user)
    result = store.purchase_atomic(user["tg_id"], product["id"], qty, store.get_int("referral_percent", 10), expected_total)
    error = result.get("error")
    if error == "invalid":
        return False, "❌ المنتج غير متاح." if lang == "ar" else "❌ Product unavailable."
    if error == "price_changed":
        return False, "⚠️ تغير السعر؛ أعد اختيار الكمية قبل الشراء." if lang == "ar" else "⚠️ Price changed; choose quantity again."
    if error == "delivery_too_long":
        return False, "⚠️ الطلب طويل جداً للتسليم دفعة واحدة؛ اشترِ كمية أقل." if lang == "ar" else "⚠️ Delivery is too long; purchase a smaller quantity."
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

    # The transaction is already committed; notifications are best-effort.
    notify_public_event("purchase", fresh, p, qty)

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
    rows = [[_btn('🟡 Binance Pay', 'primary', None, cb='paymethod:binance')],
            [_btn('💠 USDT · BEP20', 'primary', None, cb='paymethod:bep20')],
            [_btn('💠 TRON · TRC20', 'primary', None, cb='paymethod:trc20')],
            [_btn(t('lbl_cancel', lang), 'danger', None, cb='cancel')]]
    return safe_send(user['tg_id'], '💳 اختر طريقة الشحن. تتم مراجعة كل طلب يدوياً قبل إضافة الرصيد.' if lang == 'ar' else '💳 Select a method. Each deposit is reviewed manually.', inline_keyboard(rows))


def deposit_choose(user, method):
    lang = lang_of(user)
    options = {
        'binance': ('Binance Pay ID', store.get_setting('binance_pay_id', '1234077002')),
        'bep20': ('USDT BEP20', store.get_setting('bep20_address', '0xe64b863710576bc32063cde2039b9477888dc481')),
        'trc20': ('TRON TRC20', store.get_setting('trc20_address', 'TCm3uFLkPdi7yV6qBhJFLtSvYDsKjhNVqg')),
    }
    if method not in options: return
    title, pay_id = options[method]
    pay_id = pay_id.strip()
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

    body = ("💳 <b>%s</b>\n<code>%s</code>\n\n" % (esc(title), esc(pay_id)) +
            ("تأكد من العملة والشبكة مع الدعم قبل التحويل. أرسل مبلغ الشحن بالدولار/USDT؛ ثم أرسل رقم المعاملة لمراجعة المالك." if lang == 'ar' else
             "Confirm the asset and network with support before transferring. Send the USD/USDT amount, then the transaction ID for manual review."))
    state_set(user["tg_id"], "deposit_amount", expires=time.time() + session_minutes() * 60,
              lang=lang, method=method)
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


def deposit_finish(user, txid, amount=None, method="binance"):
    lang = lang_of(user)
    depos_id = store.create_deposit(user["id"], to_float(amount, 0), method, txid)
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
            "💳 <b>%s</b>\n\n👤 %s (<code>%s</code>)\n💵 %s\n💳 %s\n🔑 <code>%s</code>\n\n%s" % (
                "طلب شحن جديد", esc(user.get("first_name") or "-"), user["tg_id"],
                price_str(amount), esc(method), esc(txid),
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

    joined, check_error = membership_check(tg_id)
    if not joined:
        parts = text.split(maxsplit=1)
        if len(parts) > 1 and parts[0].split('@')[0] == '/start' and re.fullmatch(r'ref_[0-9]+', parts[1].strip()):
            state_set(tg_id, "join_referral", ref_tg=int(parts[1].strip()[4:]), expires=time.time()+86400)
        return show_join_required(user, check_error)
    user = finish_join_referral(user)

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
            user = record_referral(user, ref_tg)

    # Cancellation is recognized for both reply keyboards and slash commands,
    # including owner-customised labels. Never broadcast the cancel button.
    cancel_values = {norm_key(x) for x in ("/cancel", "إلغاء", "الغاء", "cancel", "❌ إلغاء",
                                              label("lbl_cancel", "ar"), label("lbl_cancel", "en"))}
    if norm_key(text) in cancel_values:
        return run_route(user, "cancel")

    # ---- active multi-step state ---------------------------------------
    st = state_get(tg_id)
    stock_message = st and st.get("kind") == "admin_input" and st.get("mode") in ("stock_single", "stock_batch")
    if st and (not text.startswith("/") or (stock_message and text.split()[0].split('@')[0] not in ("/admin", "/start", "/cancel"))):
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

    if kind == "admin_input":
        raw_text = msg.get("text") if st.get("mode") == "stock_single" else text
        return admin_apply_input(user, st, raw_text or "")

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

    if kind == 'purchase_qty':
        if not text.isdigit() or not 1 <= int(text) <= 100:
            safe_send(tg_id, '⚠️ أدخل كمية من 1 إلى 100.'); return True
        qty = int(text); p = store.product_by_id(st.get('product_id'))
        if not p or not p.get('visible') or store.available_stock(p) < qty:
            state_clear(tg_id); safe_send(tg_id, '⚠️ المنتج غير متاح أو المخزون غير كافٍ.'); return True
        total = round(unit_price(p, user, qty) * qty, 2)
        nonce = secrets.token_hex(5)
        state_set(tg_id, 'quantity_confirm', product_id=p['id'], qty=qty, total=total, nonce=nonce, expires=time.time()+600)
        safe_send(tg_id, '🛒 <b>%s</b> × %d\nسعر القطعة: %s\nالإجمالي: <b>%s</b>\nتأكيد الشراء من الرصيد؟' % (esc(p['name']), qty, price_str(unit_price(p,user,qty)), price_str(total)),
                  inline_keyboard([[_btn('✅ تأكيد الشراء','success',None,cb='qtybuy:'+nonce), _btn('❌ إلغاء','danger',None,cb='cancel')]]))
        return True

    if kind == "deposit_amount":
        if text.strip() in ("إلغاء", "الغاء", "cancel", "/cancel", "❌ إلغاء"):
            state_clear(tg_id)
            safe_send(tg_id, "❌ " + ("تم الإلغاء." if lang == "ar" else "Cancelled."),
                      build_main_keyboard(user))
            return True
        amount_text = text.strip().replace(',', '.')
        amount = round(to_float(amount_text, 0), 2) if re.fullmatch(r'[0-9]+(?:\.[0-9]{1,2})?', amount_text) else 0
        minimum = to_float(store.get_setting("deposit_min", "1"), 1)
        if not math.isfinite(amount) or amount <= 0 or amount > 1000000:
            safe_send(tg_id, "⚠️ " + ("أدخل مبلغاً صحيحاً." if lang == "ar" else "Enter a valid amount."))
            return True
        if amount < minimum:
            safe_send(tg_id, "⚠️ " + (("الحد الأدنى للشحن هو %s." % price_str(minimum)) if lang == "ar"
                                      else ("Minimum top-up is %s." % price_str(minimum))))
            return True
        state_set(tg_id, "deposit_txid", amount=amount, method=st.get("method", "binance"),
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
        if len(txid) < 6 or len(txid) > 200:
            safe_send(tg_id, "⚠️ " + ("معرّف المعاملة غير صالح." if lang == "ar"
                                      else "Invalid transaction ID."))
            return True
        deposit_finish(user, txid, st.get("amount"), st.get("method", "binance"))
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
    if (msg.get("chat") or {}).get("type") != "private":
        return
    joined, check_error = membership_check(user["tg_id"])
    if not joined:
        return show_join_required(user, check_error, edit=message_id)
    user = finish_join_referral(user)
    if data == "joincheck":
        if message_id:
            safe_edit(chat_id, message_id, "✅ تم التحقق من الاشتراك." if lang == "ar" else "✅ Membership verified.")
        return send_main_menu(user)
    if store.get_bool("maintenance") and not is_owner_user(user):
        return

    parts = data.split(":")
    head = parts[0] if parts else ""

    # Administration and payment decisions must stay in a private chat.
    if head in ("a", "adm", "dep") and (msg.get("chat") or {}).get("type") != "private":
        return

    if head == "a":
        if is_owner_user(user):
            return admin_dispatch(user, parts[1:], message_id)
        return

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

    if head == 'favorite' and len(parts) == 2:
        pid=to_int(parts[1]); p=store.product_by_id(pid)
        if not p or not p.get('visible'): return safe_send(chat_id, '❌ المنتج غير متاح.')
        with store.lock:
            row=store.one('SELECT id FROM favorites WHERE user_id=? AND product_id=?',(user['id'],pid))
            if row:
                store.ex('DELETE FROM favorites WHERE id=?',(row['id'],)); message='⭐ أُزيل من المفضلة.'
            else:
                store.ex('INSERT INTO favorites(user_id,product_id) VALUES(?,?)',(user['id'],pid)); message='⭐ أُضيف إلى المفضلة.'
        return safe_send(chat_id, message)

    if head == 'favorites':
        products=store.q('SELECT p.id,p.name FROM products p JOIN favorites f ON f.product_id=p.id WHERE f.user_id=? AND p.visible=1 ORDER BY f.id DESC LIMIT 30', (user['id'],))
        rows=[[_btn('⭐ '+p['name'][:40], 'primary', None, cb='view:%d' % p['id'])] for p in products]
        rows.append([_btn('⬅️ القائمة','default',None,cb='menu')])
        return safe_send(chat_id, '⭐ <b>المفضلة</b>' if products else '⭐ لا توجد منتجات في المفضلة.', inline_keyboard(rows))

    if head == 'vip':
        enabled = store.get_bool('vip_enabled')
        price = round(to_float(store.get_setting('vip_price','0'), 0), 2)
        days = store.get_int('vip_days',30); pct = store.get_int('vip_percent',0)
        until = vip_until(user['tg_id'])
        status = datetime.fromtimestamp(until, timezone.utc).strftime('%Y-%m-%d %H:%M UTC') if until > time.time() else 'غير نشط'
        if not enabled or not math.isfinite(price) or price < 0.01 or not 1 <= days <= 3650 or not 1 <= pct <= 90:
            return safe_send(chat_id, '👑 VIP: %s\nالاشتراك غير متاح حالياً.' % esc(status))
        nonce=secrets.token_hex(8)
        state_set(user['tg_id'],'vip_confirm',nonce=nonce,price=price,days=days,percent=pct,expires=time.time()+600)
        body='👑 <b>VIP</b>\nالحالة: %s\nالمدة: %d يوم\nالخصم: %d%%\nالسعر: %s من المحفظة\nيطبّق أفضل سعر فقط، دون جمع الخصومات.' % (esc(status),days,pct,price_str(price))
        return safe_send(chat_id,body,inline_keyboard([[_btn('✅ شراء / تجديد VIP','success',None,cb='vipbuy:'+nonce),_btn('❌ إلغاء','danger',None,cb='cancel')]]))

    if head == 'vipbuy' and len(parts) == 2:
        st=state_get(user['tg_id'])
        if not st or st.get('kind') != 'vip_confirm' or not hmac.compare_digest(st.get('nonce',''),parts[1]):
            return safe_send(chat_id,'⚠️ التأكيد منتهي أو مستخدم.')
        result=store.purchase_vip_atomic(user['tg_id'], st['nonce'], st['price'], st['days'], st['percent'])
        state_clear(user['tg_id'])
        if result.get('error'):
            return safe_send(chat_id, '⚠️ تعذر الاشتراك: تحقق من رصيدك والأسعار، ثم حاول مجدداً.')
        notify_public_event('purchase',user,{'name':'VIP'},1)
        return safe_send(chat_id,'✅ تم تفعيل VIP حتى %s UTC.' % datetime.fromtimestamp(result['expires_at'],timezone.utc).strftime('%Y-%m-%d %H:%M'))

    if head == 'qty' and len(parts) == 2:
        p = store.product_by_id(to_int(parts[1]))
        if not p or not p.get('visible'): return safe_send(chat_id, '❌ المنتج غير متاح.')
        state_set(user['tg_id'], 'purchase_qty', product_id=p['id'], expires=time.time()+600)
        return safe_send(chat_id, '📦 أرسل الكمية المطلوبة من 1 إلى 100. للإلغاء /cancel')

    if head == 'qtybuy' and len(parts) == 2:
        st=state_get(user['tg_id'])
        if not st or st.get('kind') != 'quantity_confirm' or not hmac.compare_digest(st.get('nonce',''),parts[1]):
            return safe_send(chat_id, '⚠️ التأكيد منتهي أو مستخدم.')
        state_clear(user['tg_id'])
        p=store.product_by_id(st['product_id'])
        if not p: return safe_send(chat_id, '❌ المنتج غير متاح.')
        ok, payload=deliver_order(user,p,st['qty'],st['total'])
        body, markup = payload if isinstance(payload, tuple) else (str(payload), None)
        return safe_edit(chat_id,message_id,body,markup) if message_id else safe_send(chat_id,body,markup)

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

    if head == "paymethod" and len(parts) == 2:
        return deposit_choose(user, parts[1])

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
                notify_public_event("deposit", target, deposit=dep)
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
#  OWNER ADMIN — جميع أدوات الإدارة داخل تيليغرام.
# ============================================================================

def _broadcast_one(uid, text):
    # الإذاعة نص عادي لتجنب أخطاء تنسيق HTML.
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
            else:
                time.sleep(1)


# ============================================================================
# لوحة الإدارة الكاملة داخل تيليغرام — بدون موقع أو خادم ويب
# ============================================================================
ADMIN_FIELDS = {
    'p': [('name','الاسم العربي'),('name_en','الاسم الإنجليزي'),('price','السعر'),
          ('description','الوصف العربي'),('description_en','الوصف الإنجليزي'),('icon','الأيقونة'),
          ('emoji_id','معرّف الإيموجي المخصص'),('category_id','رقم التصنيف'),('stock_mode','نوع المخزون'),
          ('feed','قالب التسليم اللامحدود'),('color','لون الزر'),('sort','ترتيب المنتج')],
    'c': [('name','الاسم العربي'),('name_en','الاسم الإنجليزي'),('icon','الأيقونة'),
          ('emoji_id','معرّف الإيموجي المخصص'),('sort','الترتيب')],
    'b': [('label_ar','النص العربي'),('label_en','النص الإنجليزي'),('icon','الأيقونة'),
          ('emoji_id','معرّف الإيموجي المخصص'),('color','اللون'),('row','رقم الصف'),
          ('sort','الترتيب'),('action','الوظيفة'),('payload','قيمة الوظيفة')],
}
ADMIN_SETTINGS = [
    ('store_name','اسم المتجر'),('support_username','حساب الدعم'),('default_lang','اللغة الافتراضية'),
    ('currency','العملة'),('page_size','عدد المنتجات بالصفحة'),('referral_percent','نسبة الإحالة %'),
    ('discount_percent','الخصم العام %'),('binance_pay_id','معرّف Binance Pay'),
    ('deposit_min','أقل شحن'),('deposit_session_minutes','مهلة الشحن بالدقائق'),
    ('style_enabled','ألوان الأزرار'),('mirror_rows','عكس ترتيب الصفوف'),
    ('maintenance','وضع الصيانة'),('dm_owner_on_order','إشعار الطلب'),('dm_owner_on_deposit','إشعار الشحن'),
    ('owner_ids','معرّفات المالكين'),
    ('required_channel_1','قناة الاشتراك الأولى'),('required_channel_2','قناة الاشتراك الثانية'),
    ('event_chat_id','ID شات إشعارات المبيعات والشحن'),
    ('bep20_address','عنوان BEP20'),('trc20_address','عنوان TRC20'),
    ('vip_enabled','تفعيل VIP (1 أو 0)'),('vip_price','سعر اشتراك VIP'),
    ('vip_days','مدة VIP بالأيام'),('vip_percent','خصم VIP %'),
]
ADMIN_TEXTS = [
    ('welcome_ar','الترحيب بالعربية'),('welcome','الترحيب الأساسي'),
    ('help_text_ar','المساعدة بالعربية'),('help_text_en','المساعدة بالإنجليزية'),
    ('policy_text_ar','السياسة بالعربية'),('policy_text_en','السياسة بالإنجليزية'),
    ('api_text_ar','نص API عربي'),('api_text_en','نص API إنجليزي'),
    ('maintenance_text_ar','الصيانة بالعربية'),('maintenance_text_en','الصيانة بالإنجليزية'),
    ('binance_steps_ar','شرح الشحن عربي'),('binance_steps_en','شرح الشحن إنجليزي'),
    ('binance_prompt_ar','طلب رقم العملية عربي'),('binance_prompt_en','طلب رقم العملية إنجليزي'),
]
ACTIONS = ('products','search','offers','profile','wallet','referrals','help','policy','deposit',
           'orders','lang','api','support','admin','category','text','url','menu','buy')

def admin_show(user, body, rows, edit=None):
    markup = inline_keyboard(rows + [[_btn('🏠 لوحة الإدارة', 'primary', None, cb='a:home')]])
    if edit:
        return safe_edit(user['tg_id'], edit, body, markup)
    return safe_send(user['tg_id'], body, markup)


def admin_home(user, edit=None):
    if not is_owner_user(user):
        return
    s = store.stats()
    body = ('⚙️ <b>لوحة التحكم داخل البوت</b>\n\n👥 %d مستخدم · 📦 %d منتج\n'
            '🧾 %d طلب · 💳 %d شحنة معلقة\n💰 المبيعات: %s\n\nاختر القسم:') % (
                s['users'], s['products'], s['orders'], s['pending_deposits'], price_str(s['revenue']))
    rows = [[_btn('📦 المنتجات والمخزون','success',None,cb='a:ls:p:0'), _btn('🗂 التصنيفات','primary',None,cb='a:ls:c:0')],
            [_btn('🔘 أزرار القائمة','primary',None,cb='a:ls:b:0'), _btn('👥 المستخدمون','primary',None,cb='a:ls:u:0')],
            [_btn('🧾 الطلبات','primary',None,cb='a:ls:o:0'), _btn('💳 الشحنات','success',None,cb='a:ls:d:0')],
            [_btn('📝 النصوص والرسائل','primary',None,cb='a:ls:t:0'), _btn('🔤 تسميات الأزرار','primary',None,cb='a:ls:l:0')],
            [_btn('⚙️ الإعدادات والدفع','primary',None,cb='a:ls:s:0'), _btn('🏷 ضبط الخصم','success',None,cb='adm:discount')],
            [_btn('📣 الإذاعة','primary',None,cb='adm:broadcast'), _btn('💾 نسخة احتياطية','primary',None,cb='a:confirm:backup:0')],
            [_btn('🔄 تحديث','default',None,cb='a:home')],
            [_btn('🏪 المتجر','default',None,cb='menu')]]
    markup = inline_keyboard(rows)
    return safe_edit(user['tg_id'], edit, body, markup) if edit else safe_send(user['tg_id'], body, markup)


def admin_list(user, kind, page=0, edit=None):
    page = max(0, min(page, 100000))
    size = 8
    if kind == 'p':
        items = store.products(include_hidden=True)
        title = '📦 المنتجات والمخزون'
        label_fn = lambda x: '#%s %s · %s · مخزون %s' % (x['id'], x['name'], price_str(x['price']), store.available_stock(x))
    elif kind == 'c':
        items = store.categories(include_hidden=True); title = '🗂 التصنيفات'
        label_fn = lambda x: '#%s %s' % (x['id'], x['name'])
    elif kind == 'b':
        items = store.buttons(include_hidden=True); title = '🔘 أزرار القائمة'
        label_fn = lambda x: '#%s %s · %s' % (x['id'], render_button_label(x, 'ar'), x['action'])
    elif kind == 'u':
        items = store.users_list(limit=size+1, offset=page*size); title = '👥 المستخدمون'
        label_fn = lambda x: '%s · %s · %s' % (x['tg_id'], x['first_name'] or x['username'] or '—', price_str(x['balance']))
    elif kind == 'o':
        items = store.orders_list(limit=size+1, offset=page*size); title = '🧾 الطلبات'
        label_fn = lambda x: '#%s · %s · %s' % (x['id'], x['product_name'], x['status'])
    elif kind == 'd':
        items = store.deposits_list(limit=size+1, offset=page*size); title = '💳 الشحنات'
        label_fn = lambda x: '#%s · %s · %s' % (x['id'], price_str(x['amount']), x['status'])
    elif kind in ('s','t','l'):
        pairs = ADMIN_SETTINGS if kind == 's' else ADMIN_TEXTS if kind == 't' else [(k+'_'+lang, k+' · '+lang) for k in LABEL_DEFAULTS for lang in ('ar','en')]
        items = [{'id': i, 'title': v[1]} for i,v in enumerate(pairs)]
        title = {'s':'⚙️ الإعدادات والدفع','t':'📝 النصوص والرسائل','l':'🔤 التسميات'}[kind]
        label_fn = lambda x: x['title']
    else:
        return admin_home(user, edit)
    db_paged = kind in ('u','o','d')
    more = len(items) > size if db_paged else len(items) > (page+1)*size
    subset = items[:size] if db_paged else items[page*size:(page+1)*size]
    rows = []
    if kind in ('p','c','b'):
        rows.append([_btn('➕ إضافة جديد','success',None,cb='a:new:'+kind)])
    if kind == 'u':
        rows.append([_btn('🔎 فتح مستخدم بالـ ID','primary',None,cb='a:finduser')])
    for x in subset:
        ident = x['tg_id'] if kind == 'u' else x['id']
        rows.append([_btn(label_fn(x)[:80], 'default', None, cb='a:item:%s:%s' % (kind, ident))])
    nav = []
    if page: nav.append(_btn('⬅️ السابق','default',None,cb='a:ls:%s:%d' % (kind,page-1)))
    if more: nav.append(_btn('التالي ➡️','default',None,cb='a:ls:%s:%d' % (kind,page+1)))
    if nav: rows.append(nav)
    return admin_show(user, '<b>%s</b> · صفحة %d\nاختر عنصراً:' % (title,page+1), rows, edit)


def admin_item(user, kind, ident, edit=None):
    if kind in ('p','c','b'):
        obj = {'p':store.product_by_id,'c':store.get_category,'b':store.get_button}[kind](ident)
        if not obj: return admin_list(user, kind, 0, edit)
        name = obj.get('name') or obj.get('label_ar') or '—'
        lines = ['<b>%s #%d</b>' % (esc(name),ident)]
        for key, title in ADMIN_FIELDS[kind]:
            val = str(obj.get(key) if obj.get(key) is not None else '')
            if key == 'feed' and len(val)>100: val = val[:100]+'…'
            lines.append('%s: <code>%s</code>' % (title,esc(val[:150])))
        lines.append('الظهور: %s' % ('ظاهر' if obj.get('visible') else 'مخفي'))
        rows = []
        fields = ADMIN_FIELDS[kind]
        for i in range(0,len(fields),2):
            rows.append([_btn('✏️ '+v, 'primary', None, cb='a:edit:%s:%d:%s' % (kind,ident,k)) for k,v in fields[i:i+2]])
        rows.append([_btn('👁 تبديل الظهور','primary',None,cb='a:toggle:%s:%d:visible' % (kind,ident))])
        if kind == 'p':
            lines.append('المخزون المتاح: %d' % store.product_stock(ident))
            lines.append('الجملة: %s+ · %s للقطعة' % (esc(store.get_setting('bulk_min_%d' % ident, '0')), esc(store.get_setting('bulk_price_%d' % ident, '—'))))
            rows.append([_btn('📦 ضبط سعر الجملة','primary',None,cb='a:bulk:%d' % ident)])
            rows.extend([[_btn('➕ قطعة واحدة متعددة الأسطر','success',None,cb='a:stock:add:%d' % ident)],
                         [_btn('📚 إضافة دفعة: كل سطر قطعة','primary',None,cb='a:stock:batch:%d' % ident),
                          _btn('📋 عرض المخزون','primary',None,cb='a:stock:view:%d' % ident)],
                         [_btn('🗑 مسح المخزون المتاح','danger',None,cb='a:confirm:stock:%d' % ident)]])
        if kind == 'b':
            rows.append([_btn('🔒 للمالك فقط: %s' % ('نعم' if obj.get('owner_only') else 'لا'),'primary',None,cb='a:toggle:b:%d:owner_only' % ident)])
            rows.append([_btn('📝 نص الزر عربي','primary',None,cb='a:custom:%d:ar' % ident),
                         _btn('📝 نص الزر إنجليزي','primary',None,cb='a:custom:%d:en' % ident)])
        rows.append([_btn('🗑 حذف','danger',None,cb='a:confirm:%s:%d' % (kind,ident)),
                     _btn('⬅️ القائمة','default',None,cb='a:ls:%s:0' % kind)])
        return admin_show(user, '\n'.join(lines), rows, edit)
    if kind in ('s','t','l'):
        pairs = ADMIN_SETTINGS if kind == 's' else ADMIN_TEXTS if kind == 't' else [(k+'_'+lang, k+' · '+lang) for k in LABEL_DEFAULTS for lang in ('ar','en')]
        if ident < 0 or ident >= len(pairs): return admin_home(user,edit)
        key,title = pairs[ident]
        value = store.get_setting(key, '')
        rows = [[_btn('✏️ تعديل','primary',None,cb='a:set:%s:%d' % (kind,ident)),
                 _btn('⬅️ رجوع','default',None,cb='a:ls:%s:%d' % (kind, ident//8))]]
        return admin_show(user, '<b>%s</b>\n\n<code>%s</code>' % (esc(title),esc(value[:1000]) or '—'), rows, edit)
    if kind == 'u':
        target = store.get_user(ident)
        if not target: return admin_show(user,'❌ المستخدم غير موجود.',[],edit)
        body = '👤 <b>%s</b>\nID: <code>%s</code>\nالرصيد: %s\nالحظر: %s\nمشرف: %s' % (esc(target['first_name'] or '—'),ident,price_str(target['balance']), 'نعم' if target['banned'] else 'لا','نعم' if target['is_admin'] else 'لا')
        rows = [[_btn('➕ إضافة رصيد','success',None,cb='a:wallet:add:%d' % ident),_btn('➖ خصم رصيد','danger',None,cb='a:wallet:sub:%d' % ident)],
                [_btn('🚫 تبديل الحظر','danger',None,cb='a:user:ban:%d' % ident),_btn('💬 رسالة خاصة','primary',None,cb='a:user:msg:%d' % ident)],
                [_btn('🔐 تبديل صلاحية مشرف','primary',None,cb='a:confirm:admin:%d' % ident),_btn('⬅️ المستخدمون','default',None,cb='a:ls:u:0')]]
        return admin_show(user,body,rows,edit)
    if kind == 'o':
        order = store.get_order(ident)
        if not order: return admin_list(user,'o',0,edit)
        target = store.get_user_by_id(order['user_id'])
        body = '🧾 <b>طلب #%d</b>\nالمنتج: %s\nالمستخدم: <code>%s</code>\nالكمية: %s · المبلغ: %s\nالحالة: %s' % (ident,esc(order['product_name']),esc((target or {}).get('tg_id','—')),order['qty'],price_str(order['total']),esc(order['status']))
        rows = [[_btn('✅ تسليم المعلق','success',None,cb='a:confirm:deliver:%d' % ident)],
                [_btn('💸 استرجاع المبلغ','danger',None,cb='a:confirm:refund:%d' % ident),_btn('❌ إلغاء وإرجاع','danger',None,cb='a:confirm:cancel:%d' % ident)],
                [_btn('⬅️ الطلبات','default',None,cb='a:ls:o:0')]]
        return admin_show(user,body,rows,edit)
    if kind == 'd':
        dep = store.get_deposit(ident)
        if not dep: return admin_list(user,'d',0,edit)
        target = store.get_user_by_id(dep['user_id'])
        body = '💳 <b>شحنة #%d</b>\nالمستخدم: <code>%s</code>\nالمبلغ: %s\nالطريقة: %s\nالمعاملة: <code>%s</code>\nالحالة: %s' % (ident,esc((target or {}).get('tg_id','—')),price_str(dep['amount']),esc(dep.get('method','')),esc(dep['txid']),esc(dep['status']))
        rows = [[_btn('✅ قبول','success',None,cb='dep:ok:%d' % ident),_btn('❌ رفض','danger',None,cb='dep:no:%d' % ident)],
                [_btn('⬅️ الشحنات','default',None,cb='a:ls:d:0')]]
        return admin_show(user,body,rows,edit)


def admin_prompt(user, **data):
    state_set(user['tg_id'], 'admin_input', expires=time.time()+1800, **data)
    return safe_send(user['tg_id'], data['prompt']+'\n\nللإلغاء: /cancel', reply_keyboard([[_rbtn('❌ إلغاء','danger')]]))


def admin_dispatch(user, parts, edit=None):
    action = parts[0] if parts else 'home'
    if action in ('home', 'ls', 'item'):
        state_clear(user['tg_id'])
        PENDING_BROADCAST.pop(user['tg_id'], None)
    if action == 'home': return admin_home(user,edit)
    if action == 'ls' and len(parts)==3: return admin_list(user,parts[1],to_int(parts[2]),edit)
    if action == 'item' and len(parts)==3: return admin_item(user,parts[1],to_int(parts[2],-1),edit)
    if action == 'finduser': return admin_prompt(user, mode='finduser',prompt='🔎 أرسل رقم Telegram ID للمستخدم.')
    if action == 'new' and len(parts)==2 and parts[1] in ('p','c','b'):
        return admin_prompt(user, mode='new',entity=parts[1],prompt='➕ أرسل اسم العنصر الجديد. بعد إنشائه عدّل تفاصيله من أزراره.')
    if action == 'edit' and len(parts)==4:
        kind, ident, key = parts[1],to_int(parts[2]),parts[3]
        fields = dict(ADMIN_FIELDS.get(kind,[]))
        if key not in fields: return
        hint = {'price':'رقم غير سالب مثل 2.50','stock_mode':'auto أو unlimited؛ اللامحدود يحتاج قالب التسليم',
                'category_id':'رقم تصنيف موجود أو 0','color':'auto أو success أو danger أو primary أو default',
                'action':'الوظائف: '+', '.join(ACTIONS),'payload':'للرابط اكتب https://...، وللتصنيف أو المنتج اكتب الرقم',
                'feed':'نص التسليم؛ يدعم {order} و{user} و{index}','row':'عدد صحيح من 0 إلى 100','sort':'عدد صحيح من 0 إلى 10000'}.get(key,'أرسل القيمة الجديدة. أرسل - لمسح الحقل.')
        return admin_prompt(user,mode='edit',entity=kind,ident=ident,key=key,prompt='✏️ %s\n%s' % (fields[key],hint))
    if action == 'set' and len(parts)==3 and parts[1] in ('s','t','l'):
        kind, ident = parts[1],to_int(parts[2],-1)
        pairs = ADMIN_SETTINGS if kind=='s' else ADMIN_TEXTS if kind=='t' else [(k+'_'+lang,k+' · '+lang) for k in LABEL_DEFAULTS for lang in ('ar','en')]
        if not 0<=ident<len(pairs): return
        key, title = pairs[ident]
        hint = {'referral_percent':'نسبة بين 0 و100.', 'discount_percent':'نسبة بين 0 و90.',
                'page_size':'عدد من 1 إلى 30.', 'deposit_session_minutes':'عدد دقائق من 1 إلى 1440.',
                'style_enabled':'1 للتفعيل و0 للإيقاف.', 'mirror_rows':'1 للعكس و0 للعادي.',
                'maintenance':'1 لتفعيل الصيانة و0 لإيقافها.', 'dm_owner_on_order':'1 للتفعيل و0 للإيقاف.',
                'dm_owner_on_deposit':'1 للتفعيل و0 للإيقاف.', 'default_lang':'ar أو en.',
                'owner_ids':'أرقام Telegram مفصولة بفواصل. يبقى OWNER_ID الأساسي مفعلاً.',
                'required_channel_1':'معرّف قناة عامة بدون @، أو off للإيقاف.',
                'required_channel_2':'معرّف قناة عامة بدون @، أو off للإيقاف.',
                'event_chat_id':'رقم الشات السالب، أو 0 للإيقاف.'}.get(key,'أرسل - لمسح القيمة.')
        return admin_prompt(user,mode='setting',key=key,prompt='✏️ أرسل القيمة الجديدة لـ %s.\n%s' % (title,hint))
    if action == 'custom' and len(parts)==3 and parts[2] in ('ar','en'):
        bid = to_int(parts[1]); obj = store.get_button(bid)
        if not obj: return
        if obj['action'] != 'text':
            store.update_button(bid, {'action':'text','payload':'custom_btn_%d' % bid})
        key = store.get_button(bid)['payload'] or ('custom_btn_%d' % bid)
        store.update_button(bid, {'payload':key})
        return admin_prompt(user, mode='setting',key=key+'_'+parts[2],prompt='📝 أرسل نص الزر المخصص (%s).' % parts[2])
    if action == 'toggle' and len(parts)==4:
        kind, ident, key = parts[1],to_int(parts[2]),parts[3]
        if kind not in ('p','c','b') or key not in ('visible','owner_only') or (key=='owner_only' and kind!='b'): return
        get = {'p':store.product_by_id,'c':store.get_category,'b':store.get_button}[kind]
        obj = get(ident)
        if obj:
            {'p':store.update_product,'c':store.update_category,'b':store.update_button}[kind](ident,{key:0 if obj.get(key) else 1})
        return admin_item(user,kind,ident,edit)
    if action == 'bulk' and len(parts)==2:
        pid=to_int(parts[1])
        if not store.product_by_id(pid): return admin_home(user,edit)
        return admin_prompt(user,mode='bulk',ident=pid,prompt='📦 أرسل الحد الأدنى والسعر لكل قطعة مفصولين بمسافة، مثال: 10 2.50. أرسل 0 لإيقاف الجملة.')
    if action == 'stock' and len(parts)==3:
        mode, pid = parts[1],to_int(parts[2]); product=store.product_by_id(pid)
        if not product: return admin_home(user,edit)
        if mode == 'add': return admin_prompt(user,mode='stock_single',ident=pid,prompt='📦 أرسل محتوى قطعة واحدة كاملاً، حتى لو يحتوي أسطراً كثيرة؛ سيُحسب قطعة واحدة.')
        if mode == 'batch': return admin_prompt(user,mode='stock_batch',ident=pid,prompt='📚 أرسل الدفعة: كل سطر غير فارغ يُحسب قطعة مستقلة.')
        if mode == 'view':
            stock=store.stock_list(pid,used=False)
            text='📦 المخزون المتاح: %d\n\n%s' % (len(stock),esc('\n'.join(x['content'] for x in stock[:20])) or '—')
            return admin_show(user,text,[[_btn('⬅️ المنتج','default',None,cb='a:item:p:%d' % pid)]],edit)
    if action == 'wallet' and len(parts)==3 and parts[1] in ('add','sub'):
        return admin_prompt(user,mode='wallet',op=parts[1],ident=to_int(parts[2]),prompt='💰 أرسل مبلغاً موجباً بالعملة المحددة.')
    if action == 'user' and len(parts)==3:
        op, uid = parts[1],to_int(parts[2]); target=store.get_user(uid)
        if not target: return admin_home(user,edit)
        if op == 'msg': return admin_prompt(user,mode='message',ident=uid,prompt='💬 أرسل نص الرسالة للمستخدم.')
        if op == 'ban' and uid not in owner_ids() and not target.get('is_admin'):
            store.update_user(uid,banned=0 if target['banned'] else 1)
        return admin_item(user,'u',uid,edit)
    if action == 'confirm' and len(parts)==3:
        kind, ident = parts[1],to_int(parts[2])
        if kind not in ('p','c','b','stock','refund','cancel','deliver','admin','backup'): return
        if kind == 'backup' and user['tg_id'] not in owner_ids(): return admin_show(user,'⛔ النسخة الاحتياطية للمالك فقط.',[],edit)
        nonce=secrets.token_hex(5)
        state_set(user['tg_id'],'admin_confirm',nonce=nonce,op=kind,ident=ident,expires=time.time()+600)
        question = '⚠️ النسخة تحتوي بيانات المستخدمين والمخزون؛ ستُرسل إلى حسابك. هل تؤكد؟' if kind=='backup' else '⚠️ هل تؤكد هذا الإجراء على #%d؟' % ident
        return admin_show(user,question,
            [[_btn('✅ تأكيد','danger',None,cb='a:do:%s:%d:%s' % (kind,ident,nonce)),_btn('❌ تراجع','default',None,cb='a:home')]],edit)
    if action == 'do' and len(parts)==4:
        kind, ident=parts[1],to_int(parts[2])
        confirmation=state_get(user['tg_id'])
        if not confirmation or confirmation.get('kind')!='admin_confirm' or confirmation.get('op')!=kind or confirmation.get('ident')!=ident or not hmac.compare_digest(confirmation.get('nonce',''),parts[3]):
            return admin_show(user,'⚠️ التأكيد منتهي أو تم استخدامه.',[],edit)
        state_clear(user['tg_id'])
        if kind=='backup':
            if user['tg_id'] not in owner_ids(): return
            ok=admin_send_backup(user['tg_id'])
            return admin_show(user,'✅ أُرسلت النسخة الاحتياطية.' if ok else '❌ تعذر إرسال النسخة الاحتياطية.',[],edit)
        if kind in ('p','c','b'):
            {'p':store.delete_product,'c':store.delete_category,'b':store.delete_button}[kind](ident)
            return admin_list(user,kind,0,edit)
        if kind == 'stock':
            store.ex('DELETE FROM stock_items WHERE product_id=? AND used=0',(ident,))
            return admin_item(user,'p',ident,edit)
        if kind == 'admin':
            if user['tg_id'] not in owner_ids(): return admin_show(user,'⛔ الإجراء للمالك الأساسي فقط.',[],edit)
            target=store.get_user(ident)
            if target and ident not in owner_ids(): store.update_user(ident,is_admin=0 if target['is_admin'] else 1)
            return admin_item(user,'u',ident,edit)
        if kind in ('refund','cancel'):
            order=store.refund_order_atomic(ident,'refunded' if kind=='refund' else 'cancelled')
            if order:
                target=store.get_user_by_id(order['user_id'])
                if target: safe_send(target['tg_id'],'💸 أُرجع مبلغ الطلب #%d إلى محفظتك.' % ident)
            return admin_show(user,'✅ تم إرجاع المبلغ.' if order else '⚠️ الطلب غير موجود أو تمت معالجته مسبقاً.', [[_btn('⬅️ الطلب','default',None,cb='a:item:o:%d' % ident)]],edit)
        if kind == 'deliver':
            order=store.get_order(ident); delivery=store.deliver_pending_atomic(ident)
            if order and delivery:
                target=store.get_user_by_id(order['user_id'])
                if target:
                    notify_public_event('purchase', target, {'name': order['product_name']}, order['qty'])
                    safe_send(target['tg_id'],'✅ تم تسليم الطلب #%d\n<pre>%s</pre>' % (ident,esc(delivery)))
            return admin_show(user,'✅ تم التسليم.' if delivery else '⚠️ الطلب غير معلق أو المخزون غير كافٍ.', [[_btn('⬅️ الطلب','default',None,cb='a:item:o:%d' % ident)]],edit)
    return admin_home(user,edit)


def admin_send_backup(owner_id):
    # Snapshot SQLite locally, or export JSON through the PostgreSQL adapter.
    path = None
    try:
        if hasattr(store, 'export_backup'):
            data = store.export_backup()
            filename = 'r1himo-backup.json'
        else:
            fd,path=tempfile.mkstemp(prefix='r1_backup_', suffix='.db')
            os.close(fd)
            dest=sqlite3.connect(path)
            try:
                with store.lock:
                    store.conn.backup(dest)
            finally:
                dest.close()
            if os.path.getsize(path)>45*1024*1024:
                return False
            with open(path,'rb') as fh: data=fh.read()
            filename = 'r1himo-backup.db'
        boundary='r1'+secrets.token_hex(16)
        prefix=('--'+boundary+'\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n'+str(owner_id)+'\r\n--'+boundary+'\r\nContent-Disposition: form-data; name="document"; filename="'+filename+'"\r\nContent-Type: application/octet-stream\r\n\r\n').encode()
        body=prefix+data+('\r\n--'+boundary+'--\r\n').encode()
        req=urllib.request.Request(tg.api_base+'/bot'+tg.token+'/sendDocument',data=body,headers={'Content-Type':'multipart/form-data; boundary='+boundary},method='POST')
        with urllib.request.urlopen(req,timeout=30) as response:
            return bool(json.loads(response.read().decode()).get('ok'))
    except Exception:
        log.warning('تعذر إرسال النسخة الاحتياطية.')
        return False
    finally:
        if path:
            try: os.unlink(path)
            except OSError: pass


def admin_apply_input(user, st, text):
    if not is_owner_user(user):
        state_clear(user['tg_id']); return True
    raw_text = text
    text=text.strip(); mode=st.get('mode'); ident=st.get('ident',0)
    try:
        if len(raw_text)>3500: raise ValueError('النص طويل جداً.')
        if mode == 'finduser':
            if not text.isdigit() or not store.get_user(int(text)): raise ValueError('المستخدم غير موجود؛ أدخل ID صحيحاً.')
            state_clear(user['tg_id']); admin_item(user,'u',int(text)); return True
        if mode == 'new':
            if not text or text == '-': raise ValueError('الاسم مطلوب.')
            kind=st['entity']
            ident = (store.add_product({'name':text,'price':0,'visible':0}) if kind=='p' else
                     store.add_category({'name':text}) if kind=='c' else
                     store.add_button({'label_ar':text,'label_en':text,'action':'menu'}))
            state_clear(user['tg_id']); safe_send(user['tg_id'],'✅ تم الإنشاء. أكمل التفاصيل من الأزرار.',build_main_keyboard(user))
            admin_item(user,kind,ident); return True
        if mode == 'bulk':
            if not store.product_by_id(ident): raise ValueError('المنتج غير موجود.')
            parts = text.split()
            if parts == ['0']:
                store.set_settings({'bulk_min_%d' % ident: '0', 'bulk_price_%d' % ident: ''})
            else:
                if len(parts) != 2 or not parts[0].isdigit(): raise ValueError('مثال: 10 2.50')
                qty, price = int(parts[0]), float(parts[1].replace(',', '.'))
                normal = to_float(store.product_by_id(ident)['price'], 0)
                if qty < 2 or qty > 100 or not math.isfinite(price) or price < 0.01 or price > normal: raise ValueError('الكمية 2–100 والسعر موجب ولا يتجاوز السعر العادي.')
                store.set_settings({'bulk_min_%d' % ident: str(qty), 'bulk_price_%d' % ident: str(round(price, 2))})
            state_clear(user['tg_id']); safe_send(user['tg_id'], '✅ تم حفظ سعر الجملة.', build_main_keyboard(user)); admin_item(user,'p',ident); return True
        if mode in ('stock_single', 'stock_batch'):
            if not store.product_by_id(ident): raise ValueError('المنتج غير موجود.')
            if not text: raise ValueError('المحتوى فارغ.')
            if mode == 'stock_single':
                if len(html.escape(raw_text, quote=False)) > 3000:
                    raise ValueError('محتوى القطعة طويل جداً للتسليم في تيليغرام؛ اختصره وأعد المحاولة.')
                store.add_stock_unit(ident,raw_text)
                count = 1
            else:
                lines = [line.strip() for line in text.splitlines() if line.strip()]
                if any(len(html.escape(line, quote=False)) > 3000 for line in lines):
                    raise ValueError('أحد الأسطر طويل جداً للتسليم في تيليغرام.')
                count=store.add_stock_lines(ident,lines)
            state_clear(user['tg_id']); safe_send(user['tg_id'],'✅ أُضيف %d قطعة.' % count,build_main_keyboard(user)); admin_item(user,'p',ident); return True
        if mode == 'message':
            if not text or not store.get_user(ident): raise ValueError('المستخدم أو النص غير صالح.')
            ok=_broadcast_one(ident,text)
            state_clear(user['tg_id']); safe_send(user['tg_id'],'✅ أُرسلت الرسالة.' if ok else '❌ تعذر الإرسال.',build_main_keyboard(user)); return True
        if mode == 'wallet':
            amount=float(text.replace(',','.'))
            if not math.isfinite(amount) or amount<=0 or amount>1000000 or not store.get_user(ident): raise ValueError('أدخل مبلغاً موجباً صالحاً.')
            amount=round(amount,2)
            if amount<=0: raise ValueError('الحد الأدنى 0.01.')
            if st['op']=='sub':
                with store.lock:
                    cur=store.conn.execute('UPDATE users SET balance=ROUND(balance-?,2) WHERE tg_id=? AND balance>=?',(amount,ident,amount)); store.conn.commit()
                if not cur.rowcount: raise ValueError('الرصيد غير كافٍ.')
            else: store.adjust_balance(ident,amount)
            state_clear(user['tg_id']); safe_send(user['tg_id'],'✅ تم تحديث الرصيد.',build_main_keyboard(user)); admin_item(user,'u',ident); return True
        if mode == 'edit':
            kind,key=st['entity'],st['key']; value='' if text=='-' else text
            obj={'p':store.product_by_id,'c':store.get_category,'b':store.get_button}[kind](ident)
            if not obj or key not in dict(ADMIN_FIELDS[kind]): raise ValueError('العنصر غير موجود.')
            if key in ('name','label_ar') and not value: raise ValueError('الاسم مطلوب.')
            if key == 'price':
                n=float(value.replace(',','.'))
                if not math.isfinite(n) or n<0 or n>1000000: raise ValueError('السعر غير صالح.')
                value=round(n,2)
            if key in ('category_id','row','sort'):
                if not value.isdigit() or int(value)>10000: raise ValueError('أدخل رقماً صحيحاً.')
                value=int(value)
                if key=='category_id' and value and not store.get_category(value): raise ValueError('التصنيف غير موجود.')
            if key=='stock_mode' and value not in ('auto','unlimited'): raise ValueError('استعمل auto أو unlimited.')
            if key=='color' and value not in ('auto','success','danger','primary','default'): raise ValueError('اللون غير صالح.')
            if key=='action' and value not in ACTIONS: raise ValueError('الوظيفة غير صالحة.')
            if key=='payload' and obj.get('action')=='url' and value and not value.startswith('https://'): raise ValueError('الرابط يجب أن يبدأ بـ https://')
            {'p':store.update_product,'c':store.update_category,'b':store.update_button}[kind](ident,{key:value})
            state_clear(user['tg_id']); safe_send(user['tg_id'],'✅ تم الحفظ.',build_main_keyboard(user)); admin_item(user,kind,ident); return True
        if mode == 'setting':
            key=st['key']; value='' if text=='-' else text
            if key in ('store_name', 'currency') and not value:
                raise ValueError('لا يمكن ترك هذا الحقل فارغاً.')
            if key == 'owner_ids':
                if user['tg_id'] not in owner_ids(): raise ValueError('المالك الأساسي فقط يغيّر المالكين.')
                parts=[x.strip() for x in value.split(',') if x.strip()]
                if not parts or any(not x.isdigit() for x in parts): raise ValueError('أرسل IDs مفصولة بفواصل.')
                value=','.join(parts)
            if key in ('required_channel_1','required_channel_2'):
                value = value.lstrip('@')
                if value.lower() != 'off' and not re.fullmatch(r'[A-Za-z0-9_]{5,32}',value):
                    raise ValueError('أرسل معرّف قناة عامة صالحاً، أو off للإيقاف.')
            if key == 'event_chat_id' and not re.fullmatch(r'-?[0-9]{1,20}', value):
                raise ValueError('أرسل ID رقمياً صحيحاً أو 0 للإيقاف.')
            if key in ('referral_percent','discount_percent','page_size','deposit_session_minutes','vip_days','vip_percent'):
                maximum={'referral_percent':100,'discount_percent':90,'page_size':30,'deposit_session_minutes':1440,'vip_days':3650,'vip_percent':90}[key]
                minimum=1 if key in ('page_size','deposit_session_minutes','vip_days') else 0
                if not value.isdigit() or not minimum<=int(value)<=maximum: raise ValueError('القيمة خارج الحدود المسموحة.')
            if key in ('deposit_min','vip_price'):
                n=float(value.replace(',','.'))
                if not math.isfinite(n) or n<0 or n>1000000 or (key == 'deposit_min' and n == 0): raise ValueError('المبلغ غير صالح.')
                value=str(n)
            if key in ('style_enabled','mirror_rows','maintenance','dm_owner_on_order','dm_owner_on_deposit','vip_enabled') and value not in ('0','1'): raise ValueError('أرسل 1 للتفعيل أو 0 للإيقاف.')
            if key=='default_lang' and value not in ('ar','en'): raise ValueError('أرسل ar أو en.')
            if key=='payment_methods' and any(x not in ('manual','binance') for x in value.split(',')): raise ValueError('القيم المتاحة binance أو manual.')
            if key=='support_username': value=value.lstrip('@')
            store.set_setting(key,value)
            state_clear(user['tg_id']); safe_send(user['tg_id'],'✅ تم حفظ الإعداد.',build_main_keyboard(user)); admin_home(user); return True
    except (ValueError, TypeError, OverflowError) as exc:
        safe_send(user['tg_id'],'⚠️ %s\nحاول مرة أخرى أو /cancel.' % esc(str(exc)))
        return True
    return False


def main():
    if not BOT_TOKEN:
        log.error('❌ اضبط BOT_TOKEN في متغيرات البيئة قبل التشغيل.')
        return
    if not OWNER_ID_ENV.isdigit():
        log.error('❌ اضبط OWNER_ID كرقم تيليغرام للمالك قبل التشغيل.')
        return
    init_store(DB_PATH)
    init_telegram(BOT_TOKEN)
    try:
        me = tg.get_me()
        store.set_setting('bot_username',me.get('username') or '')
        log.info('✅ البوت متصل: @%s',me.get('username') or '')
    except TgError as exc:
        log.warning('تعذر فحص اتصال تيليغرام: %s',exc.description)
    log.info('لوحة الإدارة في تيليغرام: /admin. قاعدة البيانات: %s',DB_PATH)
    poller=Poller()
    poller.start()
    try:
        while poller.is_alive(): time.sleep(1)
    except KeyboardInterrupt:
        poller.stop_flag.set()
        log.info('تم إيقاف البوت.')


if __name__ == '__main__':
    main()
