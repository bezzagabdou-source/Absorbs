# -*- coding: utf-8 -*-
"""ألعاب إضافية: شنق، سلسلة كلمات، ذاكرة، تخمين إيموجي، مليونير، عواصم متقدم، تحدي."""
import random
import time

from .helpers import esc, mention, norm, take, need_group, keyboard, btn, starts_command
from .store import get_user
from . import content_bank as cb
from .games import _win, _set_game, GAME_TTL

EMOJI_MOVIES = [
    ("🦁👑", "الأسد الملك"), ("🚢🧊💔", "تايتانيك"), ("🕷🕸", "سبايدرمان"),
    ("🦖🏝", "الحديقة الجوراسية"), ("❄️⛄👸", "فروزن"), ("🤖🚗", "المتحولون"),
    ("🧙‍♂️⚡👓", "هاري بوتر"), ("🦇", "باتمان"), ("🐠🌊", "البحث عن نيمو"),
    ("👻👻", "الأشباح"), ("🏠", "هوم ألون"), ("🐒🍌", "كينغ كونغ"),
    ("🚀🌌", "حرب النجوم"), ("💍🌋", "سيد الخواتم"), ("‍♂️", "المهمة المستحيلة"),
    ("🐍🏯", "كونغ فو باندا"), ("🦸‍♂️🛡", "كابتن أمريكا"), ("🤡", "إت"),
    ("🌪👠", "ساحر أوز"), ("🐭", "ميكي ماوس"), ("🦈🏖", "الفك المفترس"),
    ("👽", "إي تي"), ("🏎💨", "السرعة والغضب"), ("🧟‍♂️🌍", "حرب الزومبي"),
]
EMOJI_WORDS = [
    ("🌙⭐", "ليل"), ("☀️", "شمس"), ("🌊🏖", "بحر"), ("🌹❤️", "حب"),
    ("📚✏️", "مدرسة"), ("✈️🌍", "سفر"), ("🍕", "بيتزا"), ("⚽", "كرة"),
    ("🏠🔑", "بيت"), ("🌧☔", "مطر"), ("🔥💧", "نار وماء"), ("🎂", "ميلاد"),
    ("🦁🌳", "غابة"), ("🐪️", "صحراء"), ("❄️⛄", "شتاء"), ("🌸🦋", "ربيع"),
]
HANGMAN_WORDS = [
    "الجزائر", "فلسطين", "قسنطينة", "وهران", "عنابة", "مدرسة", "جامعة", "مستشفى",
    "حاسوب", "تلفاز", "سيارة", "طائرة", "سفينة", "قطار", "مكتبة", "حديقة",
    "صحراء", "محيط", "جبال", "شاطئ", "نجمة", "قمر", "شمس", "سماء",
    "كتاب", "قلم", "دفتر", "سبورة", "معلم", "طبيب", "مهندس", "محامي",
]


