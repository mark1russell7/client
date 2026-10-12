/**
 * mcp.serve exposes only a tool surface (architecture review 3.2). Before, it exposed every
 * procedure of the registry, shell.exec too.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareServe } from "./serve.js";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("mcp.serve tool surface", () => {
  it("exposes the given namespaces, less the excluded keys", async () => {
    const { expose, warning } = await prepareServe({ namespaces: ["docker", "lib"], exclude: ["lib.new"] });
    expect(warning).toBeUndefined();
    expect(expose(["docker", "ps"])).toBe(true);
    expect(expose(["lib", "scan"])).toBe(true);
    expect(expose(["lib", "new"])).toBe(false);
    expect(expose(["shell", "exec"])).toBe(false);
  });

  it("exposes nothing, with a warning, when no bundle can be loaded and no namespaces are given", async () => {
    const empty = mkdtempSync(join(tmpdir(), "mcp-serve-"));
    try {
      const { expose, warning } = await prepareServe({}, empty);
      expect(expose(["shell", "exec"])).toBe(false);
      expect(expose(["client", "chain"])).toBe(false);
      expect(warning).toContain("cannot be loaded");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("takes the surface of the bundles of a project", async () => {
    // impl-mcp-dev depends on bundle-mcp, so the bundle resolves from its folder
    const { expose, warning } = await prepareServe({}, join(packageDir, "..", "impl-mcp-dev"));
    expect(warning).toBeUndefined();
    expect(expose(["docker", "ps"])).toBe(true);
    expect(expose(["vitest", "watch"])).toBe(false);
    expect(expose(["shell", "exec"])).toBe(false);
  }, 60_000);
});
