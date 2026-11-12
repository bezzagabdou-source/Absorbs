/** Special DM payloads stored inside messages.content (no schema change needed):
 *  [image]<url>            photo message
 *  [voice]<url>            voice message (audio blob in Storage)
 *  [call|video|125|ok]     call log  (kind | seconds | ok|missed|declined)
 */
export type ParsedMessage =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string }
  | { kind: "voice"; url: string }
  | { kind: "call"; callKind: "audio" | "video"; seconds: number; outcome: string };

export function parseMessage(content: string): ParsedMessage {
  if (content.startsWith("[image]")) return { kind: "image", url: content.slice(7) };
  if (content.startsWith("[voice]")) return { kind: "voice", url: content.slice(7) };
  if (content.startsWith("[call|")) {
    const parts = content.replace(/^\[call\|/, "").replace(/\]$/, "").split("|");
    return {
      kind: "call",
      callKind: parts[0] === "video" ? "video" : "audio",
      seconds: Number(parts[1] ?? 0) || 0,
      outcome: parts[2] ?? "ok",
    };
  }
  return { kind: "text", text: content };
}

export function messagePreview(content: string): string {
  const parsed = parseMessage(content);
  switch (parsed.kind) {
    case "image":
      return "صورة";
    case "voice":
      return "رسالة صوتية";
    case "call":
      return parsed.callKind === "video" ? "مكالمة فيديو" : "مكالمة صوتية";
    default:
      return parsed.text;
  }
}

export function formatCallDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
