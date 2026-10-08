import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TierRow {
  id: "v8";
  name: string;
  tagline: string;
  icon: typeof Crown;
  facts: string[];
}

/** What each level really does (every line matches the server code: token limits, engines, image variants). */
const ROWS: readonly TierRow[] = [
  {
    id: "v8",
    name: "Nexus 8 Pro",
    tagline: "نموذج واحد، سريع وقوي",
    icon: Crown,
    facts: [
      "رد سريع جدًا من أول سطر",
      "يصنع ألعاب 2D/3D بخلفيات ملوّنة وغنية وأعداء ومراحل وزعماء",
      "يكتب مواقع وأكواد قوية ويفحصها ويصلحها تلقائيًا",
      "يفهم الدارجة الجزائرية ويصنع الصور كما طلبتها بالضبط",
    ],
  },
];

export function TierCompare({ className }: { className?: string }) {
  return (
    <section aria-label="مقارنة النماذج" className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {ROWS.map((r) => {
        const Icon = r.icon;
        const top = true;
        return (
          <article
            key={r.id}
            className={cn(
              "rounded-2xl border p-4",
              top ? "border-brand-500/60 bg-brand-500/10" : "border-white/10 bg-ink-900"
            )}
          >
            <header className="flex items-center gap-3">
              <span className={cn("grid h-10 w-10 place-items-center rounded-xl", top ? "bg-brand-500 text-white" : "bg-ink-800 text-brand-300")}>
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
