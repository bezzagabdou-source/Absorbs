/**
 * NEXUS FORGE v20 — التفكير الحقيقي (pure, client-safe)
 * ---------------------------------------------------------------------------
 * Reasoning engines (the open-source ones included) wrap their chain of thought
 * in <think> / <thinking> / <reasoning> / <thoughts>. These helpers pull that text
 * out — whole answers (`splitThink`) or live stream deltas (`thinkTap`) — and
 * nothing else. No import, no I/O, no invented reasoning: when an engine sends
 * no thinking block the result is an empty string and the UI shows nothing.
 */

const THINK_RE = /<(?:think|thinking|reasoning|thoughts)>([\s\S]*?)<\/(?:think|thinking|reasoning|thoughts)>/gi;

/** Splits a finished answer into the reasoning it really emitted + the payload. */
export function splitThink(text: string): { think: string; body: string } {
  const parts: string[] = [];
  let body = text;
  THINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = THINK_RE.exec(text))) {
    const t = m[1].trim();
    if (t) parts.push(t);
  }
  if (parts.length) body = text.replace(THINK_RE, "").trim();
  return { think: parts.join("\n"), body };
}

/** True when the answer carries a reasoning block at all. */
export function hasThink(text: string): boolean {
  THINK_RE.lastIndex = 0;
  return THINK_RE.test(text);
}

/**
 * Live thinking extractor: feed it the raw stream deltas and it calls `onThink`
 * with the reasoning text as it arrives (and keeps it out of the payload).
 * A 12/24-character tail is held back so a tag split across chunks survives.
 */
export function thinkTap(onThink: (d: string) => void): (d: string) => void {
  let buf = "";
  let inside = false;
  return (d: string) => {
    buf += d;
    for (;;) {
      if (!inside) {
        const open = /<(?:think|thinking|reasoning|thoughts)>/i.exec(buf);
        if (!open) {
          if (buf.length > 24) buf = buf.slice(-24);
          return;
        }
        buf = buf.slice(open.index + open[0].length);
        inside = true;
        continue;
      }
      const close = /<\/(?:think|thinking|reasoning|thoughts)>/i.exec(buf);
      if (close) {
        if (close.index > 0) onThink(buf.slice(0, close.index));
        buf = buf.slice(close.index + close[0].length);
        inside = false;
        continue;
      }
      if (buf.length > 12) {
        onThink(buf.slice(0, buf.length - 12));
        buf = buf.slice(buf.length - 12);
      }
      return;
    }
  };
}

/* ------------------------------------------------------------------ *
 * DUO — the two engines that write together on the fast path
 * ------------------------------------------------------------------ */

/** The subset of an engine entry the DUO choice needs. */
export type DuoCandidate = { key: string; rank: number; quick?: boolean; open?: boolean; free?: boolean };

/**
 * Scores the reachable builders and returns exactly two: the fastest first.
 * `quick` dominates (a fast engine must lead), then rank, then a small bonus for
 * open-weight and free-tier engines so the DUO stays cheap and quick.
 */
export function pickDuo<T extends DuoCandidate>(pool: T[]): [T, T] | [] {
  const scored = pool.map((m) => ({ m, s: (m.quick ? 100 : 0) + m.rank + (m.open ? 4 : 0) + (m.free ? 2 : 0) }));
  scored.sort((a, b) => b.s - a.s);
  const a = scored[0]?.m;
  if (!a) return [];
  const b = scored.find((x) => x.m.key !== a.key)?.m ?? a;
  return [a, b];
}
