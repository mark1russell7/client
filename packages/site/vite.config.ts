/// <reference types="node" />
/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import type { UserConfig } from "vite";
import { normalizeBase } from "./src/lib/base";
import { fontPreloadPlugin } from "./src/build-time/font-preload-plugin";
import { spaFallbackPlugin } from "./src/build-time/spa-fallback-plugin";

// GitHub Pages serves the site at /client/. SITE_BASE sets another base, for example "/" for a local preview.
const config: UserConfig = {
  base: normalizeBase(process.env["SITE_BASE"] ?? "/client/"),
  // After the build: an HTML file for each page (prerendered in Chromium), 404.html, the Open
  // Graph images, sitemap.xml and llms.txt. SITE_PRERENDER=0 turns off the Chromium steps.
  plugins: [react(), fontPreloadPlugin(), spaFallbackPlugin()],
  // The unit tests. Playwright runs the browser tests in e2e/ (`pnpm test:e2e`).
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
};

export default config;
