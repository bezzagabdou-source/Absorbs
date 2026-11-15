/**
 * 🔌 عميل Redis صغير فوق TCP (RESP2) بلا اعتماديات.
 *
 * يُستعمل فقط للمخزن الاحتياطي الدائم (REDIS_URL = redis:// أو rediss://) حين
 * تتعطّل القاعدة الأساسية. Upstash REST يبقى عبر fetch في store.ts.
 */
import net from "node:net";
import tls from "node:tls";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
type Parsed = { value: unknown; rest: Buffer } | null;

const CONNECT_TIMEOUT = 6000;
const COMMAND_TIMEOUT = 6000;

function encode(args: (string | number)[]): string {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    const s = String(arg);
    out += `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
  }
  return out;
}

function parse(buffer: Buffer): Parsed {
  if (!buffer.length) return null;
  const nl = buffer.indexOf("\r\n");
  if (nl === -1) return null;
  const type = String.fromCharCode(buffer[0]);
  const line = buffer.subarray(1, nl).toString();
  const rest = buffer.subarray(nl + 2);
  if (type === "+") return { value: line, rest };
  if (type === "-") return { value: new Error(line), rest };
  if (type === ":") return { value: Number(line), rest };
  if (type === "$") {
    const len = Number(line);
    if (len === -1) return { value: null, rest };
    if (rest.length < len + 2) return null;
    return { value: rest.subarray(0, len).toString(), rest: rest.subarray(len + 2) };
  }
  if (type === "*") {
    const count = Number(line);
    if (count === -1) return { value: null, rest };
    let cursor = rest;
    const out: unknown[] = [];
    for (let i = 0; i < count; i += 1) {
      const next = parse(cursor);
      if (!next) return null;
      out.push(next.value);
      cursor = next.rest;
    }
    return { value: out, rest: cursor };
  }
  return { value: line, rest };
}

class TcpRedis {
  private socket: net.Socket | null = null;
  private connecting: Promise<void> | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private queue: Pending[] = [];
  private readonly host: string;
  private readonly port: number;
  private readonly username: string;
  private readonly password: string;
  private readonly secure: boolean;
  private readonly db: number;

  constructor(url: string) {
    const parsed = new URL(url);
    this.host = parsed.hostname;
    this.port = Number(parsed.port || 6379);
    this.username = parsed.username ? decodeURIComponent(parsed.username) : "";
    this.password = parsed.password ? decodeURIComponent(parsed.password) : "";
    this.secure = parsed.protocol === "rediss:";
    this.db = Number((parsed.pathname || "/0").slice(1) || 0) || 0;
  }

  private drop(error: Error) {
    const socket = this.socket;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    socket?.destroy();
    for (const pending of this.queue.splice(0)) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  private connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = new Promise<void>((resolve, reject) => {
      const socket: net.Socket = this.secure
        ? tls.connect({ host: this.host, port: this.port, servername: this.host })
        : net.connect({ host: this.host, port: this.port });
      let settled = false;
      const timer = setTimeout(() => fail(new Error("Redis connect timeout")), CONNECT_TIMEOUT);
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.socket === socket || !this.socket) this.drop(error);
        socket.destroy();
        reject(error);
      };
      socket.setNoDelay(true);
      socket.on("data", (chunk: Buffer) => this.onData(chunk));
      const lost = (error: Error) => {
        if (!settled) fail(error);
        else if (this.socket === socket) this.drop(error);
      };
      socket.on("error", lost);
      socket.on("close", () => lost(new Error("Redis connection closed")));
      socket.once(this.secure ? "secureConnect" : "connect", async () => {
        this.socket = socket;
        try {
          if (this.password) {
            await this.raw(this.username ? ["AUTH", this.username, this.password] : ["AUTH", this.password]);
          }
          if (this.db) await this.raw(["SELECT", this.db]);
          settled = true;
          clearTimeout(timer);
          resolve();
        } catch (error) {
          fail(error as Error);
        }
      });
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private onData(chunk: Buffer) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    for (;;) {
      const parsed = parse(this.buffer);
      if (!parsed) break;
      this.buffer = parsed.rest;
      const pending = this.queue.shift();
      if (!pending) continue;
      clearTimeout(pending.timer);
      if (parsed.value instanceof Error) pending.reject(parsed.value);
      else pending.resolve(parsed.value);
    }
  }

  private raw(args: (string | number)[]): Promise<unknown> {
    const socket = this.socket;
    if (!socket || socket.destroyed) return Promise.reject(new Error("Redis connection unavailable"));
    return new Promise((resolve, reject) => {
      // مهلة = الاتصال كله مشكوك فيه: نقطعه حتى لا تختلط الردود المتأخرة
      const timer = setTimeout(() => this.drop(new Error(`Redis timeout (${args[0]})`)), COMMAND_TIMEOUT);
      this.queue.push({ resolve, reject, timer });
      socket.write(encode(args));
    });
  }

  async command<T = unknown>(args: (string | number)[]): Promise<T> {
    await this.connect();
    return (await this.raw(args)) as T;
  }
}

const globalForTcp = globalThis as unknown as { __ftTcpRedis?: Map<string, TcpRedis> };

/** منفّذ أوامر مشترك لكل رابط (اتصال واحد لكل نسخة دالة) */
export function tcpRedisExecutor(url: string) {
  globalForTcp.__ftTcpRedis ||= new Map();
  let client = globalForTcp.__ftTcpRedis.get(url);
  if (!client) {
    client = new TcpRedis(url);
    globalForTcp.__ftTcpRedis.set(url, client);
  }
  const c = client;
  return <T = unknown>(args: (string | number)[]) => c.command<T>(args);
}
