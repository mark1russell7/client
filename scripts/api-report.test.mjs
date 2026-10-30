// The tests of the reports of the public API (roadmap R30, CLI-86): the reader of the declaration
// files, the entries of the exports field, and the script on fixture packages in a temporary folder.
// Start them with: node --test scripts/api-report.test.mjs

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { apiReport, entriesOf, packageFolders, packageReport, parseDeclarations, statementsOf, targetOf } from "./lib/api-report.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "api-report.mjs");
const temp = mkdtempSync(join(tmpdir(), "api-report-"));
after(() => rmSync(temp, { recursive: true, force: true }));
let fixtures = 0;

/** This function writes a fixture folder, and gives its path. */
function fixture(files) {
  const root = join(temp, String(fixtures++));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), typeof text === "string" ? text : JSON.stringify(text, null, 2));
  }
  return root;
}

/** The report of a fixture package, without its header of five lines. */
function body(files) {
  return packageReport(fixture(files)).split("\n").slice(5).join("\n");
}

describe("the statements of a declaration file", () => {
  it("splits the statements, and drops the comments and the blank lines", () => {
    const source = [
      "/** The doc. */\r",
      'export declare const a: "x;y" | `${string};${number}`; // a comment',
      "export interface B {\r",
      "    /** A member. */",
      "    c: { d: string };",
      "",
      "}",
      'export { e as f } from "./g.js";',
      "export declare class H<T = {}> extends I<{ j: () => void }> {",
      "    k: T;",
      "}",
      "export type L = (m: number) => { n: 1 };",
      "//# sourceMappingURL=x.d.ts.map",
    ].join("\n");
    assert.deepEqual(statementsOf(source), [
      'export declare const a: "x;y" | `${string};${number}`;',
      "export interface B {\n    c: { d: string };\n}",
      'export { e as f } from "./g.js";',
      "export declare class H<T = {}> extends I<{ j: () => void }> {\n    k: T;\n}",
      "export type L = (m: number) => { n: 1 };",
    ]);
  });

  it("drops the #! line of the declarations of a bin file", () => {
    assert.deepEqual(statementsOf('#!/usr/bin/env node\nimport type { A } from "a";\nexport declare const b: A;\n'), ['import type { A } from "a";', "export declare const b: A;"]);
  });

  it("keeps a declare module block and a namespace block as one statement each", () => {
    const source = ['declare module "./x.js" {', "    interface A { b: 1; }", "}", "export declare namespace N {", "    const c: 1;", "}"].join("\n");
    assert.deepEqual(statementsOf(source), ['declare module "./x.js" {\n    interface A { b: 1; }\n}', "export declare namespace N {\n    const c: 1;\n}"]);
  });
});

describe("the kinds of the statements", () => {
  it("knows export =, import = require and export default", () => {
    const info = parseDeclarations(
      ['declare function f(): void;', "export = f;", 'import g = require("./g.js");', "declare const _default: number;", "export default _default;"].join("\n"),
    );
    assert.deepEqual(info.exported.get("export="), { local: "f", typeOnly: false });
    assert.deepEqual(info.imports.get("g"), { from: "./g.js", imported: "export=", typeOnly: false });
    assert.deepEqual(info.exported.get("default"), { local: "_default", typeOnly: false });
  });

  it("knows a default function or class without a name", () => {
    assert.equal(parseDeclarations("export default function (a: string): void;").locals.get("default").length, 1);
    assert.equal(parseDeclarations("export default class extends A {\n    b: 1;\n}").exported.get("default").local, "default");
    assert.equal(parseDeclarations("export default class C {\n}").exported.get("default").local, "C");
  });

  it("gives each name of a declaration with two declarators", () => {
    const info = parseDeclarations("export declare const a: Map<string, number>, b: (c: 1, d: 2) => void;");
    assert.deepEqual([...info.exported.keys()], ["a", "b"]);
  });

  it("keeps the ambient declarations by label", () => {
    const info = parseDeclarations(['declare module "./x.js" {\n    interface A {\n    }\n}', "declare global {\n    var g: 1;\n}", "export as namespace Lib;"].join("\n"));
    assert.deepEqual([...info.ambient.keys()], ['declare module "./x.js"', "declare global", "export as namespace Lib"]);
  });

  it("collects the module specifiers, also of import types", () => {
    const info = parseDeclarations(['import { a } from "./a.js";', 'export * from "./b.js";', 'export declare const c: import("./c.js").C;'].join("\n"));
    assert.deepEqual([...info.references].sort(), ["./a.js", "./b.js", "./c.js"]);
  });

  it("throws at an unknown form of statement", () => {
    assert.throws(() => parseDeclarations("something else;", "x.d.ts"), /A statement that the report does not know, in x\.d\.ts/);
  });
});

