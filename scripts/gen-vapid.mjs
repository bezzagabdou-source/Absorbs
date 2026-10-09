// node scripts/gen-vapid.mjs  → prints the 3 env vars to add on Vercel
import crypto from "crypto";
const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const pub = publicKey.export({ format: "jwk" });
const prv = privateKey.export({ format: "jwk" });
const b64 = (s) => s; // jwk fields are already base64url
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]);
console.log("VAPID_PUBLIC_KEY=" + raw.toString("base64url"));
console.log("VAPID_PRIVATE_KEY=" + b64(prv.d));
console.log("VAPID_SUBJECT=mailto:abdiubz0@gmail.com");
console.log("CRON_SECRET=" + crypto.randomBytes(24).toString("hex"));
