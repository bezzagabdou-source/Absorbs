/**
 * Nexus AI v12 — THE COUNCIL (مجلس النماذج).
 *
 * The flagship v12 feature: instead of trusting one model, four of them answer the
 * same question **at the same time**, the user watches all four stream live side by
 * side, every draft is scored, and a final synthesis merges the best parts into one
 * verdict.
 *
 * This module is client-safe: types, presets and the NDJSON protocol only.
 * The orchestration lives in src/app/api/ai/council/route.ts.
 */
import type { PlanId } from "@/lib/model-access";
import { MODEL_BY_KEY, type Model12 } from "@/lib/models-v12";

/** A seat at the table. */
export interface Seat {
  /** stable id used by the UI columns */
  id: string;
  /** model key from models-v12 */
  modelKey: string;
}

export interface CouncilPreset {
  id: string;
  label: string;
  blurb: string;
  icon: string;
  /** model keys, in display order */
  free: readonly string[];
  pro: readonly string[];
}

/**
 * Presets keep the feature usable without making the user assemble a jury.
 * Each preset lists a free line-up and a Pro line-up of the same size.
 */
export const COUNCIL_PRESETS: readonly CouncilPreset[] = [
  {
    id: "balanced",
    label: "المجلس المتوازن",
    blurb: "أربعة عقول مختلفة على نفس السؤال.",
    icon: "scale",
    free: ["flash-2.5", "think", "qwen-235b", "deepseek-free"],
    pro: ["sonnet-45", "grok-4", "gpt-4o", "deepseek-pro"],
  },
  {
    id: "code",
    label: "مجلس الكود",
    blurb: "المتخصّصون فالبرمجة والألعاب.",
    icon: "code",
    free: ["qwen-coder", "deepseek-free", "think", "flash-2.5"],
    pro: ["sonnet-45", "deepseek-pro", "grok-4", "auto"],
  },
  {
    id: "speed",
    label: "مجلس السرعة",
    blurb: "أربعة أجوبة فثوانٍ معدودة.",
    icon: "zap",
    free: ["flash-2.5", "flash-lite", "flash-2.0", "llama-70b"],
    pro: ["grok-2", "deepseek-pro", "sonnet-35", "gpt-4o"],
  },
  {
    id: "arabic",
    label: "المجلس العربي",
    blurb: "الأقوى فالعربية والدارجة.",
    icon: "languages",
    free: ["qwen-235b", "flash-2.5", "think", "llama-70b"],
    pro: ["sonnet-45", "gpt-4o", "grok-3", "auto"],
  },
];

export const DEFAULT_PRESET = "balanced";

export function presetById(id: string): CouncilPreset {
  return COUNCIL_PRESETS.find((p) => p.id === id) ?? COUNCIL_PRESETS[0];
}

/** Resolve a preset to concrete models for a plan, dropping anything unknown. */
export function seatsFor(preset: CouncilPreset, plan: PlanId): Model12[] {
  const keys = plan === "pro" ? preset.pro : preset.free;
  return keys.map((k) => MODEL_BY_KEY.get(k)).filter((m): m is Model12 => Boolean(m));
}

/* ------------------------------------------------------------------ *
 * Wire protocol — one JSON object per line (NDJSON).
 * ------------------------------------------------------------------ */
export type CouncilEvent =
  | { t: "open"; seats: { id: string; label: string; blurb: string; speed: string }[] }
  | { t: "delta"; id: string; d: string }
  | { t: "seat-done"; id: string; ms: number; chars: number }
  | { t: "seat-error"; id: string; message: string }
  | { t: "scores"; scores: { id: string; score: number; reasons: string[] }[]; winner: string }
  | { t: "verdict-open" }
  | { t: "verdict"; d: string }
  | { t: "done"; ms: number }
  | { t: "error"; message: string };

export function encodeEvent(e: CouncilEvent): string {
  return JSON.stringify(e) + "\n";
}

/** Incremental NDJSON reader for the browser. */
export function makeEventParser(onEvent: (e: CouncilEvent) => void) {
  let buf = "";
  return (chunk: string) => {
    buf += chunk;
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) {
        try {
          onEvent(JSON.parse(line) as CouncilEvent);
        } catch {
          /* ignore a partial / malformed line */
        }
      }
      nl = buf.indexOf("\n");
    }
  };
}

/** Hard ceilings so a council can never run away. */
export const COUNCIL = {
  MAX_SEATS: 4,
  SEAT_MAX_TOKENS: 2600,
  VERDICT_MAX_TOKENS: 6000,
  SEAT_DEADLINE_MS: 75_000,
  TOTAL_DEADLINE_MS: 170_000,
  /** a free account may convene this many councils per day */
  FREE_DAILY: 3,
} as const;

/** The system prompt every seat receives. */
export const SEAT_SYSTEM = `أنت عضو فـ «مجلس Nexus». نفس السؤال انطرح على عدة نماذج فنفس الوقت، وجوابك غادي يتقارن مع أجوبتهم.

القواعد:
- جاوب مباشرة. بلا مقدمات ولا "كسؤالك الممتاز".
- كون محدّد وعملي. أمثلة وكود حقيقي إيلا كان السؤال تقني.
- إيلا ما كنتش متأكد، قولها بصراحة بدل ما تخترع.
- اكتب بنفس لغة السؤال (دارجة ⟵ دارجة، عربية ⟵ عربية).
- خليك مركّز — جواب قوي ومختصر يغلب جواب طويل وفاضي.`;

/** The synthesis prompt. */
export function verdictSystem(count: number): string {
  return `أنت رئيس «مجلس Nexus». قرا ${count} أجوبة على نفس السؤال، وخرّج جواب نهائي واحد أحسن من كلهم.

القواعد:
- خُذ الصحيح من كل جواب، واطرح الغلط والتكرار.
- إيلا تناقضو، رجّح اللي عندو دليل أقوى وقول علاش بسطر واحد.
- ما تقولش "النموذج الأول قال" — اكتب جواب واحد نظيف وكأنك كتبتو من الصفر.
- حافظ على أحسن كود/أمثلة موجودة فالمسودات.
- نفس لغة السؤال.
- ابدا مباشرة بالجواب.`;
}
