# -*- coding: utf-8 -*-
"""الألعاب: كويز، XO، حجر ورقة مقص، تخمين، رياضيات، عواصم، أعلام، تفكيك، سرعة."""
import random
import time

from . import data
from .helpers import esc, mention, fullname, norm, take, need_group, keyboard, btn, starts_command
from .store import get_user

GAME_TTL = 100


def _set_game(ctx, g):
    g["ts"] = time.time()
    ctx.chat_data["game"] = g
    ctx.dirty = True


def _win(ctx, points=10, label=""):
    u = get_user(ctx.chat_data, ctx.user)
    u["x"] = u.get("x", 0) + points
    u["g"] = u.get("g", 0) + 1
    ctx.dirty = True
    return f"🎉 {mention(ctx.user)} {label} ربح <b>{points}</b> نقطة! (رصيده: {u['x']} ⭐)"


def handle(ctx):
    if not ctx.words:
        return False
    tg, cid = ctx.tg, ctx.chat_id

    rest = take(ctx, "كويز", "سؤال", "اسئله", "أسئلة", "quiz", "مسابقه")
    if rest is not None:
        if not need_group(ctx):
            return True
        q, opts, correct = random.choice(data.QUIZ)
        qid = random.randint(1000, 9999)
        _set_game(ctx, {"type": "quiz", "qid": qid, "correct": correct, "q": q})
        rows = [[btn(f"{chr(0x41 + i)}" if False else o, data=f"quiz:{qid}:{i}")] for i, o in enumerate(opts)]
        tg.send(cid, f"🧠 <b>سؤال معرفي:</b>\n\n{esc(q)}\n\n⏱ أول إجابة صحيحة تربح 10 نقاط!",
                markup=keyboard(rows))
        return True

    rest = take(ctx, "عواصم", "عاصمه")
    if rest is not None:
        if not need_group(ctx):
            return True
        country, capital = random.choice(data.CAPITALS)
        others = random.sample([c for _, c in data.CAPITALS if c != capital], 3)
        opts = others + [capital]
        random.shuffle(opts)
        qid = random.randint(1000, 9999)
        _set_game(ctx, {"type": "quiz", "qid": qid, "correct": opts.index(capital), "q": capital})
        rows = [[btn(o, data=f"quiz:{qid}:{i}")] for i, o in enumerate(opts)]
        tg.send(cid, f"🌍 <b>ما هي عاصمة {esc(country)}؟</b>\n\n⏱ 10 نقاط للأسرع!", markup=keyboard(rows))
        return True

    rest = take(ctx, "اعلام", "علم", "flags")
    if rest is not None:
        if not need_group(ctx):
            return True
        flag, country = random.choice(data.FLAGS)
        others = random.sample([c for _, c in data.FLAGS if c != country], 3)
        opts = others + [country]
        random.shuffle(opts)
        qid = random.randint(1000, 9999)
        _set_game(ctx, {"type": "quiz", "qid": qid, "correct": opts.index(country), "q": country})
        rows = [[btn(o, data=f"quiz:{qid}:{i}")] for i, o in enumerate(opts)]
        tg.send(cid, f"🚩 <b>لمن هذا العلم؟</b>\n\n{flag}\n\n⏱ 10 نقاط للأسرع!", markup=keyboard(rows))
        return True

    rest = take(ctx, "رياضيات", "احسبني", "math")
    if rest is not None:
        if not need_group(ctx):
            return True
        a, b, c = random.randint(2, 20), random.randint(2, 15), random.randint(2, 9)
        op = random.choice(["+", "-"])
        expr = f"{a} {op} {b} × {c}"
        ans = a + b * c if op == "+" else a - b * c
        _set_game(ctx, {"type": "math", "answer": str(ans)})
        ctx.reply(f"🧮 <b>تحدي الرياضيات:</b>\n\n{expr} = ؟\n\nأول إجابة صحيحة تربح 12 نقطة! ⏱")
        return True

    rest = take(ctx, "خمن", "تخمين", "guess")
    if rest is not None:
        if not need_group(ctx):
            return True
        n = random.randint(1, 100)
        _set_game(ctx, {"type": "guess", "number": n, "tries": 0})
        ctx.reply("🔢 <b>لعبة التخمين!</b>\nاخترت رقماً بين 1 و 100… اكتب تخمينك!\n🏆 20 نقطة للفائز")
        return True

    rest = take(ctx, "فكك", "رتب الحروف", "scramble")
    if rest is not None:
        if not need_group(ctx):
            return True
        word = random.choice(data.SCRAMBLE_WORDS)
        letters = list(word)
        random.shuffle(letters)
        _set_game(ctx, {"type": "scramble", "answer": norm(word), "display": word})
        ctx.reply(f"🔤 <b>فكك الكلمة:</b>\n\n« {' - '.join(letters)} »\n\nأول من يرتبها يربح 12 نقطة! ⏱")
        return True

    rest = take(ctx, "اسرع", "اسرع كتابه", "fast")
    if rest is not None:
        if not need_group(ctx):
            return True
        word = random.choice(data.FAST_WORDS)
        _set_game(ctx, {"type": "fast", "answer": norm(word), "display": word})
        ctx.reply(f"⚡ <b>أسرع كتابة!</b>\n\nاكتب هذه الكلمة بالضبط:\n<b>{esc(word)}</b>\n\n🏆 8 نقاط للأسرع!")
        return True

    rest = take(ctx, "حجر", "حجره", "rps", "حجر ورقه مقص")
    if rest is not None:
        rows = [[btn("🪨 حجر", data="rps:rock"), btn("📄 ورقة", data="rps:paper"), btn("✂️ مقص", data="rps:scissors")]]
        ctx.reply("🎮 <b>حجر ورقة مقص!</b> اختر سلاحك:", markup=keyboard(rows))
        return True

    rest = take(ctx, "اكس او", "xo", "اكس", "tic")
    if rest is not None:
        if not need_group(ctx):
            return True
        p2 = 0
        if ctx.reply_msg and ctx.reply_msg.get("from") and not ctx.reply_msg["from"].get("is_bot"):
            p2 = ctx.reply_msg["from"]["id"]
        xo = {"board": [""] * 9, "p1": ctx.user_id, "p2": p2, "turn": ctx.user_id, "over": False}
        ctx.chat_data["xo"] = xo
        ctx.dirty = True
        vs = f"ضد {mention(ctx.reply_msg['from'])}" if p2 else "ضدي أنا 🤖"
        res = tg.send(cid, f"🎮 <b>إكس أو!</b>\n❌ {mention(ctx.user)} {vs}\n\nدور ❌:",
                      markup=xo_board(xo))
        if isinstance(res, dict) and res.get("message_id"):
            xo["msg"] = res["message_id"]
        return True

    rest = take(ctx, "الالعاب", "العاب", "games", "قائمه الالعاب")
    if rest is not None:
        ctx.reply(GAMES_MENU)
        return True

    return False


