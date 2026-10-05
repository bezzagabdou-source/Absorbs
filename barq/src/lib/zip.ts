/**
 * Tiny dependency-free ZIP toolkit (browser only).
 *  - createZip():  builds a real .zip (stored, UTF-8 names) from text/binary files
 *  - readZip():    reads a user's .zip (stored + deflate via DecompressionStream)
 *  - filesFromReply(): turns the code blocks of an AI answer into a clean project
 */

export type ZipFile = { path: string; data: string | Uint8Array };

const enc = new TextEncoder();

let CRC_TABLE: Uint32Array | null = null;
function crc32(buf: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export function createZip(files: ZipFile[]): Blob {
  const { time, date } = dosDateTime();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.path.replace(/^\/+/, ""));
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], {
    type: "application/zip",
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ------------------------------------------------------------------ */
/* Reading a .zip the user attached                                    */
/* ------------------------------------------------------------------ */

const TEXT_EXT = new Set([
  "txt","md","markdown","csv","tsv","json","jsonl","xml","yaml","yml","toml","ini","env","log",
  "js","jsx","ts","tsx","mjs","cjs","html","htm","css","scss","sass","less","vue","svelte",
  "py","java","kt","swift","c","h","cpp","hpp","cs","go","rs","rb","php","sh","bash","bat",
  "sql","r","lua","dart","scala","gradle","dockerfile","gitignore","properties","conf","webmanifest","prisma",
]);
const SKIP_DIR = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|__pycache__|\.venv|vendor)\//i;
const SKIP_FILE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)|\.map)$/i;

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as unknown as { DecompressionStream?: new (f: string) => GenericTransformStream }).DecompressionStream;
  if (!DS) throw new Error("no DecompressionStream");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DS("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export type ReadZipResult = {
  tree: string[];
  files: { path: string; text: string }[];
  skipped: number;
};

export async function readZip(
  file: File,
  limits = { maxFiles: 120, maxChars: 280_000, maxPerFile: 40_000 }
): Promise<ReadZipResult> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_600); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip");
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder("utf-8");

  const tree: string[] = [];
  const files: { path: string; text: string }[] = [];
  let chars = 0;
  let skipped = 0;

  for (let n = 0; n < total && p + 46 <= buf.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const path = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (path.endsWith("/")) continue;
    if (SKIP_DIR.test(path) || SKIP_FILE.test(path)) {
      skipped++;
      continue;
    }
    tree.push(path);
    const base = path.split("/").pop() ?? path;
    const dot = base.lastIndexOf(".");
    const ext = (dot >= 0 ? base.slice(dot + 1) : base).toLowerCase();
    if (!TEXT_EXT.has(ext) || usize > 400_000) continue;
    if (files.length >= limits.maxFiles || chars >= limits.maxChars) {
      skipped++;
      continue;
    }
    try {
      const nl = dv.getUint16(lho + 26, true);
      const el = dv.getUint16(lho + 28, true);
      const start = lho + 30 + nl + el;
      const raw = buf.subarray(start, start + csize);
      const bytes = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null;
      if (!bytes) continue;
      let text = dec.decode(bytes);
      if (!text.trim()) continue;
      if (text.length > limits.maxPerFile) text = text.slice(0, limits.maxPerFile) + "\n/* … truncated … */";
      chars += text.length;
      files.push({ path, text });
    } catch {
      skipped++;
    }
  }
  return { tree, files, skipped };
}

/** One text payload the chat can send: file tree + every readable file. */
export function zipToPrompt(name: string, r: ReadZipResult): string {
  const head = `ZIP PROJECT "${name}" — ${r.tree.length} files${r.skipped ? ` (${r.skipped} skipped: dependencies/binaries/too big)` : ""}\n\nFILE TREE:\n${r.tree.slice(0, 400).join("\n")}\n`;
  const body = r.files.map((f) => `\n\n===== FILE: ${f.path} =====\n${f.text}`).join("");
  return head + body;
}

/* ------------------------------------------------------------------ */
/* Turning an AI answer into a project                                 */
/* ------------------------------------------------------------------ */

const LANG_EXT: Record<string, string> = {
  html: "html", htm: "html", css: "css", javascript: "js", js: "js", jsx: "jsx", typescript: "ts", ts: "ts",
  tsx: "tsx", json: "json", python: "py", py: "py", bash: "sh", sh: "sh", sql: "sql", php: "php", java: "java",
  go: "go", rust: "rs", c: "c", cpp: "cpp", csharp: "cs", kotlin: "kt", swift: "swift", ruby: "rb", yaml: "yml",
  yml: "yml", markdown: "md", md: "md", xml: "xml", svg: "svg", text: "txt", txt: "txt",
};

export type Block = { lang: string; info: string; code: string };

