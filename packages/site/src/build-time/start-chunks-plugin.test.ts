import { describe, expect, it } from "vitest";
import { eagerModules, LAZY_MODULES, startChunks, startChunksPlugin, unmatchedPatterns, type ChunkNode } from "./start-chunks-plugin";

const ROOT = "/repo/packages/site/src";

const chunk = (fileName: string, modules: string[], imports: string[] = [], isEntry = false): ChunkNode => ({ fileName, isEntry, imports, modules });

describe("the start chunks of the site", () => {
  it("follows the static imports of each entry, and stops at a cycle", () => {
    const chunks = [
      chunk("index.js", [`${ROOT}/main.tsx`], ["vendor.js"], true),
      chunk("vendor.js", ["/repo/node_modules/react/index.js"], ["index.js"]),
      chunk("Catalog.js", [`${ROOT}/pages/Catalog.tsx`], ["vendor.js"]),
    ];
    expect(startChunks(chunks)).toEqual(["index.js", "vendor.js"]);
  });

  it("finds the catalog in a start chunk, also through a shared chunk", () => {
    const chunks = [
      chunk("index.js", [`${ROOT}/main.tsx`, `${ROOT}/data/site.ts`, `${ROOT}/data/generated/site.js`], ["shared.js"], true),
      chunk("shared.js", [`${ROOT}/data/index.ts`, `${ROOT}/data/generated/catalog.js`, `${ROOT}/data/generated/packages.js`]),
    ];
    expect(eagerModules(chunks)).toEqual([
      { chunk: "shared.js", module: `${ROOT}/data/generated/catalog.js` },
      { chunk: "shared.js", module: `${ROOT}/data/generated/packages.js` },
    ]);
  });

  it("accepts the catalog in a chunk that only a dynamic import loads", () => {
    const chunks = [
      chunk("index.js", [`${ROOT}/main.tsx`, `${ROOT}/data/generated/site.js`], [], true),
      chunk("data.js", [`${ROOT}/data/index.ts`, `${ROOT}/data/generated/catalog.js`]),
    ];
    expect(eagerModules(chunks)).toEqual([]);
  });

  it("reads a module id with Windows separators and a query", () => {
    const chunks = [chunk("index.js", ["D:\\repo\\packages\\site\\src\\data\\generated\\catalog.js?import"], [], true)];
    expect(eagerModules(chunks)).toEqual([{ chunk: "index.js", module: "D:/repo/packages/site/src/data/generated/catalog.js" }]);
  });

  it("finds each pattern that matches no module of any chunk", () => {
    const chunks = [
      chunk("index.js", [`${ROOT}/main.tsx`], [], true),
      chunk("data.js", ["D:\\repo\\packages\\site\\src\\data\\generated\\catalog.js?import"]),
    ];
    expect(unmatchedPatterns(chunks)).toEqual([LAZY_MODULES[1]]);
    expect(unmatchedPatterns([...chunks, chunk("pkg.js", [`${ROOT}/data/generated/packages.js`])])).toEqual([]);
  });
});

describe("the plugin of the start chunks", () => {
  type Bundle = Record<string, { type: "chunk"; fileName: string; isEntry: boolean; imports: string[]; modules: Record<string, object> }>;
  const bundleOf = (chunks: ChunkNode[]): Bundle =>
    Object.fromEntries(
      chunks.map((node) => [
        node.fileName,
        { type: "chunk", fileName: node.fileName, isEntry: node.isEntry, imports: [...node.imports], modules: Object.fromEntries(node.modules.map((id) => [id, {}])) },
      ]),
    );
  const run = (chunks: ChunkNode[]): string[] => {
    const errors: string[] = [];
    const context = {
      error: (message: string): never => {
        errors.push(message);
        throw new Error(message);
      },
    };
    const hook = startChunksPlugin().generateBundle as (this: typeof context, options: object, bundle: Bundle) => void;
    try {
      hook.call(context, {}, bundleOf(chunks));
    } catch {
      // The error of the build is in the list
    }
    return errors;
  };

  it("passes a bundle with the generated modules in a lazy chunk", () => {
    const chunks = [
      chunk("index.js", [`${ROOT}/main.tsx`], [], true),
      chunk("data.js", [`${ROOT}/data/generated/catalog.js`, `${ROOT}/data/generated/packages.js`]),
    ];
    expect(run(chunks)).toEqual([]);
  });

  it("stops the build when a pattern finds no module, for example after a rename", () => {
    const chunks = [
      chunk("index.js", [`${ROOT}/main.tsx`, `${ROOT}/data/generated/procedures.js`, `${ROOT}/data/generated/packages.js`], [], true),
    ];
    const errors = run(chunks);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("found no module for these patterns of LAZY_MODULES");
    expect(errors[0]).toContain(LAZY_MODULES[0]!.source);
  });

  it("stops the build when a start chunk holds a generated module", () => {
    const chunks = [chunk("index.js", [`${ROOT}/main.tsx`, `${ROOT}/data/generated/catalog.js`, `${ROOT}/data/generated/packages.js`], [], true)];
    const errors = run(chunks);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`${ROOT}/data/generated/catalog.js in the start chunk index.js`);
  });
});
