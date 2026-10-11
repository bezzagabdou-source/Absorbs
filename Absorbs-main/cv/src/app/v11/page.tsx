import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { V11_FEATURES, NEXUS_V11 } from "@/lib/nexus-v11";
import { TITAN } from "@/lib/titan";
import { TURBO } from "@/lib/turbo";

export const metadata: Metadata = {
  title: "Nexus AI v11 LEGEND — ما الجديد",
  description:
    "النسخة 11: رد في أقل من ثانية، بناء حتى 5 ميغا بلا توقّف، دمج النماذج، تصميم مباشر على الشاشة، وعربية سليمة داخل الصور.",
  alternates: { canonical: "/v11" },
};

const NUMBERS: { value: string; label: string; hint: string }[] = [
  {
    value: `< ${(TURBO.TTFT_TARGET_MS / 1000).toFixed(1)} ث`,
    label: "أول حرف",
    hint: "سباق محرّكات مهجَّن — أسرع محرّك يفوز",
  },
  {
    value: `${Math.round(TITAN.MAX_BYTES / (1024 * 1024))} م.ب`,
    label: "أقصى حجم للرد الواحد",
    hint: "مقاطع متتالية بخياطة ذكية بلا تكرار",
  },
  {
    value: `${TURBO.STALL_FAILOVER_MS / 1000} ث`,
    label: "حد السكوت",
    hint: "بعدها ينتقل تلقائيًا لمحرّك بديل",
  },
  {
    value: `${TITAN.MAX_ROUNDS}`,
    label: "جولة إكمال",
    hint: "لا يتوقّف حتى يُغلق آخر وسم",
  },
];

const PIPELINE: { step: string; title: string; body: string }[] = [
  {
    step: "01",
    title: "TURBO — السباق",
    body: "ينطلق المحرّك القائد فورًا. إن سكت 0.75 ثانية ينطلق محرّك ثانٍ بالتوازي، ثم ثالث. أول من يُخرج حرفًا حقيقيًا يملك الإجابة، والباقي يُلغى في نفس اللحظة حتى لا تُهدر أي توكن.",
  },
  {
    step: "02",
    title: "WATCHDOG — الحارس",
    body: "نبضات غير مرئية تُبقي الاتصال حيًّا أثناء التفكير. إذا مرّت 18 ثانية بلا حرف واحد يُعتبر المحرّك ميتًا ويتولّى بديل مكانه. لا يمكن تقنيًا أن ينتهي الطلب بردّ فارغ.",
  },
  {
    step: "03",
    title: "TITAN — الحجم",
    body: "البناء يتواصل عبر مقاطع متتالية حتى 5 ميغابايت. كل مقطع جديد يُخاط بالذي قبله بعد حذف التداخل، فلا تتكرّر الأسطر ولا ينكسر الكود.",
  },
  {
    step: "04",
    title: "FUSION — الدمج",
    body: "كل محرّك يكتب مسودّة كاملة. نظام تنقيط يقيس الاكتمال والحجم والأعطال ومطابقة اللغة، يرمي الضعيف، ثم يدمج القائد الأفضل داخل بنية واحدة — بلا خلط تصميمين.",
  },
  {
    step: "05",
    title: "INTEGRITY — الفحص",
    body: "قبل التسليم يمرّ الملف على فاحص: أقواس، وسوم، <script>، </html>، عناصر نائبة، صور خارجية، تحكّم باللمس. ما يمكن إصلاحه يُصلَح تلقائيًا.",
  },
];

export default function V11Page() {
  return (
    <PublicShell>
      <section className="v11-aurora v11-rise rounded-3xl px-5 py-14 text-center sm:px-10 sm:py-20">
        <span className="v11-pill mb-5 inline-flex">
          <i className="v11-pill-dot" aria-hidden />
          الإصدار {NEXUS_V11.version}
        </span>
        <h1 className="v11-title mx-auto max-w-3xl text-balance">
          {NEXUS_V11.nameAr} — {NEXUS_V11.tagline}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-8 text-slate-300 sm:text-lg">
          نسخة بُنيت حول شكويين حقيقيتين: «الرد يتأخّر» و«يتوقّف في النص». الآن أول حرف يصل في أقل من ثانية،
          والبناء يكمل حتى 5 ميغابايت بلا انقطاع ولا كود مكسور.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className="v11-btn v11-btn-primary">
            جرّبها الآن
          </Link>
          <Link href="/app/upgrade" className="v11-btn v11-btn-gold">
            ترقية إلى Pro
          </Link>
        </div>
      </section>

      <section className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {NUMBERS.map((n) => (
          <div key={n.label} className="v11-glass v11-edge p-5 text-center">
            <div className="v11-title !text-3xl sm:!text-4xl">{n.value}</div>
            <div className="mt-1 text-sm font-semibold text-slate-200">{n.label}</div>
            <p className="mt-2 text-xs leading-6 text-slate-400">{n.hint}</p>
          </div>
        ))}
      </section>

      <section className="mt-16">
        <h2 className="text-xl font-bold text-slate-100 sm:text-2xl">كيف تعمل السلسلة</h2>
        <div className="mt-6 space-y-3">
          {PIPELINE.map((p) => (
            <article key={p.step} className="v11-glass flex gap-4 p-5">
              <div className="shrink-0 text-2xl font-extrabold tabular-nums text-[var(--v11-accent)] opacity-70">
                {p.step}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-100">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-7 text-slate-400">{p.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-xl font-bold text-slate-100 sm:text-2xl">كل ما هو جديد</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {V11_FEATURES.map((f) => (
            <article key={f.title} className="v11-glass p-5">
              <div className="text-2xl" aria-hidden>
                {f.emoji}
              </div>
              <h3 className="mt-2 font-bold text-slate-100">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-7 text-slate-400">{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="v11-glass v11-edge mt-16 p-6 text-center sm:p-10">
        <h2 className="v11-title !text-2xl sm:!text-3xl">جاهز للأسطوري؟</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">
          افتح المحادثة واطلب لعبة كاملة أو تطبيقًا ضخمًا — وشاهد شريط TITAN وهو يملأ الملف حتى آخر وسم.
        </p>
        <Link href="/app" className="v11-btn v11-btn-primary mt-6">
          ابدأ المحادثة
        </Link>
      </section>
    </PublicShell>
  );
}
