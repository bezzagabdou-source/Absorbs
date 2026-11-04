# -*- coding: utf-8 -*-
"""النظام الاجتماعي: ملف شخصي، سمعة، إنجازات، أصدقاء، نبذة، مستوى."""
import time

from .helpers import esc, mention, fullname, uname, take, need_group, resolve_target, rank_of, next_rank, bar, fmt_time
from .store import get_user
from .economy import boost_active

ACHIEVEMENTS = [
    ("first_msg", "🌱 البداية", "أرسلت أول رسالة", lambda u: u.get("m", 0) >= 1),
    ("chatter", "💬 ثرثار", "100 رسالة", lambda u: u.get("m", 0) >= 100),
    ("chatter500", "🗣 متحدث بارع", "500 رسالة", lambda u: u.get("m", 0) >= 500),
    ("chatter1000", "📢 أسطورة الدردشة", "1000 رسالة", lambda u: u.get("m", 0) >= 1000),
    ("inviter", "👥 داعية", "أضفت 5 أعضاء", lambda u: u.get("a", 0) >= 5),
    ("inviter20", "🌟 نجم الدعوات", "أضفت 20 عضو", lambda u: u.get("a", 0) >= 20),
    ("inviter50", "👑 ملك الدعوات", "أضفت 50 عضو", lambda u: u.get("a", 0) >= 50),
    ("gamer", "🎮 لاعب", "فزت بـ 5 ألعاب", lambda u: u.get("g", 0) >= 5),
    ("gamer25", "🏆 محترف", "فزت بـ 25 لعبة", lambda u: u.get("g", 0) >= 25),
    ("gamer100", "🐉 أسطورة الألعاب", "فزت بـ 100 لعبة", lambda u: u.get("g", 0) >= 100),
    ("rich", "💰 ثري", "جمعت 1000 نقطة", lambda u: u.get("x", 0) >= 1000),
    ("rich5000", "💎 مليونير", "جمعت 5000 نقطة", lambda u: u.get("x", 0) >= 5000),
    ("married", "💍 متزوج", "تزوجت في البوت", lambda u: u.get("sp", 0) != 0),
    ("popular", "❤️ محبوب", "سمعتك 10+", lambda u: u.get("rep", 0) >= 10),
    ("famous", "🌟 مشهور", "سمعتك 50+", lambda u: u.get("rep", 0) >= 50),
    ("shopper", "🛒 متسوق", "اشتريت من المتجر", lambda u: len(u.get("inv", [])) >= 1),
    ("collector", "🎖 جامع", "جمعت 3 شارات", lambda u: len(u.get("badges", [])) >= 3),
    ("worker", "💼 عامل", "عملت 10 مرات", lambda u: u.get("work_count", 0) >= 10),
    ("quran", "📖 قارئ", "قرأت 10 سور", lambda u: len(u.get("khatma", {}).get("done", [])) >= 10),
    ("khatma", "🕌 ختم القرآن", "أتممت ختمة", lambda u: len(u.get("khatma", {}).get("done", [])) >= 114),
]