def handle(ctx):
    if not ctx.words:
        return False
    tg, cid = ctx.tg, ctx.chat_id

    # ---- شنق ----
    rest = take(ctx, "شنق", "هانغمان", "hangman", "خمن الكلمة")
    if rest is not None:
        if not need_group(ctx):
            return True
        word = random.choice(HANGMAN_WORDS)
        _set_game(ctx, {"type": "hangman", "word": word, "guessed": [], "wrong": 0, "max": 6})
        ctx.reply(f"🎯 <b>لعبة الشنق!</b>\n\nخمّن الكلمة حرفاً حرفاً:\n<code>{'_ ' * len(word)}</code>\n\n"
                  f"❤️ المحاولات: 6\nأرسل حرفاً واحداً، أو الكلمة كاملة!\n🏆 20 نقطة للفوز")
        return True

    # ---- سلسلة كلمات ----
    rest = take(ctx, "سلسلة", "سلسله", "chain", "اخر حرف")
    if rest is not None:
        if not need_group(ctx):
            return True
        word = random.choice(cb.SCRAMBLE_WORDS)
        _set_game(ctx, {"type": "chain", "last": word[-1], "used": [word], "count": 0})
        ctx.reply(f"🔗 <b>سلسلة الكلمات!</b>\n\nأنا أبدأ: <b>{word}</b>\n"
                  f"دورك! اكتب كلمة تبدأ بحرف: <b>{word[-1]}</b>\n"
                  f"كل كلمة صحيحة = 5 نقاط، ومن يخطئ يخسر! ⏱")
        return True

    # ---- ذاكرة ----
    rest = take(ctx, "ذاكرة", "ذاكره", "memory", "تذكر")
    if rest is not None:
        if not need_group(ctx):
            return True
        seq = [random.randint(0, 9) for _ in range(5)]
        _set_game(ctx, {"type": "memory", "seq": "".join(map(str, seq)), "phase": "show"})
        msg = ctx.reply(f"🧠 <b>لعبة الذاكرة!</b>\n\nاحفظ هذا الرقم:\n\n<b>{''.join(map(str, seq))}</b>\n\n"
                        f"سيختفي… اكتبه بعد 5 ثوانٍ! 🏆 15 نقطة")
        # نخفي الرقم بعد إرسال رسالة ثانية (محاكاة)
        tg.send(cid, "⏳ ركز… اكتب الرقم الذي ظهر الآن!")
        return True

    # ---- تخمين إيموجي (أفلام) ----
    rest = take(ctx, "خمن الفيلم", "فيلم", "movie", "افلام")
    if rest is not None:
        if not need_group(ctx):
            return True
        emoji, answer = random.choice(EMOJI_MOVIES)
        _set_game(ctx, {"type": "emoji", "answer": norm(answer), "display": answer})
        ctx.reply(f"🎬 <b>خمّن الفيلم من الإيموجي!</b>\n\n{emoji}\n\n🏆 15 نقطة للأسرع!")
        return True

    # ---- تخمين كلمة بالإيموجي ----
    rest = take(ctx, "خمن الكلمة ايموجي", "ايموجي", "emoji")
    if rest is not None:
        if not need_group(ctx):
            return True
        emoji, answer = random.choice(EMOJI_WORDS)
        _set_game(ctx, {"type": "emoji", "answer": norm(answer), "display": answer})
        ctx.reply(f"😀 <b>خمّن الكلمة من الإيموجي!</b>\n\n{emoji}\n\n🏆 10 نقاط!")
        return True

    # ---- من سيربح المليون ----
    rest = take(ctx, "مليونير", "من سيربح", "millionaire")
    if rest is not None:
        if not need_group(ctx):
            return True
        q, opts, correct = random.choice(cb.QUIZ_ALL)
        qid = random.randint(1000, 9999)
        level = ctx.chat_data.get("million_level", 0)
        prize = [10, 25, 50, 100, 250, 500, 1000][min(level, 6)]
        _set_game(ctx, {"type": "quiz", "qid": qid, "correct": correct, "q": q, "million": True, "prize": prize})
        rows = [[btn(o, data=f"quiz:{qid}:{i}")] for i, o in enumerate(opts)]
        ctx.reply(f"💰 <b>من سيربح النقاط؟</b> — المستوى {level + 1}\n\n{esc(q)}\n\n🏆 الجائزة: {prize} نقطة!",
                  markup=keyboard(rows))
        return True

    # ---- تحدي سريع ----
    rest = take(ctx, "تحدي", "تحدي النقاط", "challenge")
    if rest is not None:
        if not need_group(ctx):
            return True
        # تحدي عشوائي
        challenges = [
            ("اكتب 5 دول عربية بسرعة!", "دول"), ("اكتب 3 ألوان!", "ألوان"),
            ("اكتب اسم حيوان بحرف الفيل!", "حيوان"), ("اكتب 3 فواكه!", "فواكه"),
        ]
        ch, _ = random.choice(challenges)
        ctx.reply(f"⚡ <b>تحدي سريع!</b>\n\n{ch}\n\n🏆 أول إجابة مقنعة تربح 10 نقاط!")
        return True

    # ---- قائمة الألعاب الموسعة ----
    rest = take(ctx, "العاب اضافيه", "العاب 2", "المزيد من الالعاب")
    if rest is not None:
        ctx.reply("🎮 <b>ألعاب إضافية:</b>\n\n"
                  "🎯 شنق — خمن الكلمة حرفاً حرفاً\n"
                  "🔗 سلسلة — كلمات بآخر حرف\n"
                  "🧠 ذاكرة — احفظ الرقم\n"
                  "🎬 خمن الفيلم — من الإيموجي\n"
                  "😀 ايموجي — خمن الكلمة\n"
                  "💰 مليونير — من سيربح النقاط\n"
                  "⚡ تحدي — تحديات سريعة\n\n"
                  "🎮 الألعاب الأساسية: كويز، عواصم، اعلام، رياضيات، خمن، فكك، اسرع، لغز، اكس او، حجر")
        return True

    return False


