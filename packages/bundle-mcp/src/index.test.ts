/**
 * The root of bundle-mcp gives the lists of the tool surface (docs review DOC-6: before, the root
 * was `export {}`). Its register entry registers the procedures of the bundle. The root registers
 * nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { describe, it, expect } from "vitest";
import { PROCEDURE_REGISTRY } from "@procedures/client";
import { mcpNamespaces, mcpExclude } from "./index.js";
import "./register.js";

describe("bundle-mcp", () => {
  it("registers the procedures of the bundle from its register entry", () => {
    for (const key of ["lib.scan", "docker.ps", "mongo.documents.find", "vitest.run", "git.status", "fs.readdir"]) {
      expect(PROCEDURE_REGISTRY.get(key.split("."))?.handler, key).toBeDefined();
    }
  });

  it("gives the lists of the tool surface", () => {
    expect(mcpNamespaces).toContain("lib");
    expect(mcpNamespaces).not.toContain("git");
    expect(mcpExclude).toContain("vitest.watch");
  });
});
