#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===============================================================================
 NEXUS RAG  —  نظام استرجاع معزّز بالتوليد للمعرفة البرمجية
===============================================================================
 ملف واحد مستقل. يبني قاعدة بيانات متجهة محليًا من أضخم مجموعة كود مفتوحة
 على Hugging Face، ثم يجاوب على أسئلتك البرمجية بدقة عبر Gemini.

 التثبيت
 -------
   pip install -U "datasets>=2.19" "sentence-transformers>=3.0" \
                  "chromadb>=0.5" "google-generativeai>=0.8" tqdm

   # اختياري — أسرع بزاف على كرت الشاشة:
   pip install -U "torch --index-url https://download.pytorch.org/whl/cu121"

 التشغيل
 -------
   export GEMINI_API_KEY="..."        # أو HF_TOKEN للمجموعات المحميّة
   python nexus_rag.py build          # يبني الفهرس (مرة وحدة)
   python nexus_rag.py ask "كيفاش ندير fixed timestep فـThree.js؟"
   python nexus_rag.py chat           # جلسة تفاعلية
   python nexus_rag.py stats          # إحصائيات الفهرس

 لماذا هذه المجموعات بالذات؟
 ---------------------------
   bigcode/the-stack-v2-dedup   أضخم مدوّنة كود مفتوحة (600+ لغة، 3B ملف،
                                منزوعة التكرار) — لكنها gated وتحتاج موافقة.
   bigcode/the-stack-smol       عيّنة نظيفة بلا بوابة — الافتراضي عندنا.
   codeparrot/github-code-clean كود GitHub منظّف ومفلتر بالرخصة.
   OpenCoder-LLM/opc-annealing-corpus  كود عالي الجودة مُنتقى للتدريب.
   HuggingFaceH4/CodeAlpaca_20K تعليمات ↔ كود، ممتازة للأسئلة المباشرة.

   نستعملو Streaming باش ما نحمّلوش تيرابايت على القرص ولا على الذاكرة.
===============================================================================
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import textwrap
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple

# ──────────────────────────────────────────────────────────────────────────────
#  0) الإعدادات العامة
# ──────────────────────────────────────────────────────────────────────────────

HERE = Path(__file__).resolve().parent
DB_DIR = HERE / "nexus_vectordb"          # مكان قاعدة البيانات المتجهة
COLLECTION = "nexus_code_v1"              # اسم المجموعة داخل Chroma

# نموذج التضمين: مجاني، سريع، 384 بُعد، يخدم على CPU بلا مشاكل
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EMBED_DIM = 384

# نموذج الإجابة
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# التقطيع
CHUNK_CHARS = 1400        # حجم القطعة بالحروف (≈ 350 توكن)
CHUNK_OVERLAP = 220       # التداخل باش ما يضيعش السياق بين القطع
MIN_CHUNK = 160           # نتجاهلو القطع القصيرة بزاف

# الدفعات
EMBED_BATCH = 128         # كم قطعة نضمّنها مرة وحدة
UPSERT_BATCH = 512        # كم قطعة ندفعوها لـChroma مرة وحدة


# ──────────────────────────────────────────────────────────────────────────────
#  1) اختيار قاعدة البيانات والتحميل بالـStreaming
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class DatasetSpec:
    """وصف مجموعة بيانات: من وين نقراوها وكيفاش نستخرجو النص."""
    key: str
    repo: str
    config: Optional[str] = None
    split: str = "train"
    # أسماء الحقول المحتملة للنص — نجرّبوهم بالترتيب
    text_fields: Tuple[str, ...] = ("content", "text", "code", "output")
    lang_field: Optional[str] = "language"
    path_field: Optional[str] = "path"
    gated: bool = False
    note: str = ""


