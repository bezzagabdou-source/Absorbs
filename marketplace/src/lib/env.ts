import { z } from "zod";
export function requiredEnv(name: string): string { const value = process.env[name]; if (!value) throw new Error(`Missing server configuration: ${name}`); return value; }
export function isDemoMode(): boolean { return process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true"; }
export function appOrigin(): string { const value = process.env.APP_URL; if (value) return z.url().parse(value).replace(/\/$/, ""); if (process.env.NODE_ENV !== "production") return "http://localhost:3000"; throw new Error("APP_URL is required in production"); }
export function pushConfigured(): boolean { return Boolean(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_SUBJECT); }
export function pushEndpointAllowed(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    const hosts = (process.env.PUSH_ALLOWED_HOSTS || "fcm.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com,notify.windows.com").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
    return url.protocol === "https:" && !url.port && !url.username && !url.password && hosts.includes(url.hostname.toLowerCase());
  } catch { return false; }
}
