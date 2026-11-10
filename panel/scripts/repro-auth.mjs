import net from "node:net";

/* Redis وهمي كامل للاختبار */
const store = new Map();
function parseCmd(buf) {
  if (buf.length < 4 || buf[0] !== 0x2a) return null;
  const le = buf.indexOf("\r\n");
  if (le < 0) return null;
  const n = Number(buf.toString("utf8", 1, le));
  const args = [];
  let pos = le + 2;
  for (let i = 0; i < n; i++) {
    const l2 = buf.indexOf("\r\n", pos);
    if (l2 < 0) return null;
    const len = Number(buf.toString("utf8", pos + 1, l2));
    if (buf.length < l2 + 2 + len + 2) return null;
    args.push(buf.toString("utf8", l2 + 2, l2 + 2 + len));
    pos = l2 + 2 + len + 2;
  }
  return { args, rest: buf.subarray(pos) };
}
const srv = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  sock.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      const p = parseCmd(buf);
      if (!p) break;
      buf = p.rest;
      const C = String(p.args[0]).toUpperCase();
      if (C === "GET") {
        const v = store.get(p.args[1]);
        sock.write(v == null ? "$-1\r\n" : `$${Buffer.byteLength(v)}\r\n${v}\r\n`);
      } else if (C === "SET") { store.set(p.args[1], p.args[2]); sock.write("+OK\r\n"); }
      else if (C === "INCR") { const v = Number(store.get(p.args[1]) ?? 0) + 1; store.set(p.args[1], String(v)); sock.write(`:${v}\r\n`); }
      else if (C === "DEL") { store.delete(p.args[1]); sock.write(":1\r\n"); }
      else sock.write("+PONG\r\n");
    }
  });
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
process.env.REDIS_URL = `redis://127.0.0.1:${srv.address().port}`;
process.env.SESSION_SECRET = "s1";
process.env.DASHBOARD_PASSWORD = "Barq2026";

const handler = (await import("/home/user/Absorbs/panel/api/index.js")).default;

function call(path, { method = "GET", cookie = "", body = null } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(t) { resolve({ status: this.statusCode, headers: this.headers, body: t ? JSON.parse(t) : null }); },
    };
    const req = {
      method,
      url: `/api/${path}`,
      headers: cookie ? { cookie } : {},
      async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); },
    };
    handler(req, res);
  });
}

const r1 = await call("auth/login", { method: "POST", body: { password: "Barq2026" } });
console.log("login:", r1.status, JSON.stringify(r1.body), "cookie:", Boolean(r1.headers["set-cookie"]));
const cookie = String(r1.headers["set-cookie"] ?? "").split(";")[0];
const r2 = await call("overview", { cookie });
console.log("overview:", r2.status, r2.body?.ok, r2.body?.error ?? "");
const r3 = await call("auth/session", { cookie });
console.log("session:", JSON.stringify(r3.body));
const r4 = await call("auth/password", { method: "POST", cookie, body: { current: "", next: "NewPass2026" } });
console.log("password (بلا كلمة حالية):", r4.status, JSON.stringify(r4.body));
const cookie2 = String(r4.headers["set-cookie"] ?? "").split(";")[0];
const r5 = await call("overview", { cookie: cookie2 });
console.log("overview بعد التغيير بنفس الجهاز:", r5.status, r5.body?.ok);
const r6 = await call("overview", { cookie });
console.log("overview بالجلسة القديمة:", r6.status, r6.body?.error ?? "");
srv.close();
process.exit(0);