describe("the entries of the exports field", () => {
  it("reads the string form, the nested conditions and an array", () => {
    assert.equal(targetOf("./a.js"), "./a.js");
    assert.equal(targetOf({ import: { types: "./a.d.mts", default: "./a.mjs" }, require: { types: "./a.d.cts" } }), "./a.d.mts");
    assert.equal(targetOf({ browser: "./b.js", default: "./a.js" }), "./a.js");
    assert.equal(targetOf([{ worker: "./w.js" }, "./a.js"]), "./a.js");
    assert.equal(targetOf(null), null);
  });

  it("skips ./package.json and an excluded subpath, and infers the declaration of a JavaScript target", () => {
    const root = fixture({ "dist/a.d.ts": "export {};\n", "dist/a.js": "", "dist/b.js": "", "dist/c.css": "" });
    const manifest = {
      exports: {
        ".": { import: "./dist/a.js" },
        "./b": "./dist/b.js",
        "./c.css": "./dist/c.css",
        "./internal": null,
        "./package.json": "./package.json",
      },
    };
    assert.deepEqual(entriesOf(manifest, root), [
      { subpath: ".", types: "./dist/a.d.ts" },
      { subpath: "./b", note: "no declaration file for ./dist/b.js" },
      { subpath: "./c.css", note: "no declaration file for ./dist/c.css" },
    ]);
    assert.deepEqual(entriesOf({ exports: "./dist/a.js" }, root), [{ subpath: ".", types: "./dist/a.d.ts" }]);
    assert.deepEqual(entriesOf({ exports: { import: "./dist/a.js" } }, root), [{ subpath: ".", types: "./dist/a.d.ts" }]);
  });

  it("expands a subpath pattern into the declaration files that it matches", () => {
    const root = fixture({ "dist/x.d.ts": "", "dist/y/z.d.ts": "", "dist/secret.d.ts": "", "dist/x.js": "" });
    const manifest = { exports: { "./*": { types: "./dist/*.d.ts", import: "./dist/*.js" }, "./secret": null, "./none/*": "./lib/*.js" } };
    assert.deepEqual(entriesOf(manifest, root), [
      { subpath: "./x", types: "./dist/x.d.ts" },
      { subpath: "./y/z", types: "./dist/y/z.d.ts" },
      { subpath: "./none/*", note: "no file matches ./lib/*.d.ts" },
    ]);
  });

  it("reads types, typings and main without an exports field", () => {
    const root = fixture({ "lib/main.d.ts": "", "index.d.ts": "" });
    assert.deepEqual(entriesOf({ types: "./t.d.ts" }, root), [{ subpath: ".", types: "./t.d.ts" }]);
    assert.deepEqual(entriesOf({ typings: "./t.d.ts" }, root), [{ subpath: ".", types: "./t.d.ts" }]);
    assert.deepEqual(entriesOf({ main: "./lib/main.js" }, root), [{ subpath: ".", types: "./lib/main.d.ts" }]);
    assert.deepEqual(entriesOf({}, root), [{ subpath: ".", types: "./index.d.ts" }]);
    assert.deepEqual(entriesOf({ main: "./x.js" }, fixture({})), [{ subpath: ".", note: "no declaration file for main ./x.js" }]);
    assert.deepEqual(entriesOf({}, fixture({})), []);
  });
});

