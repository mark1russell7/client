/// <reference types="node" />
/**
 * The pages for search engines and link previews: each static page has its own HTML file with
 * its head tags, the sitemap lists them, old hash links still work, and each page stays within
 * its size budget (after the Vex site: 256 kB of gzip for a page).
 */

import { test, expect, type Page, type Response } from "@playwright/test";
import { gzipSync } from "node:zlib";

/** The fixed pages and a sample of the procedure and package pages. */
const ROUTES = ["", "composer/", "catalog/", "catalog/client.chain/", "catalog/git.status/", "architecture/", "architecture/client/", "lab/", "claude/", "status/"];

/** The budgets of one page, in bytes after gzip (a font counts as it is: woff2 is compressed already). */
const PAGE_BUDGET = 256 * 1024;
const SCRIPT_BUDGET = 180 * 1024;

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
      expect(canonical, "canonical").toMatch(new RegExp(`/${route.replace(/\./g, "\\.")}$`));
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
    expect(llms).toContain("# @mark1russell7/client");
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

test.describe("the budgets", () => {
  /** The bytes that a page loads: scripts, style sheets, fonts and the document, after gzip. */
  async function measure(page: Page, route: string): Promise<{ total: number; script: number; errors: string[] }> {
    const bodies: Array<Promise<{ type: string; size: number }>> = [];
    const errors: string[] = [];
    const onResponse = (response: Response): void => {
      const type = response.request().resourceType();
      if (!["script", "stylesheet", "font", "document"].includes(type) || response.status() !== 200) return;
      bodies.push(
        response
          .body()
          .then((body) => ({ type, size: type === "font" ? body.length : gzipSync(body).length }))
          .catch(() => ({ type, size: 0 })),
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
    const sizes = await Promise.all(bodies);
    return {
      total: sizes.reduce((sum, item) => sum + item.size, 0),
      script: sizes.filter((item) => item.type === "script").reduce((sum, item) => sum + item.size, 0),
      errors,
    };
  }

  for (const route of ROUTES) {
    test(`/${route} stays within its budget and logs no error`, async ({ page }) => {
      const { total, script, errors } = await measure(page, route);
      expect(errors, "console errors").toEqual([]);
      expect(total, `the page loads ${Math.round(total / 1024)} kB of gzip`).toBeLessThanOrEqual(PAGE_BUDGET);
      expect(script, `the scripts are ${Math.round(script / 1024)} kB of gzip`).toBeLessThanOrEqual(SCRIPT_BUDGET);
      // An image has its size, so the layout does not move when it loads
      await expect(page.locator("img:not([width]), img:not([height])")).toHaveCount(0);
    });
  }
});
