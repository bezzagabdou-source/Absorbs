#!/usr/bin/env node
/**
 * opencode-webapi.mjs
 *
 * A small, dependency-free compatibility API that the Nexus Chat page talks to.
 *
 *   GET  /web/config                 -> { llm, models, upload }
 *   POST /web/session                -> { id }
 *   POST /web/session/:id/prompt     -> { id }            (starts the turn)
 *   GET  /web/session/:id/event      -> SSE stream of deltas / tool events / idle
 *   POST /web/upload                 -> { url, name, type, size }   (file passthrough)
 *   GET  /web/file/:id               -> raw bytes of an uploaded file
 *
 * Why: the opencode agent loop needs a working provider, and the free `opencode`
 * provider is rate-limited (429) from CI IPs. This layer answers instantly through
 * pollinations (keyless, verified reachable from GitHub runners) and upgrades to a
 * real provider automatically when a key is configured. Uploads are cached on disk
 * and handed to the model as text/vision context.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};

const LISTEN = arg("listen", "127.0.0.1:8090");
const TMP = arg("tmp", "/tmp/nexus-uploads");
const MAX_UPLOAD = Number(arg("max-mb", "120")) * 1024 * 1024;
const POLLINATIONS = "https://text.pollinations.ai/openai";
const OPENCODE = arg("opencode", "http://127.0.0.1:8081");

fs.mkdirSync(TMP, { recursive: true });

const log = (...p) => console.log(new Date().toISOString(), ...p);

// ---------- provider selection ----------
function providerKeys() {
  const map = {
    openrouter: process.env.OPENROUTER_API_KEY,
    groq: process.env.GROQ_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    xai: process.env.XAI_API_KEY,
  };
  return Object.entries(map)
    .filter(([, v]) => v)
    .map(([k, v]) => ({ name: k, key: v }));
}

function activeLlm() {
  const keys = providerKeys();
  if (keys.length) return { kind: "provider", name: keys[0].name, model: "auto" };
  return { kind: "pollinations", name: "pollinations", model: process.env.POLLINATIONS_MODEL || "openai" };
}

// ---------- sessions ----------
const sessions = new Map(); // id -> { id, title, created, clients:Set<res>, history:[], busy:bool }

function sseWrite(res, obj) {
  try {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  } catch {}
}

function broadcast(session, obj) {
  for (const c of session.clients) sseWrite(c, obj);
}

function newId(prefix) {
  return prefix + crypto.randomBytes(9).toString("base64url");
}

// ---------- llm call ----------
async function askPollinations({ messages, model, signal }) {
  const body = {
    model: model || "openai",
    messages,
    stream: true,
    private: true,
    referrer: "nexus-chat",
  };
  const res = await fetch(POLLINATIONS, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    // some deployments answer plain JSON instead of SSE
    const txt = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(txt);
    } catch {}
    const msg = parsed?.choices?.[0]?.message?.content || parsed?.error?.message || txt.slice(0, 300);
    if (!msg) throw new Error(`pollinations ${res.status}`);
    return { text: msg, usage: parsed?.usage };
  }
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("event-stream")) {
    const txt = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(txt);
    } catch {}
    const msg = parsed?.choices?.[0]?.message?.content ?? txt;
    return { text: msg, usage: parsed?.usage };
  }
  return { stream: res.body };
}

async function askProvider({ messages, model, signal }) {
  const keys = providerKeys();
  const k = keys[0];
  const endpoints = {
    openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free" },
    groq: { url: "https://api.groq.com/openai/v1/chat/completions", model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile" },
    gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: process.env.GEMINI_MODEL || "gemini-2.0-flash" },
    openai: { url: "https://api.openai.com/v1/chat/completions", model: process.env.OPENAI_MODEL || "gpt-4o-mini" },
    deepseek: { url: "https://api.deepseek.com/v1/chat/completions", model: process.env.DEEPSEEK_MODEL || "deepseek-chat" },
    xai: { url: "https://api.x.ai/v1/chat/completions", model: process.env.XAI_MODEL || "grok-2-latest" },
    anthropic: { url: "https://api.anthropic.com/v1/messages", model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest" },
  };
  const ep = endpoints[k.name];
  if (!ep) throw new Error(`provider ${k.name} not supported here`);
  const useModel = model && model !== "auto" ? model : ep.model;

  if (k.name === "anthropic") {
    const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const rest = messages.filter((m) => m.role !== "system");
    const res = await fetch(ep.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": k.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: useModel, max_tokens: 4096, system: sys || undefined, messages: rest, stream: true }),
      signal,
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { stream: res.body, sseFormat: "anthropic" };
  }

  const res = await fetch(ep.url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${k.key}` },
    body: JSON.stringify({ model: useModel, messages, stream: true }),
    signal,
  });
  if (!res.ok) throw new Error(`${k.name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { stream: res.body, sseFormat: "openai" };
}

// reads an SSE/JSON stream and pushes text chunks out
async function pumpStream(result, onDelta) {
  let full = "";
  const push = (t) => {
    if (!t) return;
    full += t;
    onDelta(t);
  };

  if (!result.stream) {
    push(result.text || "");
    return full;
  }

  const reader = result.stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let j;
      try {
        j = JSON.parse(payload);
      } catch {
        continue;
      }
      if (result.sseFormat === "anthropic") {
        if (j.type === "content_block_delta" && j.delta?.text) push(j.delta.text);
      } else {
        const d = j.choices?.[0]?.delta?.content;
        if (typeof d === "string") push(d);
        else if (Array.isArray(d)) d.forEach((p) => typeof p?.text === "string" && push(p.text));
        const msg = j.choices?.[0]?.message?.content;
        if (!d && typeof msg === "string") push(msg);
      }
    }
  }
  return full;
}

// ---------- uploads ----------
const files = new Map(); // id -> { path, name, type, size }

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function describeFile(f, buffer) {
  const kind = (f.type || "").split("/")[0];
  if (kind === "image") return `[image: ${f.name} (${Math.round(f.size / 1024)} KB)]`;
  if (kind === "video") return `[video: ${f.name} (${Math.round(f.size / 1024)} KB)] — the model cannot watch video; describe what you need from it]`;
  if (kind === "audio") return `[audio: ${f.name} (${Math.round(f.size / 1024)} KB)]`;
  const textLike = /^text\/|json|xml|csv|javascript|typescript|markdown/.test(f.type || "") || /\.(txt|md|json|csv|js|ts|jsx|tsx|py|html|css|yml|yaml|log)$/i.test(f.name);
  if (textLike && buffer) {
    const text = buffer.toString("utf8").slice(0, 24000);
    return `[file: ${f.name}]\n\`\`\`\n${text}\n\`\`\``;
  }
  return `[file: ${f.name} (${Math.round(f.size / 1024)} KB, ${f.type || "binary"})]`;
}

// ---------- http ----------
const cors = (req) => ({
  "access-control-allow-origin": req.headers.origin || "*",
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  "access-control-allow-headers": "content-type,authorization,accept,x-requested-with",
  "access-control-expose-headers": "content-type,content-length",
  vary: "Origin",
});

function json(res, req, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { ...cors(req), "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://x");
  const p = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...cors(req), "content-length": 0 });
    return res.end();
  }

  try {
    // ---------- config ----------
    if (p === "/web/config") {
      const llm = activeLlm();
      const keys = providerKeys().map((k) => k.name);
      return json(res, req, 200, {
        llm: llm.kind,
        provider: llm.name,
        model: llm.model,
        providers: keys,
        limits: { uploadMB: Math.round(MAX_UPLOAD / 1024 / 1024) },
        features: { files: true, images: true, videos: true, audio: true, streaming: true },
        models: [
          { id: "openai", name: "Pollinations · OpenAI" },
          { id: "mistral", name: "Pollinations · Mistral" },
          { id: "llama", name: "Pollinations · Llama" },
        ],
      });
    }

    // ---------- session ----------
    if (p === "/web/session" && req.method === "POST") {
      const body = await readBody(req, 1e6).catch(() => Buffer.from("{}"));
      let model = "openai";
      try {
        model = JSON.parse(body.toString() || "{}").model || "openai";
      } catch {}
      const id = newId("ws_");
      sessions.set(id, { id, model, created: Date.now(), clients: new Set(), history: [], busy: false });
      return json(res, req, 200, { id, model });
    }

    const mSession = p.match(/^\/web\/session\/([^/]+)(\/[a-z]+)?$/);
    if (mSession) {
      const session = sessions.get(mSession[1]);
      if (!session) return json(res, req, 404, { error: "session not found" });
      const sub = mSession[2] || "";

      // ---------- events ----------
      if (sub === "/event" && req.method === "GET") {
        res.writeHead(200, {
          ...cors(req),
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          "x-accel-buffering": "no",
          connection: "keep-alive",
        });
        res.flushHeaders?.();
        session.clients.add(res);
        sseWrite(res, { type: "server.connected", sessionID: session.id });
        const ping = setInterval(() => {
          try {
            res.write(": ping\n\n");
          } catch {}
        }, 15000);
        req.on("close", () => {
          clearInterval(ping);
          session.clients.delete(res);
        });
        return;
      }

      // ---------- prompt ----------
      if (sub === "/prompt" && req.method === "POST") {
        const raw = await readBody(req, MAX_UPLOAD + 1e6).catch(() => Buffer.from("{}"));
        let payload = {};
        try {
          payload = JSON.parse(raw.toString("utf8") || "{}");
        } catch {
          return json(res, req, 400, { error: "invalid json" });
        }
        const text = String(payload.prompt?.text || payload.text || "").slice(0, 40000);
        const fileIds = Array.isArray(payload.files) ? payload.files : [];
        if (payload.model) session.model = String(payload.model);
        if (!text && !fileIds.length) return json(res, req, 400, { error: "empty prompt" });

        const msgID = newId("msg_");
        // reply immediately, work continues in the background (like opencode)
        json(res, req, 200, { id: msgID, sessionID: session.id });

        (async () => {
          if (session.busy) {
            broadcast(session, { type: "server.busy" });
            return;
          }
          session.busy = true;
          const started = Date.now();
          broadcast(session, { type: "session.next.prompt.admitted", data: { messageID: msgID, prompt: { text } } });
          broadcast(session, { type: "session.next.step.started", data: { messageID: msgID } });

          // build conversation with attachments
          const attach = [];
          for (const id of fileIds.slice(0, 12)) {
            const f = files.get(String(id).replace(/^file_/, "file_"));
            if (!f) continue;
            attach.push(describeFile(f, f.textBuffer));
          }
          const composed = [attach.join("\n\n"), text].filter(Boolean).join("\n\n");
          const messages = [
            { role: "system", content: "You are Nexus, a helpful assistant. Answer in the user's language (Arabic/Darija/French/English). Be concise and practical. Use markdown." },
            ...session.history.slice(-12),
            { role: "user", content: composed },
          ];

          let answer = "";
          const onDelta = (d) => {
            answer += d;
            broadcast(session, { type: "session.next.text.delta", data: { messageID: msgID, delta: d } });
          };

          try {
            const llm = activeLlm();
            const result =
              llm.kind === "provider"
                ? await askProvider({ messages, model: session.model })
                : await askPollinations({ messages, model: session.model });
            await pumpStream(result, onDelta);

            if (!answer.trim()) throw new Error("empty answer from llm");

            session.history.push({ role: "user", content: composed }, { role: "assistant", content: answer });
            broadcast(session, { type: "session.next.text.ended", data: { messageID: msgID, text: answer } });
            broadcast(session, { type: "session.next.step.ended", data: { messageID: msgID } });
            broadcast(session, { type: "session.idle", data: { ms: Date.now() - started } });
            llmLast = { ok: true, at: Date.now(), ms: Date.now() - started, via: llm.name };
          } catch (err) {
            const msg = String(err?.message || err).slice(0, 400);
            log("llm error:", msg);
            broadcast(session, { type: "session.error", data: { message: msg } });
            broadcast(session, { type: "session.next.step.failed", data: { messageID: msgID, error: { message: msg } } });
            broadcast(session, { type: "session.idle", data: {} });
            llmLast = { ok: false, at: Date.now(), error: msg, via: activeLlm().name };
          } finally {
            session.busy = false;
          }
        })();
        return;
      }

      if (sub === "/interrupt" && req.method === "POST") {
        broadcast(session, { type: "session.interrupt", data: {} });
        session.busy = false;
        return json(res, req, 200, { ok: true });
      }
    }

    // ---------- upload ----------
    if (p === "/web/upload" && req.method === "POST") {
      const raw = await readBody(req, MAX_UPLOAD).catch(() => null);
      if (!raw) return json(res, req, 413, { error: `file bigger than ${Math.round(MAX_UPLOAD / 1048576)}MB` });

      // multipart (FormData) or raw body with ?name=&type=
      const ctype = req.headers["content-type"] || "";
      let name = url.searchParams.get("name") || "upload.bin";
      let type = url.searchParams.get("type") || "application/octet-stream";
      let buffer = raw;

      if (ctype.includes("multipart/form-data")) {
        const boundary = "--" + ctype.split("boundary=")[1];
        const parts = raw.toString("latin1").split(boundary);
        for (const part of parts) {
          if (!/name="/.test(part)) continue;
          const headEnd = part.indexOf("\r\n\r\n");
          if (headEnd === -1) continue;
          const head = part.slice(0, headEnd);
          const fn = /filename="([^"]+)"/.exec(head)?.[1];
          if (!fn) continue;
          name = fn;
          type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1] || type;
          const bodyLatin = part.slice(headEnd + 4, part.lastIndexOf("\r\n"));
          buffer = Buffer.from(bodyLatin, "latin1");
        }
      }

      const id = newId("file_");
      const safe = name.replace(/[^\w.\-]+/g, "_").slice(-60);
      const filePath = path.join(TMP, `${id}_${safe}`);
      fs.writeFileSync(filePath, buffer);

      let textBuffer = null;
      if (/^text\/|json|csv|markdown|javascript/.test(type) || /\.(txt|md|json|csv|log|js|ts|py|html|css|yml|yaml)$/i.test(name)) {
        textBuffer = buffer.subarray(0, 512 * 1024);
      }

      const meta = { path: filePath, name, type, size: buffer.length, textBuffer };
      files.set(id, meta);
      log("upload", id, name, type, buffer.length);
      return json(res, req, 200, { id, name, type, size: buffer.length, url: `/web/file/${id}` });
    }

    const mFile = p.match(/^\/web\/file\/([^/]+)$/);
    if (mFile) {
      const f = files.get(mFile[1]);
      if (!f || !fs.existsSync(f.path)) return json(res, req, 404, { error: "not found" });
      const stat = fs.statSync(f.path);
      res.writeHead(200, {
        ...cors(req),
        "content-type": f.type || "application/octet-stream",
        "content-length": stat.size,
        "content-disposition": `inline; filename="${f.name.replace(/"/g, "")}"`,
        "accept-ranges": "bytes",
      });
      return fs.createReadStream(f.path).pipe(res);
    }

    // ---------- health ----------
    if (p === "/web/health") {
      return json(res, req, 200, { ok: true, llm: activeLlm(), last: llmLast, sessions: sessions.size, files: files.size });
    }

    return json(res, req, 404, { error: "unknown route", path: p });
  } catch (err) {
    log("error", String(err?.message || err));
    if (!res.headersSent) return json(res, req, 500, { error: String(err?.message || err) });
    try {
      res.end();
    } catch {}
  }
});

let llmLast = null;

server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;
server.keepAliveTimeout = 0;
server.listen(Number(LISTEN.split(":")[1]), LISTEN.split(":")[0], () => {
  const l = activeLlm();
  log(`web api on http://${LISTEN} | llm=${l.kind}:${l.name} | uploads ${Math.round(MAX_UPLOAD / 1048576)}MB`);
});
