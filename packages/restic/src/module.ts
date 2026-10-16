/**
 * The procedures of @procedures/restic as data. Importing this file registers nothing.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { resticProcedures } from "./procedures.js";

export const resticModule: ProcedureModule = defineModule("@procedures/restic", resticProcedures);

export default resticModule;

/**
 * This function registers the procedures of @procedures/restic in a registry. The default is the
 * global registry.
 */
export function registerResticProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [resticModule]);
}