# ترتيب الأفضلية: من الأضخم للأخف. نوقفو على أول وحدة تتحمّل بنجاح.
CATALOG: List[DatasetSpec] = [
    DatasetSpec(
        key="the-stack-v2",
        repo="bigcode/the-stack-v2-dedup",
        config="default",
        gated=True,
        note="الأضخم: 600+ لغة، منزوع التكرار. يحتاج موافقة + HF_TOKEN.",
    ),
    DatasetSpec(
        key="github-code-clean",
        repo="codeparrot/github-code-clean",
        config="all-all",
        text_fields=("code", "content"),
        note="كود GitHub منظّف ومفلتر بالرخص.",
    ),
    DatasetSpec(
        key="the-stack-smol",
        repo="bigcode/the-stack-smol",
        config="data/javascript",
        note="عيّنة نظيفة بلا بوابة — الاحتياطي الموثوق.",
    ),
    DatasetSpec(
        key="opencoder",
        repo="OpenCoder-LLM/opc-annealing-corpus",
        config="synthetic_code_snippet",
        text_fields=("text", "content"),
        note="كود مُنتقى عالي الجودة.",
    ),
    DatasetSpec(
        key="codealpaca",
        repo="HuggingFaceH4/CodeAlpaca_20K",
        text_fields=("completion", "prompt", "output"),
        lang_field=None,
        path_field=None,
        note="أزواج تعليمة↔كود — ممتازة للأسئلة المباشرة.",
    ),
]


def pick_dataset(preferred: Optional[str] = None) -> Iterator[Tuple[DatasetSpec, Any]]:
    """
    يختار أفضل مجموعة متاحة فعليًا ويرجّع (الوصف، الـiterable).
    نجرّبو وحدة بوحدة: إيلا كانت gated ولا الشبكة رفضات، نديرو للي بعدها.
    """
    from datasets import load_dataset  # استيراد كسول باش التشغيل يبقى سريع

    specs = CATALOG
    if preferred:
        specs = [s for s in CATALOG if s.key == preferred] or CATALOG

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")

    for spec in specs:
        if spec.gated and not token:
            print(f"  ⏭  {spec.repo} — محميّة وما كاينش HF_TOKEN، نقفزوها.")
            continue
        try:
            print(f"  → نجرّبو {spec.repo}" + (f" [{spec.config}]" if spec.config else ""))
            kwargs: Dict[str, Any] = {"split": spec.split, "streaming": True}
            if spec.config:
                kwargs["name"] = spec.config
            if token:
                kwargs["token"] = token
            ds = load_dataset(spec.repo, **kwargs)
            # نتأكدو أنها تقرا فعلاً قبل ما نعتمدوها
            probe = next(iter(ds))
            if not isinstance(probe, dict):
                raise ValueError("شكل غير متوقع")
            print(f"  ✓ اخترنا: {spec.repo}  —  {spec.note}")
            yield spec, ds
            return
        except Exception as e:  # noqa: BLE001 — نبغيو نكملو مهما كان الخطأ
            print(f"  ✗ {spec.repo}: {type(e).__name__}: {str(e)[:120]}")
            continue

    raise RuntimeError(
        "ما نجّمنا نحمّلو حتى مجموعة. تأكد من الإنترنت، ولا ضبط HF_TOKEN "
        "للمجموعات المحميّة."
    )


def stream_records(spec: DatasetSpec, ds: Any, limit: int) -> Iterator[Dict[str, Any]]:
    """
    يمرّ على المجموعة بالـStreaming ويرجّع سجلات موحّدة الشكل.
    ما يحمّل والو فالذاكرة غير السجل الحالي.
    """
    seen = 0
    for row in ds:
        if seen >= limit:
            return
        # نلقاو أول حقل نص موجود وفيه محتوى
        text = ""
        for f in spec.text_fields:
            v = row.get(f)
            if isinstance(v, str) and len(v.strip()) >= MIN_CHUNK:
                text = v
                break
        if not text:
            continue

        yield {
            "text": text,
            "language": str(row.get(spec.lang_field) or "unknown") if spec.lang_field else "unknown",
            "path": str(row.get(spec.path_field) or "") if spec.path_field else "",
            "repo": str(row.get("repository_name") or row.get("repo_name") or spec.repo),
        }
        seen += 1


