/** Client-side preparation of chat attachments (Pro). Nothing here touches the network. */
import { readZip, zipToPrompt } from "@/lib/zip";

export type PendingFile = {
  id: number;
  name: string;
  kind: "image" | "pdf" | "text";
  /** image / pdf → base64 payload */
  mime?: string;
  data?: string;
  /** text / code → file content */
  text?: string;
  /** small object-URL preview for images */
  preview?: string;
};

export type FileProblem = "big" | "bad";

const TEXT_EXT = new Set([
  "txt","md","markdown","csv","tsv","json","jsonl","xml","yaml","yml","toml","ini","env","log",
  "js","jsx","ts","tsx","mjs","cjs","html","htm","css","scss","sass","less","vue","svelte",
  "py","java","kt","swift","c","h","cpp","hpp","cs","go","rs","rb","php","sh","bash","zsh","bat",
  "sql","r","lua","dart","scala","pl","gradle","dockerfile","gitignore","properties","conf",
]);

const MAX_PDF = 2_500_000; // bytes
const MAX_TEXT = 200_000; // bytes
const MAX_ZIP = 12_000_000; // bytes (read locally, only the text inside is sent)
const MAX_IMG_SIDE = 1600;

let counter = 0;

function extOf(name: string): string {
  const base = name.toLowerCase().split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1) : base; // "Dockerfile" → "dockerfile"
}

function readB64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Downscales to ≤1600px and re-encodes as JPEG: smaller upload, same readability. */
async function prepareImage(file: File): Promise<PendingFile> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMG_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff"; // transparent PNGs → white, not black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", 0.85)
  );
  return {
    id: ++counter,
    name: file.name || "image.jpg",
    kind: "image",
    mime: "image/jpeg",
    data: await readB64(blob),
    preview: URL.createObjectURL(blob),
  };
}

export async function prepareFile(
  file: File
): Promise<{ ok: true; file: PendingFile } | { ok: false; problem: FileProblem }> {
  try {
    if (file.type.startsWith("image/")) {
      return { ok: true, file: await prepareImage(file) };
    }
    if (file.type === "application/pdf" || extOf(file.name) === "pdf") {
      if (file.size > MAX_PDF) return { ok: false, problem: "big" };
      return {
        ok: true,
        file: {
          id: ++counter,
          name: file.name,
          kind: "pdf",
          mime: "application/pdf",
          data: await readB64(file),
        },
      };
    }
    if (extOf(file.name) === "zip" || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
      if (file.size > MAX_ZIP) return { ok: false, problem: "big" };
      const r = await readZip(file);
      if (r.files.length === 0) return { ok: false, problem: "bad" };
      return {
        ok: true,
        file: { id: ++counter, name: file.name, kind: "text", text: zipToPrompt(file.name, r) },
      };
    }
    const isText =
      file.type.startsWith("text/") ||
      file.type === "application/json" ||
      TEXT_EXT.has(extOf(file.name));
    if (isText) {
      if (file.size > MAX_TEXT) return { ok: false, problem: "big" };
      const text = await file.text();
      if (!text.trim()) return { ok: false, problem: "bad" };
      return { ok: true, file: { id: ++counter, name: file.name, kind: "text", text } };
    }
    return { ok: false, problem: "bad" };
  } catch {
    return { ok: false, problem: "bad" };
  }
}

/** Sum of base64 sizes — must stay under the server's 4,000,000 limit. */
export function payloadSize(files: PendingFile[]): number {
  return files.reduce((n, f) => n + (f.data?.length ?? 0), 0);
}
export const MAX_PAYLOAD = 3_900_000;
export const MAX_FILES = 4;

/** Pulls the playable HTML out of an AI reply (the ```html block). */
export function extractHtml(reply: string): string | null {
  const m = reply.match(/```html\s*\n([\s\S]*?)(?:```|$)/i);
  const code = m?.[1]?.trim();
  if (code && /<(canvas|body|script|div|html)/i.test(code)) return code;
  const raw = reply.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
  return raw ? raw[0] : null;
}
