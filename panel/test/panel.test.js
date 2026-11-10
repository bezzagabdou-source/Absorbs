/* FT AI — اختبارات النواة + الذكاء الاصطناعي + اللوحة
   تشغيل: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import crypto from "node:crypto";

/* ───── Redis وهمي (RESP) لاختبار عميل Redis بلا شبكة خارجية ───── */
const store = new Map();
const redisServer = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const parsed = parseCmd(buf);
      if (!parsed) break;
      buf = parsed.rest;
      const [cmd, ...args] = parsed.args;
      const C = String(cmd).toUpperCase();
      let out;
      if (C === "AUTH") out = "+OK\r\n";
      else if (C === "PING") out = "+PONG\r\n";
      else if (C === "GET") {
        const v = store.get(args[0]);
        out = v == null ? "$-1\r\n" : `$${Buffer.byteLength(v)}\r\n${v}\r\n`;
      } else if (C === "SET") { store.set(args[0], args[1]); out = "+OK\r\n"; }
      else if (C === "DEL") { out = `:${store.delete(args[0]) ? 1 : 0}\r\n`; }
      else if (C === "INCR") { const v = Number(store.get(args[0]) ?? 0) + 1; store.set(args[0], String(v)); out = `:${v}\r\n`; }
      else if (C === "EXPIRE") out = ":1\r\n";
      else out = "+OK\r\n";
      sock.write(out);
    }
  });
});

function parseCmd(buf) {
  if (buf.length < 4 || buf[0] !== 0x2a) return null;
  const lineEnd = buf.indexOf("\r\n");
  if (lineEnd < 0) return null;
  const n = Number(buf.toString("utf8", 1, lineEnd));
  const args = [];
  let pos = lineEnd + 2;
  for (let i = 0; i < n; i++) {
    const le = buf.indexOf("\r\n", pos);
    if (le < 0) return null;
    const len = Number(buf.toString("utf8", pos + 1, le));
    if (buf.length < le + 2 + len + 2) return null;
    args.push(buf.toString("utf8", le + 2, le + 2 + len));
    pos = le + 2 + len + 2;
  }
  return { args, rest: buf.subarray(pos) };
}

await new Promise((r) => redisServer.listen(0, "127.0.0.1", r));
const redisUrl = `redis://127.0.0.1:${redisServer.address().port}`;
process.env.REDIS_URL = redisUrl;
process.env.SESSION_SECRET = "test-secret-key";
process.env.DASHBOARD_PASSWORD = "initial-pass1";
process.env.AI_BASE_OPENROUTER = "http://127.0.0.1:9912/v1";
process.env.OPENROUTER_API_KEY = "sk-or-v1-test-key-0123456789";

/* مزوّد AI وهمي (HTTP حقيقي على 127.0.0.1) */
import http from "node:http";
const aiCalls = [];
const aiServer = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    aiCalls.push(payload);
    const hasToolResult = payload.messages.some((m) => m.role === "tool");
    const message = hasToolResult
      ? { role: "assistant", content: "شفت الإحصائيات ✅" }
      : { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "get_stats", arguments: "{}" } }] };
    const data = JSON.stringify({ model: "mock/ft-ai", choices: [{ message }], usage: { total_tokens: 10 } });
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
    res.end(data);
  });
});
await new Promise((r) => aiServer.listen(9912, "127.0.0.1", r));

/* ───── الاستيراد بعد ضبط البيئة ───── */
const core = await import("../lib/core.js");
const ai = await import("../lib/ai.js");
const bot = await import("../lib/bot.js");

test("Redis: كتابة وقراءة الحالة", async () => {
  const s = await core.readState();
  s.settings.botName = "FT AI";
  s.users["111"] = { id: "111", name: "أمين", points: 42, referrals: 0, joined_at: Date.now(), last_seen: Date.now(), ref_code: "abc123", blocked: false, risk: 0 };
  await core.writeState(s);
  const again = await core.readState();
  assert.equal(again.users["111"].points, 42);
  const raw = store.get("ftai:state:v2");
  assert.ok(raw.includes("أمين"), "الحالة تُخزّن في Redis");
});

test("كلمة السر: scrypt + تحقّق", () => {
  const h = core.hashPassword("secret123");
  assert.ok(h.startsWith("scrypt$"));
  assert.equal(core.checkPassword("secret123", h), true);
  assert.equal(core.checkPassword("wrong123", h), false);
  assert.ok(core.passwordProblem("short"));
  assert.ok(core.passwordProblem("allletters"));
  assert.equal(core.passwordProblem("good1234"), null);
});

