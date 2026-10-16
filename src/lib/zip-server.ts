/**
 * NEXUS ATLAS — ZIP على الخادم (v18)
 * ---------------------------------------------------------------------------
 * Dependency-free ZIP writer (deflate + store) so `/api/files/deliver/[id]?zip=1`
 * can hand the user a real archive of a multi-file project. The browser-side
 * writer lives in `@/lib/zip`; this one returns Node Buffers for HTTP responses.
 */
import zlib from "node:zlib";

export type ZipItem = { path: string; data: string | Uint8Array };

let CRC_TABLE: Int32Array | null = null;

function crc32(buf: Uint8Array): number {
  if (!CRC_TABLE) {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    CRC_TABLE = t;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d = new Date()): { time: number; date: number } {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

/** Builds a real .zip archive. Text files are deflated, binaries are stored. */
export function createZipBuffer(items: ZipItem[], comment = "Nexus AI v18 ATLAS — by abdelrezakbezzag (Algeria)"): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const { time, date } = dosTime();

  for (const item of items) {
    const nameBuf = Buffer.from(item.path.replace(/^\/+/, "") || "file.txt", "utf8");
    const raw = typeof item.data === "string" ? Buffer.from(item.data, "utf8") : Buffer.from(item.data);
    const isText = /\.(html?|css|js|mjs|cjs|ts|tsx|jsx|json|md|txt|csv|tsv|svg|xml|yml|yaml|py|sh|sql)$/i.test(item.path);
    let payload = raw;
    let method = 0;
    if (isText && raw.length > 128) {
      try {
        const def = zlib.deflateRawSync(raw, { level: 9 });
        if (def.length < raw.length) {
          payload = def;
          method = 8;
        }
      } catch {
        payload = raw;
        method = 0;
      }
    }
    const crc = crc32(raw);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8 names
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, payload);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const commentBuf = Buffer.from(comment, "utf8");
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(items.length, 8);
  eocd.writeUInt16LE(items.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(commentBuf.length, 20);

  return Buffer.concat([...locals, centralBuf, eocd, commentBuf]);
}
