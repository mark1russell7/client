/// <reference types="node" />
/**
 * The pages for search engines and link previews: each static page has its own HTML file with
 * its head tags, the sitemap lists them, old hash links still work, and each page stays within
 * its size budget (after the Vex site: 256 kB of gzip for a page). The main bundle has no
 * procedure schemas: the page of a procedure loads the schemas of its package only.
 */

import { test, expect, type Page, type Response } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import catalogJson from "../src/data/generated/catalog.js";

/** The fixed pages and a sample of the procedure and package pages. */
const ROUTES = [
  "",
  "composer/",
  "catalog/",
  "catalog/client.chain/",
  "catalog/git.status/",
  "architecture/",
  "architecture/client/",
  "lab/",
  "claude/",
  "status/",
  "releases/",
  "docs/",
  "docs/program-format/",
  // The longest README
  "docs/packages/client-mongo/",
];

/** The budgets of one page, in bytes after gzip (a font counts as it is: woff2 is compressed already). */
const PAGE_BUDGET = 256 * 1024;
const SCRIPT_BUDGET = 180 * 1024;
/**
 * The scripts of the Web Workers (the runtime that runs a program, the journey of a call). They
 * load off the main thread when a program runs, so they have a budget of their own. Before, they
 * counted in the page only when they loaded before the end of the measure (a matter of timing).
 */
const WORKER_BUDGET = 128 * 1024;

/** This function opens a page and waits until the live app replaced the HTML of the build. */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => document.querySelector("[data-prerendered]") === null, null, { timeout: 15_000 });
  await expect(page.locator("main")).toBeVisible();
}

function attribute(html: string, pattern: RegExp): string | undefined {
  return pattern.exec(html)?.[1];
}

test.describe("the static pages", () => {
  for (const route of ROUTES) {
    test(`/${route} has its title, description, canonical URL, Open Graph tags and structured data`, async ({ request }) => {
      const response = await request.get(route);
      expect(response.status()).toBe(200);
      const html = await response.text();
      const title = attribute(html, /<title>([^<]*)<\/title>/);
      expect(title, "title").toBeTruthy();
      expect(title).toContain("client");
      expect(attribute(html, /<meta name="description" content="([^"]+)"/), "description").toBeTruthy();
      const canonical = attribute(html, /<link rel="canonical" href="([^"]+)"/);
      expect(canonical, "canonical").toMatch(new RegExp(`/${route.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&")}$`));
      expect(attribute(html, /<meta property="og:image" content="([^"]+)"/), "og:image").toMatch(/\/og\/.+\.png$/);
      expect(attribute(html, /<meta name="twitter:card" content="([^"]+)"/)).toBe("summary_large_image");
      const jsonLd = attribute(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      expect(jsonLd, "JSON-LD").toBeTruthy();
      const data = JSON.parse(jsonLd ?? "{}") as { "@graph"?: Array<{ "@type": string }> };
      const types = (data["@graph"] ?? []).map((node) => node["@type"]);
      expect(types).toEqual(route === "" ? ["WebSite", "SoftwareSourceCode"] : ["TechArticle", "BreadcrumbList"]);
    });
  }

  test("the HTML of a page holds its content when the build prerendered it", async ({ request }) => {
    const html = await (await request.get("catalog/client.chain/")).text();
    test.skip(!html.includes("data-prerendered"), "This build has no prerendered pages (SITE_PRERENDER=0 or no Chromium).");
    expect(html).toContain('data-prerendered="catalog/client.chain"');
    expect(html).toMatch(/<h1[^>]*>[\s\S]*client\.chain[\s\S]*<\/h1>/);
    const image = await request.get("og/catalog/client.chain.png");
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/png");
  });

  test("sitemap.xml lists each page, and llms.txt links them", async ({ request }) => {
    const sitemap = await (await request.get("sitemap.xml")).text();
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "");
    expect(locations.length).toBeGreaterThan(250);
    expect(locations.some((location) => location.endsWith("/catalog/client.chain/"))).toBe(true);
    const llms = await (await request.get("llms.txt")).text();
    expect(llms).toContain("# @procedures/client");
    expect(llms).toContain("## Procedures");
    expect(llms).toMatch(/\[client\.chain: [^\]]+\]\(https?:\/\/[^)]+\/catalog\/client\.chain\/\)/);
  });

  test("the web manifest and its icons load", async ({ request }) => {
    const manifest = (await (await request.get("site.webmanifest")).json()) as { icons: Array<{ src: string }> };
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).status(), icon.src).toBe(200);
    }
  });
});

