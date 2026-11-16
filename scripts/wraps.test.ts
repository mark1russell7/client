// The pure parts of scripts/wraps.ts: the declaration file and the JavaScript file of an entry,
// the ratchet, the source of a manifest file, and the checks of the pure wraps and the programs.
// The check itself runs in CI after the build.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  callPaths,
  coverageKey,
  coverageOf,
  declarationsOf,
  entryFileOf,
  importOf,
  isBelow,
  manifestSource,
  programUseProblems,
  pureProblems,
  runProblems,
  typesOf,
  type WrapProgram,
} from "./wraps.ts";

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

describe("importOf and entryFileOf", () => {
  it("take the import condition, then node, then default, and skip a declaration file", () => {
    assert.equal(importOf({ types: "./a.d.ts", import: "./a.js", default: "./a.cjs" }), "./a.js");
    assert.equal(importOf({ node: { import: "./b.mjs" }, default: "./b.cjs" }), "./b.mjs");
    assert.equal(importOf({ types: "./c.d.ts", default: "./c.js" }), "./c.js");
    assert.equal(importOf("./d.d.mts"), undefined);
    assert.equal(importOf({ types: "./e.d.ts" }), undefined);
    assert.equal(importOf(null), undefined);
  });

  it("read the entry of the exports map, an exports map of conditions, and the fields module or main", () => {
    const keyed = { exports: { ".": { types: "./build/index.d.ts", import: "./build/index.js" }, "./fast": "./build/fast.js" } };
    assert.equal(entryFileOf(keyed, "."), "./build/index.js");
    assert.equal(entryFileOf(keyed, "./fast"), "./build/fast.js");
    assert.equal(entryFileOf(keyed, "./none"), undefined);
    assert.equal(entryFileOf({ exports: { import: "./i.js" } }, "."), "./i.js");
    assert.equal(entryFileOf({ exports: { import: "./i.js" } }, "./other"), undefined);
    assert.equal(entryFileOf({ module: "./m.js", main: "./c.js" }, "."), "./m.js");
    assert.equal(entryFileOf({ main: "./c.js" }, "."), "./c.js");
    assert.equal(entryFileOf({ main: "./c.js" }, "./other"), undefined);
  });
});

describe("pureProblems", () => {
  const browser = { client: { browser: [".", "./module", "./register"] } };

  it("gives no problem for procedures with no effects and the three browser entries", () => {
    assert.deepEqual(pureProblems("p", { procedures: [{ name: "a", effects: { reads: [], writes: [] } }] }, browser), []);
  });

  it("gives a problem for a procedure that reads, writes or declares no effects", () => {
    const procedures = [
      { name: "reads", effects: { reads: ["fs"], writes: [] } },
      { name: "writes", effects: { reads: [], writes: ["net"] } },
      { name: "unknown" },
    ];
    const problems = pureProblems("p", { procedures }, browser);
    assert.deepEqual(problems.map((problem) => problem.split(" ")[3]), ["reads", "writes", "unknown"]);
  });

  it("gives a problem for each browser entry that client.browser does not list", () => {
    const problems = pureProblems("p", { procedures: [] }, { client: { browser: ["."] } });
    assert.equal(problems.length, 2);
    assert.match(problems[0]!, /does not list \.\/module/);
    assert.match(problems[1]!, /does not list \.\/register/);
    assert.equal(pureProblems("p", { procedures: [] }, {}).length, 3);
  });
});

describe("callPaths", () => {
  it("collects the calls of the input and of the sub-programs, and skips the value of a $literal", () => {
    const program = {
      $proc: ["a", "outer"],
      input: {
        x: { $proc: ["b", "inner"], input: { y: { $proc: ["a", "deep"] } } },
        list: [{ $proc: ["b", "item"], $when: "$never" }],
        data: { $literal: { $proc: ["c", "data"] } },
      },
    };
    assert.deepEqual(callPaths(program), [["a", "outer"], ["b", "inner"], ["a", "deep"], ["b", "item"]]);
    assert.deepEqual(callPaths({ $proc: "not-a-path" }), []);
  });
});

describe("programUseProblems", () => {
  const wraps = [
    { dir: "statistics", namespace: ["statistics"] },
    { dir: "generators", namespace: ["generators"] },
  ];
  const program = (name: string, ...paths: string[][]): WrapProgram => ({
    name,
    program: { $proc: paths[0]!, input: Object.fromEntries(paths.slice(1).map((path, index) => [`x${index}`, { $proc: path }])) },
  });

  it("gives no problem when the programs call each pure wrap and only the pure wraps", () => {
    assert.deepEqual(programUseProblems([program("one", ["statistics", "median"], ["generators", "deriveSeed"])], wraps), []);
  });

  it("gives a problem for a call outside the pure wraps, and for a pure wrap that no program calls", () => {
    const problems = programUseProblems([program("one", ["statistics", "median"], ["fs", "read"])], wraps);
    assert.deepEqual(problems, [
      "wraps.programs.json: the program one calls fs.read, which is not a procedure of a pure wrap",
      "packages/generators: no program of wraps.programs.json calls a procedure of the pure wrap",
    ]);
  });

  it("does not take a namespace as the start of a longer segment", () => {
    const problems = programUseProblems([program("one", ["statisticsx", "median"])], [wraps[0]!]);
    assert.equal(problems.length, 2);
  });

  it("gives a problem for a program with no name, a name that repeats, and no call", () => {
    const problems = programUseProblems(
      [program("", ["statistics", "median"]), program("two", ["statistics", "mean"]), program("two", ["statistics", "mean"]), { name: "none", program: { $proc: "x" as unknown as string[] } }],
      [wraps[0]!],
    );
    assert.deepEqual(problems, [
      "wraps.programs.json: a program has no name",
      "wraps.programs.json: two programs have the name two",
      "wraps.programs.json: the program none has no call",
    ]);
  });
});

describe("runProblems", () => {
  const program: WrapProgram = { name: "p", program: { $proc: ["a", "b"] }, result: { value: [1, 2] } };

  it("gives no problem for two equal runs that are equal to the recorded result", () => {
    assert.deepEqual(runProblems(program, { first: { value: [1, 2] }, second: { value: [1, 2] } }, true), []);
  });

  it("gives a problem for an error, and for two runs that differ, also with no check of the record", () => {
    assert.deepEqual(runProblems(program, { error: "boom" }, false), ["wraps.programs.json: the program p fails: boom"]);
    assert.deepEqual(runProblems(program, { first: 1, second: 2 }, false), ["wraps.programs.json: the program p gives two different results in two runs"]);
  });

  it("compares the result with the record only when it is asked to", () => {
    const run = { first: { value: [2, 1] }, second: { value: [2, 1] } };
    assert.deepEqual(runProblems(program, run, false), []);
    assert.match(runProblems(program, run, true)[0]!, /gives \{"value":\[2,1\]\}, not the recorded result \{"value":\[1,2\]\}$/);
    assert.match(runProblems({ name: "q", program: program.program }, run, true)[0]!, /has no recorded result/);
  });

  it("takes a recorded null as a result", () => {
    assert.deepEqual(runProblems({ ...program, result: null }, { first: null, second: null }, true), []);
  });
});
