/// <reference types="node" />
/**
 * The static files of the site after the build (from the AsyncBrowserContext site).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import type { Browser } from "@playwright/test";
import type { Plugin, ResolvedConfig } from "vite";
import { build } from "../data";
import { docs } from "../data/docs";
import { LIBRARY_NAME, REPOSITORY_URL, SITE_NAME, SITE_TAGLINE, SITE_URL, registerDocDescriptions, staticPages } from "../lib/seo";
import { headTags, ogImageFile, type SiteFacts } from "./head-tags";
import { llmsTxt } from "./llms";
import { ogCard, ogImageHtml, type OgFonts } from "./og-image";
import { prerenderRoutes, renderOgImages } from "./prerender";
import { fileUrl, resolveSiteUrl, routeUrl } from "./site-url";
import { sitemapXml } from "./sitemap";
import { colorTokens, pageHtml, type Snapshot } from "./snapshot";
import { routeFiles } from "./static-routes";

/** The mode of the prerender: "off" ("0", "false", "no", "off"), "required" ("1", "true", "yes", "on"), else "auto". */
export function prerenderMode(value: string | undefined): "off" | "required" | "auto" {
  if (/^\s*(0|false|no|off)\s*$/i.test(value ?? "")) return "off";
  if (/^\s*(1|true|yes|on)\s*$/i.test(value ?? "")) return "required";
  return "auto";
}

async function launchChromium(): Promise<Browser> {
  const { chromium } = await import("@playwright/test");
  try {
    return await chromium.launch();
  } catch (error) {
    throw new Error(
      [
        "The site build renders each page in Chromium, but Chromium did not start.",
        'Install it with "pnpm --filter @procedures/site exec playwright install chromium", or set SITE_PRERENDER=0 to build without prerendered pages.',
        error instanceof Error ? error.message : String(error),
      ].join("\n"),
    );
  }
}

async function siteFonts(root: string): Promise<OgFonts> {
  const source = async (pkg: string, file: string): Promise<string> =>
    `url(data:font/woff2;base64,${(await readFile(path.join(root, "node_modules", "@fontsource-variable", pkg, "files", file))).toString("base64")}) format("woff2")`;
  return {
    sans: [await source("atkinson-hyperlegible-next", "atkinson-hyperlegible-next-latin-wght-normal.woff2")],
    mono: [await source("atkinson-hyperlegible-mono", "atkinson-hyperlegible-mono-latin-wght-normal.woff2")],
  };
}

async function siteFacts(root: string): Promise<SiteFacts> {
  const library = JSON.parse(await readFile(path.resolve(root, "..", "client", "package.json"), "utf8")) as { version?: string; description?: string };
  return {
    url: resolveSiteUrl(process.env["SITE_URL"], SITE_URL),
    name: SITE_NAME,
    libraryName: LIBRARY_NAME,
    softwareDescription: `${SITE_TAGLINE}. One procedure registry for your code, a CLI, HTTP, WebSocket and the MCP tools of Claude Code, with streaming, middleware and a visual composer.`,
    repository: REPOSITORY_URL,
    license: "MIT",
    ...(library.version === undefined ? {} : { version: library.version }),
    author: "Mark Russell",
    keywords: ["typescript", "rpc", "procedures", "json", "mcp", "model context protocol", "claude code", "cli", "websocket", "streaming", "middleware", "workflow"],
  };
}

/**
 * This plugin writes the static files of the site after the build:
 *
 * - An HTML file for each page (refer to `lib/seo.ts`), with the head tags of the page and, from
 *   Chromium, the full HTML of the page. Search engines and link previews read it with no
 *   JavaScript. The app replaces it with no flash (refer to `lib/prerender-handoff.ts`).
 * - `404.html`: the app with an empty root element. For any other path, GitHub Pages serves this
 *   file, and the router shows the page.
 * - An Open Graph image for each page, in `og/`.
 * - `sitemap.xml` and `llms.txt`.
 *
 * `SITE_URL` sets the absolute URL of the site. `SITE_PRERENDER=0` builds without Chromium (no
 * page HTML and no images). `SITE_PRERENDER=1` makes Chromium required. Without the variable, the
 * build prerenders when Chromium starts, and warns when it does not.
 */
export function spaFallbackPlugin(): Plugin {
  let config: ResolvedConfig | undefined;
  return {
    name: "client-site:spa-fallback",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    async writeBundle() {
      if (!config) return;
      const { root, logger } = config;
      const warn = (message: string): void => logger.warn(message);
      const outDir = path.resolve(root, config.build.outDir);
      const template = await readFile(path.join(outDir, "index.html"), "utf8");
      await writeFile(path.join(outDir, "404.html"), template, "utf8");

      const site = await siteFacts(root);
      // The head tags of the docs pages get their real descriptions (the main bundle has none)
      registerDocDescriptions(docs.map((doc) => [doc.slug, doc.description] as const));
      const routes = staticPages();
      const tokens = colorTokens(await readFile(path.join(root, "src", "styles", "tokens.css"), "utf8"));

      let snapshots = new Map<string, Snapshot>();
      let images = false;
      const mode = prerenderMode(process.env["SITE_PRERENDER"]);
      if (mode !== "off") {
        let browser: Browser | undefined;
        try {
          browser = await launchChromium();
        } catch (error) {
          if (mode === "required") throw error;
          warn(`${(error as Error).message}\nThe pages have no prerendered HTML, and the Open Graph images are not in the output.`);
        }
        if (browser) {
          const started = performance.now();
          try {
            snapshots = await prerenderRoutes({
              browser,
              outDir,
              baseUrl: new URL(config.base, site.url).href,
              template,
              routes,
              tokens,
              concurrency: Math.min(4, availableParallelism()),
              warn,
            });
            await renderOgImages(
              browser,
              outDir,
              ogImageHtml(await siteFonts(root)),
              routes.map((route) => ({ file: ogImageFile(route), card: ogCard(route, site) })),
            );
            images = true;
          } finally {
            await browser.close();
          }
          logger.info(`Prerendered ${routes.length} pages and their Open Graph images in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
        }
      } else {
        warn("SITE_PRERENDER is off: the pages have no prerendered HTML, and the Open Graph images are not in the output.");
      }

      for (const route of routes) {
        const html = pageHtml(template, { route, head: headTags(route, site), snapshot: snapshots.get(route.path), tokens });
        for (const file of routeFiles(route)) {
          const target = path.join(outDir, file);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, html, "utf8");
        }
      }
      await writeFile(path.join(outDir, "sitemap.xml"), sitemapXml(routes.map((route) => routeUrl(site.url, route.path)), build.date ?? undefined), "utf8");
      await writeFile(path.join(outDir, "llms.txt"), llmsTxt(routes, site), "utf8");
      if (!images) warn(`No Open Graph images: the head tags name ${fileUrl(site.url, "og/index.png")} and the other images, which are not in the output.`);
    },
  };
}
