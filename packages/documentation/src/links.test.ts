/**
 * Each relative link of the documents of this package goes to a file that exists. The documents in
 * `history/` keep the links of their time (README.md, section "History"), so the test leaves them out.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIPPED = new Set(["node_modules", "dist", "history"]);
/** A Markdown link: the target, with an optional title. */
const LINK = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** This function gives the Markdown files in the folder and its subfolders, except the skipped folders. */
function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED.has(entry.name) ? [] : markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

/** This function gives the relative link targets of a document, without the code blocks. */
function relativeLinks(text: string): string[] {
  const prose = text.replace(/```[\s\S]*?```/g, "");
  return [...prose.matchAll(LINK)]
    .map((match) => match[1] ?? "")
    .filter((target) => target !== "" && !target.startsWith("#") && !/^[a-z][a-z0-9+.-]*:/i.test(target));
}

describe("the links of the documentation", () => {
  const files = markdownFiles(ROOT);

  it("finds the documents, with the README", () => {
    expect(files.map((file) => relative(ROOT, file))).toContain("README.md");
  });

  it("has no relative link to a missing file", () => {
    const missing: string[] = [];
    for (const file of files) {
      for (const target of relativeLinks(readFileSync(file, "utf8"))) {
        const path = decodeURIComponent(target.split("#")[0] ?? "");
        if (!existsSync(join(dirname(file), path))) missing.push(`${relative(ROOT, file)}: ${target}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