test.describe("the router", () => {
  test("an old hash link opens its page at its path", async ({ page }) => {
    await open(page, "#/catalog/client.chain");
    await expect(page).toHaveURL(/\/catalog\/client\.chain\/$/);
    await expect(page.locator("h1")).toContainText("client.chain");
    await open(page, "#/composer?example=chain");
    await expect(page).toHaveURL(/\/composer\/\?example=chain$/);
    await expect(page.locator(".status-ok")).toBeVisible();
  });

  test("a link of the site changes the page with no reload, and Back returns", async ({ page }) => {
    await open(page, "");
    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 42));
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Procedures" }).click();
    await expect(page).toHaveURL(/\/catalog\/$/);
    await expect(page).toHaveTitle(/Procedure catalog/);
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(42);
    await page.goBack();
    await expect(page).toHaveURL(/\/client\/$/);
    await expect(page.locator(".live-hero")).toBeVisible();
  });

  test("an address with no page shows the not-found page", async ({ page }) => {
    await open(page, "no-such-page/");
    await expect(page.locator("h1")).toHaveText("This address has no page");
    await expect(page).toHaveTitle(/Page not found/);
  });
});

test.describe("the procedure schemas", () => {
  /**
   * The descriptions in the schemas of each package (`src/data/generated/schemas/<package>.js`).
   * The test keeps long text with no quote and no escape, so the minified bundle holds it as it
   * is. It removes the text that the catalog without schemas also holds.
   */
  function schemaTexts(): Map<string, Set<string>> {
    const folder = fileURLToPath(new URL("../src/data/generated/schemas/", import.meta.url));
    const summary = JSON.stringify(catalogJson);
    const texts = new Map<string, Set<string>>();
    const collect = (value: unknown, into: Set<string>): void => {
      if (value === null || typeof value !== "object") return;
      for (const [key, item] of Object.entries(value)) {
        if (key === "description" && typeof item === "string") {
          if (item.length >= 30 && /^[A-Za-z0-9 ,.:()/-]+$/.test(item) && !summary.includes(item)) into.add(item);
        } else {
          collect(item, into);
        }
      }
    };
    for (const file of readdirSync(folder).filter((name) => name.endsWith(".js"))) {
      const source = readFileSync(join(folder, file), "utf8").replace(/^export default /, "").replace(/;\s*$/, "");
      const found = new Set<string>();
      collect(JSON.parse(source) as unknown, found);
      texts.set(file.slice(0, -".js".length), found);
    }
    return texts;
  }

  /** The scripts that each page loads first: the entry of the app and its static imports. */
  function entryScripts(html: string): string[] {
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1] ?? "");
    const preloads = [...html.matchAll(/<link\b[^>]*>/g)]
      .map((match) => match[0])
      .filter((tag) => /\brel="modulepreload"/.test(tag))
      .map((tag) => /\bhref="([^"]+)"/.exec(tag)?.[1] ?? "");
    return [...scripts, ...preloads].filter((url) => url !== "");
  }

  test("the main bundle holds no schema", async ({ request }) => {
    const all = [...schemaTexts().values()].flatMap((texts) => [...texts]);
    expect(all.length, "the schema descriptions to look for").toBeGreaterThan(50);
    // 404.html is the app with no page: its scripts are the scripts of each page
    const template = await (await request.get("404.html")).text();
    const scripts = entryScripts(template);
    expect(scripts.length, "the scripts of 404.html").toBeGreaterThan(0);
    const main = (await Promise.all(scripts.map(async (url) => (await request.get(url)).text()))).join("\n");
    expect(all.filter((text) => main.includes(text)), "schema text in the main bundle").toEqual([]);
  });

  test("the page of a procedure loads the schemas of its package only", async ({ page }) => {
    const texts = schemaTexts();
    // The package with the most text, so the test examines much text
    const [dir, own]: [string, Set<string>] = [...texts.entries()].sort(([, a], [, b]) => b.size - a.size)[0] ?? ["", new Set<string>()];
    expect(own.size, `the schema descriptions of ${dir}`).toBeGreaterThan(5);
    const procedures = (catalogJson as unknown as { procedures: Array<{ key: string; package: string }> }).procedures;
    const key = procedures.find((procedure) => procedure.package === dir)?.key ?? "";
    const bodies: Array<Promise<string>> = [];
    page.on("response", (response) => {
      if (response.request().resourceType() === "script" && response.status() === 200) bodies.push(response.text().catch(() => ""));
    });
    await open(page, `catalog/${key}/`);
    await expect(page.getByRole("heading", { name: "Input", exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const loaded = (await Promise.all(bodies)).join("\n");
    expect([...own].filter((text) => !loaded.includes(text)), `schema text of ${dir} that the page did not load`).toEqual([]);
    const others = [...texts.entries()].filter(([other]) => other !== dir).flatMap(([, set]) => [...set].filter((text) => !own.has(text)));
    expect(others.filter((text) => loaded.includes(text)), "schema text of other packages").toEqual([]);
  });
});

test.describe("the budgets", () => {
  /** The bytes that a page loads: scripts, style sheets, fonts and the document, after gzip. */
  async function measure(page: Page, route: string): Promise<{ total: number; script: number; worker: number; errors: string[] }> {
    const bodies: Array<Promise<{ type: string; url: string; size: number }>> = [];
    const errors: string[] = [];
    const workers = new Set<string>();
    page.on("worker", (worker) => workers.add(worker.url()));
    const onResponse = (response: Response): void => {
      const type = response.request().resourceType();
      if (!["script", "stylesheet", "font", "document"].includes(type) || response.status() !== 200) return;
      const url = response.url();
      bodies.push(
        response
          .body()
          .then((body) => ({ type, url, size: type === "font" ? body.length : gzipSync(body).length }))
          .catch(() => ({ type, url, size: 0 })),
      );
    };
    page.on("response", onResponse);
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await open(page, route);
    await page.waitForLoadState("networkidle");
    page.off("response", onResponse);
    const all = await Promise.all(bodies);
    const sizes = all.filter((item) => !workers.has(item.url));
    return {
      total: sizes.reduce((sum, item) => sum + item.size, 0),
      script: sizes.filter((item) => item.type === "script").reduce((sum, item) => sum + item.size, 0),
      worker: all.filter((item) => workers.has(item.url)).reduce((sum, item) => sum + item.size, 0),
      errors,
    };
  }

  for (const route of ROUTES) {
    test(`/${route} stays within its budget and logs no error`, async ({ page }) => {
      const { total, script, worker, errors } = await measure(page, route);
      // The log of CI shows the size of each page, also when it is within the budget
      console.log(`/${route}: ${total} bytes of gzip, ${script} bytes of scripts`);
      expect(errors, "console errors").toEqual([]);
      expect(total, `the page loads ${Math.round(total / 1024)} kB of gzip`).toBeLessThanOrEqual(PAGE_BUDGET);
      expect(script, `the scripts are ${Math.round(script / 1024)} kB of gzip`).toBeLessThanOrEqual(SCRIPT_BUDGET);
      expect(worker, `the workers are ${Math.round(worker / 1024)} kB of gzip`).toBeLessThanOrEqual(WORKER_BUDGET);
      // An image has its size, so the layout does not move when it loads
      await expect(page.locator("img:not([width]), img:not([height])")).toHaveCount(0);
    });
  }
});
