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
      const out = (await client.call(pathToMethod(["lib", "importCycles"]), { path: dir })) as { files: number; acyclic: boolean; components: string[][] };
      expect(out.files).toBe(2);
      expect(out.acyclic).toBe(false);
      expect(out.components).toEqual([["a.ts", "sub/b.ts"]]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
