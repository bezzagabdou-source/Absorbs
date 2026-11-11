import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests/e2e", timeout: 60000, expect: { timeout: 15000 }, fullyParallel: false, workers: 1, reporter: "list", use: { baseURL: process.env.E2E_BASE_URL || "http://localhost:3000", headless: true, viewport: { width: 1360, height: 1000 }, screenshot: "only-on-failure", trace: "retain-on-failure" } });