def handle(ctx):
    if not ctx.words:
        return False
    tg, cid = ctx.tg, ctx.chat_id

    # ---- الملف الشخصي ----
    rest = take(ctx, "ملفي", "بروفايل", "profile", "بطاقتي", "حسابي")
    if rest is not None:
        if not need_group(ctx):
            return True
        target = ctx.user
        if ctx.reply_msg and ctx.reply_msg.get("from"):
            target = ctx.reply_msg["from"]
        u = get_user(ctx.chat_data, target)
        nr_need, nr_name = next_rank(u.get("x", 0))
        badges = " ".join(u.get("badges", [])) or "—"
        title = u.get("t") or rank_of(u.get("x", 0))
        bio = u.get("bio", "")
        lines = [f"👤 <b>ملف {esc(fullname(target))}</b>",
                 f"🆔 <code>{target['id']}</code> | 🔗 {uname(target)}",
                 f"🏷 اللقب: {esc(title)}",
                 f"⭐ النقاط: {u.get('x', 0)} | 🏦 البنك: {u.get('bank', 0)}",
                 f"✉️ الرسائل: {u.get('m', 0)} | 🎮 الانتصارات: {u.get('g', 0)}",
                 f"👥 الجهات: {u.get('a', 0)} | ❤️ السمعة: {u.get('rep', 0)}",
                 f"🎖 الشارات: {badges}",
                 f"⚠️ التحذيرات: {u.get('w', 0)}"]
        if nr_need:
            lines.append(f"📈 التالي: {nr_name}\n{bar(u.get('x', 0), nr_need)}")
        if bio:
            lines.append(f"📝 النبذة: {esc(bio)}")
        if u.get("sp"):
            sp = ctx.chat_data["users"].get(str(u["sp"]), {})
            lines.append(f"💍 متزوج من: {esc(sp.get('n', '؟'))}")
        if u.get("protect", 0) > time.time():
            lines.append("🛡 محمي من السرقة")
        if boost_active(u):
            lines.append("⚡ مضاعف النقاط مفعّل")
        ctx.reply("\n".join(lines))
        return True

    # ---- النبذة ----
    rest = take(ctx, "ضع نبذة", "ضع نبذه", "نبذة", "bio", "setbio")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        if not rest:
            ctx.reply("📝 الاستخدام: ضع نبذة <نص عنك>\nمثال: ضع نبذة أحب البرمجة والألعاب 💻")
            return True
        u["bio"] = rest[:150]
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"📝 حُفظت نبذتك!\n{esc(rest[:150])}")
        return True

    # ---- السمعة ----
    rest = take(ctx, "سمعتي", "سمعة", "rep", "reputation")
    if rest is not None:
        if not need_group(ctx):
            return True
        target = ctx.user
        if ctx.reply_msg and ctx.reply_msg.get("from"):
            target = ctx.reply_msg["from"]
        u = get_user(ctx.chat_data, target)
        ctx.reply(f"❤️ سمعة {mention(target)}: <b>{u.get('rep', 0)}</b>\n\n"
                  f"💡 أعطِ سمعة لشخص: رد عليه واكتب (سمعة+)")
        return True

    rest = take(ctx, "سمعة+", "سمعه+", "اعجاب", "rep+", "+rep")
    if rest is not None:
        if not need_group(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply("↩️ رد على رسالة شخص واكتب (سمعة+)")
            return True
        if target["id"] == ctx.user_id:
            ctx.reply("😅 ما تقدر تعطي سمعة لنفسك!")
            return True
        u = get_user(ctx.chat_data, ctx.user)
        if time.time() - u.get("last_rep", 0) < 3600:
            ctx.reply("⏳ تقدر تعطي سمعة مرة كل ساعة.")
            return True
        t = get_user(ctx.chat_data, target)
        t["rep"] = t.get("rep", 0) + 1
        u["last_rep"] = time.time()
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"❤️ أعطيت سمعة لـ {mention(target)}! سمعته الآن: {t['rep']}")
        return True

    # ---- الإنجازات ----
    rest = take(ctx, "انجازاتي", "إنجازاتي", "achievements", "انجازات")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        unlocked = [(name, desc) for _, name, desc, cond in ACHIEVEMENTS if cond(u)]
        locked = [(name, desc) for _, name, desc, cond in ACHIEVEMENTS if not cond(u)]
        lines = [f"🏅 <b>إنجازاتك ({len(unlocked)}/{len(ACHIEVEMENTS)}):</b>\n"]
        for name, desc in unlocked:
            lines.append(f"✅ {name} — {desc}")
        if locked:
            lines.append("\n🔒 <b>قيد الفتح:</b>")
            for name, desc in locked[:8]:
                lines.append(f"🔒 {name} — {desc}")
        ctx.reply("\n".join(lines))
        return True

    # ---- الأصدقاء ----
    rest = take(ctx, "اضف صديق", "اضافة صديق", "addfriend")
    if rest is not None:
        if not need_group(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply("↩️ رد على رسالة صديقك واكتب (اضف صديق)")
            return True
        if target["id"] == ctx.user_id:
            ctx.reply("😅 ما تقدر تضيف نفسك!")
            return True
        u = get_user(ctx.chat_data, ctx.user)
        friends = u.setdefault("friends", [])
        if target["id"] in friends:
            ctx.reply("👥 هو صديقك أصلاً!")
            return True
        if len(friends) >= 50:
            ctx.reply("⚠️ وصلت حد الأصدقاء (50).")
            return True
        friends.append(target["id"])
        ctx.dirty = ctx.force_save = True
        ctx.reply(f"👥 أضفت {mention(target)} كصديق! عندك الآن {len(friends)} صديق.")
        return True

    rest = take(ctx, "احذف صديق", "ازل صديق")
    if rest is not None:
        if not need_group(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply("↩️ رد على رسالة صديقك.")
            return True
        u = get_user(ctx.chat_data, ctx.user)
        friends = u.get("friends", [])
        if target["id"] in friends:
            friends.remove(target["id"])
            ctx.dirty = ctx.force_save = True
            ctx.reply(f"💔 أزلت {mention(target)} من أصدقائك.")
        else:
            ctx.reply("🔍 ليس في قائمة أصدقائك.")
        return True

    rest = take(ctx, "اصدقائي", "أصدقائي", "friends")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        friends = u.get("friends", [])
        if not friends:
            ctx.reply("👥 ما عندك أصدقاء بعد. أضف: اضف صديق (بالرد)")
            return True
        lines = [f"👥 <b>أصدقاؤك ({len(friends)}):</b>\n"]
        for fid in friends[:40]:
            fu = ctx.chat_data["users"].get(str(fid), {})
            lines.append(f"• {esc(fu.get('n', str(fid)))} — {fu.get('x', 0)} ⭐")
        ctx.reply("\n".join(lines))
        return True

    # ---- توب السمعة ----
    rest = take(ctx, "توب السمعة", "توب السمعه", "الاكثر سمعة")
    if rest is not None:
        if not need_group(ctx):
            return True
        board = sorted(ctx.chat_data["users"].items(), key=lambda kv: kv[1].get("rep", 0), reverse=True)[:10]
        medals = ["🥇", "🥈", "", "4️", "5️", "6️", "7️", "8️", "9️", "🔟"]
        lines = ["❤️ <b>الأكثر سمعة (محبة):</b>\n"]
        for i, (uid, u) in enumerate(board):
            if u.get("rep", 0) > 0:
                lines.append(f"{medals[i]} {esc(u.get('n', uid))} — {u['rep']} ❤️")
        ctx.reply("\n".join(lines) if len(lines) > 1 else "لا توجد سمعة بعد.")
        return True

    # ---- توب الثراء ----
    rest = take(ctx, "توب الثراء", "الاغنياء", "توب الفلوس", "الاكثر نقاطا")
    if rest is not None:
        if not need_group(ctx):
            return True
        board = sorted(ctx.chat_data["users"].items(),
                       key=lambda kv: kv[1].get("x", 0) + kv[1].get("bank", 0), reverse=True)[:10]
        medals = ["🥇", "🥈", "🥉", "4️", "5️", "6️", "7️", "8️", "9️", "🔟"]
        lines = ["💰 <b>أغنى الأعضاء:</b>\n"]
        for i, (uid, u) in enumerate(board):
            total = u.get("x", 0) + u.get("bank", 0)
            lines.append(f"{medals[i]} {esc(u.get('n', uid))} — {total} ⭐")
        ctx.reply("\n".join(lines))
        return True

    # ---- توب الألعاب ----
    rest = take(ctx, "توب الالعاب", "توب الألعاب", "افضل اللاعبين")
    if rest is not None:
        if not need_group(ctx):
            return True
        board = sorted(ctx.chat_data["users"].items(), key=lambda kv: kv[1].get("g", 0), reverse=True)[:10]
        medals = ["🥇", "", "", "4️", "5️", "6️", "7️", "8️", "9️", "🔟"]
        lines = ["🎮 <b>أساطير الألعاب:</b>\n"]
        for i, (uid, u) in enumerate(board):
            if u.get("g", 0) > 0:
                lines.append(f"{medals[i]} {esc(u.get('n', uid))} — {u['g']} فوز 🏆")
        ctx.reply("\n".join(lines) if len(lines) > 1 else "لا توجد انتصارات بعد.")
        return True

    return False
