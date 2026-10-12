/**
 * Importing the root of bundle-mcp registers its procedures and gives the lists of the tool
 * surface (docs review DOC-6: before, the root was `export {}` and registered nothing).
 */

import { describe, it, expect } from "vitest";
import { PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { mcpNamespaces, mcpExclude } from "./index.js";

describe("the root of bundle-mcp", () => {
  it("registers the procedures of the bundle", () => {
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
