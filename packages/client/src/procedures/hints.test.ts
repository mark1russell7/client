/**
 * The override of the tool hints (CLI-10). The declared effects give the hints. An override can
 * only make a tool look more dangerous: `readOnlyHint: false`, `idempotentHint: false`,
 * `destructiveHint: true`, `openWorldHint: true`. The registry refuses each other value at
 * registration, also when the effects give the same value.
 */

import { describe, it, expect } from "vitest";
import { ProcedureRegistry, RegistryError } from "./registry.js";
import { defineProcedure } from "./define.js";
import { outputSchema } from "./core/schemas.js";
import { createRegistry, defineModule } from "./module.js";
import { toolHints } from "./capability.js";
import { toolHintOverrideRefusal, toolHintsOf } from "./hints.js";
import type { AnyProcedure } from "./types.js";

const any = outputSchema<unknown>();

function procedure(path: string[], metadata: Record<string, unknown>): AnyProcedure {
  return defineProcedure({ path, input: any, output: any, metadata, handler: () => "ok" }) as AnyProcedure;
}

const READ = { reads: ["store"], writes: [] };
const WRITE_IDEMPOTENT = { reads: [], writes: ["store"], idempotent: true, destructive: false };

describe("the override of the tool hints", () => {
  it("makes a tool look more dangerous than its effects", () => {
    const read = procedure(["h", "read"], { effects: READ, toolHints: { openWorldHint: true, readOnlyHint: false } });
    expect(toolHints(read)).toEqual({ readOnlyHint: true, openWorldHint: false });
    expect(toolHintsOf(read)).toEqual({ readOnlyHint: false, openWorldHint: true });
    const write = procedure(["h", "write"], { effects: WRITE_IDEMPOTENT, toolHints: { destructiveHint: true, idempotentHint: false } });
    expect(toolHintsOf(write)).toEqual({ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false });
    // A procedure without effects gets the cautious hints of its override
    expect(toolHintsOf(procedure(["h", "plain"], { toolHints: { openWorldHint: true } }))).toEqual({ openWorldHint: true });
    const registry = new ProcedureRegistry();
    registry.register(read);
    registry.register(write);
    expect(registry.has(["h", "read"])).toBe(true);
  });

  it("refuses each value that is not cautious at registration, also when the effects give it", () => {
    const cases: Array<[Record<string, unknown>, Record<string, unknown>]> = [
      [{ readOnlyHint: true }, READ],
      [{ readOnlyHint: true }, WRITE_IDEMPOTENT],
      [{ idempotentHint: true }, WRITE_IDEMPOTENT],
      [{ destructiveHint: false }, WRITE_IDEMPOTENT],
      [{ openWorldHint: false }, READ],
      [{ openWorldHint: false }, {}],
    ];
    for (const [toolHintsValue, effects] of cases) {
      const refused = procedure(["h", "refused"], { effects, toolHints: toolHintsValue });
      const registry = new ProcedureRegistry();
      expect(() => registry.register(refused)).toThrow(RegistryError);
      expect(() => registry.register(refused)).toThrow(/can only be (true|false): an override can only make a tool look more dangerous/);
      expect(registry.has(["h", "refused"])).toBe(false);
      // A value that slips past the registry has no effect on the hints
      expect(toolHintsOf(refused)).toEqual(toolHints(refused));
    }
  });

  it("refuses an unknown hint and an override that is not an object", () => {
    expect(toolHintOverrideRefusal(procedure(["h", "u"], { toolHints: { titleHint: true } }))).toContain('unknown hint "titleHint"');
    expect(toolHintOverrideRefusal(procedure(["h", "n"], { toolHints: true }))).toBe("metadata.toolHints must be an object of hints");
    expect(toolHintOverrideRefusal(procedure(["h", "a"], { toolHints: [] }))).toBe("metadata.toolHints must be an object of hints");
    expect(toolHintOverrideRefusal(procedure(["h", "none"], {}))).toBeUndefined();
  });

  it("refuses the override in a module too", () => {
    const module = defineModule("hints-test", [procedure(["h", "bad"], { effects: READ, toolHints: { readOnlyHint: true } })]);
    expect(() => createRegistry(module)).toThrow(/metadata.toolHints.readOnlyHint can only be false/);
  });
});
