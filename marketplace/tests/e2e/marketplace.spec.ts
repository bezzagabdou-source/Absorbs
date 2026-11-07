import { test as base, expect, chromium as browserType } from "@playwright/test";
import serverless, { inflate, setupLambdaEnvironment } from "@sparticuz/chromium";
import { join } from "node:path";
import { tmpdir } from "node:os";
const test = base.extend({ browser: [async ({}, use) => {
  let options = { headless: true };
  if (process.env.E2E_SERVERLESS_CHROMIUM === "true") {
    const lib = join(tmpdir(), "al2023", "lib");
    await inflate(join(process.cwd(), "node_modules/@sparticuz/chromium/bin/al2023.tar.br"));
    setupLambdaEnvironment(lib);
    options = { ...options, executablePath: await serverless.executablePath(), args: serverless.args.filter((arg) => arg !== "--disable-web-security" && arg !== "--allow-running-insecure-content" && arg !== "--single-process") } as typeof options;
  }
  const browser = await browserType.launch(options); await use(browser); await browser.close();
}, { scope: "worker" }] });
test("Arabic, English and French switch immediately with correct direction", async ({ page }) => {
  await page.goto("/"); await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("combobox", { name: /Language|اللغة|Langue/ }).selectOption("en"); await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("link", { name: "Explore", exact: true }).first()).toBeVisible();
  await page.reload(); await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("combobox", { name: /Language|اللغة|Langue/ }).selectOption("fr"); await expect(page.getByRole("link", { name: "Explorer", exact: true }).first()).toBeVisible();
});
test("catalog search and wilaya filters use real listings", async ({ page }) => {
  await page.goto("/explore"); await expect(page.getByTestId("product-card").first()).toBeVisible();
  await page.getByRole("textbox", { name: /Search the marketplace|ابحث في السوق|Rechercher/ }).last().fill("iPhone"); await expect(page).toHaveURL(/q=iPhone/);
  await page.getByLabel(/Wilaya|الولاية/).last().selectOption("16"); await expect(page).toHaveURL(/wilaya=16/);
  await expect(page.getByTestId("product-card").first()).toBeVisible();
  await page.getByRole("textbox", { name: /Search the marketplace|ابحث في السوق|Rechercher/ }).last().fill("no-such-product-zzzzz"); await expect(page.getByRole("heading", { name: /No listings|لا توجد إعلانات|Aucune annonce/ })).toBeVisible();
});
test("product details and bargain dialog are translated and accessible", async ({ page }) => {
  await page.goto("/explore"); await page.getByTestId("product-card").first().getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /قدّم عرضاً|Make an offer|Faire une offre/ }).click(); await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("mobile navigation loads without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  await expect(page.getByRole("navigation")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("seller dashboard renders database-backed charts", async ({ page }) => {
  const login = await page.request.post("/api/auth/demo", { data: { role: "seller" }, headers: { Origin: process.env.E2E_BASE_URL || "http://localhost:3000" } }); expect(login.ok()).toBeTruthy();
  await page.goto("/dashboard"); await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".recharts-wrapper").first()).toBeVisible(); await expect(page.getByText(/Revenue|Chiffre|الإيرادات/).first()).toBeVisible();
});
test("buyer can submit a real offer and see confirmation", async ({ page }) => {
  const login = await page.request.post("/api/auth/demo", { data: { role: "buyer" }, headers: { Origin: process.env.E2E_BASE_URL || "http://localhost:3000" } }); expect(login.ok()).toBeTruthy();
  await page.goto("/explore"); await page.getByTestId("product-card").first().getByRole("link").first().click();
  await page.getByRole("button", { name: /قدّم عرضاً|Make an offer|Faire une offre/ }).click();
  await page.getByRole("button", { name: /أرسل العرض|Send offer|Envoyer mon offre/ }).click();
  await expect(page.getByRole("dialog").getByRole("link")).toBeVisible();
});
test("service worker activates and API rejects unauthenticated and cross-origin writes", async ({ page, request }) => {
  expect((await request.get("/api/dashboard")).status()).toBe(401);
  const cross = await request.post("/api/offers", { data: {}, headers: { Origin: "https://attacker.invalid" } }); expect(cross.status()).toBe(403);
  await page.goto("/"); await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
});
