/**
 * program.compile procedure
 *
 * This procedure compiles a program to a JavaScript function. It checks the program first. Then
 * it writes the text of an ES module.
 */

import { PROCEDURE_REGISTRY, type ProcedureContext } from "@procedures/client/browser";
import { compileProgram } from "../../program.js";
import { toCapability, type ProgramCompileInput, type ProgramCompileOutput } from "../../types.js";
import { effectsOutput } from "./effects-output.js";

/**
 * This function compiles a program against the registry and the expose rule of the host. The
 * output has the source text, not the closure code: a closure does not go through JSON.
 */
export async function programCompile(input: ProgramCompileInput, ctx?: ProcedureContext): Promise<ProgramCompileOutput> {
  const result = await compileProgram(input.program, {
    registry: ctx?.registry ?? PROCEDURE_REGISTRY,
    expose: ctx?.expose,
    capability: input.capability ? toCapability(input.capability) : ctx?.capability,
    mode: input.mode,
    fold: input.fold,
    language: input.language,
  });
  return {
    ok: result.ok,
    effects: effectsOutput(result.effects),
    mustEffects: result.mustEffects,
    diagnostics: result.diagnostics,
    registryHash: result.registryHash,
    code: result.code,
    sourceMap: result.sourceMap,
    folded: [...result.folded],
  };
}
