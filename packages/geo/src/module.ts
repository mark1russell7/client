/**
 * The procedures of @procedures/geo as data. Importing this file registers nothing.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { geoProcedures } from "./procedures.js";

export const geoModule: ProcedureModule = defineModule("@procedures/geo", geoProcedures);

export default geoModule;

/**
 * This function registers the procedures of @procedures/geo in a registry. The default is the
 * global registry.
 */
export function registerGeoProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [geoModule]);
}
