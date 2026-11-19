#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""بوت الوسطاء المضمونين — XR / BM / FT + لوحة تحكم"""
import json, os, threading
from pathlib import Path
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes

BASE = Path(__file__).parent
DATA_FILE = BASE / "data.json"
ASSETS = BASE / "assets"
TOKEN = os.environ.get("BOT_TOKEN", "9169731361:AAGdtx1soQWt2GIdcq23_vSyS1XfLcIH0NQ")
_lock = threading.Lock()

def load():
    with _lock:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))

def save(data):
    with _lock:
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def track_user(data, user):
    uid = str(user.id)
    if uid not in [u.get("id") for u in data.get("users", [])]:
        data.setdefault("users", []).append({
            "id": uid, "username": user.username or "", "name": user.first_name or "",
            "date": __import__("datetime").datetime.now().isoformat(timespec="seconds")})
        save(data)

def link(u):
    u = (u or "").strip()
    if not u: return ""
    return f"https://t.me/{u.lstrip('@')}"

def section_text(data, key):
    items = data["sections"].get(key, [])
    lines = []
    for it in items:
        u = it.get("username", "")
        g = it.get("guarantee", "")
        n = it.get("note", "")
        name = it.get("name", "")
        line = f"{n} {name} — [{u}]({link(u)})" if u else f"{n} {name}"
        if g: line += f" — ضمانه: {g}"
        lines.append(line)
    return "\n".join(lines) if lines else "لا يوجد أي عنصر بعد ✅"

def section_buttons(data, key):
    btns = []
    for it in data["sections"].get(key, []):
        u = it.get("username", "").strip()
        if u:
            btns.append([InlineKeyboardButton(f"💬 {it.get('name','وسيط')} — {u}",
                                              url=link(u))])
    return btns

def main_menu():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🛡️ وسطاء XR", callback_data="sec:xr"),
         InlineKeyboardButton("⚔️ وسطاء BM", callback_data="sec:bm")],
        [InlineKeyboardButton("🎩 وسطاء FT", callback_data="sec:ft"),
         InlineKeyboardButton("👑 وسطاء ومالكين", callback_data="sec:owners")],
        [InlineKeyboardButton("🎁 وسطاء مجانيين مؤقتاً", callback_data="sec:free"),
         InlineKeyboardButton("🚨 منتحلين الوسطاء", callback_data="sec:scammers")],
        [InlineKeyboardButton("📊 إحصائيات البوت", callback_data="stats")],
    ])

async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    data = load(); track_user(data, update.effective_user)
    await update.message.reply_text(data.get("welcome", "أهلاً بك 🛡️"),
                                    reply_markup=main_menu(), disable_web_page_preview=True)

async def on_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    data = load(); track_user(data, update.effective_user)
    cb = q.data
    if cb == "menu":
        await q.edit_message_text(data.get("welcome", "أهلاً بك 🛡️"), reply_markup=main_menu())
        return
    if cb == "stats":
        n = len(data.get("users", []))
        total = sum(len(v) for v in data["sections"].values())
        await q.edit_message_text(f"📊 إحصائيات البوت\n\n👥 عدد المستخدمين: {n}\n🛡️ إجمالي الوسطاء: {total}",
                                  reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 رجوع", callback_data="menu")]]))
        return
    if cb.startswith("sec:"):
        key = cb.split(":")[1]
        titles = {"xr": "🛡️ وسطاء XR الرسميون", "bm": "⚔️ وسطاء مجموعة BM",
                  "ft": "🎩 وسطاء FT", "owners": "👑 وسطاء ومالكين",
                  "free": "🎁 وسطاء مجانيين مؤقتاً", "scammers": "🚨 منتحلين الوسطاء"}
        body = section_text(data, key)
        if key == "xr":
            info = data.get("xr_info", {})
            body += f"\n\n⚠️ أي يوزر غير مذكور أعلاه لا يمثل XR.\n👑 المالك: {info.get('owner','')}\n📩 الشكاوى: {' '.join(info.get('complaints',[]))}\n👥 الكروب: {info.get('group','')}\n🛒 المتجر: {info.get('store','')}"
        if key == "bm":
            body += f"\n\n*كل الوسطاء مضمونين من طرف المالك {data.get('bm_info',{}).get('owner','')}*"
        if key == "ft":
            info = data.get("ft_info", {})
            body += f"\n\nهذه هي قائمة الوسطاء الموثوقين لدينا. يرجى الانتباه للمنتحلين وتأكد من اليوزرات 🗒⚜️\nضمان الوسطاء Ft: {info.get('guarantee','')} 🔹️\nدليل ثقة وسطاء FT: {info.get('proof','')} 🔸️"
        if key == "scammers" and not data["sections"].get("scammers"):
            body = "✅ لم يتوفر أي محتال بعد — الحمد لله"
        kb = section_buttons(data, key) + [[InlineKeyboardButton("🔙 رجوع", callback_data="menu")]]
        photo = {"xr": ASSETS/"xr.jpg", "bm": ASSETS/"bm.jpg", "ft": ASSETS/"ft.jpg"}.get(key)
        if photo and photo.exists():
            await q.message.reply_photo(photo=photo, caption=f"{titles.get(key,key)}\n\n{body}",
                                        parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(kb))
        else:
            await q.edit_message_text(f"{titles.get(key,key)}\n\n{body}", parse_mode="Markdown",
                                      reply_markup=InlineKeyboardMarkup(kb), disable_web_page_preview=True)

def main():
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(on_callback))
    print("🤖 Bot is running...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
