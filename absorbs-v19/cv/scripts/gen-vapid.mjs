/**
 * v15 — يولّد مفاتيح VAPID بلا أي مكتبة خارجية.
 * الاستعمال:  node scripts/gen-vapid.mjs
 * ثم انسخ السطرين لملف .env
 */
import { webcrypto } from "node:crypto";
const { subtle } = webcrypto;
const b64u = (buf) => Buffer.from(buf).toString("base64url");

const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = await subtle.exportKey("raw", pair.publicKey);
const jwk = await subtle.exportKey("jwk", pair.privateKey);

console.log("\n# زيد هذي فـ .env ثم أعد تشغيل الخادم\n");
console.log(`VAPID_PUBLIC_KEY=${b64u(pub)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log(`VAPID_SUBJECT=mailto:admin@example.com\n`);
