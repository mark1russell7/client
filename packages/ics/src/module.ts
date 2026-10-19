/**
 * The procedures of @procedures/ics as data. Importing this file registers nothing.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client/browser";
import { icsProcedures } from "./procedures.js";

export const icsModule: ProcedureModule = defineModule("@procedures/ics", icsProcedures);

export default icsModule;

/**
 * This function registers the procedures of @procedures/ics in a registry. The default is the
 * global registry.
 */
export function registerIcsProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [icsModule]);
}