test("الجلسات: توقيع + انتهاء + إبطال بعد تغيير كلمة السر", async () => {
  const s = await core.readState();
  s.password = { hash: core.hashPassword("oldpass1"), version: 1 };
  const token = core.signSession({ exp: Date.now() + 60000, pv: 1 });
  assert.ok(core.verifySession(token, s));
  assert.equal(core.verifySession(token + "x", s), null);
  assert.equal(core.verifySession(core.signSession({ exp: Date.now() - 1, pv: 1 }), s), null);
  s.password.version = 2;
  assert.equal(core.verifySession(token, s), null, "الجلسة القديمة تنتهي بعد التغيير");
});

test("الأدوات: إحصائيات، نقاط، حظر، أسئلة، إعدادات", async () => {
  await core.updateState((s) => {
    s.users = { "5": { id: "5", name: "سارة", username: "sara", points: 10, referrals: 1, joined_at: Date.now(), last_seen: Date.now(), risk: 0, blocked: false, quiz_total: 2, quiz_correct: 1 } };
    s.questions = [];
    s.referrals = [];
    return s;
  });
  const state = await core.readState();
  const ctx = { state, hashPassword: core.hashPassword, passwordProblem: core.passwordProblem, tgSend: async () => ({ ok: true }), baseUrl: "https://x.test" };
  const run = (name, args) => ai.toolMap()[name].run(args, ctx);

  const st = await run("get_stats", {});
  assert.equal(st.users, 1);
  const give = await run("give_points", { user_id: "5", amount: 15 });
  assert.equal(give.new_balance, 25);
  const block = await run("block_user", { username: "@sara", reason: "سبام" });
  assert.equal(block.blocked, "5");
  assert.equal(state.users["5"].blocked, true);
  await run("unblock_user", { user_id: "5" });
  assert.equal(state.users["5"].blocked, false);

  const add = await run("add_question", { text: "1+1؟", options: ["2", "3"], correct: 0 });
  assert.ok(add.added);
  assert.equal(state.questions.length, 1);
  await run("delete_question", { id: add.added });
  assert.equal(state.questions.length, 0);

  const upd = await run("update_settings", { settings: { protectionLevel: "high", rewardCorrect: 20 } });
  assert.equal(upd.settings.protectionLevel, "high");
  assert.equal(upd.settings.rewardCorrect, 20);

  await assert.rejects(() => Promise.resolve().then(() => run("run_sql_read", { query: "DELETE FROM users" })), /قراءة فقط/);
  const sql = await run("run_sql_read", { query: "SELECT * FROM users LIMIT 5" });
  assert.equal(sql.table, "users");
});

test("كلمة السر عبر الأداة تُبطل النسخة القديمة", async () => {
  const state = await core.readState();
  state.password = { hash: core.hashPassword("oldpass1"), version: 3 };
  const ctx = { state, hashPassword: core.hashPassword, passwordProblem: core.passwordProblem, tgSend: async () => ({ ok: true }) };
  const out = await ai.toolMap().change_password.run({ new_password: "newpass99" }, ctx);
  assert.ok(out.changed);
  assert.equal(core.checkPassword("newpass99", state.password.hash), true);
  assert.equal(state.password.version, 4);
  await assert.rejects(() => ai.toolMap().change_password.run({ new_password: "short" }, ctx));
});

test("AI: حلقة أدوات كاملة عبر مزوّد وهمي", async () => {
  await core.updateState((s) => { s.ai = []; return s; });
  const out = await ai.chat({ message: "عطيني إحصائيات", images: [], source: "test", baseUrl: "https://x.test" });
  assert.equal(out.ok, true);
  assert.equal(out.provider, "openrouter");
  assert.equal(out.trace[0].tool, "get_stats");
  assert.match(out.text, /الإحصائيات|شفت/);
  assert.ok(aiCalls.length >= 2, "استدعى الأداة ثم أجاب");
  const s = await core.readState();
  assert.ok(s.ai.some((m) => m.role === "user"));
});

