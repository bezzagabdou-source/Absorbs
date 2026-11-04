# -*- coding: utf-8 -*-
"""التسلية: جهاتي، نقاط، رتب، نسب، زواج، زخرفة، محتوى تفاعلي، ردود تلقائية."""
import random
import time

from . import data
from .helpers import (esc, mention, uname, fullname, norm, take, need_group, need_admin,
                      resolve_target, keyboard, btn, pct, rank_of, next_rank, bar, fmt_time)
from .store import get_user


def handle(ctx):
    if not ctx.words:
        return False
    tg, cid = ctx.tg, ctx.chat_id

    # ================= جهاتي =================
    rest = take(ctx, "جهاتي", "جهاتى", "اضافاتي")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        added = u.get("a", 0)
        # ترتيبه
        board = sorted(ctx.chat_data["users"].items(), key=lambda kv: kv[1].get("a", 0), reverse=True)
        pos = next((i + 1 for i, (uid, _) in enumerate(board) if uid == str(ctx.user_id)), "—")
        ctx.reply(f"👥 <b>جهاتك يا {esc(fullname(ctx.user))}:</b>\n\n"
                  f"📥 أضفت <b>{added}</b> عضو للمجموعة\n"
                  f"🏆 ترتيبك: <b>#{pos}</b> من {len(board)}\n\n"
                  f"💡 كل عضو تضيفه يُحسب تلقائياً!\n🗑 لتصفير عدادك: <b>مسح جهاتي</b>")
        return True

    rest = take(ctx, "مسح جهاتي", "تصفير جهاتي")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        old = u.get("a", 0)
        u["a"] = 0
        ctx.dirty = True
        ctx.reply(f"🗑 تم مسح جهاتك ({old} ← 0). ابدأ الجمع من جديد! 💪")
        return True

    rest = take(ctx, "مسح جهات", "تصفير جهات")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply(err)
            return True
        u = get_user(ctx.chat_data, target)
        u["a"] = 0
        ctx.dirty = True
        ctx.reply(f"🗑 تم تصفير جهات {mention(target)}.")
        return True

    rest = take(ctx, "جهاته", "جهات")
    if rest is not None:
        if not need_group(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply(err)
            return True
        u = ctx.chat_data["users"].get(str(target["id"]), {})
        ctx.reply(f"👥 {mention(target)} أضاف <b>{u.get('a', 0)}</b> عضو.")
        return True

    rest = take(ctx, "توب الجهات", "اقوي الجهات", "توب جهاتي", "topinvites")
    if rest is not None:
        if not need_group(ctx):
            return True
        board = sorted(ctx.chat_data["users"].items(), key=lambda kv: kv[1].get("a", 0), reverse=True)[:10]
        board = [(uid, u) for uid, u in board if u.get("a", 0) > 0]
        if not board:
            ctx.reply("👥 لا يوجد من أضاف أعضاء بعد! ادعُ أصحابك وكن الأول 🏆")
            return True
        medals = ["🥇", "🥈", "", "4️", "5️", "6️", "7️", "8️", "9️", "🔟"]
        lines = ["👥 <b>أقوى الجهات — توب 10:</b>\n"]
        for i, (uid, u) in enumerate(board):
            lines.append(f"{medals[i]} {esc(u.get('n', uid))} — <b>{u['a']}</b> عضو")
        ctx.reply("\n".join(lines))
        return True

    # ================= النقاط والرتب =================
    rest = take(ctx, "نقاطي", "رصيدي")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        nr_need, nr_name = next_rank(u.get("x", 0))
        txt = (f"⭐ <b>نقاطك:</b> {u.get('x', 0)} نقطة\n"
               f"🏅 رتبتك: {rank_of(u.get('x', 0))}\n"
               f"✉️ رسائلك: {u.get('m', 0)}\n"
               f"🎮 انتصارات الألعاب: {u.get('g', 0)}")
        if nr_need:
            txt += f"\n📈 الرتبة القادمة: {nr_name} ({nr_need} نقطة)\n{bar(u.get('x', 0), nr_need)}"
        ctx.reply(txt)
        return True

    rest = take(ctx, "رتبتي", "رتبه", "لقبي", "rank")
    if rest is not None:
        if not need_group(ctx):
            return True
        target = ctx.user
        if ctx.nwords[0] in ("رتبه",) and (ctx.reply_msg or ctx.args):
            target, err = resolve_target(ctx)
            if err:
                ctx.reply(err)
                return True
        u = ctx.chat_data["users"].get(str(target["id"]), {})
        custom = f"\n🏷 لقبه الخاص: {esc(u['t'])}" if u.get("t") else ""
        ctx.reply(f"🏅 {mention(target)}\nرتبته: <b>{rank_of(u.get('x', 0))}</b> ({u.get('x', 0)} نقطة){custom}")
        return True

    rest = take(ctx, "توب النقاط", "توب", "المتصدرين", "top")
    if rest is not None:
        if not need_group(ctx):
            return True
        board = sorted(ctx.chat_data["users"].items(), key=lambda kv: kv[1].get("x", 0), reverse=True)[:10]
        medals = ["🥇", "", "", "4️", "5️", "6️", "7️", "8️", "9️", "🔟"]
        lines = ["⭐ <b>أساطير النقاط — توب 10:</b>\n"]
        for i, (uid, u) in enumerate(board):
            lines.append(f"{medals[i]} {esc(u.get('n', uid))} — <b>{u.get('x', 0)}</b> ⭐ {rank_of(u.get('x', 0))}")
        ctx.reply("\n".join(lines))
        return True

    rest = take(ctx, "توب الرسائل", "اكثر تفاعل")
    if rest is not None:
        if not need_group(ctx):
            return True
        board = sorted(ctx.chat_data["users"].items(), key=lambda kv: kv[1].get("m", 0), reverse=True)[:10]
        medals = ["🥇", "🥈", "🥉", "4️", "5️", "6️", "7️", "8️", "9️", "🔟"]
        lines = ["✉️ <b>أكثر الأعضاء تفاعلاً:</b>\n"]
        for i, (uid, u) in enumerate(board):
            lines.append(f"{medals[i]} {esc(u.get('n', uid))} — <b>{u.get('m', 0)}</b> رسالة")
        ctx.reply("\n".join(lines))
        return True

    rest = take(ctx, "هديه", "هدية", "daily", "راتب")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        now = time.time()
        if now - u.get("d", 0) < 20 * 3600:
            left = 20 * 3600 - (now - u.get("d", 0))
            ctx.reply(f"🎁 استلمت هديتك اليوم! عد بعد {int(left // 3600)} ساعة و{int(left % 3600 // 60)} دقيقة ⏳")
            return True
        gift = random.randint(20, 80)
        u["x"] = u.get("x", 0) + gift
        u["d"] = now
        ctx.dirty = True
        ctx.reply(f"🎁 مبروك! ربحت <b>{gift}</b> نقطة من هدية اليوم!\nرصيدك: {u['x']} ⭐")
        return True

    # ================= النسب =================
    pct_kinds = {
        "نسبه الحب": ("الحب", "💖"), "نسبة الحب": ("الحب", "💖"),
        "نسبه الكره": ("الكره", "💔"), "نسبة الكره": ("الكره", "💔"),
        "نسبه الذكاء": ("الذكاء", "🧠"), "نسبة الذكاء": ("الذكاء", "🧠"),
        "نسبه الغباء": ("الغباء", "🤪"), "نسبة الغباء": ("الغباء", "🤪"),
        "نسبه الجمال": ("الجمال", "✨"), "نسبة الجمال": ("الجمال", "✨"),
        "نسبه الرجوله": ("الرجولة", "💪"), "نسبة الرجولة": ("الرجولة", "💪"),
        "نسبه الانوثه": ("الأنوثة", "🌸"), "نسبة الأنوثة": ("الأنوثة", "🌸"),
        "نسبه الخيانه": ("الخيانة", "🐍"), "نسبة الخيانة": ("الخيانة", "🐍"),
        "نسبه الكسل": ("الكسل", "😴"), "نسبة الكسل": ("الكسل", "😴"),
        "نسبه الحظ": ("الحظ", "🍀"), "نسبة الحظ": ("الحظ", "🍀"),
        "نسبه الجنون": ("الجنون", "🌀"), "نسبة الجنون": ("الجنون", "🌀"),
        "نسبه الصداقه": ("الصداقة", "🤝"), "نسبة الصداقة": ("الصداقة", "🤝"),
    }
    for prefix, (label, emoji) in pct_kinds.items():
        rest = take(ctx, prefix)
        if rest is not None:
            if not need_group(ctx):
                return True
            if ctx.reply_msg and ctx.reply_msg.get("from"):
                other = ctx.reply_msg["from"]
                val = pct([min(ctx.user_id, other["id"]), max(ctx.user_id, other["id"]), label])
                txt = f"{emoji} نسبة {label} بين {mention(ctx.user)} و {mention(other)}: <b>{val}%</b>\n{bar(val, 100)}"
            elif ctx.args:
                val = pct([ctx.user_id, norm(rest), label])
                txt = f"{emoji} نسبة {label} عندك مع {esc(rest)}: <b>{val}%</b>\n{bar(val, 100)}"
            else:
                val = pct([ctx.user_id, label])
                txt = f"{emoji} نسبة {label} عندك اليوم: <b>{val}%</b>\n{bar(val, 100)}"
            ctx.reply(txt)
            return True

    # ================= الزواج =================
    rest = take(ctx, "زواج", "زوجيني", "marry")
    if rest is not None:
        if not need_group(ctx):
            return True
        target, err = resolve_target(ctx)
        if err:
            ctx.reply("💍 رد على رسالة من تريد الزواج منه/منها!")
            return True
        if target["id"] == ctx.user_id:
            ctx.reply("😂 تتزوج نفسك؟ حب الذات مستوى أسطوري!")
            return True
        me = ctx.tg.get_me()
        if isinstance(me, dict) and target["id"] == me.get("id"):
            ctx.reply("🤖💍 أنا بوت… قلبي معالج دقيق! تزوج إنسان أحسن لك 😂")
            return True
        u1 = get_user(ctx.chat_data, ctx.user)
        u2 = get_user(ctx.chat_data, target)
        if u1.get("sp"):
            ctx.reply("😅 أنت متزوج أصلاً! اكتب (طلاق) أولاً… يا لعاب!")
            return True
        if u2.get("sp"):
            ctx.reply("💔 هذا الشخص متزوج أصلاً! ابحث عن عزّابي 😂")
            return True
        u1["sp"], u2["sp"] = target["id"], ctx.user_id
        ctx.dirty = True
        ctx.reply(random.choice(data.PROPOSAL_LINES).format(a=mention(ctx.user), b=mention(target)))
        return True

    rest = take(ctx, "طلاق", "divorce")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        sp = u.get("sp")
        if not sp:
            ctx.reply("💔 أنت أعزب أصلاً! اكتب (زواج) بالرد على أحد 😂")
            return True
        other = ctx.chat_data["users"].get(str(sp), {})
        other["sp"] = 0
        u["sp"] = 0
        ctx.dirty = True
        oname = other.get("n", str(sp))
        ctx.reply(random.choice(data.DIVORCE_LINES).format(a=esc(fullname(ctx.user)), b=esc(oname)))
        return True

    rest = take(ctx, "زوجي", "زوجتي", "زوجته", "زوجها")
    if rest is not None:
        if not need_group(ctx):
            return True
        target = ctx.user
        if ctx.nwords[0] in ("زوجته", "زوجها") and (ctx.reply_msg or ctx.args):
            target, err = resolve_target(ctx)
            if err:
                ctx.reply(err)
                return True
        u = ctx.chat_data["users"].get(str(target["id"]), {})
        sp = u.get("sp")
        if not sp:
            ctx.reply(f"💔 {mention(target)} أعزب/عزباء… الفرصة متاحة للجميع 😂💍")
        else:
            other = ctx.chat_data["users"].get(str(sp), {})
            ctx.reply(f"💍 {mention(target)} متزوج من <b>{esc(other.get('n', str(sp)))}</b> 💕")
        return True

    # ================= محتوى عشوائي =================
    simple = {
        "نكته": data.JOKES, "نكتة": data.JOKES, "joke": data.JOKES,
        "حكمه": data.WISDOM, "حكمة": data.WISDOM,
        "مثل": data.PROVERBS, "امثال": data.PROVERBS,
        "صراحه": data.TRUTH, "صراحة": data.TRUTH, "truth": data.TRUTH,
        "جراه": data.DARE, "جرأة": data.DARE, "تحدي": data.DARE, "dare": data.DARE,
        "لو خيروك": data.WOULD_YOU, "خيروك": data.WOULD_YOU,
        "دعاء": data.DUAS, "ادعيه": data.DUAS,
        "اذكار الصباح": data.ADHKAR_MORNING, "اذكار المساء": data.ADHKAR_EVENING,
        "اقتباس": data.QUOTES_CHANNEL,
        "غزل": data.LOVE_LINES, "قلد": data.ROAST_LINES,
    }
    for prefix, bank in simple.items():
        rest = take(ctx, prefix)
        if rest is not None:
            ctx.reply(random.choice(bank))
            return True

    rest = take(ctx, "لغز", "حزر", "riddle")
    if rest is not None:
        if not need_group(ctx):
            ctx.reply("🧩 " + random.choice(data.RIDDLES)[0])
            return True
        q, a = random.choice(data.RIDDLES)
        ctx.chat_data["game"] = {"type": "riddle", "answer": norm(a), "display": a,
                                 "ts": time.time(), "by": 0}
        ctx.dirty = True
        ctx.reply(f"🧩 <b>لغز جماعي:</b>\n{q}\n\nأول من يكتب الإجابة الصحيحة يربح 15 نقطة! ⏱ 90 ثانية")
        return True

    # ================= زخرفة =================
    rest = take(ctx, "زخرفه", "زخرفة", "decorate")
    if rest is not None:
        if not rest:
            ctx.reply("✍️ الاستخدام: زخرفة <النص>")
            return True
        ctx.reply(decorate(rest[:60]))
        return True

    # ================= أدوات جماعية =================
    rest = take(ctx, "منشن الكل", "منشن", "tagall")
    if rest is not None:
        if not need_group(ctx) or not need_admin(ctx):
            return True
        users = sorted(ctx.chat_data["users"].items(), key=lambda kv: kv[1].get("l", 0), reverse=True)
        tags = []
        for uid, u in users[:40]:
            if u.get("u"):
                tags.append("@" + u["u"])
            else:
                tags.append(f'<a href="tg://user?id={uid}">{esc(u.get("n", "عضو"))}</a>')
        if not tags:
            ctx.reply("👥 لا يوجد أعضاء مسجلون بعد.")
            return True
        text = rest or "📣 نداء جماعي!"
        for i in range(0, len(tags), 8):
            ctx.tg.send(cid, f"{esc(text)}\n" + " ".join(tags[i:i + 8]))
        return True

    rest = take(ctx, "اختار", "خيرني")
    if rest is not None:
        opts = []
        if " او " in rest:
            opts = [o.strip() for o in rest.split(" او ") if o.strip()]
        elif " أو " in rest:
            opts = [o.strip() for o in rest.split(" أو ") if o.strip()]
        elif " ولا " in rest:
            opts = [o.strip() for o in rest.split(" ولا ") if o.strip()]
        if len(opts) >= 2:
            ctx.reply(f"🎯 اخترت لك: <b>{esc(random.choice(opts))}</b>!")
        else:
            ctx.reply("🎯 الاستخدام: اختار بيتزا او برغر")
        return True

    rest = take(ctx, "سحب", "عشوائي")
    if rest is not None:
        if not need_group(ctx):
            return True
        pool = [(uid, u) for uid, u in ctx.chat_data["users"].items()
                if time.time() - u.get("l", 0) < 7 * 86400 and int(uid) != ctx.tg.get_me().get("id", 0)]
        if not pool:
            ctx.reply("👥 لا يوجد أعضاء نشطون.")
            return True
        uid, u = random.choice(pool)
        ctx.reply(f"🎲 تم السحب العشوائي!\nالفائز: <b>{esc(u.get('n', uid))}</b> 🎉" +
                  (f"\n🎁 الجائزة: {esc(rest)}" if rest else ""))
        return True

    rest = take(ctx, "احصائياتي", "نشاطي")
    if rest is not None:
        if not need_group(ctx):
            return True
        u = get_user(ctx.chat_data, ctx.user)
        ctx.reply(f"📊 <b>إحصائياتك:</b>\n✉️ الرسائل: {u.get('m', 0)}\n⭐ النقاط: {u.get('x', 0)}\n"
                  f"👥 جهاتك: {u.get('a', 0)}\n🎮 انتصارات: {u.get('g', 0)}\n"
                  f"⚠️ تحذيرات: {u.get('w', 0)}\n🏅 الرتبة: {rank_of(u.get('x', 0))}\n"
                  f"🕐 آخر نشاط: {fmt_time(u.get('l'))}")
        return True

    rest = take(ctx, "احصائيات المجموعه", "احصائيات المجموعة", "نشاط المجموعه")
    if rest is not None:
        if not need_group(ctx):
            return True
        users = ctx.chat_data["users"]
        active = sum(1 for u in users.values() if time.time() - u.get("l", 0) < 86400)
        top = max(users.items(), key=lambda kv: kv[1].get("m", 0), default=(None, {}))
        ctx.reply(f"📊 <b>إحصائيات المجموعة:</b>\n👤 أعضاء مسجلون: {len(users)}\n"
                  f"🔥 نشطون اليوم: {active}\n✉️ إجمالي الرسائل: {ctx.chat_data.get('msgs', 0)}\n"
                  f"👑 الأنشط: {esc(top[1].get('n', '—'))} ({top[1].get('m', 0)} رسالة)")
        return True

    rest = take(ctx, "سبحه", "سبحة", "تسبيح")
    if rest is not None:
        u = get_user(ctx.chat_data, ctx.user) if ctx.is_group else {"ts": ctx.chat_data.get("tasbih", 0)}
        count = (u.get("ts", 0) if ctx.is_group else ctx.chat_data.get("tasbih", 0))
        rows = [[btn("📿 سبح (+1)", data="tasbih:1"), btn("🔄 تصفير", data="tasbih:0")]]
        ctx.reply(f"📿 <b>السبحة الإلكترونية</b>\nالعدد: <b>{count}</b>\nسبحان الله وبحمده، سبحان الله العظيم",
                  markup=keyboard(rows))
        return True

    rest = take(ctx, "عمله", "عملة معدنيه", "coin", "قرعه")
    if rest is not None:
        ctx.reply(f"🪙 النتيجة: <b>{random.choice(['صورة 👑', 'كتابة ✍️'])}</b>!")
        return True

    rest = take(ctx, "نرد", "زهر", "dice")
    if rest is not None:
        tg.send_dice(cid, "🎲", reply_to=ctx.msg["message_id"])
        return True

    rest = take(ctx, "سلوت", "حظ", "slots")
    if rest is not None:
        tg.send_dice(cid, "🎰", reply_to=ctx.msg["message_id"])
        return True

    rest = take(ctx, "هدف", "dart", "دارت")
    if rest is not None:
        tg.send_dice(cid, "🎯", reply_to=ctx.msg["message_id"])
        return True

    rest = take(ctx, "كره", "basket", "سلة")
    if rest is not None:
        tg.send_dice(cid, "🏀", reply_to=ctx.msg["message_id"])
        return True

    rest = take(ctx, "بوسه", "بوسة", "حضن", "صفعه", "صفعة")
    if rest is not None:
        if not need_group(ctx):
            return True
        target = ctx.reply_msg.get("from") if ctx.reply_msg else None
        if not target:
            ctx.reply("↩️ رد على رسالة شخص!")
            return True
        acts = {"بوسه": "💋 أرسل قبلة إلى", "بوسة": "💋 أرسل قبلة إلى",
                "حضن": "🤗 حضن دافئ إلى", "صفعه": "👋 صفعة خفيفة إلى", "صفعة": "👋 صفعة خفيفة إلى"}
        ctx.reply(f"{acts[ctx.nwords[0]]} {mention(target)} 😂")
        return True

    return False


# ================= الردود التلقائية =================
def auto_reply(ctx):
    if not ctx.settings.get("replies_on", True) or not ctx.settings.get("fun", True):
        return False
    n = norm(ctx.text)
    # ردود مخصصة أولاً
    for trig, resp in ctx.settings.get("replies", {}).items():
        if n == trig or n.startswith(trig + " ") or (" " + trig + " ") in (" " + n + " "):
            resp = (resp.replace("{name}", mention(ctx.user))
                    .replace("{group}", esc(ctx.chat_data.get("title", "المجموعة"))))
            ctx.reply(resp)
            return True
    # ردود مدمجة
    for trig, resps in data.GREET_REPLIES.items():
        tn = norm(trig)
        if n == tn or n.startswith(tn + " ") or n.endswith(" " + tn):
            if trig == "بوت" and len(ctx.words) > 2:
                continue
            ctx.reply(random.choice(resps))
            return True
    return False


# ================= الزخرفة =================
def _seq(start, n=26):
    return "".join(chr(start + i) for i in range(n))

_LOWER = "abcdefghijklmnopqrstuvwxyz"
_UPPER = _LOWER.upper()
STYLES = {
    "عريض": str.maketrans(_LOWER + _UPPER, _seq(0x1D5EE) + _seq(0x1D5D4)),
    "مائل": str.maketrans(_LOWER + _UPPER, _seq(0x1D622) + _seq(0x1D608)),
    "مخطوط": str.maketrans(_LOWER + _UPPER, _seq(0x1D4EA) + _seq(0x1D4D0)),
    "دوائر": str.maketrans(_LOWER + _UPPER, _seq(0x24D0) + _seq(0x24B6)),
    "مربعات": str.maketrans(_LOWER + _UPPER, _seq(0x1F130) * 1 + _seq(0x1F130)),
    "واسع": str.maketrans(_LOWER + _UPPER, _seq(0xFF41) + _seq(0xFF21)),
}
_UPSIDE = dict(zip(_LOWER + _UPPER, "ɐqɔpǝɟƃɥıɾʞןɯuodbɹsʇnʌʍxʎz" + "∀qƆpƎℲ⅁HIſ⋊WNOԀQɹS┴∩ΛMX⅄Z"))


def decorate(text):
    lines = ["✨ <b>زخرفة النص:</b>\n"]
    for name, table in STYLES.items():
        lines.append(f"<b>{name}:</b> {esc(text.translate(table))}")
    upside = "".join(_UPSIDE.get(c, c) for c in reversed(text))
    lines.append(f"<b>مقلوب:</b> {esc(upside)}")
    # زخرفة عربية
    lines.append(f"<b>مطوّل:</b> {esc('ـ'.join(text.replace(' ', ' ')))}")
    lines.append(f"<b>مزخرف:</b> ꧁༺ {esc(text)} ༻")
    lines.append(f"<b>ملكي:</b> 『{esc(text)}』")
    lines.append(f"<b>نجمي:</b> ★彡 {esc(text)} 彡★")
    lines.append(f"<b>ورد:</b> 🌹 {esc(text)} 🌹")
    return "\n".join(lines)
