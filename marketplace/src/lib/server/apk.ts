import "server-only";
import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Reads the release APK that ships in `public/app/` so the download page and
 * `/download/apk` can report a real version, size, date and SHA-256 checksum.
 * Cached in-process: the file is immutable for the lifetime of a deployment.
 */
export type ApkInfo = { bytes: number; sha256: string; versionName: string; versionCode: number; updated: string; file: string };

const CANDIDATES = ["DZ-Exchange.apk", "dz-exchange.apk"];

let cached: ApkInfo | null | undefined;

export async function readApkInfo(): Promise<ApkInfo | null> {
  if (cached !== undefined) return cached;
  for (const file of CANDIDATES) {
    const full = path.join(process.cwd(), "public", "app", file);
    try {
      await access(full);
      const [bytes, stats] = await Promise.all([readFile(full), stat(full)]);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      cached = {
        bytes: bytes.byteLength,
        sha256,
        versionName: process.env.APP_VERSION_NAME ?? "1.1",
        versionCode: Number(process.env.APP_VERSION_CODE ?? 2),
        updated: stats.mtime.toISOString().slice(0, 10),
        file,
      };
      return cached;
    } catch { /* try next candidate */ }
  }
  cached = null;
  return null;
}
