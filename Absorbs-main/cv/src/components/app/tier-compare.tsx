import { Crown, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface TierRow {
  id: "v6" | "v8";
  name: string;
  tagline: string;
  icon: typeof Zap;
  facts: string[];
}

/** What each level really does (every line matches the server code: token limits, engines, image variants). */
const ROWS: readonly TierRow[] = [
  {
    id: "v6",
    name: "Nexus 6",
    tagline: "المجاني السريع",
    icon: Sparkles,
    facts: [
      "رد فوري لكل الاستعمال اليومي",
      "ترجمة، كتابة، دراسة، تلخيص وتحليل",
      "رفع الصور والملفات والمكالمة الصوتية",
      "توليد صور بالعربية بنص واضح",
    ],
  },
  {
    id: "v8",
    name: "Nexus 8 PRO",
    tagline: "الأقوى — فريق ذكاء اصطناعي",
    icon: Crown,
    facts: [
      "أسرع رد ممكن: أول حرف في أقل من ثانية",
      "أكواد وألعاب ضخمة بدون توقف (ماراثون حتى ساعة)",
      "شخصيات: مبرمج، كاتب، معلّم، محلل",
      "استوديو صور ونصوص عربية بدقة عالية + معاينة حيّة",
    ],
  },
];

export function TierCompare({ className }: { className?: string }) {
  return (
    <section aria-label="مقارنة النماذج" className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {ROWS.map((r) => {
        const Icon = r.icon;
        const top = r.id === "v8";
        return (
          <article
            key={r.id}
            className={cn(
              "rounded-2xl border p-4",
              top ? "border-brand-500/60 bg-brand-500/10" : "border-white/10 bg-ink-900"
            )}
          >
            <header className="flex items-center gap-3">
              <span className={cn("grid h-10 w-10 place-items-center rounded-xl", top ? "bg-brand-500 text-[#fff]" : "bg-ink-800 text-brand-300")}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-base font-black text-white">{r.name}</h3>
                <p className="text-xs text-slate-400">{r.tagline}</p>
              </div>
            </header>
            <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-300">
              {r.facts.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </section>
  );
}
