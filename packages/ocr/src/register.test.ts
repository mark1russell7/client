import { describe, expect, it } from "vitest";
import { PROCEDURE_REGISTRY, ProcedureRegistry } from "@procedures/client";
import * as root from "./index.js";

describe("registration", () => {
  it("registers nothing on an import of the root, and registers the procedures on an import of ./register", async () => {
    expect(PROCEDURE_REGISTRY.get(["ocr", "page"])).toBeUndefined();
    const registry = new ProcedureRegistry();
    root.registerOcrProcedures(registry);
    expect(registry.get(["ocr", "page"])).toBeDefined();
    expect(registry.get(["ocr", "image"])).toBeDefined();
    expect(registry.get(["ocr", "pageCount"])).toBeDefined();
    await import("./register.js");
    expect(PROCEDURE_REGISTRY.get(["ocr", "page"])).toBeDefined();
    expect(PROCEDURE_REGISTRY.get(["ocr", "image"])).toBeDefined();
  });
});
