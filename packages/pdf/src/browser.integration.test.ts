/**
 * A print with a real browser. The test runs only when the search finds a browser: the ubuntu
 * runner of CI has google-chrome. Without a browser, vitest skips it.
 */

import { readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { findBrowser } from "./browser.js";
import { renderPdf } from "./render.js";

const browser = findBrowser();
// A browser that runs as root (a container) needs --no-sandbox. A Linux runner of CI can also
// refuse the user namespaces of the sandbox, and the test page is static.
const linuxCi = process.platform === "linux" && process.env["CI"] !== undefined;
const extra = linuxCi || (process.platform !== "win32" && process.getuid?.() === 0) ? ["--no-sandbox"] : [];

describe.skipIf(browser === undefined)("renderPdf with a real browser", () => {
  it("prints an HTML page to a PDF file", async () => {
    const result = await renderPdf({
      html: "<!doctype html><html><body><h1>Test page</h1><p>A made-up line of text.</p></body></html>",
      args: extra,
      timeout: 90_000,
    });
    try {
      expect(result.bytes).toBeGreaterThan(500);
      expect(readFileSync(result.path).subarray(0, 4).toString("latin1")).toBe("%PDF");
    } finally {
      rmSync(dirname(result.path), { recursive: true, force: true });
    }
  }, 120_000);
});
