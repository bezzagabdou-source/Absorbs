/**
 * NEXUS FORGE v19 — حزمة الرابط المحمول (pure, no DB, no server APIs)
 * ---------------------------------------------------------------------------
 * The portable live link carries the whole project inside the URL *fragment*
 * (`/live/portable#d=…`), so it works with zero storage: the fragment is never
 * sent to a server, the browser inflates it and runs it in a sandbox.
 *
 * Codec: raw DEFLATE (level 9) → base64url. The browser side uses
 * `DecompressionStream("deflate-raw")`, which is exactly this format.
 */
import zlib from "node:zlib";

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export const isSlug = (s: string): boolean => typeof s === "string" && /^[a-z0-9][a-z0-9-]{2,63}$/.test(s);

/** `My Cool Game` → `my-cool-game-x7k2p` (Arabic titles keep a readable head). */
export function slugify(title: string, rand = ""): string {
  const base = String(title ?? "")
    .toLowerCase()
    .replace(/[\u0600-\u06FF]+/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34);
  const tail =
    rand || Array.from({ length: 5 }, () => SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)]).join("");
  const head = base && base.length > 2 ? base : "nexus";
  return `${head}-${tail}`.slice(0, 48);
}

/** A filename-safe version of a title (Arabic letters kept, Arabic punctuation dropped). */
export function fileSlug(title: string): string {
  return (
    String(title ?? "")
      .replace(/[^\w\u0621-\u064A\u0660-\u0669\-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "nexus-site"
  );
}

export function packPortable(html: string): string {
  return zlib.deflateRawSync(Buffer.from(html, "utf8"), { level: 9 }).toString("base64url");
}

export function unpackPortable(payload: string): string {
  const clean = String(payload ?? "").replace(/[^A-Za-z0-9_\-]/g, "");
  return zlib.inflateRawSync(Buffer.from(clean, "base64url")).toString("utf8");
}

/** Builds the full portable URL for a given site origin. */
export function portableHref(origin: string, html: string, title: string): { url: string; bytes: number; packed: number; ratio: number } {
  const packed = packPortable(html);
  const bytes = Buffer.byteLength(html, "utf8");
  const base = String(origin ?? "").replace(/\/+$/, "");
  return {
    url: `${base}/live/portable#d=${packed}&t=${encodeURIComponent(String(title ?? "مشروع Nexus").slice(0, 80))}`,
    bytes,
    packed: packed.length,
    ratio: bytes ? packed.length / bytes : 0,
  };
}
