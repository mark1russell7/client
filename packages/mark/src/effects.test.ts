/**
 * Each procedure of the ecosystem declares its effects, and each declaration includes the
 * effects of the procedures that it calls (CAPABILITIES-2026-10, phase D). A host with a
 * restriction refuses a procedure without a declaration, so a new procedure without one is a
 * procedure that a read-only session cannot start: this test makes it visible.
 */

import { describe, it, expect } from "vitest";
import { checkEffects, effectsOf, pathToKey } from "@procedures/client";
import { loadEcosystemRegistry } from "./ecosystem.js";

describe("the effects of the ecosystem", () => {
  it("declares the effects of each procedure", async () => {
    const { registry, loaded } = await loadEcosystemRegistry(false, false);
    expect(loaded.length).toBeGreaterThan(15);
    const undeclared = registry
      .getAll()
      .filter((procedure) => effectsOf(procedure) === undefined)
      .map((procedure) => pathToKey(procedure.path))
      .sort();
    expect(undeclared).toEqual([]);
  });

  it("finds no declaration that leaves out the effects of a procedure that it calls", async () => {
    const { registry } = await loadEcosystemRegistry(false, false);
    expect(checkEffects(registry.getAll()).map((violation) => violation.message)).toEqual([]);
  });
});
