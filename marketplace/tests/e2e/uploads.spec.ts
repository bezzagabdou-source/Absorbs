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
const origin = () => process.env.E2E_BASE_URL || "http://localhost:3000";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
test("seller uploads a device photo and publishes a listing without image URLs", async ({ page }) => {
  const login = await page.request.post("/api/auth/demo", { data: { role: "seller" }, headers: { Origin: origin() } }); expect(login.ok()).toBeTruthy();
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /New listing|Nouvelle annonce|إعلان جديد/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Listing title|Titre de l'annonce|عنوان الإعلان/).fill(`Uploaded photo test ${Date.now()}`);
  await dialog.getByLabel(/Description|الوصف/).fill("A real device upload test listing with enough description text.");
  await dialog.getByLabel(/^Price|Prix|السعر/).fill("1234");
  await dialog.getByLabel(/Category|Catégorie|التصنيف/).selectOption({ index: 1 });
  await dialog.getByLabel(/Wilaya|الولاية/).selectOption("16");
  await dialog.getByLabel(/Commune|البلدية/).fill("Hydra");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "device.png", mimeType: "image/png", buffer: png });
  await expect(dialog.locator(".upload-previews li")).toHaveCount(1);
  await expect(dialog.locator(".upload-previews img")).toHaveAttribute("src", /^\/api\/media\/[0-9a-f-]{36}$/);
  await dialog.getByRole("button", { name: /Save|Enregistrer|حفظ/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/Uploaded photo test/).first()).toBeVisible();
});
test("upload API rejects unauthenticated, cross-origin and non-image files", async ({ request }) => {
  expect((await request.post("/api/uploads", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: png } } })).status()).toBe(403);
  expect((await request.post("/api/uploads", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: png } }, headers: { Origin: origin() } })).status()).toBe(401);
  const login = await request.post("/api/auth/demo", { data: { role: "seller" }, headers: { Origin: origin() } }); expect(login.ok()).toBeTruthy();
  const cross = await request.post("/api/uploads", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: png } }, headers: { Origin: "https://attacker.invalid" } }); expect(cross.status()).toBe(403);
  const bad = await request.post("/api/uploads", { multipart: { file: { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("hello") } }, headers: { Origin: origin() } }); expect(bad.status()).toBe(415);
});
