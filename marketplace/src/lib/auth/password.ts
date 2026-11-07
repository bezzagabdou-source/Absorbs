import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
const scrypt = (password: string, salt: string, length: number, options: { N: number; r: number; p: number; maxmem: number }) => new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, length, options, (error, key) => error ? reject(error) : resolve(key)));
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64, options);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  const [algorithm, salt, hex] = (encoded ?? "scrypt$00000000000000000000000000000000$" + "00".repeat(64)).split("$");
  if (algorithm !== "scrypt" || !salt || !/^[a-f0-9]{128}$/.test(hex ?? "")) return false;
  const actual = await scrypt(password, salt, 64, options);
  return timingSafeEqual(actual, Buffer.from(hex, "hex")) && encoded !== null;
}
