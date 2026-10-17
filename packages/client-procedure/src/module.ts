/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for procedure operations
 *
 * This is the canonical home for procedure.* procedures.
 * client-cli no longer registers these to avoid duplicates.
 */

import { createProcedure, zodAdapter, defineModule, type AnyProcedure, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import { procedureNew } from "./procedures/procedure/index.js";
import { procedureRegistryProcedures } from "./procedures/procedure/registry.js";
import {
  ProcedureNewInputSchema,
  type ProcedureNewInput,
  type ProcedureNewOutput,
  ProcedureNewOutputSchema,
} from "./types.js";
import type { ProcedureContext } from "@procedures/client";

// procedure.new procedure
const procedureNewProcedure = createProcedure()
  .path(["procedure", "new"])
  .input(zodAdapter<ProcedureNewInput>(ProcedureNewInputSchema))
  .output(zodAdapter<ProcedureNewOutput>(ProcedureNewOutputSchema))
  .meta({
    description: "Scaffold a new procedure with types and registration boilerplate",
    calls: ["fs.exists", "fs.read", "fs.write", "fs.mkdir"],
    // It refuses a name that collides, makes new files and adds lines to the existing files
    effects: { reads: ["fs", "registry"], writes: ["fs"], destructive: false },
    // Under a root of the files (roadmap R33): the project folder must be in the root, and without
    // it the project is the root. The files go through fs.*, so the root confines them too.
    fsRoot: { cwd: "path" },
    args: ["name"],
    shorts: { namespace: "n", description: "d", path: "p", dryRun: "D" },
    output: "text",
  })
  .handler(async (input: ProcedureNewInput, ctx: ProcedureContext): Promise<ProcedureNewOutput> => {
    return procedureNew(input, ctx);
  })
  .build();

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 * `procedure.new` calls `fs.*`: the host gives them (this package does not depend on client-fs).
 */
export const procedureModule: ProcedureModule = defineModule("@procedures/procedure", [
  // procedure.new
  procedureNewProcedure as AnyProcedure,
  // procedure.export (from registry.ts)
  ...procedureRegistryProcedures,
]);

export default procedureModule;

/**
 * This function registers the procedures of @procedures/procedure, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerProcedureProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [procedureModule], { override: true });
}
