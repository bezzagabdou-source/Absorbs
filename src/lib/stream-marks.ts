/**
 * Control marks shared by the server (writer) and the browser (reader) of a chat stream.
 * All marks are invisible characters, so an old client that ignores them still shows a clean answer.
 */

/** Everything written before the LAST mark is replaced by what follows it (used when a verified build was repaired). */
export const REPLACE_MARK = "⁣NX_REPLACE⁣";

/** Applies the replace mark: keeps only the text after the last one. */
export function applyReplaceMark(acc: string): string {
  const k = acc.lastIndexOf(REPLACE_MARK);
  return k < 0 ? acc : acc.slice(k + REPLACE_MARK.length);
}

/**
 * Appends a chunk and applies the replace mark, scanning ONLY the new tail (O(chunk), not O(answer)):
 * a 300 KB build with thousands of chunks must not be re-scanned from the start every time.
 */
export function appendChunk(acc: string, chunk: string): string {
  let next = acc + chunk;
  for (;;) {
    const from = Math.max(0, acc.length - REPLACE_MARK.length);
    const k = next.indexOf(REPLACE_MARK, from);
    if (k < 0) return next;
    next = next.slice(k + REPLACE_MARK.length);
    acc = ""; // everything before the mark is gone: continue scanning the remainder from its start
  }
}
