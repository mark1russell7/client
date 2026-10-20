// The tests of scripts/check-declared-imports.mjs (roadmap CLI-63), with fixture packages in a
// temporary folder. Start them with: node --test scripts/check-declared-imports.test.mjs

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { entryFiles, packageNameOf, undeclaredImportProblems } from "./check-declared-imports.mjs";

const fixtures = mkdtempSync(join(tmpdir(), "declared-imports-"));
after(() => rmSync(fixtures, { recursive: true, force: true }));

/** This function writes a fixture package (its files, relative to its folder) and gives it as the check reads it. */
function fixture(name, manifest, files) {
  const path = join(fixtures, name.replace("/", "__"));
  const full = { name, type: "module", ...manifest };
  for (const [file, text] of Object.entries({ ...files, "package.json": JSON.stringify(full) })) {
    mkdirSync(dirname(join(path, file)), { recursive: true });
    writeFileSync(join(path, file), text);
  }
  return { name, path, manifest: full };
}

const check = (...packages) => undeclaredImportProblems(packages);

describe("packageNameOf", () => {
  it("reduces an import to its package name, and a scoped name keeps two segments", () => {
    assert.equal(packageNameOf("zod"), "zod");
    assert.equal(packageNameOf("zod/v4/core"), "zod");
    assert.equal(packageNameOf("@modelcontextprotocol/sdk/server/mcp.js"), "@modelcontextprotocol/sdk");
    assert.equal(packageNameOf("@procedures/client"), "@procedures/client");
  });

  it("gives no name for a built-in, a path, a subpath import, a URL or a text that is not a package name", () => {
    for (const specifier of ["fs", "node:fs", "fs/promises", "node:fs/promises", "node:test", "./x.js", "../x.js", "/abs/x.js", "#internal", "data:text/javascript,1", "https://example.com/x.js", "${value}", "@scope", "has space", ""]) {
      assert.equal(packageNameOf(specifier), undefined, specifier);
    }
  });
});

describe("entryFiles", () => {
  it("reads each condition of the exports map except types, the bins, and the files of a pattern", () => {
    const pkg = fixture("entries", { exports: { ".": { types: "./lib/index.d.ts", import: "./lib/index.js", require: "./lib/index.cjs" }, "./tools/*": "./lib/tools/*.js", "./package.json": "./package.json" }, bin: { tool: "./bin/tool.js" } }, {
      "lib/tools/a.js": "",
      "lib/tools/deep/b.js": "",
      "lib/tools/c.d.ts": "",
    });
    assert.deepEqual(entryFiles(pkg.manifest, pkg.path).sort(), ["./bin/tool.js", "./lib/index.cjs", "./lib/index.js", "./lib/tools/a.js", "./lib/tools/deep/b.js"]);
  });

  it("reads the main when the package has no exports map", () => {
    assert.deepEqual(entryFiles({ main: "lib/main.js", bin: "cli.js" }, fixtures), ["./lib/main.js", "./cli.js"]);
  });
});

