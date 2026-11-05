import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { getServerStatus } from "@/lib/opencode/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const exec = promisify(execFile);

function tail(value: string | undefined, max = 1800): string {
  if (!value) return "";
  const trimmed = value.trim();
  return trimmed.length > max ? `…${trimmed.slice(-max)}` : trimmed;
}

/**
 * POST /api/opencode/restart
 * Runs scripts/opencode/start-opencode.sh --restart (stop + start + health wait)
 * and returns the fresh server status.
 */
export async function POST() {
  const script = path.join(process.cwd(), "scripts", "opencode", "start-opencode.sh");
  if (!existsSync(script)) {
    return Response.json(
      { ok: false, error: "لم يتم العثور على سكربت تشغيل السيرفر" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { stdout, stderr } = await exec("bash", [script, "--restart"], {
      cwd: process.cwd(),
      timeout: 90_000,
      env: process.env,
      maxBuffer: 1024 * 1024,
    });

    const status = await getServerStatus();
    return Response.json(
      {
        ok: status.connected,
        status,
        message: status.connected
          ? "تم إعادة تشغيل السيرفر بنجاح"
          : "تم تنفيذ أمر إعادة التشغيل لكن السيرفر لا يستجيب",
        output: tail(stdout) || tail(stderr),
      },
      { status: status.connected ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    const detail = tail(err.stderr) || tail(err.stdout) || err.message;
    return Response.json(
      {
        ok: false,
        error: "فشلت إعادة تشغيل السيرفر",
        detail,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
