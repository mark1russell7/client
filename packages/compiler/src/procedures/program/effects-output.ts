/**
 * The effects of a program in the JSON output of the procedures.
 */

import type { Effects } from "@procedures/client/browser";
import type { EffectsOutput } from "../../types.js";

/** This function copies the effects into mutable lists for the output schema. */
export function effectsOutput(effects: Effects): EffectsOutput {
  return {
    ...(effects.reads ? { reads: [...effects.reads] } : {}),
    ...(effects.writes ? { writes: [...effects.writes] } : {}),
    ...(effects.destructive !== undefined ? { destructive: effects.destructive } : {}),
    ...(effects.idempotent !== undefined ? { idempotent: effects.idempotent } : {}),
  };
}