GAMES_MENU = """🎮 <b>قاعة الألعاب الأسطورية:</b>

🧠 <b>كويز</b> — أسئلة معرفية
🌍 <b>عواصم</b> — خمن العاصمة
🚩 <b>اعلام</b> — خمن العلم
🧮 <b>رياضيات</b> — تحدي حساب
🔢 <b>خمن</b> — خمن الرقم 1-100
🔤 <b>فكك</b> — رتب الحروف
⚡ <b>اسرع</b> — أسرع كتابة
🧩 <b>لغز</b> — ألغاز جماعية
🎮 <b>اكس او</b> — ضد البوت أو صديقك (بالرد)
🎲 <b>حجر</b> — حجر ورقة مقص
🎲 <b>نرد</b> · 🎰 <b>سلوت</b> · 🎯 <b>هدف</b> · 🏀 <b>كرة</b>
😂 <b>صراحة</b> · <b>جرأة</b> · <b>لو خيروك</b> · <b>نكتة</b>

💡 كل فوز = نقاط ⭐ ترفع رتبتك!
🏆 اكتب <b>توب</b> لتشوف المتصدرين"""


def xo_board(xo):
    rows = []
    icons = {"X": "❌", "O": "⭕", "": "⬜"}
    for r in range(3):
        row = []
        for c in range(3):
            i = r * 3 + c
            row.append(btn(icons[xo["board"][i]], data=f"xo:{i}"))
        rows.append(row)
    rows.append([btn("🔄 لعبة جديدة", data="xo:new")])
    return keyboard(rows)


