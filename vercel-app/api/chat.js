export const config = { maxDuration: 60 };

const POLLINATIONS = "https://text.pollinations.ai/openai";

const SYSTEM = `أنت Nexus، مساعد ذكي مفيد. جاوب بلغة المستخدم (عربية/دارجة/فرنسية/إنجليزية).
كن مختصرًا وعمليًا. استعمل Markdown للكود والقوائم.`;

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 4_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("access-control-allow-methods", "POST,OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let payload = {};
  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    payload = JSON.parse(raw || "{}");
  } catch {
    try {
      payload = JSON.parse((await readBody(req)) || "{}");
    } catch {
      return res.status(400).json({ error: "invalid json" });
    }
  }

  const model = String(payload.model || "openai");
  const incoming = Array.isArray(payload.messages) ? payload.messages : [];
  if (!incoming.length) return res.status(400).json({ error: "messages required" });

  const messages = [{ role: "system", content: SYSTEM }, ...incoming.slice(-14)];

  const callUpstream = async (msgs) => {
    const r = await fetch(POLLINATIONS, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ model, messages: msgs, stream: true, private: true, referrer: "nexus-chat-vercel" }),
    });
    return r;
  };

  let upstream;
  try {
    upstream = await callUpstream(messages);
    if (!upstream.ok) {
      const txt = await upstream.text();
      // retry once as plain text (some models reject multimodal parts)
      const flat = messages.map((m) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.map((p) => (p.type === "text" ? p.text : "[image omitted]")).join("\n")
          : m.content,
      }));
      upstream = await callUpstream(flat);
      if (!upstream.ok) {
        const t2 = await upstream.text();
        return res.status(502).json({ error: `upstream ${upstream.status}`, detail: (t2 || txt).slice(0, 300) });
      }
    }
  } catch (err) {
    return res.status(502).json({ error: "upstream unreachable", detail: String(err?.message || err) });
  }

  res.setHeader("content-type", "text/event-stream; charset=utf-8");
  res.setHeader("cache-control", "no-cache, no-transform");
  res.setHeader("x-accel-buffering", "no");
  res.setHeader("connection", "keep-alive");
  res.flushHeaders?.();

  const ctype = upstream.headers.get("content-type") || "";

  // some responses come back as plain json instead of a stream
  if (!ctype.includes("event-stream")) {
    const txt = await upstream.text();
    let parsed = null;
    try {
      parsed = JSON.parse(txt);
    } catch {}
    const answer = parsed?.choices?.[0]?.message?.content ?? txt;
    for (const chunk of String(answer).match(/[\s\S]{1,60}/g) || []) sse(res, { delta: chunk });
    sse(res, { done: true });
    return res.end();
  }

  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const p = line.slice(5).trim();
        if (!p || p === "[DONE]") continue;
        let j;
        try {
          j = JSON.parse(p);
        } catch {
          continue;
        }
        const d = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content;
        if (typeof d === "string" && d) sse(res, { delta: d });
      }
    }
    sse(res, { done: true });
  } catch (err) {
    sse(res, { error: String(err?.message || err) });
  }
  res.end();
}
