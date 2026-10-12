/**
 * NOVA FORGE — الأنواع المركزية للتطبيق
 * كل الأنواع مُحكمة (strict) ومشتركة بين كل الوحدات.
 */

export type Lang = 'ar' | 'en';
export type Theme = 'dark' | 'light';
export type Accent = 'forge' | 'plasma' | 'neon' | 'magma';
export type Density = 'comfortable' | 'compact';

export interface Bi {
  ar: string;
  en: string;
}

export type ModelId =
  | 'gpt-astra'
  | 'kimi-3'
  | 'gemini-ultra-lite'
  | 'deepseek-v4-lite'
  | 'qwen-4-turbo'
  | 'grok-4-mini'
  | 'mistral-forge'
  | 'glm-5-air'
  | 'llama-4-scout'
  | 'nova-coder-x';

export interface ModelInfo {
  id: ModelId;
  name: string;
  vendor: string;
  /** معرّف النموذج عند المزوّد (قابل للتغيير من الإعدادات) */
  apiModel: string;
  tagline: Bi;
  contextK: number;
  maxOut: number;
  /** 1..5 سرعة توليد تقديرية */
  speed: number;
  quality: number;
  reasoning: number;
  costIn: number; // $ لكل 1M توكن
  costOut: number;
  badges: Bi[];
  specialties: string[];
  color: string;
  flagship?: boolean;
  light: boolean;
  /** بطاقة الشخصية + برومبت النظام الضخم */
  system: Bi;
}

export type PromptCategory = 'game' | 'web' | 'app' | 'api' | 'design' | 'ai' | 'qa' | 'growth';

export interface PromptItem {
  id: string;
  title: Bi;
  category: PromptCategory;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard' | 'extreme';
  bestModels: ModelId[];
  minutes: number;
  body: Bi;
  deliverable: Bi;
  gates: Bi[];
}

export type ProjectKind = 'game' | 'website' | 'app' | 'api' | 'other';

export interface CodeSnapshot {
  at: number;
  code: string;
  label: string;
  score?: number;
}

export interface Project {
  id: string;
  title: string;
  kind: ProjectKind;
  code: string;
  language: 'html' | 'tsx' | 'js' | 'py' | 'md';
  modelId: ModelId;
  promptId?: string;
  createdAt: number;
  updatedAt: number;
  qaScore: number | null;
  deliveryCode: string | null;
  delivered: boolean;
  pinned: boolean;
  history: CodeSnapshot[];
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type QaCategory = 'html' | 'js' | 'css' | 'game' | 'seo' | 'a11y' | 'perf' | 'security' | 'ux';

export interface QaIssue {
  id: string;
  rule: string;
  severity: Severity;
  category: QaCategory;
  title: Bi;
  detail: Bi;
  evidence?: string;
  line?: number;
  fix: Bi;
  autoFixable: boolean;
  applied?: boolean;
}

export interface QaReport {
  score: number;
  grade: string;
  passed: boolean;
  issues: QaIssue[];
  counts: Record<Severity, number>;
  metrics: {
    lines: number;
    bytes: number;
    functions: number;
    loops: number;
    listeners: number;
    externalRefs: number;
    todoCount: number;
    canvases: number;
    fpsGuards: number;
    touchControls: number;
  };
  checkedAt: number;
  profile: ProjectKind;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  at: number;
  modelId?: ModelId;
  tokens?: number;
  pending?: boolean;
  error?: string;
}

export interface Settings {
  lang: Lang;
  theme: Theme;
  accent: Accent;
  density: Density;
  animations: boolean;
  sound: boolean;
  baseUrl: string;
  apiKey: string;
  demoMode: boolean;
  temperature: number;
  topP: number;
  maxTokens: number;
  stream: boolean;
  autoQa: boolean;
  /** إصلاح ذكي تلقائي بالـAI بعد التوليد (فحص ← إصلاح ← إعادة فحص) */
  autoRepair: boolean;
  /** عدد تمريرات الإصلاح الذكي (1–3) */
  repairPasses: number;
  strictGate: boolean;
  requireDeliveryCode: boolean;
  /** عرض رمز التسليم على الشاشة (للتطوير فقط — معطّل افتراضياً) */
  showDemoCode: boolean;
  autoFixSafe: boolean;
  persona: string;
  modelOverrides: Partial<Record<ModelId, string>>;
  defaultModel: ModelId;
  fontScale: number;
  reducedMotion: boolean;
}

export interface ToastMsg {
  id: string;
  kind: 'ok' | 'warn' | 'err' | 'info';
  title: string;
  body?: string;
}

export interface DeliveryState {
  sent: boolean;
  verified: boolean;
  error: string | null;
}

export interface GenerationState {
  running: boolean;
  modelId: ModelId | null;
  startedAt: number;
  chars: number;
  phase: string;
}
