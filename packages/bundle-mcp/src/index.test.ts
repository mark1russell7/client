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
    for (const key of ["lib.scan", "docker.ps", "mongo.documents.find", "vitest.run", "git.status", "fs.readdir", "dag.traverse", "sqlite.query", "db.query"]) {
      expect(PROCEDURE_REGISTRY.get(key.split("."))?.handler, key).toBeDefined();
    }
  });

  it("gives the lists of the tool surface", () => {
    expect(mcpNamespaces).toContain("lib");
    expect(mcpNamespaces).not.toContain("git");
    expect(mcpExclude).toContain("vitest.watch");
  });

  it("exposes the sqlite namespace, not the deprecated db aliases or dag", () => {
    expect(mcpNamespaces).toContain("sqlite");
    expect(mcpNamespaces).not.toContain("db");
    expect(mcpNamespaces).not.toContain("dag");
    expect(mcpExclude).toEqual(expect.arrayContaining(["sqlite.transaction", "sqlite.migrate", "sqlite.backup"]));
    expect(mcpExclude.filter((key) => key.startsWith("db."))).toEqual([]);
  });
});
