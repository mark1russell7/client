// The tests of scripts/check-browser-entries.mjs (roadmap CLI-39), with fixture packages in a
// temporary folder. Start them with: node --test scripts/check-browser-entries.test.mjs

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { browserEntryProblems, isBuiltin } from "./check-browser-entries.mjs";

const fixtures = mkdtempSync(join(tmpdir(), "browser-entries-"));
after(() => rmSync(fixtures, { recursive: true, force: true }));

/** This function writes a fixture package (its files, relative to its folder) and gives it as the check reads it. */
function fixture(name, manifest, files) {
  const path = join(fixtures, name);
  for (const [file, text] of Object.entries({ ...files, "package.json": JSON.stringify({ name, type: "module", ...manifest }) })) {
    mkdirSync(dirname(join(path, file)), { recursive: true });
    writeFileSync(join(path, file), text);
  }
  return { name, path, manifest: { name, type: "module", ...manifest } };
}

const check = (...packages) => browserEntryProblems(packages, fixtures);

/** The built-in that a problem names. */
const builtinOf = (problem) => /reaches the Node built-in "([^"]+)"/.exec(problem)?.[1];

describe("isBuiltin", () => {
  it("knows the built-ins with and without the prefix node:", () => {
    for (const name of ["http", "node:http", "fs", "fs/promises", "node:fs/promises", "events", "node:sqlite", "node:test"]) assert.equal(isBuiltin(name), true, name);
  });

  it("does not take a package or a file with a similar name for a built-in", () => {
    for (const name of ["http-status", "ws", "zod", "./http", "@procedures/client", "eventsource"]) assert.equal(isBuiltin(name), false, name);
  });
});

describe("browserEntryProblems", () => {
  it("fails on a planted bare http import, and gives the chain of files from the entry", async () => {
    const pkg = fixture("planted-http", { exports: { ".": "./lib/index.js" }, client: { browser: ["."] } }, {
      "lib/index.js": `export { status } from "./status.js";\n`,
      "lib/status.js": `import { STATUS_CODES } from "http";\nexport const status = (code) => STATUS_CODES[code];\n`,
    });
    const { problems, entries } = await check(pkg);
    assert.equal(entries, 1);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^planted-http "\." reaches the Node built-in "http"/);
    assert.match(problems[0], /planted-http\/lib\/index\.js\n {4}→ planted-http\/lib\/status\.js\n {6}imports "http"/);
  });

  it("fails on node: in a dynamic import and on a bare built-in in require", async () => {
    const pkg = fixture("lazy-node", { exports: { ".": { types: "./lib/index.d.ts", import: "./lib/index.js" } }, client: { browser: ["."] } }, {
      "lib/index.js": `export async function read(path) {\n  const { readFile } = await import("node:fs/promises");\n  return readFile(path, "utf8");\n}\nexport { gzip } from "./zip.cjs";\n`,
      "lib/zip.cjs": `const zlib = require("zlib");\nexports.gzip = (data) => zlib.gzipSync(data);\n`,
    });
    const { problems } = await check(pkg);
    assert.deepEqual(problems.map(builtinOf).sort(), ["node:fs/promises", "zlib"]);
  });

  it("follows a dependency package through its exports map, with the condition browser", async () => {
    const pkg = fixture("uses-deps", { exports: { ".": "./lib/index.js" }, client: { browser: ["."] } }, {
      "lib/index.js": `export { a } from "dual";\nexport { b } from "http-status";\nexport { c } from "node-only";\n`,
      "node_modules/dual/package.json": JSON.stringify({ name: "dual", exports: { ".": { browser: "./browser.js", import: "./node.js" } } }),
      "node_modules/dual/browser.js": `export const a = 1;\n`,
      "node_modules/dual/node.js": `import "net";\nexport const a = 2;\n`,
      "node_modules/http-status/package.json": JSON.stringify({ name: "http-status", main: "./index.js" }),
      "node_modules/http-status/index.js": `export const b = 200;\n`,
      "node_modules/node-only/package.json": JSON.stringify({ name: "node-only", type: "module", exports: "./index.js" }),
      "node_modules/node-only/index.js": `import { tmpdir } from "node:os";\nexport const c = tmpdir;\n`,
    });
    const { problems } = await check(pkg);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^uses-deps "\." reaches the Node built-in "node:os"/);
    assert.match(problems[0], /uses-deps\/node_modules\/node-only\/index\.js/);
  });

  it("passes a clean entry, and examines only the entries that client.browser names", async () => {
    const pkg = fixture("clean", { exports: { ".": "./lib/index.js", "./node": "./lib/node.js" }, client: { procedures: "./lib/register.js", browser: ["."] } }, {
      "lib/index.js": `import { add } from "./math.js";\nexport const twice = (n) => add(n, n);\n`,
      "lib/math.js": `export const add = (a, b) => a + b;\n// import "http" in a comment loads nothing\nexport const text = 'import { request } from "http";';\n`,
      "lib/node.js": `import { createServer } from "http";\nexport { createServer };\n`,
    });
    const without = fixture("no-list", { exports: { ".": "./lib/index.js" }, client: null }, { "lib/index.js": `import "fs";\n` });
    assert.deepEqual(await check(pkg, without), { problems: [], entries: 1 });
  });

  it("reports an entry that esbuild cannot bundle, for example an import of a missing package", async () => {
    const pkg = fixture("missing-dep", { exports: { ".": "./lib/index.js" }, client: { browser: ["."] } }, { "lib/index.js": `export * from "not-installed";\n` });
    const { problems } = await check(pkg);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^missing-dep "\.": esbuild cannot bundle it for a browser: .*not-installed/);
  });

  it("fails on a list that names no export, an entry without a file, and a list that is not a list", async () => {
    const stale = fixture("stale", { exports: { ".": "./lib/index.js", "./types": { types: "./lib/index.d.ts" } }, client: { browser: ["./gone", "./types", "."] } }, {});
    const wrong = fixture("wrong", { exports: { ".": "./lib/index.js" }, client: { browser: "." } }, {});
    const { problems, entries } = await check(stale, wrong);
    assert.equal(entries, 0);
    assert.deepEqual(problems, [
      'stale: client.browser names "./gone", but the exports map has no "./gone"',
      'stale: the exports entry "./types" has no JavaScript file to bundle',
      'stale: "." is ./lib/index.js, and that file does not exist (start pnpm build first)',
      "wrong: client.browser is not a list of exports keys",
    ]);
  });
});
