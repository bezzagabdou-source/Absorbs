# -*- coding: utf-8 -*-
"""نظام الاقتصاد: متجر، شارات، ألقاب، تحويل، رهان، يانصيب، بنك، استثمار، عمل، سرقة."""
import random
import time

from .helpers import esc, mention, fullname, norm, take, need_group, resolve_target, keyboard, btn, rank_of
from .store import get_user
from .moretools import UNITS

SHOP = {
    "vip": {"name": "👑 عضوية VIP", "price": 500, "desc": "لقب VIP ذهبي + 50 نقطة يومياً", "type": "title"},
    "legend": {"name": "🐉 لقب أسطورة", "price": 1000, "desc": "لقب أسطورة حصري", "type": "title"},
    "king": {"name": "🏰 لقب ملك", "price": 2000, "desc": "لقب ملك المجموعة", "type": "title"},
    "dragon": {"name": "🔥 لقب التنين", "price": 3000, "desc": "لقب التنين الناري", "type": "title"},
    "shield": {"name": "🛡 درع الحماية", "price": 300, "desc": "حماية من السرقة 24 ساعة", "type": "protect"},
    "shield_week": {"name": "🛡 درع أسبوعي", "price": 1500, "desc": "حماية من السرقة أسبوع", "type": "protect"},
    "badge_star": {"name": "⭐ شارة النجم", "price": 200, "desc": "شارة نجم في ملفك", "type": "badge"},
    "badge_fire": {"name": "🔥 شارة اللهب", "price": 400, "desc": "شارة اللهب", "type": "badge"},
    "badge_diamond": {"name": "💎 شارة الماس", "price": 800, "desc": "شارة الماس النادرة", "type": "badge"},
    "badge_crown": {"name": "👑 شارة التاج", "price": 1500, "desc": "شارة التاج الملكي", "type": "badge"},
    "badge_dragon": {"name": "🐉 شارة التنين", "price": 2500, "desc": "شارة التنين الأسطورية", "type": "badge"},
    "lottery": {"name": "🎟 تذكرة يانصيب", "price": 50, "desc": "فرصة لربح 500 نقطة (سحب يومي)", "type": "lottery"},
    "double": {"name": "⚡ مضاعف النقاط", "price": 600, "desc": "مضاعفة نقاط الرسائل ساعة", "type": "boost"},
}

BADGE_ICONS = {"badge_star": "⭐", "badge_fire": "🔥", "badge_diamond": "💎", "badge_crown": "👑", "badge_dragon": "🐉"}
TITLE_NAMES = {"vip": "👑 VIP", "legend": "🐉 أسطورة", "king": "🏰 ملك", "dragon": "🔥 تنين"}


