"use client";

/**
 * Minimal Server-Sent-Events reader for browser fetch streams.
 * Handles multi-line `data:` frames and `event:` names.
 */
export type SseHandler = (event: string, data: Record<string, unknown>) => void;

export async function readSSE(res: Response, onEvent: SseHandler): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
      }
      if (dataLines.length) {
        try {
          onEvent(event, JSON.parse(dataLines.join("\n")));
        } catch {
          /* malformed frame — skip */
        }
      }
    }
  }
}
