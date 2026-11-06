import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
const projects = [
  { name: "gnab-ai", apiKey: "AIzaSyAccTPIxaCaUjQNnGmAoP_sW_OQrLE049U", buckets: ["gnab-ai.firebasestorage.app", "gnab-ai.appspot.com"], databaseURL: "https://gnab-ai-default-rtdb.firebaseio.com" },
  { name: "mohtal-9b1d3", apiKey: "AIzaSyDeja2hzGtRXafKzACUFFw-g3joWmlzGTU", buckets: ["mohtal-9b1d3.firebasestorage.app", "mohtal-9b1d3.appspot.com"], databaseURL: "https://mohtal-9b1d3-default-rtdb.firebaseio.com" },
];
async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  return { status: r.status, body: await r.json().catch(() => null) as Record<string, unknown> | null };
}
async function text(r: Response) { const t = await r.text().catch(() => ""); return t.slice(0, 400); }
async function probe(p: typeof projects[number]) {
  const out: Record<string, unknown> = { project: p.name };
  const auth = await post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${p.apiKey}`, { returnSecureToken: true });
  out.anonymous = { status: auth.status, error: (auth.body?.error as { message?: string } | undefined)?.message ?? null };
  const idToken = auth.body?.idToken as string | undefined;
  const uid = auth.body?.localId as string | undefined;
  if (!idToken || !uid) return out;
  out.storage = [];
  for (const bucket of p.buckets) {
    const object = `marketplace_probe/${uid}.txt`;
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodeURIComponent(object)}`;
    const up = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "text/plain" }, body: "ok", cache: "no-store" });
    const item: Record<string, unknown> = { bucket, status: up.status, error: await text(up) };
    if (up.ok) {
      const del = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(object)}`, { method: "DELETE", headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store" });
      item.delete = del.status;
    }
    (out.storage as unknown[]).push(item);
  }
  out.rtdb = [];
  for (const mode of ["auth", "bearer", "none"]) {
    const url = `${p.databaseURL}/marketplace_probe/${uid}.json${mode === "auth" ? `?auth=${encodeURIComponent(idToken)}` : ""}`;
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(mode === "bearer" ? { Authorization: `Bearer ${idToken}` } : {}) };
    const put = await fetch(url, { method: "PUT", headers, body: JSON.stringify({ ok: true, uid }), cache: "no-store" });
    const item: Record<string, unknown> = { mode, status: put.status, error: await text(put) };
    if (put.ok) {
      const get = await fetch(url, { headers: mode === "bearer" ? { Authorization: `Bearer ${idToken}` } : {}, cache: "no-store" });
      item.read = get.status;
      const del = await fetch(url, { method: "DELETE", headers, cache: "no-store" });
      item.delete = del.status;
    }
    (out.rtdb as unknown[]).push(item);
  }
  await post(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${p.apiKey}`, { idToken }).catch(() => undefined);
  out.cleaned = true;
  return out;
}
export async function GET() {
  const results = [];
  for (const p of projects) { try { results.push(await probe(p)); } catch (e) { results.push({ project: p.name, error: e instanceof Error ? e.message : "unknown" }); } }
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
