#!/usr/bin/env node
/**
 * opencode-selftest.mjs
 *
 * Proves the whole chain works (session -> prompt -> streamed answer) and prints a
 * single machine-readable line the supervisor can publish:
 *
 *   SELFTEST llm=ok model=opencode/iceman-free text="pong"
 *   SELFTEST llm=fail model=opencode/x error="..."
 *
 * usage: node scripts/opencode-selftest.mjs [--upstream http://127.0.0.1:8081] [--timeout 75]
 */
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const UP = getArg("upstream", "http://127.0.0.1:8081").replace(/\/$/, "");
// when --webapi is given, test the chat api the website uses (pollinations or a keyed provider)
const WEBAPI = getArg("webapi", "").replace(/\/$/, "");
const TIMEOUT = Number(getArg("timeout", "75")) * 1000;
const PROMPT = getArg("prompt", "Reply with exactly one word: pong");

const say = (...p) => console.log(...p);
const out = (line) => {
  say("SELFTEST " + line);
};

async function json(path, init) {
  const res = await fetch(UP + path, init);
  if (!res.ok) throw new Error(`${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function pickModels(list) {
  const ok = list.filter((m) => m.enabled && m.status !== "deprecated");
  const free = ok.filter((m) => (m.cost?.[0]?.input ?? 1) === 0);
  const pool = free.length ? free : ok;
  // prefer the provider that ships with a public key (works on a bare runner)
  pool.sort((a, b) => {
    const score = (m) => (m.providerID === "opencode" ? 0 : 1) + (m.api?.type === "aisdk" ? 0 : 0.5);
    return score(a) - score(b);
  });
  return pool.slice(0, 2);
}

async function tryModel(model) {
  const started = Date.now();
  const { data: session } = await json("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: { providerID: model.providerID, id: model.id } }),
  });
  const sid = session.id;

  let text = "";
  let error = "";
  let done = false;

  const ctrl = new AbortController();
  const killIn = setTimeout(() => ctrl.abort(), TIMEOUT);

  // stream the session events
  const stream = await fetch(`${UP}/api/session/${sid}/event`, {
    signal: ctrl.signal,
    headers: { accept: "text/event-stream" },
  });

  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const pump = (async () => {
    try {
      for (;;) {
        const { value, done: eof } = await reader.read();
        if (eof) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            let ev;
            try {
              ev = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            const t = ev.type || "";
            const d = ev.data || {};
            if (t.endsWith("text.delta")) {
              text += d.delta ?? d.text ?? d.content ?? "";
            } else if (t.endsWith("text.ended")) {
              if (!text && typeof d.text === "string") text += d.text;
            } else if (t.endsWith("step.failed") || t === "session.error") {
              error = d.error?.message || d.error?.type || "step failed";
              done = true;
            } else if (t.endsWith("step.ended") && text) {
              done = true;
            } else if (t === "session.idle") {
              if (text) done = true;
              else if (!error) error = "idle without text";
            }
            if (done) return;
          }
        }
      }
    } catch (e) {
      if (!error) error = e.name === "AbortError" ? "timeout" : String(e.message || e);
    }
  })();

  await json(`/api/session/${sid}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: { text: PROMPT }, model: { providerID: model.providerID, id: model.id } }),
  });

  await Promise.race([pump, new Promise((r) => setTimeout(r, TIMEOUT))]);
  clearTimeout(killIn);
  try {
    ctrl.abort();
  } catch {}
  try {
    await fetch(`${UP}/api/session/${sid}/interrupt`, { method: "POST" });
  } catch {}

  const ms = Date.now() - started;
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 120);
  return { ok: Boolean(clean), text: clean, error, ms, sid, label: `${model.providerID}/${model.id}` };
}