def xo_winner(b):
    lines = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]
    for a, b1, c in lines:
        if b[a] and b[a] == b[b1] == b[c]:
            return b[a]
    return None


def bot_move(b):
    # فوز فوري
    for mark in ("O", "X"):
        for i in range(9):
            if not b[i]:
                b[i] = mark
                if xo_winner(b) == mark:
                    b[i] = ""
                    return i
                b[i] = ""
    if not b[4]:
        return 4
    corners = [i for i in (0, 2, 6, 8) if not b[i]]
    if corners:
        return random.choice(corners)
    free = [i for i in range(9) if not b[i]]
    return random.choice(free) if free else None


def callback(ctx, parts):
    tg, cid = ctx.tg, ctx.chat_id
    cq = ctx.update["callback_query"]
    kind = parts[0]

    if kind == "quiz":
        try:
            qid, idx = int(parts[1]), int(parts[2])
        except (ValueError, IndexError):
            return
        g = ctx.chat_data.get("game") or {}
        if g.get("type") != "quiz" or g.get("qid") != qid:
            tg.answer_callback(cq["id"], "⏱ انتهى هذا السؤال! اكتب (كويز) لجديد.", alert=False)
            return
        if time.time() - g.get("ts", 0) > GAME_TTL:
            ctx.chat_data["game"] = None
            ctx.dirty = True
            tg.answer_callback(cq["id"], "⏱ انتهى الوقت!", alert=True)
            return
        if idx == g.get("correct"):
            ctx.chat_data["game"] = None
            ctx.dirty = True
            tg.answer_callback(cq["id"], "✅ صحيح! +10 نقاط", alert=False)
            tg.send(cid, _win(ctx, 10, f"أجاب صحيحاً على: {esc(g.get('q', ''))}\n") )
            if cq.get("message"):
                tg.edit_markup(cid, cq["message"]["message_id"], keyboard([]))
        else:
            tg.answer_callback(cq["id"], "❌ خطأ! جرّب مرة أخرى.", alert=False)
        return

    if kind == "rps":
        choice = parts[1]
        bot = random.choice(["rock", "paper", "scissors"])
        names = {"rock": "🪨 حجر", "paper": "📄 ورقة", "scissors": "✂️ مقص"}
        beats = {"rock": "scissors", "paper": "rock", "scissors": "paper"}
        tg.answer_callback(cq["id"])
        if choice == bot:
            res = "🤝 تعادل!"
        elif beats[choice] == bot:
            res = _win(ctx, 5, "انتصر!")
        else:
            res = f"😂 خسرت! البوت اختار {names[bot]}"
        tg.send(cid, f"🎮 أنت: {names[choice]} | البوت: {names[bot]}\n{res}")
        return

    if kind == "xo":
        xo = ctx.chat_data.get("xo")
        if not xo or xo.get("over"):
            tg.answer_callback(cq["id"], "انتهت اللعبة! اكتب (اكس او) لجديدة.", alert=False)
            return
        if parts[1] == "new":
            ctx.chat_data["xo"] = {"board": [""] * 9, "p1": cq["from"]["id"], "p2": 0,
                                   "turn": cq["from"]["id"], "over": False,
                                   "msg": cq["message"]["message_id"]}
            ctx.dirty = True
            tg.answer_callback(cq["id"], "🔄 لعبة جديدة!")
            tg.edit_markup(cid, cq["message"]["message_id"], xo_board(ctx.chat_data["xo"]))
            return
        try:
            pos = int(parts[1])
        except ValueError:
            return
        player = cq["from"]["id"]
        if player not in (xo["p1"], xo["p2"]) and xo["p2"] != 0:
            tg.answer_callback(cq["id"], "🚫 هذه اللعبة ليست لك!", alert=True)
            return
        if xo["p2"] == 0 and player != xo["p1"]:
            tg.answer_callback(cq["id"], "🚫 هذه لعبة شخص آخر ضد البوت!", alert=True)
            return
        if player != xo["turn"] and xo["p2"] != 0:
            tg.answer_callback(cq["id"], "⏳ ليس دورك!", alert=False)
            return
        if xo["board"][pos]:
            tg.answer_callback(cq["id"], "⬜ خانة مأخوذة!", alert=False)
            return
        mark = "X" if player == xo["p1"] else "O"
        xo["board"][pos] = mark
        winner = xo_winner(xo["board"])
        full = all(xo["board"])
        if winner or full:
            xo["over"] = True
            ctx.dirty = True
            tg.answer_callback(cq["id"])
            tg.edit_markup(cid, cq["message"]["message_id"], xo_board(xo))
            if winner == "X":
                u = get_user(ctx.chat_data, cq["from"])
                u["x"] = u.get("x", 0) + 15
                u["g"] = u.get("g", 0) + 1
                tg.send(cid, f"🏆 {mention(cq['from'])} فاز في إكس أو! +15 نقطة ⭐")
            elif winner == "O":
                if xo["p2"]:
                    other = ctx.chat_data["users"].get(str(xo["p2"]), {})
                    tg.send(cid, f"🏆 {esc(other.get('n', 'اللاعب ⭕'))} فاز في إكس أو! 🎉")
                else:
                    tg.send(cid, "🤖 فزت أنا! حظ أوفر المرة القادمة 😎")
            else:
                tg.send(cid, "🤝 تعادل! لعبة قوية من الطرفين.")
            return
        if xo["p2"] == 0:
            # دور البوت
            bpos = bot_move(xo["board"])
            if bpos is not None:
                xo["board"][bpos] = "O"
            winner = xo_winner(xo["board"])
            if winner or all(xo["board"]):
                xo["over"] = True
                ctx.dirty = True
                tg.answer_callback(cq["id"])
                tg.edit_markup(cid, cq["message"]["message_id"], xo_board(xo))
                if winner == "X":
                    u = get_user(ctx.chat_data, cq["from"])
                    u["x"] = u.get("x", 0) + 15
                    u["g"] = u.get("g", 0) + 1
                    tg.send(cid, f"🏆 {mention(cq['from'])} هزمني! +15 نقطة ⭐")
                elif winner == "O":
                    tg.send(cid, "🤖 فزت! من يتحداني بعد ذلك؟ 😎")
                else:
                    tg.send(cid, "🤝 تعادل! أنت خصم عنيد.")
                return
        else:
            xo["turn"] = xo["p2"] if player == xo["p1"] else xo["p1"]
        ctx.dirty = True
        tg.answer_callback(cq["id"])
        tg.edit_markup(cid, cq["message"]["message_id"], xo_board(xo))
        return


