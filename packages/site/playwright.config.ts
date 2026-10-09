/// <reference types="node" />
import { defineConfig, devices } from "@playwright/test";

// The smoke test runs against the built site (`vite preview`), with the base of GitHub Pages.
const port = Number(process.env["SITE_PORT"] ?? 4173);
const base = process.env["SITE_BASE"] ?? "/client/";
const url = `http://localhost:${port}${base}`;

export default defineConfig({
  testDir: "e2e",
  // In node_modules, so git ignores the traces and the screenshots
  outputDir: "node_modules/.cache/playwright/results",
  timeout: 60_000,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  use: { baseURL: url, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `vite preview --port ${port} --strictPort`,
    url,
    reuseExistingServer: !process.env["CI"],
  },
});
