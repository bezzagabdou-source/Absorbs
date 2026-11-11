import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/panel/vision/route";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a1sAAAAASUVORK5CYII=";
function request(body: unknown, key = "vision-test-key") {
  return new NextRequest("http://localhost/api/panel/vision", { method: "POST", headers: { "content-type": "application/json", "x-panel-key": key }, body: JSON.stringify(body) });
}

test("vision validates authentication and image, and sends actual image bytes to Gemini", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.PANEL_PUBLIC_KEY;
  const oldGemini = process.env.GEMINI_API_KEY;
  process.env.PANEL_PUBLIC_KEY = "vision-test-key";
  process.env.GEMINI_API_KEY = "dummy-gemini-key";
  try {
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
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.PANEL_PUBLIC_KEY; else process.env.PANEL_PUBLIC_KEY = oldKey;
    if (oldGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldGemini;
  }
});
