import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
const projects = [
  { name: "gnab-ai", apiKey: "AIzaSyAccTPIxaCaUjQNnGmAoP_sW_OQrLE049U", databaseURL: "https://gnab-ai-default-rtdb.firebaseio.com" },
  { name: "mohtal-9b1d3", apiKey: "AIzaSyDeja2hzGtRXafKzACUFFw-g3joWmlzGTU", databaseURL: "https://mohtal-9b1d3-default-rtdb.firebaseio.com" },
];
async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  return { status: r.status, body: await r.json().catch(() => null) as Record<string, unknown> | null };
}
async function probe(p: typeof projects[number]) {
  const out: Record<string, unknown> = { project: p.name };
  let auth = await post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${p.apiKey}`, { returnSecureToken: true });
  out.anonymous = { status: auth.status, error: (auth.body?.error as { message?: string } | undefined)?.message ?? null };
  if (!auth.body?.idToken) {
    auth = await post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${p.apiKey}`, { email: `dz-probe-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: `Probe-${Math.random().toString(36).slice(2)}-Aa1!`, returnSecureToken: true });
    out.emailPassword = { status: auth.status, error: (auth.body?.error as { message?: string } | undefined)?.message ?? null };
  }
  const idToken = auth.body?.idToken as string | undefined;
  const uid = auth.body?.localId as string | undefined;
  if (!idToken || !uid) return out;
  out.rtdb = [];
  for (const path of [`marketplace_probe/${uid}`, `users/${uid}/probe`, `probe`]) {
    const url = `${p.databaseURL}/${path}.json?auth=${encodeURIComponent(idToken)}`;
    const put = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, uid, at: Date.now() }), cache: "no-store" });
    const item: Record<string, unknown> = { path, status: put.status, error: (await put.text().catch(() => "")).slice(0, 300) };
    if (put.ok) {
      const get = await fetch(url, { cache: "no-store" });
      item.read = get.status;
      const del = await fetch(url, { method: "DELETE", cache: "no-store" });
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