describe("undeclaredImportProblems", () => {
  it("fails on an undeclared import, also when the package declares it only in devDependencies", async () => {
    const pkg = fixture("@fixture/mcp", { exports: { ".": "./dist/index.js" }, dependencies: { "@modelcontextprotocol/sdk": "^1.0.0" }, devDependencies: { zod: "^4.6.5" } }, {
      "dist/index.js": `export { serve } from "./procedures/serve.js";\n`,
      "dist/procedures/serve.js": `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";\nimport { z } from "zod";\nexport const serve = () => [McpServer, z];\n`,
    });
    assert.deepEqual(await check(pkg), {
      problems: ["@fixture/mcp: dist/procedures/serve.js imports 'zod', which is not declared"],
      entries: 1,
    });
  });

  it("fails on an undeclared package in a dynamic import, in require and in export from, once for each file", async () => {
    const pkg = fixture("lazy", { exports: { ".": "./lib/index.js" }, bin: { lazy: "./bin/lazy.js" } }, {
      "lib/index.js": `export * from "re-exported";\nexport { x } from "./cjs.cjs";\nexport const load = () => import("lodash/fp");\nexport const again = () => import("lodash");\n`,
      "lib/cjs.cjs": `exports.x = require("@scope/needed/deep/file.js");\n`,
      "bin/lazy.js": `import "commander";\n`,
    });
    const { problems, entries } = await check(pkg);
    assert.equal(entries, 2);
    assert.deepEqual(problems.sort(), [
      "lazy: bin/lazy.js imports 'commander', which is not declared",
      "lazy: lib/cjs.cjs imports '@scope/needed', which is not declared",
      "lazy: lib/index.js imports 'lodash', which is not declared",
      "lazy: lib/index.js imports 're-exported', which is not declared",
    ]);
  });

  it("passes a dependency, a peer, an optional dependency, a built-in and an import of the package itself", async () => {
    const pkg = fixture("@fixture/declared", {
      exports: { ".": "./dist/index.js", "./module": "./dist/module.js" },
      dependencies: { zod: "^4.6.5" },
      peerDependencies: { "@procedures/client": "^0.17.0", express: "^5.0.0" },
      peerDependenciesMeta: { express: { optional: true } },
      optionalDependencies: { "fsevents": "^2.3.0" },
    }, {
      "dist/index.js": `import { z } from "zod/v4";\nimport { createClient } from "@procedures/client/client";\nimport { readFile } from "node:fs/promises";\nimport { createServer } from "http";\nimport zlib from "zlib";\nexport { module } from "@fixture/declared/module";\nexport const all = [z, createClient, readFile, createServer, zlib, () => import("express"), () => import("fsevents")];\n`,
      "dist/module.js": `export const module = 1;\n`,
    });
    assert.deepEqual(await check(pkg), { problems: [], entries: 2 });
  });

  it("does not count a type-only import, which tsc erases", async () => {
    const pkg = fixture("types-only", { exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" }, "./source": "./src/index.ts" } }, {
      // The output of tsc: the declaration file keeps the import of the types, the JavaScript does not
      "dist/index.d.ts": `import type { ZodType } from "zod";\nimport { type InferOutput } from "valibot";\nexport declare const schema: ZodType | InferOutput<never>;\n`,
      "dist/index.js": `export const schema = { kind: "object" };\n`,
      // A TypeScript entry: the parser of esbuild erases `import type`, as tsc does
      "src/index.ts": `import type { ZodType } from "zod";\nexport type { BaseSchema } from "valibot";\nexport const schema: ZodType = undefined as never;\n`,
    });
    assert.deepEqual(await check(pkg), { problems: [], entries: 2 });
  });

  it("reads only the files that an entry reaches: a file that only the tests import does not count", async () => {
    const pkg = fixture("@fixture/collections", { exports: { ".": "./dist/index.js", "./testing": "./dist/testing.js" }, devDependencies: { "fast-check": "^4.0.0" } }, {
      "dist/index.js": `export const overlay = (a, b) => ({ ...a, ...b });\n`,
      "dist/testing.js": `export const fixtureRows = [];\n`,
      "dist/contracts/model.js": `import fc from "fast-check";\nexport const arbitraryRow = fc.record({});\n`,
      "dist/contracts/model.test.js": `import "./model.js";\n`,
    });
    assert.deepEqual(await check(pkg), { problems: [], entries: 2 });
  });

  it("does not count a text or a comment that looks like an import", async () => {
    const pkg = fixture("@fixture/lib", { exports: { ".": "./dist/index.js" } }, {
      "dist/index.js": [
        "// import { a } from \"in-a-comment\";",
        "/* require(\"in-a-block-comment\") */",
        "export const template = (value) => `import { x } from \"${value}\";`;",
        "export const rename = (newValue) => `export * from \"${newValue}\"`;",
        "export const text = 'import \"in-a-string\"; require(\"in-a-string-too\")';",
        "",
      ].join("\n"),
    });
    assert.deepEqual(await check(pkg), { problems: [], entries: 1 });
  });

  it("reports a missing entry file, and an entry that esbuild cannot read", async () => {
    const unbuilt = fixture("unbuilt", { exports: { ".": "./dist/index.js" } }, {});
    const broken = fixture("broken", { exports: { ".": "./dist/index.js" } }, { "dist/index.js": `export * from "./gone.js";\n` });
    const { problems, entries } = await check(unbuilt, broken);
    assert.equal(entries, 1);
    assert.equal(problems.length, 2);
    assert.equal(problems[0], "unbuilt: the entry ./dist/index.js does not exist (start pnpm build first)");
    assert.match(problems[1], /^broken: esbuild cannot read its entries: .*gone\.js/);
  });
});
