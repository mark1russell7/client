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
  "",
  "composer/?example=chain",
  "composer/?example=pipeline",
  "catalog/",
  "catalog/client.chain/",
  "architecture/",
  "architecture/client/",
  "claude/",
  "status/",
  "status/?status=open",
  "releases/",
  "lab/",
  "catalog/git.status/",
  "docs/",
  "docs/program-format/",
  "docs/packages/client-git/",
  "no-such-page/",
];

function encode(program: unknown): string {
  return Buffer.from(JSON.stringify(program)).toString("base64url");
}

/**
 * This function opens a page and waits for the live app. A prerendered page shows the HTML of the
 * build first, and the app renders next to it, hidden, until it is ready (lib/prerender-handoff.ts).
 */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => document.querySelector("[data-prerendered]") === null, null, { timeout: 15_000 });
  await expect(page.locator("main")).toBeVisible();
}

test.describe("the Composer", () => {
  for (const example of examples) {
    test(`the example "${example.id}" runs`, async ({ page }) => {
      await open(page, `composer/?example=${example.id}`);
      await expect(page.locator(".status-ok")).toBeVisible();
      await expect(page.locator(".trace-row").first()).toBeVisible();
    });
  }

  test("a share link round-trips, and it waits for Run", async ({ page, context }) => {
    await open(page, "composer/?example=nested");
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
    await open(page, "composer/?example=nested");
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

  test("a saved program stays in the browser, and it opens again (roadmap R45)", async ({ page }) => {
    await open(page, "composer/?example=nested");
    await page.getByRole("textbox", { name: "b", exact: true }).last().fill("10");
    await expect(page.locator(".result-value")).toHaveText("22");

    await page.getByRole("button", { name: "Saved", exact: true }).click();
    const panel = page.getByRole("region", { name: "Saved programs" });
    await expect(panel).toContainText("IndexedDB");
    await panel.getByRole("textbox", { name: "Name" }).fill("my.nested");
    await panel.getByRole("button", { name: "Save the program" }).click();
    await expect(panel.getByRole("status")).toHaveText("Saved my.nested.");

    // Another program in a new load of the page: IndexedDB keeps the saved program
    await open(page, "composer/?example=chain");
    await expect(page.locator(".status-ok")).toBeVisible();
    await page.getByRole("button", { name: "Saved", exact: true }).click();
    await panel.getByRole("button", { name: "Open my.nested" }).click();
    await expect(page.locator(".result-value")).toHaveText("22");
    await expect(page).toHaveURL(/\?p=/);
    await expect(panel).toHaveCount(0);
  });

  test("the TypeScript tab gives code that runs with Node", async ({ page }) => {
    await open(page, "composer/?example=map");
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
    await open(page, `composer/?p=${encode({ $proc: ["client", "identity"], input: { value: deep } })}`);
    await expect(page.getByRole("status").filter({ hasText: "levels" })).toBeVisible();

    await open(page, "composer/?p=not-a-program!!");
    await expect(page.getByRole("status").filter({ hasText: "not a program" })).toBeVisible();

    // Through the old hash form: the page reads the path, and no server sees the bad escape
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
    await open(page, `composer/?p=${encode(long)}`);
    await page.getByRole("button", { name: "▶ Run" }).click();
    await page.getByRole("button", { name: "■ Stop" }).click();
    await expect(page.locator(".status-line")).toContainText("stopped");
  });
});

test.describe("the keyboard", () => {
  test("the trace is a tree that the arrow keys move in", async ({ page }) => {
    await open(page, "composer/?example=chain");
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
    await open(page, `composer/?p=${encode({ $proc: ["client", "add"], input: { a: null, b: 2 } })}`);
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
    await open(page, `composer/?p=${encode({ $proc: ["client", "sum"], input: { values: [1, 2, 3] } })}`);
    await page.getByRole("button", { name: "Remove item 0 of values" }).click();
    await expect(page.getByRole("textbox", { name: "values item 0" })).toBeFocused();
  });
});

test.describe("the new pages", () => {
  test("the trace shows a call that ran for an input under the call that got its result", async ({ page }) => {
    await open(page, "composer/?example=nested");
    await expect(page.locator(".status-ok")).toBeVisible();
    const inner = page.getByRole("treeitem", { name: /^multiply, an input/ });
    await expect(inner).toHaveAttribute("aria-level", "2");
  });

  test("the graph view shows the calls, and the keyboard moves in it", async ({ page }) => {
    await open(page, "composer/?example=chain");
    await page.getByRole("tab", { name: "Graph" }).click();
    const tree = page.getByRole("tree", { name: /The program as a graph/ });
    await expect(tree.getByRole("treeitem")).toHaveCount(4);
    await tree.getByRole("treeitem").first().focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page.locator(".graph-detail")).toContainText("client.multiply");
    await page.getByRole("button", { name: "Edit in the blocks" }).click();
    await expect(page.getByRole("tab", { name: "Blocks" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: /Call of client\.multiply, selected/ })).toBeFocused();
  });

  test("the status board filters the findings, and a link keeps the filters", async ({ page }) => {
    await open(page, "status/");
    const count = page.locator("p", { hasText: /of \d+ findings/ });
    await expect(count).toBeVisible();
    const openChip = page.getByRole("group", { name: "Status", exact: true }).getByRole("button", { name: "Open", exact: true });
    await openChip.click();
    await expect(page).toHaveURL(/status=open/);
    const filtered = await count.textContent();
    await page.reload();
    await expect(count).toHaveText(filtered ?? "");
    await expect(openChip).toHaveAttribute("aria-pressed", "true");
  });

  test("the releases timeline selects a version by a click and by the arrow keys", async ({ page }) => {
    await open(page, "releases/");
    const section = page.locator(".releases-page");
    await expect(section.locator("h1")).toHaveText("Releases");
    await expect(section.locator(".lead-text")).toHaveText(/^\d+ versions from \w{3} \d+ to \w{3} \d+\. /);
    const marks = section.getByRole("group", { name: /The release timeline/ }).getByRole("button");
    const count = await marks.count();
    expect(count).toBeGreaterThan(4);
    const title = section.locator(".release-details h2");
    const versionOf = async (index: number): Promise<string> => ((await marks.nth(index).getAttribute("aria-label")) ?? "").split(",")[0]!;

    // The newest version is selected at first, and it is the last mark of the time axis
    const newest = await versionOf(count - 1);
    await expect(marks.nth(count - 1)).toHaveAttribute("aria-pressed", "true");
    await expect(title).toHaveText(newest);

    // A click selects an older version, and the details follow
    const older = await versionOf(count - 3);
    await marks.nth(count - 3).click();
    await expect(marks.nth(count - 3)).toHaveAttribute("aria-pressed", "true");
    await expect(marks.nth(count - 1)).toHaveAttribute("aria-pressed", "false");
    await expect(title).toHaveText(older);
    // The changes of an older version load on demand
    const changeCount = Number(/(\d+) changes?$/.exec((await marks.nth(count - 3).getAttribute("aria-label")) ?? "")?.[1] ?? 0);
    await expect(section.locator(".release-change")).toHaveCount(Math.min(changeCount, 8));
    await expect(section.locator(".release-details [data-loading]")).toHaveCount(0);
    await expect(section.getByRole("link", { name: "On npm" })).toHaveAttribute("href", `https://www.npmjs.com/package/@procedures/client/v/${older}`);
    await expect(section.getByRole("link", { name: "Changelog" })).toHaveAttribute(
      "href",
      `https://github.com/mark1russell7/client/blob/main/packages/client/CHANGELOG.md#${older.replace(/\./g, "")}`,
    );

    // The left arrow key selects the version before it and moves the focus, End goes to the newest
    const before = await versionOf(count - 4);
    await page.keyboard.press("ArrowLeft");
    await expect(marks.nth(count - 4)).toHaveAttribute("aria-pressed", "true");
    await expect(marks.nth(count - 4)).toBeFocused();
    await expect(title).toHaveText(before);
    await page.keyboard.press("ArrowRight");
    await expect(title).toHaveText(older);
    await page.keyboard.press("End");
    await expect(title).toHaveText(newest);
    await expect(marks.nth(count - 1)).toBeFocused();
  });

  test("on a phone, the releases timeline scrolls in its box and shows the newest version", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "releases/");
    const box = page.locator(".release-scroll");
    const sizes = await box.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    // The box starts at the newest version, the right end of the axis
    await expect.poll(() => box.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    const marks = page.getByRole("group", { name: /The release timeline/ }).getByRole("button");
    const boxRect = (await box.boundingBox())!;
    const markRect = (await marks.last().boundingBox())!;
    expect(markRect.x).toBeGreaterThanOrEqual(boxRect.x);
    expect(markRect.x + markRect.width).toBeLessThanOrEqual(boxRect.x + boxRect.width);
  });

  test("the version on the home page links to the releases page, and the status page links to it too", async ({ page }) => {
    await open(page, "");
    const link = page.getByRole("link", { name: /^Version \d+\.\d+\.\d+ on npm$/ });
    // Without an answer of npm at build time, the home page shows the clone command and no version
    test.skip((await link.count()) === 0, "The build did not get the version from npm");
    await link.click();
    await expect(page).toHaveURL(/\/releases\/$/);
    await expect(page.locator("h1")).toHaveText("Releases");
    await open(page, "status/");
    await page.getByRole("main").getByRole("link", { name: "Releases", exact: true }).click();
    await expect(page).toHaveURL(/\/releases\/$/);
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Releases" })).toHaveAttribute("aria-current", "page");
  });

  test("the middleware lab runs a scenario through the real middlewares", async ({ page }) => {
    await open(page, "lab/");
    await page.getByRole("button", { name: "A hot key" }).click();
    // Six requests with one key: the server answers the first one, and the cache the others
    const totals = page.locator(".lab-totals");
    await expect(totals.locator("div", { hasText: "succeeded" })).toHaveText(/6\s*succeeded/, { timeout: 15_000 });
    await expect(totals.locator("div", { hasText: "server calls" })).toHaveText(/^1\s*server calls/);
    await expect(page.locator(".timeline-row")).toHaveCount(6);
  });
});

