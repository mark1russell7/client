/**
 * program.check procedure
 *
 * Check a program before it runs: the names, the procedures, the inputs, the capability and the
 * effects. No call of the program starts.
 */

import { PROCEDURE_REGISTRY, type ProcedureContext } from "@procedures/client/browser";
import { checkProgram } from "../../program.js";
import { toCapability, type ProgramCheckInput, type ProgramCheckOutput } from "../../types.js";
import { effectsOutput } from "./effects-output.js";

/**
 * This function checks a program against the registry and the expose rule of the host. The
 * capability is the capability of the input, or the capability of the caller.
 */
export async function programCheck(input: ProgramCheckInput, ctx?: ProcedureContext): Promise<ProgramCheckOutput> {
  const result = checkProgram(input.program, {
    registry: ctx?.registry ?? PROCEDURE_REGISTRY,
    expose: ctx?.expose,
    capability: input.capability ? toCapability(input.capability) : ctx?.capability,
    mode: input.mode,
  });
  return {
    ok: result.ok,
    effects: effectsOutput(result.effects),
    mustEffects: result.mustEffects,
    diagnostics: result.diagnostics,
    registryHash: result.registryHash,
  };
}
