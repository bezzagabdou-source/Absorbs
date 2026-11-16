"""Content definition for the GTA VI viral short (Arabic fuṣḥā)."""

GOLD_S = "gold"
GREEN_S = "green"
CYAN_S = "cyan"
PINK_S = "pink"
WHITE_S = "white"

# Each scene: words (text, style), emoji, background, motion, caption position
SCENES = [
    dict(
        name="hook", bg="neon_street.png", motion="push", grade="neon",
        weight_scale=1.0,
        words=[("بعد", WHITE_S), ("ثلاثة", GOLD_S), ("أيام", GOLD_S),
               ("بالضبط", GOLD_S), ("تنزل", WHITE_S), ("اللعبة", GREEN_S),
               ("الأكثر", GREEN_S), ("انتظاراً", GOLD_S), ("في", WHITE_S),
               ("التاريخ", WHITE_S)],
        emoji=[], card="countdown",
    ),
    dict(
        name="broke", bg="vice_sunset.png", motion="pull", grade="warm",
        weight_scale=1.0,
        words=[("وأنت", WHITE_S), ("لا", WHITE_S), ("تملك", PINK_S),
               ("ثمنها؟", PINK_S)],
        emoji=["1f4b8"], card=None,
    ),
    dict(
        name="method", bg="miami1.png", motion="push", grade="neon",
        weight_scale=1.0,
        words=[("هناك", WHITE_S), ("طريقة", GREEN_S), ("تجني", WHITE_S),
               ("بها", WHITE_S), ("الذهب", GOLD_S), ("من", WHITE_S),
               ("وراء", WHITE_S), ("الضجيج", PINK_S)],
        emoji=["1f4b0"], card=None,
    ),
    dict(
        name="audience", bg="gamer_setup.png", motion="push", grade="cool",
        weight_scale=1.0,
        words=[("ملايين", GOLD_S), ("المشاهدين", CYAN_S), ("يتابعون", WHITE_S),
               ("أشهر", WHITE_S), ("اللاعبين", GREEN_S), ("كل", WHITE_S),
               ("ليلة", WHITE_S)],
        emoji=["1f525"], card=None,
    ),
    dict(
        name="clip", bg="neon_street.png", motion="whip", grade="cool",
        weight_scale=1.0,
        words=[("وأنت", WHITE_S), ("تقتطع", CYAN_S), ("أقوى", GOLD_S),
               ("اللحظات", GOLD_S), ("وتنشرها", GREEN_S), ("في", WHITE_S),
               ("ثوانٍ", GREEN_S)],
        emoji=["26a1", "1f3ac"], card=None,
    ),
    dict(
        name="retention", bg="ai_dashboard.png", motion="push_soft", grade="tech",
        weight_scale=0.94,
        words=[("خطّاف", GREEN_S), ("قوي", WHITE_S), ("ترجمة", CYAN_S),
               ("واضحة", CYAN_S), ("ومؤثرات", PINK_S), ("تشدّ", PINK_S),
               ("العين", WHITE_S)],
        emoji=["1f3af"], card=None,
    ),
    dict(
        name="agent", bg="gamer_setup.png", motion="pull", grade="tech",
        weight_scale=0.94,
        words=[("وكيل", CYAN_S), ("ذكاء", CYAN_S), ("اصطناعي", GREEN_S),
               ("يفعل", WHITE_S), ("كل", WHITE_S), ("شيء", GREEN_S),
               ("وأنت", WHITE_S), ("نائم", GREEN_S)],
        emoji=["1f916", "1f634"], card="ai",
    ),
    dict(
        name="scale", bg="ai_dashboard.png", motion="pull", grade="tech",
        weight_scale=0.90,
        words=[("يختار", WHITE_S), ("المقاطع", WHITE_S), ("ويجهّز", CYAN_S),
               ("عشرة", GOLD_S), ("فيديوهات", GREEN_S), ("من", WHITE_S),
               ("بث", GOLD_S), ("واحد", GOLD_S)],
        emoji=["1f4c8", "1f3ac"], card=None,
    ),
    dict(
        name="money", bg="miami1.png", motion="push_fast", grade="warm",
        weight_scale=1.0,
        words=[("هذا", WHITE_S), ("ليس", PINK_S), ("راتباً", PINK_S),
               ("هذا", WHITE_S), ("مال", GOLD_S), ("يصنع", GOLD_S),
               ("نفسه", GOLD_S)],
        emoji=["1f4b0", "1f680"], card=None,
    ),
    dict(
        name="cta", bg="vice_sunset.png", motion="push", grade="warm",
        weight_scale=1.05,
        words=[("الموجة", PINK_S), ("لا", WHITE_S), ("تنتظر", WHITE_S),
               ("أحداً", PINK_S), ("ابدأ", GREEN_S), ("اليوم", GOLD_S)],
        emoji=["1f680", "1f525"], card="cta",
    ),
]

# transition used BETWEEN scene i and i+1
TRANSITIONS = ["glitch", "whip", "flash", "whip", "glitch",
               "cut", "whip", "glitch", "flash"]

GRADES = {
    "neon":  dict(sat=1.16, con=1.18, bri=-0.06, gam=1.0),
    "warm":  dict(sat=1.12, con=1.12, bri=-0.05, gam=1.02),
    "cool":  dict(sat=1.10, con=1.16, bri=-0.06, gam=0.98),
    "tech":  dict(sat=1.06, con=1.18, bri=-0.07, gam=1.0),
}

EMOJI_NEEDED = ["23f0", "1f4b8", "1f4b0", "1f525", "26a1", "1f3ac", "1f3af",
                "1f916", "1f634", "1f4c8", "1f680", "1f48e", "1f4a5", "1f929"]

STYLE_COLORS = {
    GOLD_S: (255, 201, 60, 255),
    GREEN_S: (0, 255, 156, 255),
    CYAN_S: (60, 226, 255, 255),
    PINK_S: (255, 66, 148, 255),
    WHITE_S: (255, 255, 255, 255),
}

# syllable-ish weights so word highlighting tracks the speech rhythm
def word_weights(words):
    w = []
    for t in words:
        n = len([c for c in t if c not in "اأإآوىىى"])
        w.append(max(0.65, 0.55 + 0.30 * n))
    return w