# ──────────────────────────────────────────────────────────────────────────────
#  2) التجهيز والتنظيف والتقسيم
# ──────────────────────────────────────────────────────────────────────────────

# أنماط الضجيج الشائعة فالكود المسحوب من الإنترنت
RE_LONG_B64 = re.compile(r"[A-Za-z0-9+/]{220,}={0,2}")      # بيانات مضمّنة
RE_MINIFIED = re.compile(r"^.{2000,}$", re.MULTILINE)        # سطر مصغّر عملاق
RE_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")    # رموز تحكم
RE_MANY_BLANK = re.compile(r"\n{4,}")
RE_TRAIL_WS = re.compile(r"[ \t]+\n")


def clean_text(s: str) -> str:
    """تنظيف النص من الرموز العشوائية والضجيج اللي يخرّب التضمين."""
    s = RE_CTRL.sub("", s)
    # ملاحظة: الترتيب مهم. قاعدة base64 تطابق أي سطر طويل من حروف وأرقام،
    # فلو شغّلناها قبل، كتبلع السطر المصغّر وما يتعلّمش عليه الوسم الصحيح.
    s = RE_MINIFIED.sub(" <MINIFIED> ", s)  # السطر المصغّر ما فيه معرفة
    s = RE_LONG_B64.sub(" <DATA> ", s)      # نبدّلو base64 الطويل بعلامة
    s = RE_TRAIL_WS.sub("\n", s)
    s = RE_MANY_BLANK.sub("\n\n\n", s)
    return s.strip()


def is_useful(s: str) -> bool:
    """نرفضو النصوص اللي ماشي كود ولا توثيق مفيد."""
    if len(s) < MIN_CHUNK:
        return False
    # نسبة الرموز غير المقروءة
    printable = sum(1 for c in s if c.isprintable() or c in "\n\t")
    if printable / max(1, len(s)) < 0.92:
        return False
    # لازم يبان بحال كود ولا نص تقني
    signals = ("def ", "function", "class ", "import ", "return", "const ", "{", "};", "#include", "=>")
    return sum(1 for g in signals if g in s) >= 2


