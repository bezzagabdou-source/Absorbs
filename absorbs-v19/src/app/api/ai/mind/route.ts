import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { readMind, mindChips, mindChipLabels, mindNeedsClarification, mindTelemetry, mindSummary } from "@/lib/mind";
import { award } from "@/lib/mastery";
import { db } from "@/db";
import { mindEvents } from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_TEXT = 12_000;

/**
 * POST { text } → the full MIND reading for one draft.
 *
 * This is the endpoint behind the 🧠 button: it shows the user, before they
 * send anything, exactly how the platform understood the request (language,
 * intent, entities, confidence, what is missing) and offers one-tap chips.
 *
 * The same reading is re-computed server-side inside /api/ai/chat, so the UI
 * can never drift from what the model is actually told.
 */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`mind:${user.uid}`, 40, 60_000).ok) return json(429, { code: "RATE" });

  let body: { text?: unknown; log?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const text = typeof body.text === "string" ? body.text.slice(0, MAX_TEXT) : "";
  if (!text.trim()) return json(400, { code: "EMPTY_TEXT" });

  const reading = readMind(text);

  // Telemetry + XP are best-effort: a DB outage must never fail a reading.
  if (body.log !== false) {
    const t = mindTelemetry(reading);
    db.insert(mindEvents)
      .values({
        userId: user.uid,
        kind: "mind",
        intent: t.intent,
        lang: t.lang,
        confidence: t.confidence,
        ms: t.ms,
        payload: t.payload,
      })
      .execute()
      .catch(() => undefined);
    void award(user.uid, "mind_read").catch(() => undefined);
  }

  try {
    await ensureUser(user).catch(() => undefined);
  } catch {
    /* offline / no DB — still answer */
  }

  return json(200, {
    reading: {
      language: reading.language,
      languageMix: reading.languageMix,
      script: reading.script,
      arabizi: reading.arabizi,
      intent: reading.intent,
      intentLabel: reading.intentLabel,
      altIntent: reading.altIntent,
      altIntentLabel: reading.altIntentLabel,
      confidence: reading.confidence,
      domain: reading.domain,
      sentiment: reading.sentiment,
      urgency: reading.urgency,
      complexity: reading.complexity,
      deliverable: reading.deliverable,
      audience: reading.audience,
      entities: reading.entities,
      keywords: reading.keywords,
      words: reading.words,
      explain: reading.explain,
      corrections: reading.corrections,
      protectedSpans: reading.protectedSpans,
      missing: reading.missing,
      normalized: reading.normalized.slice(0, 4000),
      ms: reading.ms,
    },
    chips: mindChips(reading),
    chipLabels: mindChipLabels(reading),
    summary: mindSummary(reading),
    needsClarification: mindNeedsClarification(reading),
  });
}

export async function GET() {
  // A tiny, dependency-free demo so anyone can see the engine work without a login.
  const sample = "salam, bghit n3mel jeu b html 3labalek? 4500 دج في وهران";
  const r = readMind(sample);
  return json(200, { sample, summary: `${r.intent}@${r.confidence}% ${r.language}`, explain: r.explain });
}
