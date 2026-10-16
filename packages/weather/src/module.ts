/**
 * The procedures of @procedures/weather as data. Importing this file registers nothing.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { weatherProcedures } from "./procedures.js";

export const weatherModule: ProcedureModule = defineModule("@procedures/weather", weatherProcedures);

export default weatherModule;

/**
 * This function registers the procedures of @procedures/weather in a registry. The default is the
 * global registry.
 */
export function registerWeatherProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [weatherModule]);
}
