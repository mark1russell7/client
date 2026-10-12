/**
 * Procedure Registration for procedure operations
 *
 * This is the canonical home for procedure.* procedures.
 * client-cli no longer registers these to avoid duplicates.
 */

import { createProcedure, PROCEDURE_REGISTRY, zodAdapter, outputSchema } from "@mark1russell7/client";
import { procedureNew } from "./procedures/procedure/index.js";
import { procedureRegistryProcedures } from "./procedures/procedure/registry.js";
import {
  ProcedureNewInputSchema,
  type ProcedureNewInput,
  type ProcedureNewOutput,
} from "./types.js";
import type { ProcedureContext } from "@mark1russell7/client";

// procedure.new procedure
const procedureNewProcedure = createProcedure()
  .path(["procedure", "new"])
  .input(zodAdapter<ProcedureNewInput>(ProcedureNewInputSchema))
  .output(outputSchema<ProcedureNewOutput>())
  .meta({
    description: "Scaffold a new procedure with types and registration boilerplate",
    calls: ["fs.exists", "fs.read", "fs.write", "fs.mkdir"],
    args: ["name"],
    shorts: { namespace: "n", description: "d", path: "p", dryRun: "D" },
    output: "text",
  })
  .handler(async (input: ProcedureNewInput, ctx: ProcedureContext): Promise<ProcedureNewOutput> => {
    return procedureNew(input, ctx);
  })
  .build();

export function registerProcedureProcedures(): void {
  // Override makes the registration idempotent. procedure.list and procedure.get are the core
  // ones: this package does not replace them (docs review DOC-6).
  PROCEDURE_REGISTRY.registerAll(
    [
      // procedure.new
      procedureNewProcedure,
      // procedure.export (from registry.ts)
      ...procedureRegistryProcedures,
    ],
    { override: true }
  );
}

// Auto-register
registerProcedureProcedures();
