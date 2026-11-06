import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
const projects = [
  { name: "gnab-ai", apiKey: "AIzaSyAccTPIxaCaUjQNnGmAoP_sW_OQrLE049U", bucket: "gnab-ai.firebasestorage.app" },
  { name: "mohtal-9b1d3", apiKey: "AIzaSyDeja2hzGtRXafKzACUFFw-g3joWmlzGTU", bucket: "mohtal-9b1d3.firebasestorage.app" },
];
async function jsonPost(url: string, body: unknown, token?: string) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), cache: "no-store" });
  return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
}
async function probe(project: typeof projects[number]) {
  const out: Record<string, unknown> = { project: project.name };
  const base = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${project.apiKey}`;
  let auth = await jsonPost(base, { returnSecureToken: true });
  out.anonymous = { status: auth.status, error: (auth.body?.error as { message?: string } | undefined)?.message ?? null };
  let emailPassword = false;
  if (!auth.body?.idToken) {
    const email = `dz-probe-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const password = `Probe-${Math.random().toString(36).slice(2)}-Aa1!`;
    auth = await jsonPost(base, { email, password, returnSecureToken: true });
    emailPassword = true;
    out.emailPassword = { status: auth.status, error: (auth.body?.error as { message?: string } | undefined)?.message ?? null };
  }
  const idToken = auth.body?.idToken as string | undefined;
  const localId = auth.body?.localId as string | undefined;
  if (!idToken || !localId) return out;
  const docUrl = `https://firestore.googleapis.com/v1/projects/${project.name}/databases/(default)/documents/marketplace_probe/${localId}`;
  const write = await fetch(docUrl, { method: "PATCH", headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: { ok: { booleanValue: true } } }), cache: "no-store" });
  out.firestoreWrite = { status: write.status, error: await write.text().catch(() => "") };
  if (write.ok) await fetch(docUrl, { method: "DELETE", headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store" }).catch(() => undefined);
  const object = `marketplace_probe/${localId}.txt`;
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${project.bucket}/o?name=${encodeURIComponent(object)}`;
  const upload = await fetch(uploadUrl, { method: "POST", headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "text/plain" }, body: "ok", cache: "no-store" });
  out.storageWrite = { status: upload.status, error: await upload.text().catch(() => "") };
  if (upload.ok) await fetch(`https://firebasestorage.googleapis.com/v0/b/${project.bucket}/o/${encodeURIComponent(object)}`, { method: "DELETE", headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store" }).catch(() => undefined);
  await jsonPost(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${project.apiKey}`, { idToken }).catch(() => undefined);
  out.cleaned = true;
  out.emailPassword = emailPassword;
  return out;
}
export async function GET() {
  const results = [];
  for (const project of projects) {
    try { results.push(await probe(project)); } catch (error) { results.push({ project: project.name, error: error instanceof Error ? error.message : "unknown" }); }
  }
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
