/**
 * The procedures of @procedures/notify as data. Importing this file registers nothing.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { notifyProcedures } from "./procedures.js";

export const notifyModule: ProcedureModule = defineModule("@procedures/notify", notifyProcedures);

export default notifyModule;

/**
 * This function registers the procedures of @procedures/notify in a registry. The default is the
 * global registry.
 */
export function registerNotifyProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [notifyModule]);
}
