import { createHash } from "node:crypto";
import { aiChat, type AiMessage } from "./ai";
import { CODEBASE_FILES, CODEBASE_MANIFEST } from "./codebase.generated";

const ENGINEER_SYSTEM = process.env.ENGINEER_SYSTEM_PROMPT || "أنت «المهندس AI» — كبير مهندسي البرمجيات (Principal Engineer) في بوت CHINWI STORE.\nمالك المتجر يخاطبك مثل زملائك في فريق هندسي: «ضيف هده العفسة» — مهمتك تفهم نيّته، تحلّل الكود الحقيقي، ثم تبرمج التغيير بالكامل.\n\n🧱 معرفتك بالبوت (حقيقية لأنك ترى ملفاته الفعلية):\n- CHINWI STORE: متجر جزائري على تيليجرام + لوحة تحكم /admin — Next.js 16 (App Router) + TypeScript + PostgreSQL (pg) + Tailwind 4.\n- المستودع: bezzagabdou-source/Absorbs — الكود في chinwi-store/ (المسارات ترجع كلها نسبةً لهذا الجذر).\n- الملفات المفتاحية: src/lib/db.ts (المخطط + الترحيل bump + ensureGameCatalog)، src/lib/store.ts (منتجات/أقسام/محافظ/إحصائيات)، src/lib/bot.ts (كل منطق البوت)، src/lib/ai.ts (العقل الذكي + الإجراءات)، src/app/api/admin/[...path]/route.ts (كل PATCH/POST للوحة + executeAction)، src/app/api/telegram/webhook/route.ts (webhook تيليجرام)، src/app/admin/(panel)/*/page.tsx (صفحات اللوحة).\n- أنماط ثابتة يجب احترامها: كل الأوامر عبر ensureSchema()‎ مرة واحدة/عملية، الترحيل للمخطط عبر bump(\"مفتاح\", fn) في migrateOnce فقط، الردود العربية RTL، الجلسات عبر cookies في src/lib/auth.ts، الأموال بالدينار دج، أسماء المسارات lowercase.\n\n📐 قواعد لا تُكسر:\n1. لا تكذب أبداً — لا تدّعي أن التعديل «انطبق» لأنه راح ينطبق فقط بعد دمج الـPR. قل «حضرت التعديل» فقط.\n2. ممنوع حذف أي ملف. ممنوع لمس: .env*، الترحيل القائم (لا تعدّل bump موجودة — أضف bump جديدة)، package-lock.json.\n3. غيّر فقط ما يلزم — لا إعادة هيكلة مجانية. حافظ على الطراز القائم (أسماء، تعليقات عربية، نوعية الأسلوب).\n4. TypeScript صارم: لا any بدون لزوم، تعامل مع null، لا تكسر الاستيرادات.\n5. أي تعديل يلمس الدفع/الطلبات/المصادقة/الترحيل = risk: high واذكر السبب صراحة.\n6. لا أٍسرار في الكود: لا توكنات ولا مفاتيح — فقط process.env.NAME مع تعليق ما هو.\n7. بعد التعديل: فكّر «هل tsc ينجح؟ هل e2e يمر؟» — إن فيه شك، وضّحه في risk_notes.\n8. إن كان الطلب غامضاً: لا تخمّن — أعِد clarify بسؤال واحد واضح واترك files فارغة.\n\n📤 الإخراج: JSON صالح فقط، بلا أي حرف خارجه.\nالمرحلة الأولى (اختيار الملفات):\n{\"summary\":\"ما طلبه المالك بجملة\",\"chosen\":[\"src/lib/....ts\"],\"risk\":\"low|medium|high\",\"clarify\":\"سؤال أو null\"}\nالمرحلة الثانية (البرمجة) بعد أن ترى محتوى الملفات:\n{\"summary\":\"ما ستفعله\",\"plan\":[\"خطوة 1\",\"خطوة 2\"],\"risk\":\"low|medium|high\",\"risk_notes\":\"لماذا هذا الخطر وماذا تفحص\",\"files\":[{\"path\":\"src/...\",\"action\":\"modify|create\",\"content\":\"المحتوى الكامل الجديد للملف — وليس diff\"}]}\nمهم: content = الملف كاملاً بعد التعديل (full-file). modify لملف موجود في القائمة، create لملف جديد (مساره يبدأ بـ src/ أو scripts/). لا ملفات أخرى.\nإن لم يوجد أي تعديل منطقي → files = [] واشرح لماذا.\n\n✨ أسلوب العمل:\n- اقرأ نيّة المالك من دارجته: «ضيف عفسة» = ميزة، «صلح هاداك» = bugfix، «بدل اللون» = UI.\n- إن احتاجت الميزة إعداد/API key جديد: أضفه عبر env واذكر في plan أن المالك يضيفه في Vercel.\n- لا تعدّل أكثر من 10 ملفات في الدفعة الواحدة.\n";

