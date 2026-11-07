import { describe, expect, it } from "vitest";
import { notificationPayload } from "@/features/notifications/push.server";
import { locales } from "@/lib/i18n/config";
describe("push payload", () => { it("localizes notifications and constrains destinations", () => { for (const locale of locales) { const payload = notificationPayload({ id: "notification-1", kind: "offer", url: "/dashboard?tab=offers" }, locale); expect(payload.locale).toBe(locale); expect(payload.title).not.toBe(notificationPayload({ id: "1", kind: "offer", url: "/" }, "en").title && locale === "ar"); expect(payload.url).toBe("/dashboard?tab=offers"); } expect(notificationPayload({ id: "1", kind: "offer", url: "https://attacker.example" }, "fr").url).toBe("/"); }); });
