import { describe, expect, it } from "vitest";
import { PROCEDURE_REGISTRY, ProcedureRegistry } from "@procedures/client";
import * as root from "./index.js";

const PATHS = [
  ["predicates", "orient2dSign"],
  ["predicates", "incircleSign"],
  ["predicates", "classifySegments"],
];

describe("registration", () => {
  it("registers nothing on an import of the root, and registers the procedures on an import of ./register", async () => {
    for (const path of PATHS) expect(PROCEDURE_REGISTRY.get(path)).toBeUndefined();
    const registry = new ProcedureRegistry();
    root.registerPredicatesProcedures(registry);
    for (const path of PATHS) expect(registry.get(path)).toBeDefined();
    await import("./register.js");
    for (const path of PATHS) expect(PROCEDURE_REGISTRY.get(path)).toBeDefined();
  });
});
