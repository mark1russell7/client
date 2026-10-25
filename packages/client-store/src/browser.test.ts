/**
 * The entry `@procedures/store/browser` (roadmap CLI-19). The first tests pin the exports of the
 * entry: the same classes as the root and `./indexeddb`, and no file store. The last test reads
 * the sources that the entry loads through relative imports. It fails on an import of a module of
 * Node. It also fails on a value import of a package entry outside the browser-safe list.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as browser from "./browser.js";
import * as indexeddb from "./indexeddb.js";
import * as root from "./index.js";

const SRC = dirname(fileURLToPath(import.meta.url));

/** The value exports of the entry. */
const EXPORTS = [
  "ApiStorage",
  "ConflictError",
  "DEFAULT_PROGRAM_DATABASE",
  "EventsChangeFeed",
  "HybridStorage",
  "IndexedDbProgramStore",
  "IndexedDbQueueStore",
  "IndexedDbStorage",
  "IndexedDbSyncStateStore",
  "MemoryProgramStore",
  "MemoryQueueStore",
  "MemorySyncStateStore",
  "MissingKeysError",
  "ModeSwitchError",
  "PendingWriteError",
  "QueueFullError",
  "QueueStoreError",
  "RemoteApplyHookError",
  "SyncStateError",
  "TabCoordinator",
  "TabGroup",
  "hasIndexedDb",
];

/**
 * The package entries that a module of the browser entry can load at run time. The root of
 * `@procedures/client` is not in the list, because it loads `http` and `ws`. The test
 * `adapters/websocket/node.test.ts` of the client pins that `@procedures/client/browser` loads
 * no module of Node.
 */
const BROWSER_SAFE = new Set(["@procedures/client/browser", "@procedures/client/query", "@procedures/collections", "@mark1russell7/service/backoff"]);

const NODE_MODULES = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

/** The source files that an entry reaches through relative imports, and the package imports of each file. */
function walk(entry: string): Map<string, Array<{ specifier: string; typeOnly: boolean }>> {
  const files = new Map<string, Array<{ specifier: string; typeOnly: boolean }>>();
  const queue = [entry];
  // An import or an export with a module name. Group 2 is "type" for a type-only import.
  const pattern = /^\s*(import|export)\s+(type\b)?(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;
  // A dynamic import with a literal module name.
  const dynamic = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    const source = readFileSync(file, "utf8");
    const imports = [
      ...[...source.matchAll(pattern)].map((match) => ({ specifier: match[3]!, typeOnly: match[2] !== undefined })),
      ...[...source.matchAll(dynamic)].map((match) => ({ specifier: match[1]!, typeOnly: false })),
    ];
    files.set(file, imports);
    for (const { specifier } of imports) {
      if (!specifier.startsWith(".")) continue;
      const target = join(dirname(file), specifier.replace(/\.js$/, ".ts"));
      queue.push(existsSync(target) ? target : join(dirname(file), specifier, "index.ts"));
    }
  }
  return files;
}

describe("the entry @procedures/store/browser", () => {
  it("exports the storages, the feed and the stores of a browser", () => {
    expect(Object.keys(browser).sort()).toEqual([...EXPORTS].sort());
    expect(browser).not.toHaveProperty("FileProgramStore");
    expect(browser).not.toHaveProperty("FileQueueStore");
  });

  it("exports the same classes as the root and ./indexeddb", () => {
    const exported: Record<string, unknown> = { ...browser };
    const sources: Record<string, unknown> = { ...indexeddb, ...root };
    for (const name of EXPORTS) {
      expect(sources[name], name).toBeDefined();
      expect(exported[name], name).toBe(sources[name]);
    }
  });

  it("loads no module of Node and no package entry outside the browser-safe list", () => {
    const files = walk(join(SRC, "browser.ts"));
    const reached = [...files.keys()].map((file) => relative(SRC, file).replaceAll("\\", "/"));
    expect(reached).toEqual(
      expect.arrayContaining(["storage/hybrid.ts", "storage/api.ts", "storage/feed.ts", "storage/tab-coordinator.ts", "indexeddb/idb.ts"]),
    );
    expect(reached).not.toContain("program-store/file.ts");
    expect(reached).not.toContain("storage/file-queue.ts");

    const problems: string[] = [];
    for (const [file, imports] of files) {
      for (const { specifier, typeOnly } of imports) {
        const name = relative(SRC, file).replaceAll("\\", "/");
        if (NODE_MODULES.has(specifier) || specifier.startsWith("node:")) problems.push(`${name} imports ${specifier}`);
        else if (!specifier.startsWith(".") && !typeOnly && !BROWSER_SAFE.has(specifier)) problems.push(`${name} loads ${specifier}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("the entry @procedures/store/indexeddb", () => {
  it("loads only @procedures/client/query and @procedures/collections: not the root of the client, and not zod", () => {
    const files = walk(join(SRC, "indexeddb.ts"));
    const reached = [...files.keys()].map((file) => relative(SRC, file).replaceAll("\\", "/"));
    expect(reached).toEqual(expect.arrayContaining(["indexeddb/document-storage.ts", "indexeddb/idb.ts"]));
    expect(reached).not.toContain("storage/hybrid.ts");
    const loaded = new Set<string>();
    for (const imports of files.values()) {
      for (const { specifier, typeOnly } of imports) if (!specifier.startsWith(".") && !typeOnly) loaded.add(specifier);
    }
    expect([...loaded].sort()).toEqual(["@procedures/client/query", "@procedures/collections"]);
  });
});
