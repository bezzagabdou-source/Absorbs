export interface ProviderInfo {
  baseUrl: string;
  envKey: string;
}

export const PROVIDERS: Record<string, ProviderInfo> = {
  xai: { baseUrl: 'https://api.x.ai/v1', envKey: 'XAI_API_KEY' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', envKey: 'OPENROUTER_API_KEY' },
  cerebras: { baseUrl: 'https://api.cerebras.ai/v1', envKey: 'CEREBRAS_API_KEY' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', envKey: 'GEMINI_API_KEY' },
  hf: { baseUrl: 'https://router.huggingface.co/v1', envKey: 'HF_TOKEN' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', envKey: 'GROQ_API_KEY' },
  pollinations: { baseUrl: 'https://gen.pollinations.ai/v1', envKey: 'POLLINATIONS_API_KEY' },
};

export type Tier = 'free' | 'pro';
export type Capability = 'fast' | 'code' | 'vision' | 'deep';

export interface ModelEntry {
  provider: string;
  id: string;
  tiers: Tier[];
  caps: Capability[];
  priority: number;
}
export type RegistryEntry = ModelEntry;
export type ModelDef = ModelEntry;
export type ModelConfig = ModelEntry;

// Strongest models first. The router automatically skips providers whose
// API key is missing or failing, so listing several providers is safe.
const DEFAULT_MODELS: ModelEntry[] = [
  { provider: 'openrouter', id: 'anthropic/claude-sonnet-4.5', tiers: ['free', 'pro'], caps: ['fast', 'code', 'vision', 'deep'], priority: 1 },
  { provider: 'pollinations', id: 'openai/gpt-5.4-nano', tiers: ['free', 'pro'], caps: ['fast', 'vision'], priority: 2 },
  { provider: 'cerebras', id: 'gpt-oss-120b', tiers: ['free', 'pro'], caps: ['fast', 'code', 'deep'], priority: 3 },
  { provider: 'pollinations', id: 'deepseek/deepseek-v4.1-flash-1017', tiers: ['free', 'pro'], caps: ['fast', 'code', 'vision', 'deep'], priority: 4 },
  { provider: 'openrouter', id: 'deepseek/deepseek-chat-v3.1', tiers: ['free', 'pro'], caps: ['fast', 'code'], priority: 5 },
  { provider: 'openrouter', id: 'moonshotai/kimi-k2', tiers: ['free', 'pro'], caps: ['fast', 'code'], priority: 6 },
  { provider: 'groq', id: 'llama-3.3-70b-versatile', tiers: ['free', 'pro'], caps: ['fast'], priority: 7 },
  { provider: 'gemini', id: 'gemini-2.5-flash', tiers: ['free', 'pro'], caps: ['fast', 'vision'], priority: 8 },
  { provider: 'hf', id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', tiers: ['free', 'pro'], caps: ['code'], priority: 9 },
  { provider: 'gemini', id: 'gemini-2.5-pro', tiers: ['free', 'pro'], caps: ['fast', 'code', 'vision', 'deep'], priority: 10 },
  { provider: 'xai', id: 'grok-4-fast', tiers: ['free', 'pro'], caps: ['fast', 'code', 'vision'], priority: 11 },
];

export const defaultRegistry: ModelEntry[] = DEFAULT_MODELS;

let cached: ModelEntry[] | null = null;

export function getRegistry(): ModelEntry[] {
  if (cached) return cached;
  try {
    if (process.env.MODEL_REGISTRY_JSON) cached = JSON.parse(process.env.MODEL_REGISTRY_JSON) as ModelEntry[];
  } catch (e) {
    console.warn('[GNAB AI] MODEL_REGISTRY_JSON is invalid JSON, using defaults');
  }
  return (cached ??= DEFAULT_MODELS);
}