export type CodebaseEntry = { path: string; lines: number; bytes: number };
export type EngineerFileChange = { path: string; action: "modify" | "create"; content: string };
export type EngineerRisk = "low" | "medium" | "high";

export function codebaseManifest(): CodebaseEntry[] {
  return CODEBASE_MANIFEST.map((f) => ({ path: f.path, lines: f.lines, bytes: f.bytes }));
}

export function readCodebaseFile(path: string): { path: string; content: string } | null {
  const content = CODEBASE_FILES[path];
  return content === undefined ? null : { path, content };
}

function stripFences(raw: string): string {
  let t = String(raw ?? "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return t;
}

function parseLoose(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stripFences(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const RISK_VALUES = new Set(["low", "medium", "high"]);
const normRisk = (v: unknown): EngineerRisk => (typeof v === "string" && RISK_VALUES.has(v) ? (v as EngineerRisk) : "medium");

function manifestIndex(): Map<string, number> {
  return new Map(CODEBASE_MANIFEST.map((f) => [f.path, CODEBASE_FILES[f.path].length]));
}

function summarizeManifest(): string {
  return CODEBASE_MANIFEST.map((f) => `${f.path} (${f.lines} سطر، ${Math.round(f.bytes / 1024)}KB)`).join("\n");
}

async function stagePickFiles(request: string): Promise<{ summary: string; chosen: string[]; risk: EngineerRisk; clarify: string | null; provider: string }> {
  const prompt = [
    "طلب المالك:",
    request,
    "",
    "هذه كل ملفات كود البوت المتاحة لك (المسار + الحجم):",
    summarizeManifest(),
    "",
    "اختر الملفات (بحد أقصى 10) التي تحتاج قراءتها لتنفيذ الطلب. أخرج JSON المرحلة الأولى فقط.",
  ].join("\n");
  const res = await aiChat([{ role: "user", content: prompt }], { system: ENGINEER_SYSTEM });
  const parsed = parseLoose(res.text);
  if (!parsed) throw new Error("رد المزوّد لم يكن JSON صالحاً (المرحلة 1)");
  const chosenRaw = Array.isArray(parsed.chosen) ? parsed.chosen.map(String) : [];
  const chosen = [...new Set(chosenRaw)].filter((p) => CODEBASE_FILES[p] !== undefined).slice(0, 10);
  const clarify = typeof parsed.clarify === "string" && parsed.clarify.trim() ? parsed.clarify.trim() : null;
  return { summary: String(parsed.summary ?? "").slice(0, 500), chosen, risk: normRisk(parsed.risk), clarify, provider: res.provider };
}

export type PlanResult =
  | { ok: true; summary: string; plan: string[]; risk: EngineerRisk; risk_notes: string; files: EngineerFileChange[]; chosen: string[]; provider: string; dropped: string[] }
  | { ok: false; error: string; provider?: string; clarify?: string | null; chosen?: string[] };

const PATH_RE = /^(src|scripts)\/[A-Za-z0-9_./()[\]-]+$/;
const BANNED_PATH_RE = /(^|\/)(\.env|node_modules|package-lock\.json)(\/|$)|\.generated\.ts$/;

export async function planChange(request: string): Promise<PlanResult> {
  const clean = String(request ?? "").trim().slice(0, 4000);
  if (clean.length < 4) return { ok: false, error: "اكتب طلبك بكلمات أكثر (مثال: «ضيف زر حفظ البروفايل في صفحة الإعدادات»)" };

  let pick;
  try {
    pick = await stagePickFiles(clean);
  } catch (err) {
    return { ok: false, error: `تعذّر تحليل الطلب: ${(err as Error).message}. تأكد من ضبط مفاتيح AI في «المفاتيح» أو حاول لاحقاً.` };
  }
  if (pick.clarify && pick.chosen.length === 0) {
    return { ok: false, error: "المالك يحتاج يوضّح أولاً", clarify: pick.clarify, chosen: [] , provider: pick.provider };
  }
  if (!pick.chosen.length) {
    return { ok: false, error: "لم أتمكن من تحديد ملفات مناسبة — أعد صياغة الطلب بتفاصيل أكثر (اسم الميزة/الصفحة/الخطأ المقصود).", provider: pick.provider };
  }

  const ctx = pick.chosen.map((p) => `===== ${p} =====\n${CODEBASE_FILES[p]}`).join("\n\n");
  const prompt = [
    "طلب المالك:",
    clean,
    "",
    pick.summary ? `فهمك للطلب (المرحلة 1): ${pick.summary}` : "",
    "",
    "هذا محتوى الملفات المختارة من كود البوت (الحقيقة — لا تخمّن):",
    ctx,
    "",
    "برمج التغيير الآن. أخرج JSON المرحلة الثانية فقط (files بالمحتوى الكامل لكل ملف).",
  ].join("\n");

  let res;
  try {
    res = await aiChat([{ role: "user", content: prompt }], { system: ENGINEER_SYSTEM });
  } catch (err) {
    return { ok: false, error: `تعذّرت برمجة التغيير: ${(err as Error).message}`, provider: pick.provider };
  }
  const parsed = parseLoose(res.text);
  if (!parsed) return { ok: false, error: "رد المزوّد لم يكن JSON صالحاً (المرحلة 2) — حاول مرة أخرى.", provider: res.provider };

  const index = manifestIndex();
  const filesRaw = Array.isArray(parsed.files) ? parsed.files : [];
  const dropped: string[] = [];
  const files: EngineerFileChange[] = [];
  for (const raw of filesRaw) {
    const item = raw as Record<string, unknown>;
    const p = String(item?.path ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
    const content = typeof item?.content === "string" ? item.content : "";
    if (!PATH_RE.test(p) || BANNED_PATH_RE.test(p) || p.includes("..")) { dropped.push(p || "(فارغ)"); continue; }
    const action = item?.action === "create" ? "create" : "modify";
    if (action === "modify" && !index.has(p)) { dropped.push(`${p} (modify لملف غير موجود)`); continue; }
    if (action === "create" && index.has(p)) { dropped.push(`${p} (create لملف موجود)`); continue; }
    if (!content.trim()) { dropped.push(`${p} (محتوى فارغ)`); continue; }
    if (Buffer.byteLength(content, "utf8") > 150 * 1024) { dropped.push(`${p} (>150KB)`); continue; }
    files.push({ path: p, action, content });
    if (files.length >= 10) break;
  }
  if (!files.length) {
    return { ok: false, error: "المزوّد لم يُنتج ملفات صالحة للتعديل" + (dropped.length ? ` (مرفوضة: ${dropped.join("، ")})` : ""), provider: res.provider };
  }
  let risk = normRisk(parsed.risk);
  if (files.some((f) => /(^|\/)(auth|webhook|cron|\.github)|db\.ts$|env\.ts$/.test(f.path)) && risk === "low") risk = "medium";
  const plan = Array.isArray(parsed.plan) ? parsed.plan.map((s) => String(s).slice(0, 300)).slice(0, 20) : [];
  return {
    ok: true,
    summary: String(parsed.summary ?? pick.summary ?? "تعديل مبرمج").slice(0, 500),
    plan,
    risk,
    risk_notes: String(parsed.risk_notes ?? "").slice(0, 1000),
    files,
    chosen: pick.chosen,
    provider: res.provider,
    dropped,
  };
}

/* ─────────────── التطبيق: فرع + commit + PR على GitHub ─────────────── */

const GITHUB = "https://api.github.com";
const gh = () => ({
  token: process.env.GITHUB_TOKEN || "",
  repo: process.env.GITHUB_REPO || "bezzagabdou-source/Absorbs",
  base: process.env.GITHUB_BASE_BRANCH || "main",
});

async function ghFetch(path: string, init: RequestInit = {}): Promise<{ status: number; json: any }> {
  const { token } = gh();
  const res = await fetch(`${GITHUB}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "chinwi-ai-engineer",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* رد غير JSON */ }
  return { status: res.status, json };
}

export type ApplyResult =
  | { ok: true; branch: string; commit_sha: string; pr_number: number; pr_url: string }
  | { ok: false; error: string; need_token?: boolean };

export async function applyToGithub(files: EngineerFileChange[], opts: { title?: string; body?: string } = {}): Promise<ApplyResult> {
  const { token, repo, base } = gh();
  if (!token) {
    return {
      ok: false,
      need_token: true,
      error: "GITHUB_TOKEN غير مضبوط في Vercel — أضفه (Settings → Environment Variables) ثم أعد النشر. الخطوات تظهر في بطاقة «التطبيق» في اللوحة.",
    };
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { ok: false, error: "GITHUB_REPO غير صالح (المتوقع owner/repo)" };
  if (!Array.isArray(files) || !files.length) return { ok: false, error: "لا توجد ملفات للتطبيق" };

  // تحقّق مكرر من المسارات (لا نثق بأي شيء قادم من العميل)
  const index = manifestIndex();
  const safe = files.slice(0, 10).filter((f) => {
    const p = String(f.path ?? "");
    if (!PATH_RE.test(p) || BANNED_PATH_RE.test(p) || p.includes("..")) return false;
    if (typeof f.content !== "string" || !f.content.trim()) return false;
    if (Buffer.byteLength(f.content, "utf8") > 150 * 1024) return false;
    if (f.action === "modify") return index.has(p);
    return true;
  });
  if (!safe.length) return { ok: false, error: "كل المسارات رُفضت بعد التحقق الأمني" };

  const baseRef = await ghFetch(`/repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`);
  const baseSha: string | undefined = baseRef.json?.object?.sha;
  if (baseRef.status !== 200 || !baseSha) return { ok: false, error: `تعذّرت قراءة الفرع الأساسي (${base}) — تأكد أن التوكن يملك صلاحية contents:read على ${repo}` };

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const slug = String(opts.title || "ai-change").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "ai-change";
  const branch = `ai/${stamp}-${slug}`;

  // Git Data API: blobs → tree → commit → ref → PR
  const tree: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
  for (const f of safe) {
    const blob = await ghFetch(`/repos/${repo}/git/blobs`, { method: "POST", body: JSON.stringify({ content: f.content, encoding: "utf-8" }) });
    if (blob.status !== 201 || !blob.json?.sha) return { ok: false, error: `تعذّر رفع الملف ${f.path} إلى GitHub` };
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.json.sha });
  }
  const baseCommit = await ghFetch(`/repos/${repo}/git/commits/${baseSha}`);
  const baseTree: string | undefined = baseCommit.json?.tree?.sha;
  if (!baseTree) return { ok: false, error: "تعذّرت قراءة شجرة الفرع الأساسي" };
  const newTree = await ghFetch(`/repos/${repo}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseTree, tree }) });
  if (newTree.status !== 201 || !newTree.json?.sha) return { ok: false, error: "تعذّر بناء شجرة التغييرات" };
  const title = String(opts.title || "feat(ai): تعديل مبرمج بواسطة المهندس AI").slice(0, 200);
  const commit = await ghFetch(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `${title}\n\nCo-authored-by: chinwi-ai-engineer <ai-engineer@chinwi.store>`,
      tree: newTree.json.sha,
      parents: [baseSha],
    }),
  });
  if (commit.status !== 201 || !commit.json?.sha) return { ok: false, error: "تعذّر إنشاء الـ commit" };
  const newRef = await ghFetch(`/repos/${repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.json.sha }) });
  if (newRef.status !== 201) return { ok: false, error: "تعذّر إنشاء الفرع على GitHub" };

  const fileList = safe.map((f) => `- \`${f.action === "create" ? "➕" : "✏️"} ${f.path}\``).join("\n");
  const prBody = [
    opts.body?.trim() || "تعديل مبرمج بواسطة «المهندس AI» داخل لوحة CHINWI STORE بناءً على طلب المالك.",
    "",
    "## الملفات المعدّلة",
    fileList,
    "",
    "⚠️ راجع التعديلات قبل الدمج — الدمج للإنتاج مسؤولية المالك.",
  ].join("\n");
  const pr = await ghFetch(`/repos/${repo}/pulls`, { method: "POST", body: JSON.stringify({ title, head: branch, base, body: prBody }) });
  if (pr.status !== 201 || !pr.json?.number) return { ok: false, error: `الفرع انعمل (${branch}) لكن فتح الـ PR فشل: ${pr.json?.message ?? pr.status}` };
  return { ok: true, branch, commit_sha: commit.json.sha, pr_number: pr.json.number, pr_url: pr.json.html_url };
}

export async function mergePullRequest(number: number): Promise<{ ok: true; sha: string } | { ok: false; error: string; need_token?: boolean }> {
  const { token, repo } = gh();
  if (!token) return { ok: false, need_token: true, error: "GITHUB_TOKEN غير مضبوط في Vercel" };
  const n = Math.trunc(Number(number));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "رقم الـ PR غير صالح" };
  const res = await ghFetch(`/repos/${repo}/pulls/${n}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "merge" }) });
  if (res.status === 200 && res.json?.merged) return { ok: true, sha: res.json.sha };
  return { ok: false, error: `الدمج فشل: ${res.json?.message ?? `HTTP ${res.status}`}` };
}

export function engineerEnabled(): { github_token: boolean; repo: string; base_branch: string } {
  const { repo, base } = gh();
  return { github_token: Boolean(process.env.GITHUB_TOKEN), repo, base_branch: base };
}

export const fingerprint = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 16);
