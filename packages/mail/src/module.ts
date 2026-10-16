/**
 * The procedures of @procedures/mail as data. Importing this file registers nothing.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { mailProcedures } from "./procedures.js";

export const mailModule: ProcedureModule = defineModule("@procedures/mail", mailProcedures);

export default mailModule;

/**
 * This function registers the procedures of @procedures/mail in a registry. The default is the
 * global registry.
 */
export function registerMailProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [mailModule]);
}
