/** قراءة الإعدادات الحسّاسة من البيئة (متغيّرات Vercel) — لا قيم مكتوبة داخل الكود. */

const clean = (v?: string | null) => (v ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();

export const env = {
  get botToken(): string {
    return clean(process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
  },
  get adminPassword(): string {
    return clean(process.env.ADMIN_PASSWORD);
  },
  get authSecret(): string {
    return clean(process.env.AUTH_SECRET) || clean(process.env.ADMIN_PASSWORD) || "mx-default-secret";
  },
  get webhookSecret(): string {
    return clean(process.env.WEBHOOK_SECRET) || "mx-hook";
  },
  get redisUrl(): string {
    const names = [
      "REDIS_URL",
      "KV_REST_API_URL_RAW",
      "UPSTASH_REDIS_URL",
      "STORAGE_REDIS_URL",
    ];
    for (const n of names) {
      const v = clean(process.env[n]);
      if (/^rediss?:\/\//i.test(v)) return v;
    }
    // آخر محاولة: أي متغيّر يبدو رابط redis
    for (const [k, v0] of Object.entries(process.env)) {
      const v = clean(v0);
      if (k.startsWith("NEXT_PUBLIC_")) continue;
      if (/^rediss?:\/\//i.test(v)) return v;
    }
    return "";
  },
  get blobToken(): string {
    return clean(process.env.BLOB_READ_WRITE_TOKEN);
  },
  /** مهلة عامة لأي نداء خارجي (تيليجرام / Redis) حتى لا يتعلّق أي طلب */
  get httpTimeoutMs(): number {
    const n = Number(clean(process.env.EXTERNAL_TIMEOUT_MS));
    return Number.isFinite(n) && n >= 1000 ? Math.min(n, 25000) : 9000;
  },
  get siteUrl(): string {
    const explicit = clean(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL);
    if (explicit) return explicit.replace(/\/+$/, "");
    const prod = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL);
    if (prod) return `https://${prod.replace(/^https?:\/\//, "")}`;
    const v = clean(process.env.VERCEL_URL);
    if (v) return `https://${v.replace(/^https?:\/\//, "")}`;
    return "http://localhost:3000";
  },
  get isVercel(): boolean {
    return Boolean(process.env.VERCEL);
  },
  get adminChatId(): string {
    return clean(process.env.ADMIN_CHAT_ID);
  },
};

export const AI_KEYS: { name: string; env: string; label: string }[] = [
  { name: "gemini", env: "GEMINI_API_KEY", label: "Gemini" },
  { name: "openrouter", env: "OPENROUTER_API_KEY", label: "OpenRouter" },
  { name: "groq", env: "GROQ_API_KEY", label: "Groq" },
  { name: "deepseek", env: "DEEPSEEK_API_KEY", label: "DeepSeek" },
  { name: "xai", env: "XAI_API_KEY", label: "Grok" },
  { name: "openai", env: "OPENAI_API_KEY", label: "OpenAI" },
  { name: "anthropic", env: "ANTHROPIC_API_KEY", label: "Claude" },
  { name: "cerebras", env: "CEREBRAS_API_KEY", label: "Cerebras" },
  { name: "huggingface", env: "HF_TOKEN", label: "HuggingFace" },
];

export function detectAIProviders(): { name: string; label: string; configured: boolean }[] {
  return AI_KEYS.map((k) => ({ name: k.name, label: k.label, configured: Boolean(clean(process.env[k.env])) }));
}
