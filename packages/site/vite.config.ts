/// <reference types="node" />
/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import type { UserConfig } from "vite";

// GitHub Pages serves the site at /client/. SITE_BASE sets another base, for example "/" for a local preview.
const config: UserConfig = {
  base: process.env["SITE_BASE"] ?? "/client/",
  plugins: [react()],
  // The unit tests. Playwright runs the browser tests in e2e/ (`pnpm test:e2e`).
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
};

export default config;