def check_answer(ctx):
    """معالجة إجابات الألعاب الجديدة."""
    if starts_command(ctx.text):
        return False
    g = ctx.chat_data.get("game")
    if not g:
        return False
    if time.time() - g.get("ts", 0) > GAME_TTL:
        ctx.chat_data["game"] = None
        ctx.dirty = True
        return False
    t = norm(ctx.text)
    kind = g.get("type")

    if kind == "hangman":
        word = g["word"]
        if t == norm(word):
            ctx.chat_data["game"] = None
            ctx.dirty = True
            ctx.reply(_win(ctx, 20, f"خمن الكلمة: <b>{word}</b>! 🎉\n"))
            return True
        if len(t) == 1 and ctx.text.strip():
            letter = ctx.text.strip()
            if letter in g.get("guessed", []):
                ctx.reply("⚠️ جربت هذا الحرف قبلاً!")
                return True
            g.setdefault("guessed", []).append(letter)
            if letter in word:
                revealed = " ".join(c if c in g["guessed"] or c == " " else "_" for c in word)
                ctx.dirty = True
                if "_" not in revealed:
                    ctx.chat_data["game"] = None
                    ctx.reply(_win(ctx, 20, f"أكمل الكلمة: <b>{word}</b>! 🎉\n"))
                else:
                    ctx.reply(f"✅ حرف صحيح!\n<code>{revealed}</code>\n❤️ متبقي: {g['max'] - g['wrong']}")
            else:
                g["wrong"] += 1
                ctx.dirty = True
                if g["wrong"] >= g["max"]:
                    ctx.chat_data["game"] = None
                    ctx.reply(f"💀 خسرت! الكلمة كانت: <b>{word}</b>")
                else:
                    revealed = " ".join(c if c in g["guessed"] or c == " " else "_" for c in word)
                    ctx.reply(f"❌ حرف خاطئ!\n<code>{revealed}</code>\n❤️ متبقي: {g['max'] - g['wrong']}")
            return True
        return False

    if kind == "chain":
        if not t or len(t) < 2:
            return False
        if t[0] != g["last"]:
            ctx.reply(f"⚠️ يجب أن تبدأ بحرف <b>{g['last']}</b>!")
            return True
        if t in g.get("used", []):
            ctx.reply("⚠️ هذه الكلمة استُخدمت! جرّب غيرها.")
            return True
        g.setdefault("used", []).append(t)
        g["last"] = t[-1]
        g["count"] = g.get("count", 0) + 1
        u = get_user(ctx.chat_data, ctx.user)
        u["x"] = u.get("x", 0) + 5
        ctx.dirty = True
        # البوت يرد بكلمة
        bot_words = [w for w in cb.SCRAMBLE_WORDS if w[0] == g["last"] and w not in g["used"]]
        if bot_words:
            bw = random.choice(bot_words)
            g["used"].append(bw)
            g["last"] = bw[-1]
            ctx.reply(f"✅ +5 نقاط! دوري أنا: <b>{bw}</b>\nدورك! اكتب كلمة تبدأ بـ <b>{bw[-1]}</b>")
        else:
            ctx.chat_data["game"] = None
            ctx.reply(_win(ctx, 15, f"عجّزتني! فزت بسلسلة من {g['count']} كلمات! 🏆\n"))
        return True

    if kind == "memory":
        if t.replace(" ", "") == g["seq"]:
            ctx.chat_data["game"] = None
            ctx.dirty = True
            ctx.reply(_win(ctx, 15, f"تذكرت الرقم <b>{g['seq']}</b>! 🧠\n"))
        else:
            ctx.reply(f"❌ خطأ! حاول مرة أخرى (الرقم مكوّن من {len(g['seq'])} أرقام)")
        return True

    if kind == "emoji":
        if t == g["answer"] or g["answer"] in t:
            ctx.chat_data["game"] = None
            ctx.dirty = True
            ctx.reply(_win(ctx, 15, f"الإجابة: <b>{g['display']}</b>! 🎬\n"))
            return True
    return False