export function codeBlocks(reply: string): Block[] {
  const out: Block[] = [];
  const re = /```([\w+#-]*)([^\n]*)\n([\s\S]*?)(?:```|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(reply))) {
    const code = m[3].replace(/\n$/, "");
    if (code.trim()) out.push({ lang: m[1].toLowerCase(), info: m[2] ?? "", code });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

/** Splits one big HTML file into index.html + css/style.css + js/app.js (only when it helps). */
export function splitHtml(html: string): ZipFile[] {
  const styles: string[] = [];
  const scripts: string[] = [];
  let out = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, c: string) => {
    styles.push(c.trim());
    return styles.length === 1 ? '<link rel="stylesheet" href="css/style.css">' : "";
  });
  out = out.replace(
    /<script\b(?![^>]*\bsrc\s*=)(?![^>]*type\s*=\s*["']?(?:module|application\/ld\+json|importmap))[^>]*>([\s\S]*?)<\/script>/gi,
    (_m, c: string) => {
      scripts.push(c.trim());
      return scripts.length === 1 ? '<script src="js/app.js" defer></script>' : "";
    }
  );
  const files: ZipFile[] = [{ path: "index.html", data: out }];
  if (styles.length) files.push({ path: "css/style.css", data: styles.join("\n\n") + "\n" });
  if (scripts.length) files.push({ path: "js/app.js", data: scripts.join("\n\n") + "\n" });
  return files;
}

function nameHint(b: Block): string | null {
  const fromInfo = /(?:title|file|filename|name)\s*=\s*["']?([\w./-]+\.\w{1,6})/i.exec(b.info)?.[1];
  if (fromInfo) return fromInfo;
  const first = b.code.split("\n", 1)[0] ?? "";
  const c = /^\s*(?:\/\/|#|\/\*|<!--)\s*(?:file(?:name)?\s*[:=]\s*)?([\w./-]+\.\w{1,6})\s*(?:\*\/|-->)?\s*$/i.exec(first)?.[1];
  return c ?? null;
}

export function filesFromReply(reply: string): ZipFile[] {
  const blocks = codeBlocks(reply);
  if (blocks.length === 0) return [];
  const files: ZipFile[] = [];
  const used = new Set<string>();
  const uniq = (p: string) => {
    if (!used.has(p)) {
      used.add(p);
      return p;
    }
    const dot = p.lastIndexOf(".");
    const stem = dot > 0 ? p.slice(0, dot) : p;
    const ext = dot > 0 ? p.slice(dot) : "";
    let i = 2;
    while (used.has(`${stem}-${i}${ext}`)) i++;
    used.add(`${stem}-${i}${ext}`);
    return `${stem}-${i}${ext}`;
  };

  const htmls = blocks.filter((b) => /^(html|htm)$/.test(b.lang) && /<(html|body|div|canvas|script)/i.test(b.code));
  const onlyOneWebPage = htmls.length === 1 && blocks.length === 1;

  blocks.forEach((b, i) => {
    const hint = nameHint(b);
    if (onlyOneWebPage && b === htmls[0]) {
      for (const f of splitHtml(b.code)) files.push({ path: uniq(f.path), data: f.data });
      return;
    }
    const ext = LANG_EXT[b.lang] ?? "txt";
    const path = hint ?? (ext === "html" && !used.has("index.html") ? "index.html" : `code-${i + 1}.${ext}`);
    files.push({ path: uniq(path), data: b.code + "\n" });
  });

  const prose = reply.replace(/```[\s\S]*?(?:```|$)/g, "").replace(/\n{3,}/g, "\n\n").trim();
  files.push({
    path: "README.md",
    data: `# Nexus AI v8.4 project\n\nGenerated by Nexus AI v8.4 — by abdelrezakbezzag.\n\n${prose ? prose + "\n\n" : ""}## Run\nOpen \`index.html\` in any browser (or serve the folder with any static server).\n`,
  });
  return files;
}

export function zipSizeLabel(files: ZipFile[]): string {
  const n = files.reduce((s, f) => s + (typeof f.data === "string" ? enc.encode(f.data).length : f.data.length), 0);
  return n < 1024 ? `${n} B` : n < 1_048_576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1_048_576).toFixed(2)} MB`;
}


/** Client twin of the server's looksCut(): the answer ended inside a code block. */
export function codeLooksCut(text: string): boolean {
  const fences = (text.match(/```/g) ?? []).length;
  if (fences % 2 === 1) return true;
  for (const b of text.matchAll(/```html[ \t]*\r?\n([\s\S]*?)```/gi)) {
    const code = b[1];
    if (/<html[\s>]/i.test(code) && !/<\/html>\s*$/i.test(code.trim())) return true;
    const open = (code.match(/<script\b/gi) ?? []).length;
    const close = (code.match(/<\/script>/gi) ?? []).length;
    if (open > close) return true;
  }
  return false;
}