async function testWebApi() {
  const started = Date.now();
  const { id } = await (await fetch(`${WEBAPI}/web/session`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "openai" }),
  })).json();

  let text = "";
  let error = "";
  let done = false;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  const stream = await fetch(`${WEBAPI}/web/session/${id}/event`, { signal: ctrl.signal });

  const reader = stream.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done: eof } = await reader.read();
        if (eof) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            let ev;
            try {
              ev = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            const d = ev.data || {};
            if (ev.type === "session.next.text.delta") text += d.delta || "";
            else if (ev.type === "session.error" || ev.type === "session.next.step.failed") {
              error = d.error?.message || d.message || "error";
              done = true;
            } else if (ev.type === "session.idle") {
              if (text) done = true;
              else if (!error) error = "idle without text";
            }
            if (done) return;
          }
        }
      }
    } catch (e) {
      if (!error) error = e.name === "AbortError" ? "timeout" : String(e.message || e);
    }
  })();

  await fetch(`${WEBAPI}/web/session/${id}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: { text: "Reply with exactly one word: pong" }, model: "openai" }),
  });

  await Promise.race([pump, new Promise((r) => setTimeout(r, TIMEOUT))]);
  clearTimeout(timer);
  try {
    ctrl.abort();
  } catch {}

  const ms = Date.now() - started;
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 120);
  return { ok: Boolean(clean), text: clean, error, ms };
}

(async () => {
  if (WEBAPI) {
    try {
      const cfg = await (await fetch(`${WEBAPI}/web/config`)).json();
      say(`web api llm=${cfg.llm} provider=${cfg.provider} model=${cfg.model}`);
      const r = await testWebApi();
      if (r.ok) {
        out(`llm=ok web=${cfg.provider}/${cfg.model} ms=${r.ms} text="${r.text}"`);
        process.exit(0);
      }
      out(`llm=fail web=${cfg.provider}/${cfg.model} error="${(r.error || "no text").slice(0, 90)}"`);
      process.exit(1);
    } catch (e) {
      out(`llm=fail web=${WEBAPI} error="${String(e.message || e).slice(0, 90)}"`);
      process.exit(1);
    }
  }

  let list;
  try {
    list = (await json("/api/model")).data || [];
  } catch (e) {
    out(`llm=fail reason="model list failed: ${String(e.message).slice(0, 80)}"`);
    process.exit(1);
  }

  // raw provider probe: is the inference endpoint itself reachable/authorized?
  const probeModel = pickModels(list)[0];
  let probeTag = "probe=skip";
  if (probeModel?.api?.url) {
    const url = probeModel.api.url.replace(/\/$/, "") + "/chat/completions";
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${probeModel.request?.body?.apiKey || "public"}`,
        },
        body: JSON.stringify({ model: probeModel.api.id || probeModel.id, messages: [{ role: "user", content: "hi" }], max_tokens: 4 }),
        signal: AbortSignal.timeout(30000),
      });
      const body = (await r.text()).slice(0, 160).replace(/\s+/g, " ");
      say(`probe ${probeModel.providerID}: HTTP ${r.status} ${body}`);
      probeTag = `probe=${r.status}`;
    } catch (e) {
      say(`probe ${probeModel.providerID}: ERROR ${e.message}`);
      probeTag = "probe=ERR";
    }
  }

  const candidates = pickModels(list);
  if (!candidates.length) {
    out('llm=fail reason="no enabled model"');
    process.exit(1);
  }

  const attempts = [];
  for (const m of candidates) attempts.push(m);
  // 429 on the shared free endpoint is common on CI IPs: retry the same pool once more
  if (process.env.SELFTEST_EXTRA_ROUND === "1") attempts.push(...candidates);

  for (const m of attempts) {
    say(`trying ${m.providerID}/${m.id} (${m.name || ""}) …`);
    let r;
    try {
      r = await tryModel(m);
    } catch (e) {
      r = { ok: false, error: String(e.message || e).slice(0, 120) };
    }
    if (r.ok) {
      out(`llm=ok ${probeTag} model=${r.label} ms=${r.ms} text="${r.text}"`);
      process.exit(0);
    }
    say(`  failed: ${r.error || "no text"}`);
    if (/429|rate|abort/i.test(r.error || "")) {
      say("  backing off 25s before the next attempt");
      await new Promise((r) => setTimeout(r, 15000));
    }
  }

  out(`llm=fail ${probeTag} model=${candidates[0].providerID}/${candidates[0].id} error="no answer from any model"`);
  process.exit(1);
})();