def handle(ctx):
    if not ctx.words:
        return False
    tg, cid = ctx.tg, ctx.chat_id

    rest = take(ctx, "المتجر", "متجر", "shop", "السوق")
    if rest is not None:
        if not need_group(ctx):
            return True
        lines = ["🛒 <b>متجر الأساطير:</b>\n"]
        for key, item in SHOP.items():
            lines.append(f"{item['name']} — <b>{item['price']}</b> ⭐\n   {item['desc']}\n   <code>شراء {key}</code>")
        lines.append("\n💰 رصيدك: " + str(get_user(ctx.chat_data, ctx.user).get("x", 0)) + " ⭐")
        ctx.reply("\n".join(lines))
        return True

    rest = take(ctx, "شراء", "اشتري", "buy")
    if rest is not None:
        if not need_group(ctx):
            return True
        key = rest.strip().lower()
        if key not in SHOP:
            ctx.reply("🔍 عنصر غير موجود. اكتب (المتجر) للعرض.")
            return True
        item = SHOP[key]
        u = get_user(ctx.chat_data, ctx.user)
        if u.get("x", 0) < item["price"]:
            ctx.reply(f"💸 رصيدك لا يكفي! تحتاج {item['price']} ⭐ وعندك {u.get('x', 0)}.")
            return True
        u["x"] -= item["price"]
        inv = u.setdefault("inv", [])
        if item["type"] == "title":
            u["t"] = TITLE_NAMES.get(key, item["name"])
            inv.append(key)
            ctx.reply(f"🎉 اشتريت {item['name']}! لقبك الآن: <b>{u['t']}</b>")
        elif item["type"] == "badge":
            if key not in inv:
                inv.append(key)
            badges = u.setdefault("badges", [])
            if BADGE_ICONS[key] not in badges:
                badges.append(BADGE_ICONS[key])
            ctx.reply(f"🎉 اشتريت {item['name']}! تظهر في ملفك.")
        elif item["type"] == "protect":
            dur = 86400 if key == "shield" else 7 * 86400
            u["protect"] = max(u.get("protect", 0), time.time()) + dur
            ctx.reply(f"🛡 درع الحماية مفعّل! لا أحد يسرقك حتى {time.strftime('%m-%d %H:%M', time.gmtime(u['protect']))}.")
        elif item["type"] == "lottery":
            u["tickets"] = u.get("tickets", 0) + 1
            ctx.reply(f"🎟 اشتريت تذكرة! تذاكرك: {u['tickets']}. السحب كل يوم، الجائزة 500 ⭐.")
        elif item["type"] == "boost":
            u["boost"] = time.time() + 3600
            ctx.reply("⚡ مضاعف النقاط مفعّل ساعة! نقاط رسائلك ×2.")
        ctx.dirty = ctx.force_save = True
        return True

    rest = take(ctx, "مقتنياتي", "حقيبتي", "inventory", "اغراضي")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        inv = u.get("inv", [])
        badges = u.get("badges", [])
        lines = [f"🎒 <b>مقتنيات {esc(fullname(ctx.user))}:</b>"]
        lines.append(f"⭐ النقاط: {u.get('x', 0)} | 🏦 البنك: {u.get('bank', 0)}")
        lines.append(f"🏷 اللقب: {u.get('t') or '—'}")
        lines.append(f"🎖 الشارات: {' '.join(badges) if badges else '—'}")
        lines.append(f"🎟 تذاكر اليانصيب: {u.get('tickets', 0)}")
        if u.get("protect", 0) > time.time():
            lines.append(f"🛡 محمي حتى: {time.strftime('%m-%d %H:%M', time.gmtime(u['protect']))}")
        if u.get("boost", 0) > time.time():
            lines.append("⚡ مضاعف النقاط مفعّل")
        ctx.reply("\n".join(lines))
        return True

    rest = take(ctx, "تحويل", "حول", "transfer", "اعطي")
    if rest is not None:
        # إذا كانت الكلمات وحدات قياس → تحويل وحدات وليس نقاط (اتركه لـ moretools)
        unit_words = {w for units in UNITS.values() for w in units}
        if any(norm(a) in unit_words for a in ctx.args):
            return False
        if not need_group(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply("💸 الاستخدام: تحويل @user 100 (أو بالرد + تحويل 100)")
            return True
        if target["id"] == ctx.user_id:
            ctx.reply("😅 تحول لنفسك؟")
            return True
        amount = None
        for a in ctx.args:
            if a.isdigit():
                amount = int(a)
                break
        if not amount or amount <= 0:
            ctx.reply("🔢 حدد مبلغاً موجباً. مثال: تحويل 100")
            return True
        u = get_user(ctx.chat_data, ctx.user)
        if u.get("x", 0) < amount:
            ctx.reply(f"💸 رصيدك {u.get('x', 0)} فقط!")
            return True
        t = get_user(ctx.chat_data, target)
        fee = max(1, amount // 20)
        u["x"] -= amount
        t["x"] = t.get("x", 0) + amount - fee
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"💸 حوّلت <b>{amount - fee}</b> ⭐ إلى {mention(target)} (رسوم {fee}).")
        return True

    rest = take(ctx, "رهان", "قامر", "gamble", "خاطر")
    if rest is not None:
        if not need_group(ctx):
            return True
        amount = None
        for a in ctx.args:
            if a.isdigit():
                amount = min(int(a), 10000)
                break
        if not amount or amount <= 0:
            ctx.reply("🎲 الاستخدام: رهان 100")
            return True
        u = get_user(ctx.chat_data, ctx.user)
        if u.get("x", 0) < amount:
            ctx.reply(f"💸 رصيدك {u.get('x', 0)} فقط!")
            return True
        if time.time() - u.get("last_gamble", 0) < 10:
            ctx.reply("⏳ انتظر 10 ثوانٍ بين الرهانات.")
            return True
        u["last_gamble"] = time.time()
        if random.random() < 0.47:
            u["x"] += amount
            ctx.reply(f"🎉 ربحت! +{amount} ⭐\nرصيدك: {u['x']}")
        else:
            u["x"] -= amount
            ctx.reply(f"😢 خسرت {amount} ⭐\nرصيدك: {u['x']}")
        ctx.dirty = ctx.force_save = True
        return True

    rest = take(ctx, "عمل", "اشتغل", "work", "وظيفة")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        if time.time() - u.get("last_work", 0) < 1800:
            left = 1800 - (time.time() - u.get("last_work", 0))
            ctx.reply(f"⏳ تعبت! استرح {int(left // 60)} دقيقة.")
            return True
        jobs = ["برمجت موقعاً 💻", "صممت شعاراً 🎨", "كتبت مقالاً ✍️", "بعت منتَجاً 🛍", "درّست درساً 📚",
                "صلحت حاسوباً 🔧", "طبخت وجبة 🍳", "سوّقت منتجاً 📢", "ترجمت نصاً 🌐", "صورت فيديو 🎬"]
        earn = random.randint(30, 120)
        u["x"] += earn
        u["last_work"] = time.time()
        u["work_count"] = u.get("work_count", 0) + 1
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"💼 {random.choice(jobs)}\nربحت <b>{earn}</b> ⭐! رصيدك: {u['x']}")
        return True

    rest = take(ctx, "بنك", "رصيدي البنكي", "bank")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        ctx.reply(f"🏦 <b>البنك:</b>\nرصيدك البنكي: <b>{u.get('bank', 0)}</b> ⭐\n"
                  f"💵 محفظتك: {u.get('x', 0)} ⭐\n\n"
                  f"• <b>ايداع 100</b> — إيداع\n• <b>سحب 100</b> — سحب\n🔒 البنك آمن من السرقة.")
        return True

    rest = take(ctx, "ايداع", "إيداع", "deposit")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        amount = _amount(ctx, u.get("x", 0))
        if not amount:
            ctx.reply("🔢 الاستخدام: ايداع 100 (أو ايداع الكل)")
            return True
        u["x"] -= amount
        u["bank"] = u.get("bank", 0) + amount
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"🏦 أودعت {amount} ⭐. البنك: {u['bank']} | المحفظة: {u['x']}")
        return True

    rest = take(ctx, "سحب", "withdraw")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        amount = _amount(ctx, u.get("bank", 0))
        if not amount:
            ctx.reply("🔢 الاستخدام: سحب 100 (أو سحب الكل)")
            return True
        u["bank"] -= amount
        u["x"] += amount
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"💵 سحبت {amount} ⭐. البنك: {u['bank']} | المحفظة: {u['x']}")
        return True

    rest = take(ctx, "استثمار", "invest")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        amount = None
        for a in ctx.args:
            if a.isdigit():
                amount = min(int(a), 50000)
                break
        if not amount or amount < 100:
            ctx.reply("📈 الاستخدام: استثمار 500 (الحد الأدنى 100، عائد 10-30% بعد ساعة)")
            return True
        if u.get("x", 0) < amount:
            ctx.reply("💸 رصيدك لا يكفي!")
            return True
        if u.get("invest", {}).get("amount"):
            ctx.reply("⏳ عندك استثمار قائم. انتظر حتى ينضج ثم اكتب (حصاد).")
            return True
        u["x"] -= amount
        u["invest"] = {"amount": amount, "ts": time.time(), "rate": random.uniform(0.10, 0.30)}
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"📈 استثمرت {amount} ⭐! عد بعد ساعة واكتب (حصاد) لجني العائد (10-30%).")
        return True

    rest = take(ctx, "حصاد", "harvest")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        inv = u.get("invest", {})
        if not inv.get("amount"):
            ctx.reply("🌾 لا يوجد استثمار. اكتب (استثمار 500).")
            return True
        if time.time() - inv["ts"] < 3600:
            left = 3600 - (time.time() - inv["ts"])
            ctx.reply(f"⏳ الاستثمار لم ينضج. متبقي {int(left // 60)} دقيقة.")
            return True
        profit = int(inv["amount"] * inv["rate"])
        total = inv["amount"] + profit
        u["x"] += total
        u["invest"] = {}
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"🌾 حصدت استثمارك! {inv['amount']} + {profit} ربح = <b>{total}</b> ⭐")
        return True

    rest = take(ctx, "سرقة", "اسرق", "steal")
    if rest is not None:
        if not need_group(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply("🥷 الاستخدام: سرقة بالرد على شخص")
            return True
        if target["id"] == ctx.user_id:
            ctx.reply("😂 تسرق نفسك؟")
            return True
        u = get_user(ctx.chat_data, ctx.user)
        t = get_user(ctx.chat_data, target)
        if time.time() - u.get("last_steal", 0) < 3600:
            ctx.reply("⏳ السرقة مرة كل ساعة. اصبر!")
            return True
        if t.get("protect", 0) > time.time():
            u["last_steal"] = time.time()
            fine = min(u.get("x", 0), 50)
            u["x"] -= fine
            ctx.dirty = ctx.force_save = True
            ctx.reply(f"🛡 {mention(target)} محمي بالدرع! خسرت غرامة {fine} ⭐.")
            return True
        if t.get("x", 0) < 50:
            ctx.reply("😅 هذا الشخص فقير (أقل من 50 نقطة). لا تستحق المخاطرة!")
            return True
        u["last_steal"] = time.time()
        if random.random() < 0.4:
            stolen = min(t["x"], random.randint(20, 100))
            t["x"] -= stolen
            u["x"] += stolen
            ctx.reply(f"🥷 نجحت السرقة! أخذت {stolen} ⭐ من {mention(target)}.")
        else:
            fine = min(u.get("x", 0), random.randint(30, 80))
            u["x"] -= fine
            ctx.reply(f"🚔 فشلت السرقة! قبضوا عليك وغرمت {fine} ⭐.")
        ctx.dirty = ctx.force_save = True
        return True

    rest = take(ctx, "يانصيب", "lottery", "سحب اليوم")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        ctx.reply(f"🎟 <b>اليانصيب اليومي:</b>\nتذاكرك: <b>{u.get('tickets', 0)}</b>\n"
                  f"💰 الجائزة: 500 ⭐\n🎫 اشترِ تذكرة: <code>شراء lottery</code> (50 ⭐)\n"
                  f"🎲 السحب التلقائي كل يوم، أو اكتب (سحب يانصيب) لتجربة حظك الآن.")
        return True

    rest = take(ctx, "سحب يانصيب", "جرب حظك")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        if u.get("tickets", 0) < 1:
            ctx.reply("🎟 ما عندك تذاكر! اشترِ: شراء lottery")
            return True
        u["tickets"] -= 1
        if random.random() < 0.25:
            u["x"] += 500
            ctx.reply(f"🎉🎉 فزت باليانصيب! +500 ⭐\nرصيدك: {u['x']}")
        else:
            ctx.reply("😢 لم تفز هذه المرة. جرّب تذكرة أخرى!")
        ctx.dirty = ctx.force_save = True
        return True

    rest = take(ctx, "راتب", "salary", "راتبي")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        if time.time() - u.get("last_salary", 0) < 86400:
            ctx.reply("⏳ الراتب مرة كل 24 ساعة.")
            return True
        salary = 100 + (50 if "vip" in u.get("inv", []) else 0)
        u["x"] += salary
        u["last_salary"] = time.time()
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"💼 استلمت راتبك اليومي: <b>{salary}</b> ⭐!" + (" (VIP +50)" if "vip" in u.get("inv", []) else ""))
        return True

    return False


def _amount(ctx, balance):
    for a in ctx.args:
        if a.isdigit():
            return min(int(a), balance)
        if a in ("الكل", "كل", "all"):
            return balance
    return None


def boost_active(u):
    return u.get("boost", 0) > time.time()
