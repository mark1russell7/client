import { describe, expect, it } from "vitest";
import { PROCEDURE_REGISTRY, ProcedureRegistry } from "@procedures/client";
import * as root from "./index.js";

describe("registration", () => {
  it("registers nothing on an import of the root, and registers pdf.render on an import of ./register", async () => {
    expect(PROCEDURE_REGISTRY.get(["pdf", "render"])).toBeUndefined();
    const registry = new ProcedureRegistry();
    root.registerPdfProcedures(registry);
    expect(registry.get(["pdf", "render"])).toBeDefined();
    await import("./register.js");
    expect(PROCEDURE_REGISTRY.get(["pdf", "render"])).toBeDefined();
  });
});
