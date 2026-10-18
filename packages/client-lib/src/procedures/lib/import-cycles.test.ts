import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, Client, LocalTransport, pathToMethod } from "@procedures/client";
import { ANGULAR_DI_DECORATORS, findCycles, importCycles, importGraph } from "../../index.js";
import { libModule } from "../../module.js";

const sources = (files: Record<string, string>) => new Map(Object.entries(files));

describe("importGraph and importCycles", () => {
  it("finds a cycle of value imports, and resolves an index file and a .js specifier", () => {
    const files = sources({
      "src/a.ts": "import { b } from './b';\nexport const a = () => b;",
      "src/b.ts": "import { c } from './c/index';\nexport const b = 1; export const use = c;",
      "src/c/index.ts": "import { a } from '../a.js';\nexport const c = a;",
      "src/leaf.ts": "export const leaf = 1;",
    });
    expect(importGraph(files).get("src/c/index.ts")).toEqual(["src/a.ts"]);
    const result = importCycles(files);
    expect(result.components).toEqual([["src/a.ts", "src/b.ts", "src/c/index.ts"]]);
    expect(result).toMatchObject({ files: 4, edges: 3, filesInCycles: 3 });
  });

  it("drops an import of types only at runtime (the elision), and counts it in the modes declared and raw", () => {
    const files = sources({
      "src/a.ts": "import { B } from './b';\nexport interface A { b: B }",
      "src/b.ts": "import { A } from './a';\nexport interface B { a: A }",
    });
    expect(importCycles(files).components).toEqual([]);
    // Without `import type`, the cycle holds only because the elision catches it
    expect(importCycles(files, { mode: "declared" }).components).toEqual([["src/a.ts", "src/b.ts"]]);
    expect(importCycles(files, { mode: "raw" }).components).toEqual([["src/a.ts", "src/b.ts"]]);
    const declared = sources({
      "src/a.ts": "import type { B } from './b';\nexport interface A { b: B }",
      "src/b.ts": "import { type A } from './a';\nexport interface B { a: A }",
    });
    expect(importCycles(declared, { mode: "declared" }).components).toEqual([]);
    expect(importCycles(declared, { mode: "raw" }).components).toEqual([["src/a.ts", "src/b.ts"]]);
  });

  it("keeps the dependency-injection tokens of a decorated class (Angular) when the option names the decorators", () => {
    const files = sources({
      "src/store.ts": "import { Injectable } from '@angular/core';\nimport { Api } from './api';\n@Injectable() export class Store { constructor(private api: Api) {} }",
      "src/api.ts": "import { Injectable } from '@angular/core';\nimport { Store } from './store';\n@Injectable() export class Api { constructor(private store: Store) {} }",
    });
    expect(importCycles(files).components).toEqual([]);
    expect(importCycles(files, { diDecorators: ANGULAR_DI_DECORATORS }).components).toEqual([["src/api.ts", "src/store.ts"]]);
  });

  it("ignores a package import, and a specifier that names no known file", () => {
    const files = sources({ "src/a.ts": "import x from 'react';\nimport { y } from './missing';\nexport const a = [x, y];" });
    expect(importGraph(files).get("src/a.ts")).toEqual([]);
  });

  it("finds a cycle of 20000 files without an overflow of the call stack (the search keeps its own stack)", () => {
    const names = Array.from({ length: 20_000 }, (_, i) => `src/m${i}.ts`);
    const edges = new Map(names.map((name, i) => [name, [names[(i + 1) % names.length]!]]));
    const cycles = findCycles(names, edges);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toHaveLength(20_000);
  });
});

describe("lib.importCycles", () => {
  it("reads the sources under a folder through fs, leaves out the tests, and gives the cycles", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lib-import-cycles-"));
    try {
      mkdirSync(join(dir, "sub"));
      writeFileSync(join(dir, "a.ts"), "import { b } from './sub/b';\nexport const a = b;");
      writeFileSync(join(dir, "sub", "b.ts"), "import { a } from '../a';\nexport const b = a;");
      writeFileSync(join(dir, "a.test.ts"), "import { a } from './a';\nexport const t = a;");
      const registry = createRegistry(libModule);
      const client = new Client(new LocalTransport({ registry })).useRegistry(registry);
      const out = (await client.call(pathToMethod(["lib", "importCycles"]), { path: dir })) as { files: number; acyclic: boolean; components: string[][]; skipped: unknown[] };
      expect(out.files).toBe(2);
      expect(out.acyclic).toBe(false);
      expect(out.components).toEqual([["a.ts", "sub/b.ts"]]);
      expect(out.skipped).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /** A folder with a few sources, and a client of the lib procedures. */
  function folder(files: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), "lib-import-cycles-"));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    const registry = createRegistry(libModule);
    const client = new Client(new LocalTransport({ registry })).useRegistry(registry);
    const call = (input: Record<string, unknown>, options?: { signal?: AbortSignal }) =>
      client.call(pathToMethod(["lib", "importCycles"]), { path: dir, ...input }, options) as Promise<{ files: number; skipped: Array<{ path: string; bytes: number }> }>;
    return { dir, call, done: () => rmSync(dir, { recursive: true, force: true }) };
  }

  it("refuses a folder with more files than limits.maxFiles, before it reads a file", async () => {
    const f = folder({ "a.ts": "export const a = 1;", "b.ts": "export const b = 1;", "c.ts": "export const c = 1;" });
    try {
      await expect(f.call({ limits: { maxFiles: 2 } })).rejects.toThrow(/3 source files, more than the limit of 2/);
      expect((await f.call({ limits: { maxFiles: 3 } })).files).toBe(3);
    } finally {
      f.done();
    }
  });

  it("skips a file larger than limits.maxFileBytes, and lists it in the result", async () => {
    const f = folder({ "small.ts": "export const s = 1;", "large.ts": `export const l = "${"x".repeat(200)}";` });
    try {
      const out = await f.call({ limits: { maxFileBytes: 100 } });
      expect(out.files).toBe(1);
      expect(out.skipped).toHaveLength(1);
      expect(out.skipped[0]!.path).toBe("large.ts");
      expect(out.skipped[0]!.bytes).toBeGreaterThan(100);
    } finally {
      f.done();
    }
  });

  it("stops at an abort of the call", async () => {
    const f = folder({ "a.ts": "export const a = 1;" });
    try {
      const abort = new AbortController();
      abort.abort(new Error("stopped by the test"));
      await expect(f.call({}, { signal: abort.signal })).rejects.toThrow();
    } finally {
      f.done();
    }
  });
});

describe("the abort signal of importCycles", () => {
  it("stops before the next file", () => {
    const abort = new AbortController();
    abort.abort(new Error("stopped"));
    expect(() => importCycles(new Map([["a.ts", "export const a = 1;"]]), { signal: abort.signal })).toThrow("stopped");
  });

  it("sorts cycles of one size by the code units of their first file", () => {
    const files = new Map([
      ["b/x.ts", "import { y } from './y';\nexport const x = y;"],
      ["b/y.ts", "import { x } from './x';\nexport const y = x;"],
      ["B/x.ts", "import { y } from './y';\nexport const x = y;"],
      ["B/y.ts", "import { x } from './x';\nexport const y = x;"],
    ]);
    // "B" (66) comes before "b" (98) in code units
    expect(importCycles(files).components.map((c) => c[0])).toEqual(["B/x.ts", "b/x.ts"]);
  });
});
