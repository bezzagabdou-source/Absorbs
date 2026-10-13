import type { AITask } from "@/lib/ai-providers";

export type NexusModel = {
  id: string;
  name: string;
  tagline: string;
  badge?: string;
  speed: 1 | 2 | 3; // dots
  iq: 1 | 2 | 3;
  /** which Absorbs routing chain answers for this model (src/lib/ai-providers.ts) */
  task: AITask;
  /** requires an active Pro plan / trial */
  pro?: boolean;
};

export const NEXUS_MODELS: NexusModel[] = [
  {
    id: "nexus-core",
    name: "Nexus Core",
    tagline: "المحرك المتوازن للاستعمال اليومي",
    badge: "افتراضي",
    speed: 3,
    iq: 2,
    task: "fast",
  },
  {
    id: "nexus-flash",
    name: "Nexus Flash",
    tagline: "سرعة البرق للإجابات القصيرة",
    speed: 3,
    iq: 1,
    task: "fast",
  },
  {
    id: "nexus-apex",
    name: "Nexus Apex",
    tagline: "أعمق استدلال للمهام المعقّدة",
    badge: "PRO",
    speed: 1,
    iq: 3,
    task: "reasoning",
    pro: true,
  },
  {
    id: "nexus-forge",
    name: "Nexus Forge",
    tagline: "متخصّص في الكود والهندسة",
    badge: "DEV",
    speed: 2,
    iq: 3,
    task: "code",
    pro: true,
  },
];

export const DEFAULT_MODEL = NEXUS_MODELS[0].id;

export function modelById(id: string | null | undefined): NexusModel {
  return NEXUS_MODELS.find((m) => m.id === id) ?? NEXUS_MODELS[0];
}
