/**
 * The procedures of @procedures/access as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/access
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";

export const accessModule: ProcedureModule = defineModule("@procedures/access", []);

export default accessModule;

/**
 * This function registers the procedures of @procedures/access in a registry. The default is the
 * global registry.
 */
export function registerAccessProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [accessModule]);
}
