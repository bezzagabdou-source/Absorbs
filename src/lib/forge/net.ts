/**
 * NEXUS FORGE v19 — الإنترنت داخل الورشة
 * ---------------------------------------------------------------------------
 * When the user asks for a site with pictures, a game with sound, a shop with
 * product photos… the Forge does not let the model invent URLs. It searches the
 * open web (Openverse, Wikimedia Commons, Pixabay, Pexels, Freesound, Internet
 * Archive — no key required for most of them) and hands the builders a real,
 * licensed asset list with attribution, plus the rules for using it safely.
 *
 * Auto-detection: the request is scanned in Arabic, Darija, French and English.
 */
import { findMedia, mediaBlock, type MediaAsset } from "@/lib/net/media";

const IMG_RE =
  /(صور[ةه]?|صور|خلفي[ةه]|backgrounds?|images?|photos?|imgs?|logo|شعار|أيقون|ايقون|icons?|illustrations?|رسوم|banner|لافتة|منتج|produits?|pictures?|artwork|gallery|معرض|galerie|visuel)/i;
const AUD_RE = /(أصوات|اصوات|صوت|موسيق[ىى]|music|musique|sound\s?effects?|sfx|audio|نغم|ringtone|voice\s?over|تعليق صوتي)/i;
const DATA_RE = /(بيانات حقيقية|real data|dataset|api|مصادر|references|مراجع|إحصائي|stats|statistics)/i;

export const wantsImages = (prompt: string) => IMG_RE.test(prompt);
export const wantsAudio = (prompt: string) => AUD_RE.test(prompt);
export const wantsData = (prompt: string) => DATA_RE.test(prompt);

/** Builds 1–3 short search queries out of the request (stops words dropped). */
export function queriesFrom(prompt: string, max = 3): string[] {
  const STOP = new Set(
    (
      "ابي ابغى اريد نبي بغيت عطني سويلي اصنعلي صمم صمملي اعمل اعمللي عمل build make create design generate site website page app application game لعبة موقع صفحة تطبيق نظام platform with and for the of a an une un des le la les avec pour et dans من في على الى إلى عن عبر " +
      "html css js javascript react next tailwind كامل كامله احترافي احترافية ضخم ضخمه كبير كبيره real working free open source nexus v19 2026"
    ).split(/\s+/)
  );
  const words = prompt
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()));
  if (!words.length) return [];

  const out: string[] = [];
  // the longest noun-ish chunks first
  const chunk = words.slice(0, 6).join(" ");
  if (chunk) out.push(chunk);
  const theme = words.filter((w) => !IMG_RE.test(w) && !AUD_RE.test(w)).slice(0, 3).join(" ");
  if (theme && theme !== chunk) out.push(theme);
  out.push(words[0]);
  return Array.from(new Set(out)).slice(0, max);
}

export type ForgeNetHint = {
  text: string;
  source: string;
  images: MediaAsset[];
  audio: MediaAsset[];
  wanted: { images: boolean; audio: boolean; data: boolean };
};

/** Searches the open web and returns the block the builders receive. */
export async function forgeNetHint(o: { prompt: string; limit?: number; signal?: AbortSignal }): Promise<ForgeNetHint> {
  const prompt = o.prompt ?? "";
  const wanted = { images: wantsImages(prompt), audio: wantsAudio(prompt), data: wantsData(prompt) };
  const qs = queriesFrom(prompt, 2);
  const limit = Math.min(10, Math.max(3, o.limit ?? 6));

  let images: MediaAsset[] = [];
  let audio: MediaAsset[] = [];

  if (!wanted.images && !wanted.audio && !wanted.data) {
    return { text: "", source: "none", images, audio, wanted };
  }

  const jobs: Promise<void>[] = [];
  if (wanted.images && qs.length) {
    jobs.push(
      (async () => {
        const all = await Promise.all(qs.map((q) => findMedia({ query: q, kind: "image", limit, signal: o.signal }).catch(() => [] as MediaAsset[])));
        images = dedupe(all.flat()).slice(0, limit);
      })()
    );
  }
  if (wanted.audio && qs.length) {
    jobs.push(
      (async () => {
        const q = qs[0] ?? prompt.slice(0, 40);
        audio = dedupe(await findMedia({ query: `${q} sound effect`, kind: "audio", limit: 5, signal: o.signal }).catch(() => [] as MediaAsset[]));
      })()
    );
  }
  await Promise.all(jobs);

  const blocks: string[] = [];
  if (images.length) blocks.push(mediaBlock(images, "real, openly-licensed images — use these URLs"));
  if (audio.length) blocks.push(mediaBlock(audio, "real, openly-licensed audio — use these URLs"));

  let text = blocks.join("\n");
  if (text) {
    text += `

HOW TO USE THEM IN THE BUILD (mandatory)
- Use ONLY the URLs listed above. NEVER invent, guess or "remember" an image or audio URL — a made-up URL is a broken build.
- Every <img> gets: alt text in the project language, loading="lazy", decoding="async", width/height (or aspect-ratio in CSS),
  and onerror="this.style.display='none';this.nextElementSibling&&this.nextElementSibling.classList.remove('hidden')" with a CSS/SVG
  fallback block right after it, so the page still looks perfect if the network is offline.
- Put the credit line of each asset in the footer (small, muted text) — the license requires it.
- Audio: preload="none", started only after a user gesture, wrapped in try/catch, with a mute button persisted in localStorage.
- If the list above does not contain what a section needs, DRAW IT with CSS gradients and inline SVG instead of using a URL.
- Prefer 2–6 strong assets over 30 weak ones, and reuse them across sections with different crops/filters.`;
  } else if (wanted.images || wanted.audio) {
    text = `INTERNET ASSETS: the open-web search returned nothing usable for this request.
Draw every visual with CSS gradients, shapes and inline SVG (no external image URLs at all), and synthesize every sound with the Web Audio API.
NEVER invent an image or audio URL.`;
  }

  return { text, source: images.length || audio.length ? "openverse+commons+pixabay+pexels+freesound+archive" : "none", images, audio, wanted };
}

function dedupe(list: MediaAsset[]): MediaAsset[] {
  const seen = new Set<string>();
  const out: MediaAsset[] = [];
  for (const a of list) {
    const k = a.url.split("?")[0].toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}
