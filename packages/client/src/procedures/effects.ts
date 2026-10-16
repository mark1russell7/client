/**
 * Effect declarations for groups of procedures (CAPABILITIES-2026-10). This file imports only
 * types, so each file of procedures can use it without an import cycle.
 */

import type { AnyProcedure, Effects } from "./types.js";

/** The effects of a procedure that reads and changes nothing: its output comes from its input. */
export const PURE_EFFECTS: Effects = Object.freeze({ reads: Object.freeze([]), writes: Object.freeze([]) });

/** The effects of a procedure that reads the procedure registry and changes nothing. */
export const REGISTRY_READ_EFFECTS: Effects = Object.freeze({ reads: Object.freeze(["registry"]), writes: Object.freeze([]) });

/**
 * This function gives copies of the procedures with the effects in their metadata. A procedure
 * that declares its own effects keeps them.
 */
export function withEffects<T extends AnyProcedure>(effects: Effects, procedures: readonly T[]): T[] {
  return procedures.map((procedure) =>
    (procedure.metadata as { effects?: unknown } | undefined)?.effects !== undefined
      ? procedure
      : ({ ...procedure, metadata: { ...procedure.metadata, effects } } as T)
  );
}
