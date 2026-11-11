import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/panel/vision/route";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a1sAAAAASUVORK5CYII=";
const names = ["PANEL_PUBLIC_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_VISION_MODEL", "GROQ_API_KEY", "GROQ_VISION_MODEL", "OPENROUTER_API_KEY", "OPENROUTER_VISION_MODEL", "OPENAI_API_KEY", "OPENAI_VISION_MODEL"];
function request(body: unknown, key = "vision-test-key") {
  return new NextRequest("http://localhost/api/panel/vision", { method: "POST", headers: { "content-type": "application/json", "x-panel-key": key }, body: JSON.stringify(body) });
}
async function isolated(env: Record<string, string>, fn: () => Promise<void>) {
  const oldFetch = globalThis.fetch;
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, { PANEL_PUBLIC_KEY: "vision-test-key", ...env });
  try { await fn(); }
  finally {
    globalThis.fetch = oldFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    }
  }
}

test("vision validates authentication and image, and sends actual image bytes to Gemini", async () => {
  await isolated({ GEMINI_API_KEY: "dummy-gemini-key" }, async () => {
    assert.equal((await POST(request({ image }, "bad"))).status, 401);
    assert.equal((await POST(request({ image: "data:image/png;base64,AAAA" }))).status, 400);
    let captured: { url?: string; headers?: Headers; body?: any } = {};
    globalThis.fetch = async (input, init) => {
      captured = { url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
      return Response.json({ candidates: [{ content: { parts: [{ text: "صورة تجريبية" }] } }] });
    };
    const res = await POST(request({ image, prompt: "ما في الصورة؟" }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.text, "صورة تجريبية");
    assert.match(captured.url || "", /^https:\/\/generativelanguage\.googleapis\.com\//);
    assert.equal(captured.headers?.get("x-goog-api-key"), "dummy-gemini-key");
    assert.equal(captured.body.contents[0].parts[1].inlineData.mimeType, "image/png");
    assert.equal(captured.body.contents[0].parts[1].inlineData.data, image.split(",")[1]);
    assert.ok(!JSON.stringify(data).includes("dummy-gemini-key"));
  });
});

test("Gemini failure falls back to Groq vision with the actual image", async () => {
  await isolated({ GEMINI_API_KEY: "bad-gemini", GROQ_API_KEY: "working-groq", OPENROUTER_API_KEY: "unused-router" }, async () => {
    const calls: { url: string; body: any; headers: Headers }[] = [];
    globalThis.fetch = async (input, init) => {
      const call = { url: String(input), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) };
      calls.push(call);
      if (call.url.includes("googleapis.com")) return new Response("{}", { status: 503 });
      assert.match(call.url, /^https:\/\/api\.groq\.com\//);
      return Response.json({ choices: [{ message: { content: "هذه صورة جائزة" } }] });
    };
    const res = await POST(request({ image, prompt: "اشرح الصورة" }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.provider, "Groq");
    assert.equal(data.text, "هذه صورة جائزة");
    assert.equal(calls.length, 2, "do not send image to later providers after success");
    assert.equal(calls[1].headers.get("authorization"), "Bearer working-groq");
    assert.equal(calls[1].body.model, "qwen/qwen3.8-27b");
    assert.equal(calls[1].body.reasoning_effort, "none");
    assert.equal(calls[1].body.messages[1].content[1].image_url.url, image);
    assert.match(calls[1].body.messages[0].content, /غير موثوقة/);
    assert.ok(!JSON.stringify(data).includes("working-groq"));
  });
});

test("OpenRouter free image model is tried after earlier failures", async () => {
  await isolated({ GEMINI_API_KEY: "bad-gemini", GROQ_API_KEY: "bad-groq", OPENROUTER_API_KEY: "working-router" }, async () => {
    const calls: { url: string; body: any }[] = [];
    globalThis.fetch = async (input, init) => {
      const call = { url: String(input), body: JSON.parse(String(init?.body)) };
      calls.push(call);
      if (call.url.includes("googleapis.com")) throw new Error("mock network failure");
      if (call.url.includes("groq.com")) return new Response("{}", { status: 429 });
      assert.match(call.url, /^https:\/\/openrouter\.ai\//);
      return Response.json({ choices: [{ message: { content: [{ type: "text", text: "نجح البديل" }] } }] });
    };
    const res = await POST(request({ image }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.provider, "OpenRouter");
    assert.equal(data.text, "نجح البديل");
    assert.equal(calls.length, 3);
    assert.equal(calls[2].body.model, "openrouter/free");
    assert.equal(calls[2].body.messages[1].content[1].image_url.url, image);
  });
});

test("missing providers and empty model responses fail without leaking configuration", async () => {
  await isolated({}, async () => {
    const res = await POST(request({ image }));
    assert.equal(res.status, 503);
    assert.equal((await res.json()).ok, false);
  });
  await isolated({ GEMINI_API_KEY: "secret-key", GEMINI_VISION_MODEL: "gemini-missing" }, async () => {
    let n = 0;
    globalThis.fetch = async () => { n++; return Response.json({ candidates: [{ content: { parts: [] } }] }); };
    const res = await POST(request({ image }));
    const data = await res.json();
    assert.equal(res.status, 503);
    assert.equal(n, 2, "configured Gemini model falls back to the latest model");
    assert.ok(!JSON.stringify(data).includes("secret-key"));
  });
});