def chunk_text(s: str, size: int = CHUNK_CHARS, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """
    تقسيم بتداخل، مع محاولة القطع عند حدّ طبيعي (سطر فارغ ولا نهاية سطر)
    باش ما نقصّوش دالة فنصّها ونضيّعو السياق.
    """
    s = s.strip()
    if len(s) <= size:
        return [s] if len(s) >= MIN_CHUNK else []

    out: List[str] = []
    start = 0
    n = len(s)
    while start < n:
        end = min(n, start + size)
        if end < n:
            # ندوّرو على أحسن نقطة قطع فالربع الأخير من القطعة
            window_start = max(start + int(size * 0.75), start + 1)
            cut = s.rfind("\n\n", window_start, end)
            if cut == -1:
                cut = s.rfind("\n", window_start, end)
            if cut != -1 and cut > start + MIN_CHUNK:
                end = cut
        piece = s[start:end].strip()
        if len(piece) >= MIN_CHUNK:
            out.append(piece)
        if end >= n:
            break
        start = max(end - overlap, start + 1)  # التداخل يحفظ السياق
    return out


def doc_id(text: str, extra: str = "") -> str:
    """معرّف ثابت مبني على المحتوى — يمنع التكرار عند إعادة البناء."""
    return hashlib.sha1((extra + "\u0000" + text).encode("utf-8")).hexdigest()


# ──────────────────────────────────────────────────────────────────────────────
#  3) قاعدة البيانات المتجهة (ChromaDB) + نموذج التضمين
# ──────────────────────────────────────────────────────────────────────────────

class Embedder:
    """غلاف حول sentence-transformers مع تحميل كسول وتطبيع المتجهات."""

    def __init__(self, model_name: str = EMBED_MODEL) -> None:
        self.model_name = model_name
        self._m = None

    @property
    def model(self):  # noqa: ANN201
        if self._m is None:
            from sentence_transformers import SentenceTransformer
            print(f"  … نحمّلو نموذج التضمين {self.model_name}")
            self._m = SentenceTransformer(self.model_name)
        return self._m

    def encode(self, texts: List[str], batch: int = EMBED_BATCH) -> List[List[float]]:
        vecs = self.model.encode(
            texts,
            batch_size=batch,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,   # التطبيع يخلّي المسافة = جيب التمام
        )
        return [v.tolist() for v in vecs]


def get_collection(reset: bool = False):  # noqa: ANN201
    """يفتح (ولا ينشئ) المجموعة داخل Chroma المحليّة الدائمة."""
    import chromadb
    from chromadb.config import Settings

    DB_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(
        path=str(DB_DIR),
        settings=Settings(anonymized_telemetry=False, allow_reset=True),
    )
    if reset:
        try:
            client.delete_collection(COLLECTION)
            print("  ⚠ مسحنا المجموعة القديمة.")
        except Exception:  # noqa: BLE001
            pass
    return client.get_or_create_collection(
        name=COLLECTION,
        metadata={"hnsw:space": "cosine", "dim": EMBED_DIM},
    )


# ──────────────────────────────────────────────────────────────────────────────
#  4) البناء
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class BuildStats:
    records: int = 0
    chunks: int = 0
    skipped: int = 0
    started: float = field(default_factory=time.time)

    def line(self) -> str:
        el = max(1e-6, time.time() - self.started)
        return (
            f"سجلات {self.records:,} | قطع {self.chunks:,} | "
            f"مرفوضة {self.skipped:,} | {self.chunks / el:,.0f} قطعة/ثا"
        )


def build(limit: int, preferred: Optional[str], reset: bool) -> None:
    """يبني الفهرس كامل: تحميل → تنظيف → تقطيع → تضمين → تخزين."""
    print("\n═══ 1) اختيار المجموعة ═══")
    spec, ds = next(pick_dataset(preferred))

    print("\n═══ 2) تجهيز قاعدة البيانات المتجهة ═══")
    col = get_collection(reset=reset)
    emb = Embedder()

    print(f"\n═══ 3) البناء (هدف: {limit:,} سجل) ═══")
    stats = BuildStats()

    buf_txt: List[str] = []
    buf_meta: List[Dict[str, Any]] = []
    buf_ids: List[str] = []
    seen_ids: set[str] = set()

    def flush() -> None:
        """يضمّن ويدفع الدفعة الحالية لـChroma."""
        if not buf_txt:
            return
        vecs = emb.encode(buf_txt)
        col.upsert(ids=buf_ids, documents=buf_txt, metadatas=buf_meta, embeddings=vecs)
        buf_txt.clear()
        buf_meta.clear()
        buf_ids.clear()

    try:
        for rec in stream_records(spec, ds, limit):
            stats.records += 1
            cleaned = clean_text(rec["text"])
            if not is_useful(cleaned):
                stats.skipped += 1
                continue

            for piece in chunk_text(cleaned):
                cid = doc_id(piece, rec["path"])
                if cid in seen_ids:       # إزالة التكرار داخل نفس الجلسة
                    continue
                seen_ids.add(cid)
                buf_ids.append(cid)
                buf_txt.append(piece)
                buf_meta.append({
                    "language": rec["language"][:40],
                    "path": rec["path"][:200],
                    "repo": rec["repo"][:120],
                    "source": spec.repo,
                    "chars": len(piece),
                })
                stats.chunks += 1

                if len(buf_txt) >= UPSERT_BATCH:
                    flush()
                    print(f"  … {stats.line()}", end="\r", flush=True)

        flush()
    except KeyboardInterrupt:
        print("\n  ⚠ وقفنا بطلب منك — نحفظو اللي بنيناه.")
        flush()

    print(f"\n\n✅ خلصنا. {stats.line()}")
    print(f"   المجموعة: {col.count():,} متجه فـ {DB_DIR}")


# ──────────────────────────────────────────────────────────────────────────────
#  5) الاسترجاع
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class Hit:
    text: str
    meta: Dict[str, Any]
    score: float


def retrieve(question: str, k: int = 6, lang: Optional[str] = None) -> List[Hit]:
    """يدوّر على أقرب القطع للسؤال داخل قاعدة البيانات المتجهة."""
    col = get_collection()
    if col.count() == 0:
        raise RuntimeError("الفهرس فارغ. شغّل:  python nexus_rag.py build")

    emb = Embedder()
    qv = emb.encode([question])[0]

    where = {"language": lang} if lang else None
    res = col.query(
        query_embeddings=[qv],
        n_results=max(1, k),
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]

    hits: List[Hit] = []
    for d, m, dist in zip(docs, metas, dists):
        # المسافة cosine ∈ [0,2] → نحوّلوها لنتيجة تشابه ∈ [0,1]
        hits.append(Hit(text=d, meta=dict(m or {}), score=max(0.0, 1.0 - float(dist) / 2.0)))
    return hits


def build_context(hits: List[Hit], budget: int = 12_000) -> str:
    """يركّب المصادر فنص واحد مرقّم، مع احترام سقف الحروف."""
    parts: List[str] = []
    used = 0
    for i, h in enumerate(hits, 1):
        head = f"[{i}] {h.meta.get('path') or h.meta.get('repo') or 'مصدر'}"
        lang = h.meta.get("language")
        if lang and lang != "unknown":
            head += f"  ({lang})"
        head += f"  — تشابه {h.score:.2f}"
        block = f"{head}\n```\n{h.text}\n```"
        if used + len(block) > budget:
            break
        parts.append(block)
        used += len(block)
    return "\n\n".join(parts)


# ──────────────────────────────────────────────────────────────────────────────
#  6) الربط مع Gemini
# ──────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """أنت مهندس برمجيات خبير. تجاوب بالاعتماد على المقاطع المرفقة.

قواعد ملزمة:
1. اعتمد على المقاطع المرفقة أولًا. إذا كانت ناقصة، قل ذلك صراحة ثم أكمل من معرفتك مع التوضيح أن هذا الجزء ليس من المصادر.
2. استشهد برقم المصدر بين قوسين مربّعين، مثل [2]، بعد كل ادّعاء مأخوذ من المصادر.
3. أعطِ كودًا كاملًا قابلًا للتشغيل. ممنوع "// باقي الكود" أو TODO.
4. جاوب بنفس لغة السؤال (دارجة جزائرية ← دارجة، إنجليزية ← إنجليزية).
5. اذكر التعقيد الزمني والمكاني عند الحديث عن خوارزمية.
6. لا تخترع اسم دالة أو مكتبة غير موجودة في المصادر.
"""


def ask_gemini(question: str, context: str, model_name: str = GEMINI_MODEL) -> str:
    """يبعث السؤال + المصادر لـGemini ويرجّع الجواب."""
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return (
            "⚠ ما كاينش GEMINI_API_KEY.\n"
            "صدّرو هكذا:  export GEMINI_API_KEY='...'\n\n"
            "المصادر اللي لقيناها:\n\n" + context
        )

    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name, system_instruction=SYSTEM_PROMPT)

    prompt = textwrap.dedent(f"""\
        ===== المقاطع المسترجَعة من قاعدة المعرفة =====
        {context if context.strip() else "(ما لقينا حتى مصدر مناسب)"}
        ===== نهاية المقاطع =====

        السؤال: {question}
    """)

    try:
        resp = model.generate_content(
            prompt,
            generation_config={"temperature": 0.2, "max_output_tokens": 8192},
        )
        return (getattr(resp, "text", "") or "").strip() or "(الجواب رجع فارغ)"
    except Exception as e:  # noqa: BLE001
        return f"⚠ Gemini رجّع خطأ: {type(e).__name__}: {e}"


def answer(question: str, k: int = 6, lang: Optional[str] = None, show_sources: bool = True) -> str:
    """الخط الكامل: استرجاع ← بناء السياق ← توليد."""
    t0 = time.time()
    hits = retrieve(question, k=k, lang=lang)
    ctx = build_context(hits)
    out = ask_gemini(question, ctx)
    dt = time.time() - t0

    if show_sources and hits:
        srcs = "\n".join(
            f"  [{i}] {h.meta.get('path') or h.meta.get('repo')}  ({h.score:.2f})"
            for i, h in enumerate(hits, 1)
        )
        out += f"\n\n───── المصادر ─────\n{srcs}\n⏱ {dt:.1f} ثانية"
    return out


# ──────────────────────────────────────────────────────────────────────────────
#  7) واجهة سطر الأوامر
# ──────────────────────────────────────────────────────────────────────────────

def cmd_stats() -> None:
    col = get_collection()
    n = col.count()
    print(f"\n📊 الفهرس: {n:,} متجه")
    print(f"   المسار : {DB_DIR}")
    print(f"   النموذج: {EMBED_MODEL}  ({EMBED_DIM} بُعد)")
    if n:
        sample = col.peek(limit=5)
        langs = {}
        for m in (sample.get("metadatas") or []):
            langs[m.get("language", "?")] = langs.get(m.get("language", "?"), 0) + 1
        print(f"   عيّنة  : {json.dumps(langs, ensure_ascii=False)}")


def cmd_chat() -> None:
    print("\n💬 جلسة Nexus RAG — اكتب 'خروج' باش تخرج.\n")
    while True:
        try:
            q = input("أنت ❯ ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not q:
            continue
        if q in {"خروج", "exit", "quit", "q"}:
            return
        print("\n" + answer(q) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Nexus RAG — نظام معرفة برمجية بالاسترجاع المعزّز",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="يبني الفهرس من Hugging Face")
    b.add_argument("--limit", type=int, default=20_000, help="عدد السجلات (افتراضي 20000)")
    b.add_argument("--dataset", type=str, default=None, help="مفتاح المجموعة من الكتالوج")
    b.add_argument("--reset", action="store_true", help="يمسح الفهرس القديم")

    a = sub.add_parser("ask", help="سؤال واحد")
    a.add_argument("question", type=str)
    a.add_argument("-k", type=int, default=6, help="عدد المقاطع المسترجَعة")
    a.add_argument("--lang", type=str, default=None, help="فلترة بلغة البرمجة")

    sub.add_parser("chat", help="جلسة تفاعلية")
    sub.add_parser("stats", help="إحصائيات الفهرس")
    sub.add_parser("catalog", help="يعرض المجموعات المتاحة")

    args = ap.parse_args()

    if args.cmd == "build":
        build(limit=args.limit, preferred=args.dataset, reset=args.reset)
    elif args.cmd == "ask":
        print("\n" + answer(args.question, k=args.k, lang=args.lang) + "\n")
    elif args.cmd == "chat":
        cmd_chat()
    elif args.cmd == "stats":
        cmd_stats()
    elif args.cmd == "catalog":
        print("\n📚 الكتالوج (بالترتيب):\n")
        for s in CATALOG:
            flag = " 🔒 محميّة" if s.gated else ""
            print(f"  {s.key:22} {s.repo}{flag}\n     {s.note}\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nوقفنا.")
        sys.exit(130)
