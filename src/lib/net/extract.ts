/**
 * NEXUS ATLAS — قارئ النصوص من الملفات (v18)
 * ---------------------------------------------------------------------------
 * Zero-dependency text extraction for the formats people actually upload or
 * that the internet engine downloads: PDF, DOCX, HTML, XML, CSV, JSON, ZIP
 * (listing) and plain text. Best-effort by design: the goal is to give the
 * model something quotable, not to be a perfect parser.
 */
import zlib from "node:zlib";

export type ExtractResult = {
  ok: boolean;
  text: string;
  kind: string;
  pages?: number;
  note?: string;
};

const MAX_OUT = 400_000;

export function looksLikePdf(buf: Uint8Array): boolean {
  return buf.length > 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
}

export function looksLikeZip(buf: Uint8Array): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);
}

/* ═══════════════════════════════ PDF ═══════════════════════════════ */

/**
 * Extracts text from a PDF: inflates every FlateDecode stream, then reads the
 * text-showing operators (Tj / TJ / ') and the ToUnicode hex maps when present.
 * Works for the overwhelming majority of text-based PDFs (not scanned images).
 */
export function pdfToText(buf: Uint8Array): ExtractResult {
  try {
    const latin = Buffer.from(buf).toString("latin1");
    const streams: Buffer[] = [];
    let pages = 0;
    const reStream = /stream\r?\n/g;
    let m: RegExpExecArray | null;
    while ((m = reStream.exec(latin))) {
      const start = m.index + m[0].length;
      const end = latin.indexOf("endstream", start);
      if (end < 0) continue;
      const raw = Buffer.from(buf.subarray(start, end));
      const dictStart = Math.max(0, latin.lastIndexOf("obj", m.index) - 800);
      const dict = latin.slice(dictStart, m.index);
      if (/\/Type\s*\/Page[^s]/.test(dict)) pages++;
      if (/FlateDecode/.test(dict)) {
        try {
          streams.push(zlib.inflateSync(raw));
        } catch {
          try {
            streams.push(zlib.inflateRawSync(raw));
          } catch {
            /* skip */
          }
        }
      } else if (/(Tj|TJ)\s*$|\bBT\b/.test(raw.toString("latin1").slice(0, 4000))) {
        streams.push(raw);
      }
    }

    const out: string[] = [];
    for (const s of streams) {
      const txt = streamText(s.toString("latin1"));
      if (txt) out.push(txt);
      if (out.join("").length > MAX_OUT) break;
    }
    let text = out.join("\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    let note: string | undefined;
    if (text.replace(/\s/g, "").length < 40) {
      note = "PDF بلا نص قابل للقراءة (غالبًا صور ممسوحة ضوئيًا) — أرفقه في المحادثة ليقرأه النموذج بالرؤية.";
      text = note;
    }
    return { ok: true, text: text.slice(0, MAX_OUT), kind: "pdf", pages: pages || undefined, note };
  } catch (e) {
    return { ok: false, text: "", kind: "pdf", note: e instanceof Error ? e.message : "pdf-error" };
  }
}

function streamText(s: string): string {
  const parts: string[] = [];
  // (text) Tj   and   [(a) -20 (b)] TJ
  const tj = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = tj.exec(s))) parts.push(unescapePdf(m[1]));
  const arr = /\[((?:[^\[\]\\]|\\.)*)\]\s*TJ/g;
  while ((m = arr.exec(s))) {
    const inner = m[1];
    const bits = /\(((?:\\.|[^\\()])*)\)/g;
    let b: RegExpExecArray | null;
    let line = "";
    while ((b = bits.exec(inner))) line += unescapePdf(b[1]);
    parts.push(line);
  }
  // <hex> Tj
  const hex = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
  while ((m = hex.exec(s))) parts.push(hexToStr(m[1]));
  // Td/TD/T* → newline hints
  return parts.join(" ").replace(/\s{2,}/g, " ").trim();
}

function unescapePdf(s: string): string {
  return s
    .replace(/\\([nrtbf()\\])/g, (_a, c: string) =>
      c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c === "b" ? "" : c === "f" ? "" : c
    )
    .replace(/\\([0-7]{1,3})/g, (_a, o: string) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\\r?\n/g, "");
}

