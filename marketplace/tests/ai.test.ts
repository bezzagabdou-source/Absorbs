import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiAssistInputSchema } from "@/features/ai/schema";
import { assist, parseAiResponse } from "@/features/ai/service";
import { offlineAnswer } from "@/features/ai/offline";

/** Provider keys the suite touches; every test starts from a clean slate. */
const KEYS = [
  "AI_PROVIDER", "AI_MODEL", "AI_API_KEY", "AI_API_URL",
  "GEMINI_API_KEY", "GOOGLE_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY",
  "MISTRAL_API_KEY", "CEREBRAS_API_KEY", "TOGETHER_API_KEY", "DEEPSEEK_API_KEY",
  "XAI_API_KEY", "OPENAI_API_KEY",
];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const key of KEYS) { saved[key] = process.env[key]; delete process.env[key]; } });
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const geminiBody = (text: string) => JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }] });
const openAiBody = (text: string, finish = "stop") => JSON.stringify({ choices: [{ finish_reason: finish, message: { content: text } }] });

describe("AI assistant", () => {
  it("validates requests and rejects extra fields", () => {
    expect(aiAssistInputSchema.parse({ mode: "search", prompt: "phone in Algiers", locale: "en" }).mode).toBe("search");
    expect(() => aiAssistInputSchema.parse({ mode: "search", prompt: "phone", locale: "en", apiKey: "x" })).toThrow();
  });

  it("validates provider JSON and rejects unsafe incomplete drafts", () => {
    expect(parseAiResponse('```json\n{"keywords":["phone"],"advice":"Use the wilaya filter."}\n```').keywords).toEqual(["phone"]);
    expect(() => parseAiResponse('{"title":"Phone","keywords":[],"advice":"x"}')).toThrow();
    expect(() => parseAiResponse("not json")).toThrow();
  });

  it("calls Gemini server-side and never exposes the key in the request body", async () => {
    process.env.GEMINI_API_KEY = "test-secret";
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("generativelanguage.googleapis.com");
      expect(init?.headers).toMatchObject({ "x-goog-api-key": "test-secret" });
      expect(String(init?.body)).not.toContain("test-secret");
      return new Response(geminiBody('{"keywords":["هاتف"],"advice":"استعمل فلتر الولاية وتحقق من السلعة."}'), { status: 200 });
    });
    const result = await assist({ mode: "search", prompt: "هاتف في الجزائر", locale: "ar" }, fetcher as unknown as typeof fetch);
    expect(result.keywords).toEqual(["هاتف"]);
    expect(result.source).toBe("ai");
    expect(result.provider).toBe("Google Gemini");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("marks the answer offline when the provider fails, and still answers", async () => {
    process.env.GEMINI_API_KEY = "test-gemini";
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { status: "UNAVAILABLE" } }), { status: 503 }));
    const result = await assist({ mode: "safety", prompt: "advance payment?", locale: "en" }, fetcher as unknown as typeof fetch);
    expect(result.source).toBe("offline");
    expect(result.advice.length).toBeGreaterThan(0);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects a truncated provider answer and falls back to the offline advisor", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "test-groq";
    const fetcher = vi.fn(async () => new Response(openAiBody('{"keywords":["x"]}', "length"), { status: 200 }));
    const result = await assist({ mode: "search", prompt: "laptop", locale: "en" }, fetcher as unknown as typeof fetch);
    expect(result.source).toBe("offline");
  });

  it("answers without any provider instead of failing", async () => {
    const result = await assist({ mode: "safety", prompt: "advance payment?", locale: "en" });
    expect(result.source).toBe("offline");
    expect(result.advice.toLowerCase()).toMatch(/public|payer|دفع/);
  });

  it("drafts a listing title and keywords offline for Arabic and French input", () => {
    const arabic = offlineAnswer("listing", "ايفون 13 برو 128 Go مستعمل حالة جيدة 85000 دج", "ar", { listingCount: 42 });
    expect(arabic.title).toContain("ايفون 13");
    expect(arabic.keywords.length).toBeGreaterThan(0);
    const french = offlineAnswer("listing", "Macbook air m2 13 pouces comme neuf 260000 DA", "fr");
    expect(french.title).toContain("Macbook air m2");
    expect((french.description ?? "").length).toBeGreaterThan(20);
  });
});
