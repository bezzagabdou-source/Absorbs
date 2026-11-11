import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/panel/chat/route";

const names = ["PANEL_PUBLIC_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "OPENROUTER_API_KEY", "PANEL_GEMINI_MODEL", "PANEL_OPENROUTER_MODEL"];
const tool = { type: "function", function: { name: "ft_catalog", parameters: { type: "object", properties: {} } } };
const body = { messages: [{ role: "user", content: "اعرض الجوائز" }], tools: [tool] };
function request(input: unknown, key = "test-panel-key") {
  return new NextRequest("http://localhost/api/panel/chat", { method: "POST", headers: { "content-type": "application/json", "x-panel-key": key }, body: JSON.stringify(input) });
}
async function isolated(env: Record<string, string>, fn: () => Promise<void>) {
  const oldFetch = globalThis.fetch;
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, { PANEL_PUBLIC_KEY: "test-panel-key", ...env });
  try { await fn(); } finally {
    globalThis.fetch = oldFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    }
  }
}

test("text fallback requires the panel key and bounded, valid messages", async () => {
  await isolated({ GEMINI_API_KEY: "dummy-secret" }, async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({}); };
    assert.equal((await POST(request(body, "incorrect"))).status, 401);
    assert.equal((await POST(request({ messages: [{ role: "admin", content: "x" }], tools: [] }))).status, 400);
    assert.equal((await POST(request({ messages: [{ role: "user", content: "x".repeat(900_001) }], tools: [] }))).status, 400);
    assert.equal(calls, 0);
  });
});

test("text fallback switches providers, forwards tools and never exposes keys", async () => {
  await isolated({ GEMINI_API_KEY: "dummy-gemini", OPENROUTER_API_KEY: "dummy-router" }, async () => {
    const calls: { url: string; payload: any; auth: string | null }[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), payload: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("authorization") });
      if (calls.length === 1) return new Response("{}", { status: 503 });
      return Response.json({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "ft_catalog", arguments: "{}" } }] } }] });
    };
    const res = await POST(request(body));
    const result = await res.json();
    assert.equal(res.status, 200);
    assert.match(calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\//);
    assert.match(calls[1].url, /^https:\/\/openrouter\.ai\//);
    assert.equal(calls[1].payload.model, "openrouter/free");
    assert.deepEqual(calls[1].payload.tools, [tool]);
    assert.equal(calls[1].auth, "Bearer dummy-router");
    assert.equal(result.message.tool_calls[0].function.name, "ft_catalog");
    assert.ok(!JSON.stringify(result).includes("dummy-"));
  });
});

test("missing providers or empty model replies are reported, not fabricated", async () => {
  await isolated({}, async () => { assert.equal((await POST(request(body))).status, 503); });
  await isolated({ GEMINI_API_KEY: "dummy-gemini" }, async () => {
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: "" } }] });
    assert.equal((await POST(request(body))).status, 503);
  });
});
