import { describe, expect, it } from "vitest";
import { eagerModules, startChunks, type ChunkNode } from "./start-chunks-plugin";

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
});
