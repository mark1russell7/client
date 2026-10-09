/**
 * The handler loader imports only allowed modules (regression: BUGS-2026-07 M11, deep dive
 * CORE-7, DATA-11: a stored record could name `node:child_process` and run a shell command).
 */

import { describe, it, expect } from "vitest";
import { createDynamicHandlerLoader } from "./serialization.js";
import { createSyncedRegistry } from "./factory.js";

describe("createDynamicHandlerLoader", () => {
  it("refuses URLs and paths, also when the allowlist would match them", async () => {
    const loader = createDynamicHandlerLoader(["*"]);
    for (const module of [
      "node:child_process",
      "data:text/javascript,export const run = 1",
      "file:///tmp/x.js",
      "C:\\temp\\x.js",
      "./local.js",
      "/abs/x.js",
      "\\\\share\\x.js",
    ]) {
      expect(await loader.load({ module, export: "execSync" })).toBeUndefined();
    }
  });

  it("imports only the listed modules", async () => {
    const loader = createDynamicHandlerLoader(["zod"]);
    expect(await loader.load({ module: "zod", export: "z" })).toBeDefined();
    expect(await loader.load({ module: "vitest", export: "describe" })).toBeUndefined();
  });

  it("matches a prefix that ends with *", async () => {
    const loader = createDynamicHandlerLoader(["zo*"]);
    expect(await loader.load({ module: "zod", export: "z" })).toBeDefined();
  });

  it("is not the default of a synced registry", () => {
    const registry = createSyncedRegistry({ type: "memory" });
    expect(registry.getHandlerLoader()).toBeUndefined();
  });
});
