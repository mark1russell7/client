// The pure parts of scripts/wraps.ts: the declaration file of an entry, the ratchet and the
// source of a manifest file. The check itself runs in CI after the build.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverageKey, coverageOf, declarationsOf, isBelow, manifestSource, typesOf } from "./wraps.ts";

describe("typesOf", () => {
  it("takes the types condition, then the types of import or default", () => {
    assert.equal(typesOf({ types: "./a.d.ts", import: "./a.js" }), "./a.d.ts");
    assert.equal(typesOf({ import: { types: "./b.d.mts", default: "./b.mjs" } }), "./b.d.mts");
    assert.equal(typesOf({ default: { types: "./c.d.ts" } }), "./c.d.ts");
    assert.equal(typesOf("./d.d.ts"), "./d.d.ts");
  });

  it("gives nothing for a target with no declaration file", () => {
    assert.equal(typesOf("./a.js"), undefined);
    assert.equal(typesOf({ import: "./a.js" }), undefined);
    assert.equal(typesOf(null), undefined);
    assert.equal(typesOf(3), undefined);
  });
});

describe("declarationsOf", () => {
  it("reads the entry of the exports map", () => {
    const manifest = { exports: { ".": { types: "./build/index.d.ts" }, "./extra": { types: "./build/extra.d.ts" } } };
    assert.equal(declarationsOf(manifest, "."), "./build/index.d.ts");
    assert.equal(declarationsOf(manifest, "./extra"), "./build/extra.d.ts");
    assert.equal(declarationsOf(manifest, "./absent"), undefined);
  });

  it("reads an exports map of conditions as the entry .", () => {
    assert.equal(declarationsOf({ exports: { types: "./index.d.ts", default: "./index.js" } }, "."), "./index.d.ts");
    assert.equal(declarationsOf({ exports: { types: "./index.d.ts" } }, "./extra"), undefined);
  });

  it("does not read the field types for an entry of the exports map with no declaration file", () => {
    assert.equal(declarationsOf({ exports: { ".": "./index.js" }, types: "./index.d.ts" }, "."), undefined);
  });

  it("reads the field types or typings when the package has no exports map", () => {
    assert.equal(declarationsOf({ types: "./index.d.ts" }, "."), "./index.d.ts");
    assert.equal(declarationsOf({ typings: "./typings.d.ts" }, "."), "./typings.d.ts");
    assert.equal(declarationsOf({ types: "./index.d.ts" }, "./extra"), undefined);
    assert.equal(declarationsOf({}, "."), undefined);
  });
});

describe("the ratchet", () => {
  it("keys a home by its package, and by its entry when the entry is not .", () => {
    assert.equal(coverageKey({ home: "@scope/home", namespace: ["home"], manifest: "src/manifest.ts" }), "@scope/home");
    assert.equal(coverageKey({ home: "@scope/home", entry: "./extra", namespace: ["home"], manifest: "src/manifest.ts" }), "@scope/home/extra");
  });

  it("compares the shares, not the counts", () => {
    assert.equal(isBelow({ procedures: 72, functions: 80 }, { procedures: 74, functions: 82 }), true);
    assert.equal(isBelow({ procedures: 74, functions: 82 }, { procedures: 72, functions: 80 }), false);
    // A new function with a procedure keeps the share up, though the count of functions grows
    assert.equal(isBelow({ procedures: 10, functions: 10 }, { procedures: 9, functions: 9 }), false);
    // A new function with an exemption lowers the share
    assert.equal(isBelow({ procedures: 9, functions: 10 }, { procedures: 9, functions: 9 }), true);
    assert.equal(isBelow({ procedures: 9, functions: 9 }, { procedures: 9, functions: 9 }), false);
  });

  it("counts each procedure and each exemption as a function", () => {
    assert.deepEqual(coverageOf({ package: "p", procedures: [1, 2, 3], exempt: [4] }), { procedures: 3, functions: 4 });
  });
});

describe("manifestSource", () => {
  it("gives a typed module with a header that names the package, the version and the command", () => {
    const source = manifestSource({ package: "@scope/home", version: "1.2.3", procedures: [], exempt: [] });
    const lines = source.split("\n");
    assert.match(lines[0]!, /^\/\/ The manifest of @scope\/home 1\.2\.3, made from its types by `node scripts\/wraps\.ts generate`\. Do not edit it\.$/);
    assert.equal(lines[1], `import type { ExportsManifest } from "@procedures/compiler";`);
    assert.ok(source.includes(`export const manifest: ExportsManifest = {\n  "package": "@scope/home",`));
    assert.ok(source.endsWith("};\n"));
  });

  it("gives no version when the manifest has none", () => {
    assert.match(manifestSource({ package: "home", procedures: [], exempt: [] }), /^\/\/ The manifest of home, made/);
  });
});