test("AI: صورة تُمرَّر كـ data URL للنموذج", async () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wFPh7WjAAAAAElFTkSuQmCC";
  const out = await ai.chat({ message: "شوف الصورة", images: [{ dataUrl: png }], source: "test" });
  assert.equal(out.ok, true);
  const lastCall = aiCalls[aiCalls.length - 1];
  const userMsg = [...lastCall.messages].reverse().find((m) => m.role === "user");
  assert.ok(Array.isArray(userMsg.content), "المحتوى متعدّد الأجزاء");
  assert.ok(userMsg.content.some((p) => p.type === "image_url"));
});

test("AI: الدرع المحلي ينفّذ بلا مزوّد", async () => {
  const saved = { ...process.env };
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.XAI_API_KEY;
  await core.updateState((s) => { s.users = { "9": { id: "9", name: "كريم", points: 3, referrals: 0, joined_at: Date.now(), last_seen: Date.now(), risk: 0, blocked: false } }; s.ai = []; return s; });
  const out = await ai.chat({ message: "عطيني إحصائيات", images: [], source: "test" });
  assert.equal(out.ok, true);
  assert.match(out.text, /العدد/);
  Object.assign(process.env, saved);
});

test("البوت: /start ينشئ عضواً + إحالة مشبوهة تُوسم", async () => {
  await core.updateState((s) => { s.users = {}; s.referrals = []; return s; });
  const tg = await import("../lib/tg.js");
  const sent = [];
  const origSend = tg.sendMessage;
  // نعترض الإرسال (بلا شبكة)
  await bot.handleUpdate({ message: { message_id: 1, chat: { id: 555 }, from: { id: 555, first_name: "ياسين", username: "yacine" }, text: "/start" } }, { ip: "1.2.3.4" });
  let s = await core.readState();
  assert.ok(s.users["555"], "العضو تدار");
  assert.ok(s.users["555"].ref_code);

  // عضو جديد عن طريق كود الإحالة
  const code = s.users["555"].ref_code;
  await bot.handleUpdate({ message: { message_id: 2, chat: { id: 556 }, from: { id: 556, first_name: "ياسين", username: "yacine2" }, text: `/start ${code}` } }, { ip: "1.2.3.4" });
  s = await core.readState();
  assert.equal(s.referrals.length, 1);
  assert.equal(s.referrals[0].referrer_id, "555");
  assert.equal(s.referrals[0].status, "flagged", "نفس الاسم + نفس IP ⇒ مشبوهة");
});

test("البوت: جواب صحيح يزيد النقاط", async () => {
  await core.updateState((s) => {
    s.users = { "7": { id: "7", name: "ليلى", points: 0, referrals: 0, joined_at: Date.now(), last_seen: Date.now(), risk: 0, blocked: false, quiz_total: 0, quiz_correct: 0, streak: 0 } };
    s.questions = [{ id: "qx", text: "2+2؟", options: ["4", "5"], correct: 0, category: "عام" }];
    return s;
  });
  await bot.handleUpdate({ callback_query: { id: "cb1", data: "ans:qx:0", from: { id: 7, first_name: "ليلى" } } }, { ip: "9.9.9.9" });
  const s = await core.readState();
  assert.ok(s.users["7"].points > 0, "النقاط تزادت");
  assert.equal(s.users["7"].quiz_correct, 1);
});

test("رفع صورة: كشف النوع من البايتات + حفظ في Redis", async () => {
  const { sniff } = await import("../lib/http-kit.js");
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");
  assert.equal(sniff(png), "image/png");
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(sniff(jpg), "image/jpeg");
  assert.equal(sniff(Buffer.from("hello world!!")), null);

  await core.putImage("im1", { data: png.toString("base64"), mime: "image/png" });
  const got = await core.getImage("im1");
  assert.equal(got.mime, "image/png");
  assert.ok(store.get("ftai:img:im1"), "الصورة في Redis");
  await core.delImage("im1");
  assert.equal(await core.getImage("im1"), null);
});

test("فيب هوك: الترويسة السرّية", async () => {
  const secret = bot.webhookSecret();
  assert.equal(typeof secret, "string");
  assert.ok(secret.length >= 16);
});

test("نقاط الحماية: سقف محاولات الدخول", async () => {
  let allowed = true;
  for (let i = 0; i < 14; i++) allowed = await core.loginAllowed("10.0.0.9");
  assert.equal(allowed, false);
});

/* ───── تنظيف ───── */
test.after(async () => {
  redisServer.close();
  aiServer.close();
});