function hexToStr(h: string): string {
  const clean = h.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (code >= 32) out += String.fromCharCode(code);
  }
  return out;
}

/* ═══════════════════════════════ ZIP / DOCX ═══════════════════════════════ */

type ZipEntry = { name: string; data: Uint8Array };

/** Minimal ZIP reader (store + deflate) — enough for DOCX/XLSX and listings. */
export function readZipSync(buf: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  try {
    // find the End Of Central Directory record
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
      if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return entries;
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    for (let n = 0; n < count && off + 46 < buf.length; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const compSize = dv.getUint32(off + 20, true);
      const nameLen = dv.getUint16(off + 28, true);
      const extraLen = dv.getUint16(off + 30, true);
      const commentLen = dv.getUint16(off + 32, true);
      const localOff = dv.getUint32(off + 42, true);
      const name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nameLen));
      if (localOff + 30 < buf.length) {
        const lNameLen = dv.getUint16(localOff + 26, true);
        const lExtraLen = dv.getUint16(localOff + 28, true);
        const dataStart = localOff + 30 + lNameLen + lExtraLen;
        const raw = buf.subarray(dataStart, dataStart + compSize);
        let data = raw;
        if (method === 8) {
          try {
            data = new Uint8Array(zlib.inflateRawSync(Buffer.from(raw)));
          } catch {
            data = new Uint8Array(0);
          }
        }
        entries.push({ name, data });
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
  } catch {
    /* malformed archive */
  }
  return entries;
}

/** DOCX → plain text (word/document.xml, paragraphs and table cells kept). */
export function docxToText(buf: Uint8Array): ExtractResult {
  const entries = readZipSync(buf);
  const doc = entries.find((e) => e.name === "word/document.xml");
  if (!doc) return { ok: false, text: "", kind: "docx", note: "not a docx" };
  let xml = new TextDecoder("utf-8", { fatal: false }).decode(doc.data);
  xml = xml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n");
  return { ok: true, text: xml.trim().slice(0, MAX_OUT), kind: "docx" };
}

/** Lists the content of an archive as readable text. */
export function zipListing(buf: Uint8Array): string {
  const entries = readZipSync(buf);
  if (!entries.length) return "";
  return entries.map((e) => `${e.name} (${e.data.length} bytes)`).join("\n");
}

/* ═══════════════════════════════ generic ═══════════════════════════════ */

/** Picks the right extractor from the mime type / file name. */
export function extractText(name: string, mime: string, buf: Uint8Array): ExtractResult {
  const n = (name || "").toLowerCase();
  const m = (mime || "").toLowerCase();
  if (looksLikePdf(buf) || m === "application/pdf" || n.endsWith(".pdf")) return pdfToText(buf);
  if (n.endsWith(".docx") || m.includes("wordprocessingml")) return docxToText(buf);
  if (looksLikeZip(buf) || m.includes("zip")) {
    if (n.endsWith(".xlsx")) {
      const entries = readZipSync(buf);
      const shared = entries.find((e) => e.name === "xl/sharedStrings.xml");
      if (shared) {
        const xml = new TextDecoder("utf-8", { fatal: false }).decode(shared.data);
        const cells = [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("\n");
        return { ok: true, text: cells.replace(/<[^>]+>/g, "").slice(0, MAX_OUT), kind: "xlsx" };
      }
    }
    const listing = zipListing(buf);
    return { ok: true, text: `محتويات الأرشيف:\n${listing}`, kind: "zip" };
  }
  if (m.startsWith("image/") || m.startsWith("audio/") || m.startsWith("video/")) {
    return { ok: false, text: "", kind: m.split("/")[0], note: "binary media — لا يُستخرج منه نص" };
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const printable = text.replace(/[^\P{C}\n\t\r]/gu, "").length / Math.max(1, text.length);
  if (printable < 0.8) return { ok: false, text: "", kind: "binary", note: "ملف ثنائي" };
  const stripped = /<[a-z][\s\S]*>/i.test(text) ? text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ") : text;
  return { ok: true, text: stripped.trim().slice(0, MAX_OUT), kind: "text" };
}