describe("the report of a package", () => {
  it("lists the names of each entry, then each declaration, in the order of the code units", () => {
    const report = body({
      "package.json": { name: "p", exports: { ".": { types: "./dist/index.d.ts" }, "./b": { types: "./dist/b.d.ts" } } },
      "dist/index.d.ts": ['export { b as renamed, type B } from "./b.js";', 'export * from "./c.js";', "export declare function Zeta(): void;", "export declare function alpha(): void;"].join("\n"),
      "dist/b.d.ts": "/** Doc. */\nexport declare const b: 1;\nexport interface B {\n    x: 1;\n}\n",
      "dist/c.d.ts": "export type C = 2;\nexport default C;\n",
    });
    assert.equal(
      report,
      [
        "",
        "## . (dist/index.d.ts): 5 names",
        "",
        "type B: dist/b.d.ts#B",
        "C: dist/c.d.ts#C",
        "Zeta: dist/index.d.ts#Zeta",
        "alpha: dist/index.d.ts#alpha",
        "renamed: dist/b.d.ts#b",
        "",
        "## ./b (dist/b.d.ts): 2 names",
        "",
        "B: dist/b.d.ts#B",
        "b: dist/b.d.ts#b",
        "",
        "## Declarations",
        "",
        "### dist/b.d.ts#B",
        "export interface B {\n    x: 1;\n}",
        "",
        "### dist/b.d.ts#b",
        "export declare const b: 1;",
        "",
        "### dist/c.d.ts#C",
        "export type C = 2;",
        "",
        "### dist/index.d.ts#Zeta",
        "export declare function Zeta(): void;",
        "",
        "### dist/index.d.ts#alpha",
        "export declare function alpha(): void;",
        "",
      ].join("\n"),
    );
  });

  it("joins the overloads of a function and drops the private members of a class", () => {
    const report = body({
      "package.json": { name: "p", types: "./index.d.ts" },
      "index.d.ts": ["export declare function f(a: string): string;", "export declare function f(a: number): number;", "export declare class K {", "    #private;", "    private secret;", "    private static readonly other;", "    protected kept: 1;", "    get value(): 1;", "}"].join("\n"),
    });
    assert.match(report, /### index\.d\.ts#f\nexport declare function f\(a: string\): string;\nexport declare function f\(a: number\): number;\n/);
    assert.match(report, /### index\.d\.ts#K\nexport declare class K \{\n {4}protected kept: 1;\n {4}get value\(\): 1;\n\}\n/);
  });

  it("knows enums, namespaces, export = and export default", () => {
    const report = body({
      "package.json": { name: "p", exports: { ".": "./index.js", "./cjs": "./cjs.js", "./def": "./def.js" } },
      "index.d.ts": ["export declare enum E {\n    A = 0\n}", "export declare const enum F {\n    B = 1\n}", "export declare namespace N {\n    const c: 1;\n}"].join("\n"),
      "cjs.d.ts": "declare function run(): void;\ndeclare namespace run {\n    const version: string;\n}\nexport = run;\n",
      "def.d.ts": "declare const _default: { a: 1 };\nexport default _default;\n",
    });
    assert.match(report, /## \. \(index\.d\.ts\): 3 names\n\nE: index\.d\.ts#E\nF: index\.d\.ts#F\nN: index\.d\.ts#N\n/);
    assert.match(report, /## \.\/cjs \(cjs\.d\.ts\): 1 names\n\nexport=: cjs\.d\.ts#run\n/);
    assert.match(report, /### cjs\.d\.ts#run\ndeclare function run\(\): void;\ndeclare namespace run \{\n {4}const version: string;\n\}\n/);
    assert.match(report, /default: def\.d\.ts#_default\n/);
  });

  it("lists the names of a namespace export and the names of other packages", () => {
    const report = body({
      "package.json": { name: "p", types: "./index.d.ts" },
      "index.d.ts": ['export * as ns from "./ns.js";', 'export * from "other-package";', 'import type { Ext } from "@scope/pkg/sub";', "export { Ext };", 'import * as all from "./ns.js";', "export { all };"].join("\n"),
      "ns.d.ts": "export declare const one: 1;\nexport type Two = 2;\n",
    });
    assert.match(
      report,
      new RegExp(
        [
          "\\* from \"other-package\": other-package#\\* \\(external\\)",
          "type Ext: @scope/pkg/sub#Ext \\(external\\)",
          "all: ns\\.d\\.ts#\\* \\(namespace\\)",
          "all\\.Two: ns\\.d\\.ts#Two",
          "all\\.one: ns\\.d\\.ts#one",
          "ns: ns\\.d\\.ts#\\* \\(namespace\\)",
          "ns\\.Two: ns\\.d\\.ts#Two",
          "ns\\.one: ns\\.d\\.ts#one",
        ].join("\\n"),
      ),
    );
  });

  it("gives each name of export type * and export type * as as a type", () => {
    const report = body({
      "package.json": { name: "p", types: "./index.d.ts" },
      "index.d.ts": ['export type * from "./ir.js";', 'export type * as shapes from "./ir.js";', 'export type * from "other-package";'].join("\n"),
      "ir.d.ts": "export declare const node: 1;\nexport type Edge = 2;\n",
    });
    assert.match(report, /type \* from "other-package": other-package#\* \(external\)\ntype Edge: ir\.d\.ts#Edge\ntype node: ir\.d\.ts#node\ntype shapes: ir\.d\.ts#\* \(namespace\)/);
  });

  it("lists the ambient declarations of each file that an entry reaches", () => {
    const report = body({
      "package.json": { name: "p", types: "./index.d.ts" },
      "index.d.ts": 'export type { A } from "./a.js";\nexport declare const b: import("./b.js").B;\n',
      "a.d.ts": 'export interface A {\n}\ndeclare module "./a.js" {\n    interface A {\n        added: 1;\n    }\n}\n',
      "b.d.ts": "export type B = 1;\ndeclare global {\n    var g: 1;\n}\n",
    });
    assert.match(report, /ambient: a\.d\.ts#declare module "\.\/a\.js"\nambient: b\.d\.ts#declare global\n/);
    assert.match(report, /### b\.d\.ts#declare global\ndeclare global \{\n {4}var g: 1;\n\}/);
  });

  it("resolves a # name of the imports field", () => {
    const report = body({
      "package.json": { name: "p", types: "./index.d.ts", imports: { "#lib/*": "./lib/*.js" } },
      "index.d.ts": 'export { x } from "#lib/x";\n',
      "lib/x.d.ts": "export declare const x: 1;\n",
    });
    assert.match(report, /x: lib\/x\.d\.ts#x\n/);
  });

  it("says when a package has no type declarations, and names the entries without one", () => {
    const report = packageReport(fixture({ "package.json": { name: "p", exports: { "./style.css": "./style.css" } } }));
    assert.match(report, /^# The public API of p\n/);
    assert.match(report, /This package has no type declarations/);
    assert.match(report, /## \.\/style\.css: no declaration file for \.\/style\.css\n$/);
  });

  it("throws when the build is missing", () => {
    assert.throws(() => packageReport(fixture({ "package.json": { name: "p", types: "./dist/index.d.ts" } })), /dist\/index\.d\.ts is missing\. Build the package first/);
  });

  it("gives the same text for CRLF line ends", () => {
    const files = (end) => ({ "package.json": { name: "p", types: "./index.d.ts" }, "index.d.ts": ["export interface A {", "    b: 1;", "}", ""].join(end) });
    assert.equal(body(files("\r\n")), body(files("\n")));
    assert.equal(apiReport("p", fixture({}), []).includes("\r"), false);
  });
});

describe("the script", () => {
  const run = (cwd, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
  const workspace = () =>
    fixture({
      "package.json": { name: "root", private: true },
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n  # a comment\n  - "!packages/ignored"\n\nother: 1\n',
      "packages/a/package.json": { name: "a", types: "./index.d.ts" },
      "packages/a/index.d.ts": "export declare const a: 1;\n",
      "packages/b/package.json": { name: "b", exports: { "./x.css": "./x.css" } },
      "packages/hidden/package.json": { name: "hidden", private: true },
      "packages/ignored/package.json": { name: "ignored" },
    });

  it("finds the package folders of the workspace", () => {
    const root = workspace();
    assert.deepEqual(packageFolders(root), ["a", "b", "hidden"].map((name) => join(root, "packages", name)));
    const single = fixture({ "package.json": { name: "solo" } });
    assert.deepEqual(packageFolders(single), [single]);
  });

  it("fails a check without reports, writes them with --update, then passes", () => {
    const root = workspace();
    const first = run(root);
    assert.equal(first.status, 1);
    assert.match(first.stdout, /No report:\n {2}packages\/a\n {2}packages\/b\n/);
    const update = run(root, "--update");
    assert.equal(update.status, 0, update.stdout + update.stderr);
    assert.match(update.stdout, /packages\/a\/test\/api\/public-api\.txt \(new\)/);
    assert.match(readFileSync(join(root, "packages/a/test/api/public-api.txt"), "utf8"), /a: index\.d\.ts#a/);
    assert.equal(run(root, "--check").status, 0);
    writeFileSync(join(root, "packages/a/index.d.ts"), "export declare const a: 2;\n");
    const changed = run(root, "packages/a");
    assert.equal(changed.status, 1);
    assert.match(changed.stdout, /differs from the built \.d\.ts files:\n {2}packages\/a \(first difference at line \d+\)/);
  });

  it("fails a run over all packages that finds no public package", () => {
    const root = fixture({
      "package.json": { name: "root", private: true },
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
      "packages/hidden/package.json": { name: "hidden", private: true },
    });
    for (const mode of ["--check", "--update"]) {
      const result = run(root, mode);
      assert.equal(result.status, 1, mode);
      assert.match(result.stdout, /Errors:\n {2}\.: no public package/);
    }
  });

  it("fails a run over all packages on a report that the run does not examine", () => {
    const root = workspace();
    assert.equal(run(root, "--update").status, 0);
    for (const folder of ["hidden", "ignored", "removed"]) {
      mkdirSync(join(root, "packages", folder, "test/api"), { recursive: true });
      writeFileSync(join(root, "packages", folder, "test/api/public-api.txt"), "an old report\n");
    }
    for (const mode of ["--check", "--update"]) {
      const result = run(root, mode);
      assert.equal(result.status, 1, mode);
      assert.match(result.stdout, /does not examine \(remove the report, or make the package public\):\n {2}packages\/hidden\/test\/api\/public-api\.txt\n {2}packages\/ignored\/test\/api\/public-api\.txt\n {2}packages\/removed\/test\/api\/public-api\.txt\n/);
    }
    // A run of named folders examines only those folders
    assert.equal(run(root, "packages/a").status, 0);
  });

  it("reports an error of one package, and still writes the others", () => {
    const root = workspace();
    writeFileSync(join(root, "packages/a/index.d.ts"), "something unknown;\n");
    const result = run(root, "--update");
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Errors:\n {2}packages\/a: A statement that the report does not know/);
    assert.match(readFileSync(join(root, "packages/b/test/api/public-api.txt"), "utf8"), /no type declarations/);
  });
});
