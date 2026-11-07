/**
 * Deterministic zipalign for APKs.
 *
 * `zipalign` is not available on every machine, and apksigner rejects an APK
 * whose STORED entries are not 4-byte aligned. This module rewrites the archive
 * in one pass (same order, same names, correct CRC and sizes, 0xD935 alignment
 * extra field) so the result is byte-stable and reproducible.
 */
import { readFile, writeFile } from "node:fs/promises";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

function findEocd(buffer) {
  const start = Math.max(0, buffer.length - 0xffff - 22);
  for (let index = buffer.length - 22; index >= start; index--) {
    if (buffer.readUInt32LE(index) === SIG_EOCD) return index;
  }
  return -1;
}

/** Minimal ZIP reader: enough for APKs produced by aapt2 (no ZIP64, no encryption). */
export function readZip(buffer) {
  const eocd = findEocd(buffer);
  if (eocd < 0) throw new Error("zip_eocd_missing");
  const total = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < total; index++) {
    if (buffer.readUInt32LE(offset) !== SIG_CENTRAL) throw new Error("zip_central_bad");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (flags & 0x1) throw new Error("zip_encrypted");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error("zip64_unsupported");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    // Keep the entry fully uncompressed in memory: the writer re-deflates it,
    // so sizes and CRC always describe the same bytes.
    const data = method === METHOD_DEFLATE ? inflateRawSync(raw) : raw;
    if (data.length !== uncompressedSize) throw new Error(`zip_size_mismatch:${name}`);
    entries.push({ name, method, crc, uncompressedSize, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Writes an aligned, deterministic ZIP. STORED entries start at a 4-byte boundary. */
export function writeAlignedZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const DOS_TIME = 0;
  const DOS_DATE = 0x21; // 1980-01-01
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const method = entry.method === METHOD_STORED ? METHOD_STORED : METHOD_DEFLATE;
    const payload = method === METHOD_STORED ? entry.data : deflateRawSync(entry.data, { level: 9 });
    const crc = entry.crc >>> 0;
    let extra = Buffer.alloc(0);
    if (method === METHOD_STORED) {
      const remainder = (-(offset + 30 + name.length)) & 3;
      extra = Buffer.alloc(4 + remainder);
      extra.writeUInt16LE(0xd935, 0);
      extra.writeUInt16LE(remainder, 2);
    }
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.uncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extra.length, 28);
    chunks.push(local, name, extra, payload);
    central.push({ name, extra, method, crc, payload, offset, uncompressedSize: entry.uncompressedSize });
    offset += local.length + name.length + extra.length + payload.length;
  }
  const centralStart = offset;
  const directory = [];
  for (const item of central) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(SIG_CENTRAL, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(item.method, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(item.crc, 16);
    header.writeUInt32LE(item.payload.length, 20);
    header.writeUInt32LE(item.uncompressedSize, 24);
    header.writeUInt16LE(item.name.length, 28);
    header.writeUInt16LE(item.extra.length, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(item.offset, 42);
    directory.push(header, item.name, item.extra);
  }
  const directoryBuffer = Buffer.concat(directory);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(directoryBuffer.length, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, directoryBuffer, eocd]);
}

export async function alignFile(source, destination) {
  const entries = readZip(await readFile(source));
  const aligned = writeAlignedZip(entries);
  await writeFile(destination, aligned);
  return { entries: entries.length, bytes: aligned.length };
}
