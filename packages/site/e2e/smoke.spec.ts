/// <reference types="node" />
/**
 * The smoke test of the site (site improvement idea 7). It runs in CI against the built site:
 * the examples run, a share link round-trips and waits for Run, no page scrolls sideways at
 * 375 px, axe-core finds no serious problem in either theme, the TypeScript tab runs with
 * Node, and hostile links do not break the page.
 */

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { examples } from "../src/lib/examples";

const run = promisify(execFile);

const PAGES = [
  "#/",
  "#/composer?example=chain",
  "#/composer?example=pipeline",
  "#/catalog",
  "#/catalog/client.chain",
  "#/architecture",
  "#/architecture/client",
  "#/claude",
];

function encode(program: unknown): string {
  return Buffer.from(JSON.stringify(program)).toString("base64url");
}

async function open(page: Page, hash: string): Promise<void> {
  await page.goto(hash);
  await expect(page.locator("main")).toBeVisible();
}

test.describe("the Composer", () => {
  for (const example of examples) {
    test(`the example "${example.id}" runs`, async ({ page }) => {
      await open(page, `#/composer?example=${example.id}`);
      await expect(page.locator(".status-ok")).toBeVisible();
      await expect(page.locator(".trace-row").first()).toBeVisible();
    });
  }

  test("a share link round-trips, and it waits for Run", async ({ page, context }) => {
    await open(page, "#/composer?example=nested");
    await expect(page.locator(".status-ok")).toBeVisible();
    await page.getByRole("textbox", { name: "b", exact: true }).last().fill("-6");
    await expect(page).toHaveURL(/\?p=/);
    await expect(page.locator(".result-value")).toHaveText("6");
    const link = page.url();

    const other = await context.newPage();
    await other.goto(link);
    // A program from a link does not run before the reader presses Run
    await expect(other.locator(".callout")).toContainText("press Run");
    await expect(other.locator(".status-ok")).toHaveCount(0);
    await other.getByRole("button", { name: "▶ Run" }).click();
    await expect(other.locator(".result-value")).toHaveText("6");
  });

  test("undo, redo and the Back button", async ({ page }) => {
    await open(page, "#/composer?example=nested");
    const field = page.getByRole("textbox", { name: "b", exact: true }).last();
    await field.fill("10");
    await expect(page.locator(".result-value")).toHaveText("22");
    await page.getByRole("button", { name: "↶ Undo" }).click();
    await expect(page.locator(".result-value")).toHaveText("17");
    await page.getByRole("button", { name: "↷ Redo" }).click();
    await expect(page.locator(".result-value")).toHaveText("22");
    await page.goBack();
    await expect(page.locator(".result-value")).toHaveText("17");
  });

  test("the TypeScript tab gives code that runs with Node", async ({ page }) => {
    await open(page, "#/composer?example=map");
    await expect(page.locator(".status-ok")).toBeVisible();
    const result: unknown = JSON.parse((await page.locator(".result-value").textContent()) ?? "null");
    await page.getByRole("tab", { name: "TypeScript" }).click();
    const code = (await page.getByLabel("The program as TypeScript").textContent()) ?? "";
    const folder = fileURLToPath(new URL("../node_modules/.cache/e2e", import.meta.url));
    mkdirSync(folder, { recursive: true });
    const file = join(folder, "map.mjs");
    writeFileSync(file, code);
    const { stdout } = await run(process.execPath, [file], { timeout: 30_000 });
    expect(JSON.parse(stdout)).toEqual(result);
  });

  test("hostile links do not break the page", async ({ page }) => {
    let deep: unknown = 1;
    for (let index = 0; index < 3000; index++) deep = [deep];
    await open(page, `#/composer?p=${encode({ $proc: ["client", "identity"], input: { value: deep } })}`);
    await expect(page.getByRole("status").filter({ hasText: "levels" })).toBeVisible();

    await open(page, "#/composer?p=not-a-program!!");
    await expect(page.getByRole("status").filter({ hasText: "not a program" })).toBeVisible();

    await open(page, "#/catalog/%E0%A4");
    await expect(page.locator("h1")).toBeVisible();

    // A long run: the page stays responsive, and Stop ends the run. (An endless range is now an
    // error of the core: a range has at most 1 000 000 items. So the long run is one call for each
    // item of the largest range.)
    const long = {
      $proc: ["client", "map"],
      input: {
        items: { $proc: ["client", "range"], input: { start: 0, end: 1_000_000 } },
        fn: { $proc: ["client", "add"], input: { a: { $ref: "item" }, b: 1 } },
      },
    };
    await open(page, `#/composer?p=${encode(long)}`);
    await page.getByRole("button", { name: "▶ Run" }).click();
    await page.getByRole("button", { name: "■ Stop" }).click();
    await expect(page.locator(".status-line")).toContainText("stopped");
  });
});

test.describe("the keyboard", () => {
  test("the trace is a tree that the arrow keys move in", async ({ page }) => {
    await open(page, "#/composer?example=chain");
    const first = page.getByRole("treeitem").first();
    await expect(first).toBeVisible();
    await first.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("treeitem").nth(1)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: /Input and output of client\.add/ })).toBeVisible();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("treeitem")).toHaveCount(1);
  });

  test("an empty slot reaches its controls", async ({ page }) => {
    await open(page, `#/composer?p=${encode({ $proc: ["client", "add"], input: { a: null, b: 2 } })}`);
    const empty = page.getByRole("button", { name: /^a: null/ });
    await empty.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("combobox", { name: "Kind of value of a" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("combobox", { name: "Put a procedure call in a" })).toBeFocused();
    // The picker puts the call on Enter: "gte" must not stop at "gt"
    await page.keyboard.type("gte");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /Call of client\.gte/ })).toBeVisible();
  });

  test("the removal of a list item keeps the focus in the list", async ({ page }) => {
    await open(page, `#/composer?p=${encode({ $proc: ["client", "sum"], input: { values: [1, 2, 3] } })}`);
    await page.getByRole("button", { name: "Remove item 0 of values" }).click();
    await expect(page.getByRole("textbox", { name: "values item 0" })).toBeFocused();
  });
});

test.describe("the layout", () => {
  test("no page scrolls sideways at 375 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const hash of PAGES) {
      await open(page, hash);
      await page.waitForTimeout(300);
      const { scroll, client } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(scroll, `${hash} scrolls sideways`).toBeLessThanOrEqual(client);
    }
  });
});

test.describe("accessibility", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`axe finds no serious problem (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      const problems: string[] = [];
      const check = async (name: string): Promise<void> => {
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        for (const violation of results.violations) {
          if (violation.impact === "serious" || violation.impact === "critical") {
            problems.push(`${name}: ${violation.id} (${violation.nodes.length}): ${violation.nodes[0]?.target.join(" ")}`);
          }
        }
      };
      for (const hash of PAGES) {
        await open(page, hash);
        await page.waitForTimeout(400);
        await check(hash);
      }
      // The Composer with its states: a problem list, insert choices, an open call of the trace
      await open(page, `#/composer?p=${encode({ $proc: ["client", "add"], input: { a: { $ref: "nope" }, b: { $proc: ["client", "multiply"], input: { a: 2, b: 3 } } } })}`);
      await page.getByRole("button", { name: "▶ Run" }).click();
      await page.getByRole("treeitem").first().click();
      await page.getByRole("button", { name: /Call of client\.multiply/ }).click();
      await page.getByRole("button", { name: /^add:/ }).click();
      await expect(page.getByRole("group", { name: /Where does add go/ })).toBeVisible();
      await check("the Composer with its states");
      expect(problems).toEqual([]);
    });
  }
});
