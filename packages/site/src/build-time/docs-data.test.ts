/**
 * The docs pages: the conversion of the Markdown of the repository (`scripts/docs-data.mjs`), and
 * the real documents, so a broken link between two docs pages fails the tests.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_MARKER,
  convertMarkdown,
  createSlugger,
  linkResolver,
  plainText,
  programOf,
  readDocs,
  REPOSITORY_URL,
  SITE_URL,
} from "../../scripts/docs-data.mjs";

const PACKAGES = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const REPO = resolve(PACKAGES, "..");

function html(markdown: string, options?: Parameters<typeof convertMarkdown>[1]): string {
  return convertMarkdown(markdown, options).segments.map((segment) => segment.html).join("");
}

describe("convertMarkdown", () => {
  it("takes the first H1 as the title and the first paragraph with text as the description", () => {
    const doc = convertMarkdown("# The title\n\n[![npm](https://img.shields.io/npm/v/x)](https://npm.im/x)\n\nThe first `real` paragraph.\n\n## A section\n");
    expect(doc.title).toBe("The title");
    expect(doc.description).toBe("The first real paragraph.");
    // The page header shows the title: the H1 is not in the HTML
    expect(html("# The title\n\nText.")).not.toContain("<h1");
  });

  it("gives each H2 and H3 an id, an anchor link and a line in the table of contents", () => {
    const doc = convertMarkdown("# T\n\n## The `$ref` key\n\n### Names: one\n\n#### Deep\n\n## The `$ref` key\n");
    expect(doc.toc).toEqual([
      { id: "the-ref-key", text: "The $ref key", depth: 2 },
      { id: "names-one", text: "Names: one", depth: 3 },
      { id: "the-ref-key-1", text: "The $ref key", depth: 2 },
    ]);
    const out = html("# T\n\n## Install\n");
    expect(out).toContain('<h2 id="install">Install<a class="heading-anchor" href="#install"');
  });

  it("makes ids like GitHub, with a suffix for a repeated heading and none of the ids of the page", () => {
    const slug = createSlugger();
    expect(slug("5. `$when`: a call that waits")).toBe("5-when-a-call-that-waits");
    expect(slug("Main")).toBe("main-section");
    expect(slug("Main")).toBe("main-section-1");
  });

  it("colors code at build time and keeps the code of an unknown language as text", () => {
    const out = html("```ts\nconst a = 1;\n```\n\n```cue\nx: <1>\n```\n");
    expect(out).toContain('<pre class="doc-code" data-lang="ts" tabindex="0"><code class="hljs"><span class="hljs-keyword">const</span>');
    expect(out).toContain("x: &lt;1&gt;");
  });

  it("shows the source of a Mermaid diagram", () => {
    const out = html("```mermaid\ngraph TD; A-->B\n```\n");
    expect(out).toContain('<figure class="doc-diagram">');
    expect(out).toContain("A--&gt;B");
  });

  it("puts a table in a box that scrolls, and keeps the alignment", () => {
    const out = html("| a | b |\n|:--|--:|\n| `x` | 2 |\n");
    expect(out).toContain('<div class="table-wrap" tabindex="0" role="region" aria-label="Table"><table>');
    expect(out).toContain('<th style="text-align: left">a</th>');
    expect(out).toContain('<td style="text-align: left"><code>x</code></td>');
    expect(out).toContain('<td style="text-align: right">2</td>');
  });

  it("leaves out badges, makes another image a link, and shows unknown HTML as text", () => {
    const out = html("![CI](https://github.com/x/y/badge.svg) ![Shot](./shot.png)\n\n<script>alert(1)</script>\n\nA <kbd>K</kbd> key.\n");
    expect(out).not.toContain("badge.svg");
    expect(out).not.toContain("<img");
    // A link around a badge goes with it, and so does a paragraph of badges
    const badges = html("[![npm](https://img.shields.io/npm/v/x)](https://npmjs.com/x) [![CI](https://x/badge.svg)](https://x)\n\nText.\n");
    expect(badges).not.toContain("<a ");
    expect(badges).toBe("<p>Text.</p>\n");
    expect(out).toContain(">Shot</a>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("<kbd>K</kbd>");
  });

  it("cuts out each JSON program, with its expected result and whether the browser can run it", () => {
    const doc = convertMarkdown(
      '# T\n\nText.\n\n```json\n{ "$proc": ["client", "add"], "input": { "a": 1, "b": 2 } }\n// 3\n```\n\n```json\n{ "$proc": ["git", "status"] }\n```\n\n```json\n{ "not": "a program" }\n```\n',
      { canRun: (key) => key.startsWith("client.") },
    );
    const programs = doc.segments.filter((segment) => segment.type === "program");
    expect(programs).toHaveLength(2);
    expect(programs[0]).toMatchObject({ runnable: true, expected: "3", program: { $proc: ["client", "add"] } });
    expect(programs[1]).toMatchObject({ runnable: false });
    expect(doc.programs).toBe(2);
    // The JSON that is not a program stays in the HTML
    expect(doc.segments.some((segment) => segment.type === "html" && segment.html.includes("a program"))).toBe(true);
  });

  it("reads a program with comment lines, and no program from other JSON", () => {
    expect(programOf('{ "$proc": ["client", "not"], "input": { "value": true } }\n// false')).toMatchObject({ expected: "false" });
    expect(programOf("[1, 2]")).toBeNull();
    expect(programOf("not json")).toBeNull();
  });
});

describe("plainText", () => {
  it("decodes each entity one time, so an escaped entity stays an entity", () => {
    expect(plainText("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;")).toBe(`a & b <c> "d" 'e'`);
    expect(plainText("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
  });
});

describe("linkResolver", () => {
  const file = join(PACKAGES, "documentation", "PROGRAM-FORMAT.md");
  const docsByPath = new Map([
    [join(PACKAGES, "documentation", "ARCHITECTURE.md").toLowerCase(), "architecture"],
    [join(PACKAGES, "client-git", "README.md").toLowerCase(), "packages/client-git"],
  ]);
  const resolveLink = linkResolver({ file, repoRoot: REPO, docsByPath });

  it("sends a link to a document of the site to its docs page, with the anchor", () => {
    expect(resolveLink("./ARCHITECTURE.md#hosts")).toEqual({ href: `${BASE_MARKER}docs/architecture/#hosts`, external: false });
    expect(resolveLink("../client-git/README.md")).toEqual({ href: `${BASE_MARKER}docs/packages/client-git/`, external: false });
    expect(resolveLink("../client-git")).toEqual({ href: `${BASE_MARKER}docs/packages/client-git/`, external: false });
  });

  it("sends a link to another file of the repository to GitHub", () => {
    expect(resolveLink("../client/src/procedures/ref.ts")).toEqual({ href: `${REPOSITORY_URL}/blob/main/packages/client/src/procedures/ref.ts`, external: true });
    expect(resolveLink("../client/src")).toEqual({ href: `${REPOSITORY_URL}/tree/main/packages/client/src`, external: true });
  });

  it("keeps anchors and other sites, and makes a link to this site a link of the site", () => {
    expect(resolveLink("#names")).toEqual({ href: "#names", external: false });
    expect(resolveLink("https://example.com/x")).toEqual({ href: "https://example.com/x", external: true });
    expect(resolveLink(`${SITE_URL}composer/`)).toEqual({ href: `${BASE_MARKER}composer/`, external: false });
  });
});

describe("the documents of the repository", () => {
  const packages = readdirSync(PACKAGES)
    .filter((dir) => existsSync(join(PACKAGES, dir, "package.json")))
    .map((dir) => ({ dir, name: dir, description: "" }));
  const docs = readDocs(PACKAGES, packages, { canRun: (key) => key.startsWith("client.") });
  const slugs = new Set(docs.index.map((doc) => doc.slug));

  it("has the guides, the client library documents and a page for each package README", () => {
    for (const slug of ["onboarding", "program-format", "architecture", "release", "client-api", "policy", "packages/client"]) {
      expect(slugs.has(slug), slug).toBe(true);
    }
    expect(docs.index.filter((doc) => doc.section === "Packages").length).toBeGreaterThan(25);
  });

  it("gives each page a title, a description and its source", () => {
    for (const doc of docs.index) {
      expect(doc.title, doc.slug).toBeTruthy();
      expect(doc.description.length, doc.slug).toBeGreaterThan(10);
      expect(doc.description.length, doc.slug).toBeLessThanOrEqual(160);
      expect(existsSync(join(REPO, doc.source)), doc.slug).toBe(true);
    }
  });

  it("has no link to a docs page that does not exist", () => {
    for (const [slug, page] of Object.entries(docs.pages)) {
      for (const segment of page.segments) {
        for (const match of segment.html.matchAll(/href="%SITE_BASE%docs\/([^"#]*?)\/?(?:#[^"]*)?"/g)) {
          const target = match[1] ?? "";
          if (target === "") continue;
          expect(slugs.has(target), `${slug} links to docs/${target}`).toBe(true);
        }
      }
    }
  });

  it("finds the runnable programs of the program format", () => {
    const programs = docs.pages["program-format"]?.segments.filter((segment) => segment.type === "program") ?? [];
    expect(programs.length).toBeGreaterThanOrEqual(10);
    expect(programs.some((segment) => segment.type === "program" && segment.runnable)).toBe(true);
  });
});