test.describe("the command palette, the journey and the gallery", () => {
  test("Ctrl+K opens the palette, a fuzzy query finds a procedure, Enter opens it, Escape gives the focus back", async ({ page }) => {
    await open(page, "");
    await page.keyboard.press("Control+k");
    const input = page.getByRole("combobox", { name: /Search the pages/ });
    await expect(input).toBeFocused();
    await input.fill("gst");
    await expect(page.getByRole("option").first()).toContainText("git.status");
    await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/catalog\/git\.status\/$/);
    await expect(page.locator("h1")).toHaveText("git.status");

    // The button opens it too, and Escape closes it and gives the focus back to the button
    const button = page.getByRole("button", { name: /Search/ });
    await button.click();
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test("the journey records the steps of a real call, and the controls move through them", async ({ page }) => {
    await open(page, "architecture/");
    const counter = page.locator(".journey-counter");
    await expect(counter).toContainText(/Step \d+ of \d+/);
    await page.getByRole("button", { name: "Last step" }).click();
    await expect(page.locator(".journey-received li.got")).toHaveCount(3);
    await expect(page.locator(".journey-title")).toContainText("The app has 3 items");
    await page.getByRole("button", { name: "First step" }).click();
    await page.getByRole("button", { name: "Next step" }).click();
    await expect(counter).toContainText("Step 2 of");
    // Another host: the MCP journey sends progress notifications
    await page.getByRole("radio", { name: "MCP" }).click();
    await expect(page.getByRole("radio", { name: "MCP" })).toHaveAttribute("aria-checked", "true");
    await page.locator(".journey-list summary").click();
    await expect(page.locator(".journey-list")).toContainText("as a progress notification");
  });

  test("with reduced motion the journey shows the whole path and does not play", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "architecture/");
    await expect(page.locator(".journey-received li.got")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Play again" })).toBeVisible();
  });

  test("the gallery loads an example, and gives the focus back to its button", async ({ page }) => {
    await open(page, "composer/?example=nested");
    const button = page.getByRole("button", { name: /Gallery/ });
    await button.click();
    const dialog = page.getByRole("dialog", { name: "Example gallery" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /A reusable procedure/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/example=define/);
    await expect(page.locator(".status-ok")).toBeVisible();
    await expect(button).toBeFocused();
    // Escape closes it too
    await button.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Example gallery" })).toHaveCount(0);
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
        // A dialog fades in: axe measures the contrast of the final colors, after the animations
        await page.waitForFunction(() =>
          document
            .getAnimations()
            .every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity),
        );
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
      await open(page, `composer/?p=${encode({ $proc: ["client", "add"], input: { a: { $ref: "nope" }, b: { $proc: ["client", "multiply"], input: { a: 2, b: 3 } } } })}`);
      await page.getByRole("button", { name: "▶ Run" }).click();
      await page.getByRole("treeitem").first().click();
      await page.getByRole("button", { name: /Call of client\.multiply/ }).click();
      await page.getByRole("button", { name: /^add:/ }).click();
      await expect(page.getByRole("group", { name: /Where does add go/ })).toBeVisible();
      await check("the Composer with its states");
      // The graph view, and the lab after a scenario
      await page.getByRole("tab", { name: "Graph" }).click();
      await page.getByRole("treeitem").first().click();
      await check("the graph view");
      await open(page, "lab/");
      await page.getByRole("button", { name: "A slow stream" }).click();
      await page.waitForTimeout(1500);
      await check("the lab with a scenario");
      // The open command palette, the gallery dialog, and the journey at its last step
      await open(page, "");
      await page.keyboard.press("Control+k");
      await page.getByRole("combobox", { name: /Search the pages/ }).fill("chain");
      await check("the command palette");
      await page.keyboard.press("Escape");
      await open(page, "composer/?example=chain");
      await page.getByRole("button", { name: /Gallery/ }).click();
      await check("the gallery");
      await page.keyboard.press("Escape");
      await open(page, "architecture/");
      await page.getByRole("button", { name: "Last step" }).click();
      await check("the journey");
      expect(problems).toEqual([]);
    });
  }
});
