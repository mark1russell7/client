/**
 * The manifest that the procedures `sdk.openrpc` and `sdk.typescript` read.
 */

import { describeRegistry, PROCEDURE_REGISTRY, type AnyProcedure, type ProcedureContext, type ProcedureManifest } from "@procedures/client/browser";
import type { SdkInput } from "../../types.js";

/**
 * This function describes the registry of the caller, as `procedure.manifest` does. The manifest
 * has only the procedures that the host exposes, and only one namespace when the input names it.
 */
export function manifestOf(input: SdkInput, ctx?: ProcedureContext): ProcedureManifest {
  return describeRegistry(ctx?.registry ?? PROCEDURE_REGISTRY, {
    ...(ctx?.expose ? { expose: ctx.expose } : {}),
    ...(input.namespace ? { include: (procedure: AnyProcedure) => procedure.path[0] === input.namespace } : {}),
  });
}
