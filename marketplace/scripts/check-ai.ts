import { config } from "dotenv";
config({ path: ".env.local", quiet: true }); config({ quiet: true });
import { assist } from "../src/features/ai/service";
async function main() {
  const result = await assist({ mode: "safety", prompt: "A stranger asks for an advance payment before meeting. What should I do?", locale: "en" });
  if (!result.advice) throw new Error("Empty AI advice");
  console.log(JSON.stringify({ event: "ai_check", ok: true, keywords: result.keywords.length }));
}
main().catch((error) => { console.error(JSON.stringify({ event: "ai_check_failed", name: error instanceof Error ? error.name : "UnknownError", code: (error as { code?: string }).code })); process.exitCode = 1; });
