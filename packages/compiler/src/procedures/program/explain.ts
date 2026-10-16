/**
 * program.explain procedure
 *
 * This procedure explains a program before it starts: the effects, each call with its declared
 * effects and the answer of the capability, and the diagnostics. No call of the program starts.
 */

import { PROCEDURE_REGISTRY, type ProcedureContext } from "@procedures/client/browser";
import { explainProgram } from "../../explain.js";
import { toCapability, type CallExplanationOutput, type ProgramExplainInput, type ProgramExplainOutput } from "../../types.js";
import { effectsOutput } from "./effects-output.js";

/**
 * This function explains a program against the registry and the expose rule of the host. The
 * capability is the capability of the input, or the capability of the caller.
 */
export async function programExplain(input: ProgramExplainInput, ctx?: ProcedureContext): Promise<ProgramExplainOutput> {
  const result = explainProgram(input.program, {
    registry: ctx?.registry ?? PROCEDURE_REGISTRY,
    expose: ctx?.expose,
    capability: input.capability ? toCapability(input.capability) : ctx?.capability,
    mode: input.mode,
  });
  return {
    ok: result.ok,
    effects: effectsOutput(result.effects),
    mustEffects: result.mustEffects,
    calls: result.calls.map(
      (call): CallExplanationOutput => ({
        key: call.key,
        path: [...call.path],
        pointer: call.pointer,
        kind: call.kind,
        ...(call.effects ? { effects: effectsOutput(call.effects) } : {}),
        known: call.known,
        exposed: call.exposed,
        permitted: call.permitted,
        ...(call.reason !== undefined ? { reason: call.reason } : {}),
        message: call.message,
      }),
    ),
    diagnostics: result.diagnostics,
    registryHash: result.registryHash,
    summary: result.summary,
  };
}
