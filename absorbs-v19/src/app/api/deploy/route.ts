import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-click deploy for generated projects.
 *   provider "vercel": creates a production deployment from the files.
 *   provider "github": creates a repo and commits every file in ONE commit.
 * The user's own token travels only inside this request (HTTPS) and is never stored or logged.
 */

const MAX_FILES = 100;
const TOKEN_RE = /^[\w\-.]{20,300}$/;
const PATH_RE = /^[\w.\-/]{1,120}$/;

type F = { path: string; data: string };

function cleanFiles(raw: unknown): F[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FILES) return null;
  const out: F[] = [];
  const seen = new Set<string>();
  for (const f of raw) {
    const x = (f ?? {}) as { path?: unknown; data?: unknown };
    if (typeof x.path !== "string" || typeof x.data !== "string") return null;
    const p = x.path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!PATH_RE.test(p) || p.split("/").some((s) => s === ".." || s === "." || s === "")) return null;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push({ path: p, data: x.data });
  }
  return out;
}

const T = () => AbortSignal.timeout(25_000);

async function gh(token: string, path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`https://api.github.com${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "barq-ai",
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: T(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

async function pushGithub(token: string, repoName: string, files: F[], title: string): Promise<Response> {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repoName)) return json(400, { code: "BAD_REPO_NAME" });
  const made = await gh(token, "/user/repos", {
    method: "POST",
    body: { name: repoName, description: `${title} — generated with Nexus AI v8.4`.slice(0, 300), private: true, auto_init: true },
  });
  if (!made.ok) {
    if (made.status === 401) return json(401, { code: "BAD_TOKEN" });
    if (made.status === 403) return json(403, { code: "TOKEN_SCOPE" });
    if (made.status === 422) return json(422, { code: "REPO_EXISTS" });
    return json(502, { code: "GITHUB_ERROR", detail: String(made.data.message ?? "").slice(0, 200) });
  }
  const full = String(made.data.full_name ?? "");
  const branch = String(made.data.default_branch ?? "main");
  const htmlUrl = String(made.data.html_url ?? "");

  // the fresh repo needs a moment before its first commit is readable
  let baseSha = "";
  for (let i = 0; i < 6 && !baseSha; i++) {
    const ref = await gh(token, `/repos/${full}/git/ref/heads/${branch}`);
    const sha = (ref.data.object as { sha?: string } | undefined)?.sha;
    if (ref.ok && sha) baseSha = sha;
    else await new Promise((r) => setTimeout(r, 700));
  }
  if (!baseSha) return json(502, { code: "GITHUB_ERROR", detail: "empty repo" });
  const base = await gh(token, `/repos/${full}/git/commits/${baseSha}`);
  const baseTree = (base.data.tree as { sha?: string } | undefined)?.sha;
  if (!base.ok || !baseTree) return json(502, { code: "GITHUB_ERROR" });

  const entries: { path: string; mode: string; type: string; sha: string }[] = [];
  for (let i = 0; i < files.length; i += 6) {
    const chunk = files.slice(i, i + 6);
    const done = await Promise.all(
      chunk.map(async (f) => {
        const b = await gh(token, `/repos/${full}/git/blobs`, { method: "POST", body: { content: f.data, encoding: "utf-8" } });
        return b.ok && typeof b.data.sha === "string" ? { path: f.path, mode: "100644", type: "blob", sha: b.data.sha } : null;
      })
    );
    for (const e of done) {
      if (!e) return json(502, { code: "GITHUB_ERROR", detail: "blob" });
      entries.push(e);
    }
  }
  const tree = await gh(token, `/repos/${full}/git/trees`, { method: "POST", body: { base_tree: baseTree, tree: entries } });
  if (!tree.ok || typeof tree.data.sha !== "string") return json(502, { code: "GITHUB_ERROR", detail: "tree" });
  const commit = await gh(token, `/repos/${full}/git/commits`, {
    method: "POST",
    body: { message: "Initial commit from Nexus AI v8.4", tree: tree.data.sha, parents: [baseSha] },
  });
  if (!commit.ok || typeof commit.data.sha !== "string") return json(502, { code: "GITHUB_ERROR", detail: "commit" });
  const upd = await gh(token, `/repos/${full}/git/refs/heads/${branch}`, { method: "PATCH", body: { sha: commit.data.sha } });
  if (!upd.ok) return json(502, { code: "GITHUB_ERROR", detail: "ref" });
  return json(200, { url: htmlUrl });
}

async function deployVercel(token: string, name: string, files: F[]): Promise<Response> {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "barq-project";
  const res = await fetch("https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: slug,
      target: "production",
      files: files.map((f) => ({ file: f.path, data: f.data })),
      projectSettings: { framework: null },
    }),
    signal: T(),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string; code?: string } };
  if (res.status === 401 || res.status === 403) return json(401, { code: "BAD_TOKEN" });
  if (!res.ok || !data.url) return json(502, { code: "VERCEL_ERROR", detail: String(data.error?.message ?? "").slice(0, 200) });
  return json(200, { url: `https://${data.url}` });
}

export async function POST(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`deploy:${user.uid}`, 6, 60_000).ok) return json(429, { code: "RATE" }, { "Retry-After": "20" });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!TOKEN_RE.test(token)) return json(400, { code: "BAD_TOKEN" });
  const files = cleanFiles(body.files);
  if (!files) return json(400, { code: "BAD_FILES" });
  const name = typeof body.name === "string" ? body.name.slice(0, 100) : "barq-project";
  const title = typeof body.title === "string" ? body.title.slice(0, 80) : "Nexus AI v8.4 project";

  try {
    if (body.provider === "github") return await pushGithub(token, name, files, title);
    if (body.provider === "vercel") return await deployVercel(token, name, files);
    return json(400, { code: "BAD_PROVIDER" });
  } catch (e) {
    console.error("[deploy] failed:", (e as Error).name);
    return json(502, { code: "NETWORK" });
  }
}
