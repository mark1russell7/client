/**
 * The docs pages: each page loads with no console error, a program runs on its page and opens
 * in the Composer, the table of contents and the sidebar move with no reload, and a link to a
 * heading of another page goes to that heading.
 */

import { test, expect, type Page } from "@playwright/test";
import docsIndex from "../src/data/generated/docs-index.js";

const docs = docsIndex as unknown as Array<{ slug: string; title: string; programs: number }>;

/** This function opens a page and waits for the live app and the content of the page. */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => document.querySelector("[data-prerendered]") === null, null, { timeout: 15_000 });
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("[data-loading]")).toHaveCount(0);
}

test.describe("the docs pages", () => {
  test("each page loads with its title and no console error", async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${page.url()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
    for (const doc of docs) {
      await open(page, `docs/${doc.slug}/`);
      await expect(page.locator("h1#doc-title"), doc.slug).toBeVisible();
      await expect(page.locator(".doc-content"), doc.slug).not.toBeEmpty();
    }
    expect(errors).toEqual([]);
  });

  test("a program runs on its page and opens in the Composer", async ({ page }) => {
    await open(page, "docs/program-format/");
    const first = page.locator(".doc-program").first();
    await first.getByRole("button", { name: "Run program 1 on this page" }).click();
    await expect(first.locator(".doc-program-result")).toContainText("Result");
    await expect(first.locator(".doc-program-result code")).toHaveText("3");
    const composer = first.getByRole("link", { name: "Open program 1 in the Composer" });
    expect(await composer.getAttribute("href")).toMatch(/\/composer\/\?p=/);
    await composer.click();
    await expect(page).toHaveURL(/\/composer\/\?p=/);
    // A shared program waits for Run, so the Composer shows it
    await expect(page.getByRole("button", { name: "▶ Run" })).toBeVisible();
  });

  test("the table of contents goes to a heading, and the sidebar changes the page with no reload", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await open(page, "docs/program-format/");
    await page.evaluate(() => {
      (window as unknown as { marker: number }).marker = 1;
    });
    const toc = page.getByRole("navigation", { name: "On this page" });
    await toc.getByRole("link", { name: "7. Implicit chains" }).click();
    await expect(page).toHaveURL(/#7-implicit-chains$/);
    await expect(page.locator('[id="7-implicit-chains"]')).toBeInViewport();
    await page.getByRole("navigation", { name: "Docs pages" }).getByRole("link", { name: "Architecture" }).click();
    await expect(page).toHaveURL(/\/docs\/architecture\/$/);
    await expect(page.locator("h1#doc-title")).toHaveText("Architecture");
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
  });

  test("a link of the palette goes to a heading of a page", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await open(page, "docs/");
    await page.keyboard.press("Control+K");
    await page.getByRole("combobox").fill("implicit chains");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/docs\/program-format\/#7-implicit-chains$/);
    await expect(page.locator('[id="7-implicit-chains"]')).toBeInViewport();
  });

  test("a package page links its README, and the README links the package map", async ({ page }) => {
    await open(page, "architecture/client-git/");
    await page.getByRole("link", { name: "Read the README →" }).click();
    await expect(page).toHaveURL(/\/docs\/packages\/client-git\/$/);
    await expect(page.getByRole("link", { name: "Package map" })).toHaveAttribute("href", /\/architecture\/client-git\/$/);
  });
});
