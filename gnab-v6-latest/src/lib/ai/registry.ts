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
};

export type Tier = 'free' | 'pro';
export type Capability = 'fast' | 'code' | 'vision';

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
  { provider: 'openrouter', id: 'anthropic/claude-sonnet-4.5', tiers: ['free', 'pro'], caps: ['fast', 'code', 'vision'], priority: 1 },
  { provider: 'cerebras', id: 'gpt-oss-120b', tiers: ['free', 'pro'], caps: ['fast', 'code'], priority: 2 },
  { provider: 'openrouter', id: 'deepseek/deepseek-chat-v3.1', tiers: ['free', 'pro'], caps: ['fast', 'code'], priority: 3 },
  { provider: 'openrouter', id: 'moonshotai/kimi-k2', tiers: ['free', 'pro'], caps: ['fast', 'code'], priority: 4 },
  { provider: 'gemini', id: 'gemini-2.5-flash', tiers: ['free', 'pro'], caps: ['fast', 'vision'], priority: 5 },
  { provider: 'hf', id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', tiers: ['free', 'pro'], caps: ['code'], priority: 6 },
  { provider: 'gemini', id: 'gemini-2.5-pro', tiers: ['free', 'pro'], caps: ['fast', 'code', 'vision'], priority: 7 },
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