def check_answer(ctx):
    """فحص إجابات الألعاب النصية. True إذا استُهلكت الرسالة كإجابة."""
    if starts_command(ctx.text):
        return False
    g = ctx.chat_data.get("game")
    if not g:
        return False
    if time.time() - g.get("ts", 0) > GAME_TTL:
        if g.get("type") in ("riddle", "scramble", "math", "fast"):
            ctx.tg.send(ctx.chat_id, f"⏱ انتهى وقت اللعبة! الإجابة كانت: <b>{esc(g.get('display', g.get('answer', '?')))}</b>")
        ctx.chat_data["game"] = None
        ctx.dirty = True
        return False
    t = norm(ctx.text)
    kind = g.get("type")
    if kind in ("riddle", "scramble", "fast"):
        if t == g.get("answer") or (kind == "riddle" and g.get("answer") in t and len(t) < len(g.get("answer", "")) + 15):
            ctx.chat_data["game"] = None
            ctx.dirty = True
            pts = {"riddle": 15, "scramble": 12, "fast": 8}[kind]
            ctx.reply(_win(ctx, pts, f"حلّها! الإجابة: <b>{esc(g.get('display', ''))}</b>\n"))
            return True
    elif kind == "math":
        if t.lstrip("+-").isdigit() and int(t) == int(g["answer"]):
            ctx.chat_data["game"] = None
            ctx.dirty = True
            ctx.reply(_win(ctx, 12, f"حسبها صح! الناتج: <b>{g['answer']}</b>\n"))
            return True
    elif kind == "guess":
        if t.isdigit():
            n, guess = g["number"], int(t)
            g["tries"] = g.get("tries", 0) + 1
            ctx.dirty = True
            if guess == n:
                ctx.chat_data["game"] = None
                ctx.reply(_win(ctx, 20, f"خمن الرقم <b>{n}</b> بعد {g['tries']} محاولة!\n"))
                return True
            hint = "⬆️ أكبر!" if guess < n else "⬇️ أصغر!"
            ctx.reply(f"{hint} (محاولة {g['tries']})")
            return True
    return False
