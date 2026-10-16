/**
 * NEXUS APEX — the wire format between the engine and the chat UI.
 *
 * A build result travels as ONE compact line the model never sees and the user
 * never reads:
 *
 *   ⟦APEX:{"slug":"…","title":"…","lines":53137,…}⟧
 *
 * The chat streams a few lines of prose *plus* this mark; the UI turns the mark
 * into a real project card (live preview, ZIP, publish). Keeping it a single
 * line means the marker survives streaming, retries and copy/paste intact.
 */

export interface ApexMark {
  slug: string;
  title: string;
  tagline?: string;
  blueprint: string;
  kind: string;
  emoji?: string;
  palette?: string;
  lines: number;
  files: number;
  modules: number;
  bytes: number;
  dataRows: number;
  score: number;
  pages: number;
  buildMs: number;
  visibility?: string;
  url?: string;
}

const MARK_RE = /⟦APEX:(\{[\s\S]*?\})⟧/;

/** Reads the mark out of an assistant message (null when there is none). */
export function apexMark(content: string): ApexMark | null {
  const hit = MARK_RE.exec(content || "");
  if (!hit) return null;
  try {
    const parsed = JSON.parse(hit[1]) as ApexMark;
    if (!parsed || typeof parsed.slug !== "string" || !parsed.slug) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Removes the mark so the prose stays clean. Also hides a *partial* mark while
 * the answer is still streaming (the tail arrives token by token).
 */
export function stripApexMark(content: string): string {
  return (content || "")
    .replace(MARK_RE, "")
    .replace(/⟦APEX:[\s\S]*$/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Serialises a build result for the wire. */
export function encodeApexMark(mark: ApexMark): string {
  return `⟦APEX:${JSON.stringify(mark)}⟧`;
}

/** Live URL helpers (relative, so they work on any host). */
export function apexLiveUrl(slug: string): string {
  return `/p/${slug}`;
}
export function apexEmbedUrl(slug: string): string {
  return `/p/${slug}?embed=1`;
}
