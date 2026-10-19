/**
 * The split of the procedure data: each page loads the procedures without their schemas, and
 * the page of a procedure loads the schemas of its package.
 */

import { describe, it, expect } from "vitest";
import { procedures } from "./index";
import { loadProcedure } from "./schemas";

describe("the procedure schemas", () => {
  it("are not in the data of each page", () => {
    expect(procedures.length).toBeGreaterThan(0);
    for (const procedure of procedures) {
      expect(Object.keys(procedure), procedure.key).not.toContain("input");
      expect(Object.keys(procedure), procedure.key).not.toContain("output");
    }
  });

  it("load for each procedure from the module of its package", async () => {
    for (const procedure of procedures) {
      const loaded = await loadProcedure(procedure.key);
      expect(loaded?.key, procedure.key).toBe(procedure.key);
      expect(loaded?.package, procedure.key).toBe(procedure.package);
      expect(typeof loaded?.input, procedure.key).toBe("object");
      expect(typeof loaded?.output, procedure.key).toBe("object");
    }
  });

  it("give undefined for a key that no procedure has", async () => {
    expect(await loadProcedure("no.such.procedure")).toBeUndefined();
  });
});
