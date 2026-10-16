/**
 * The procedures of @procedures/privacy-scan as data. Importing this file registers nothing.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { privacyScanProcedures } from "./procedures.js";

export const privacyScanModule: ProcedureModule = defineModule("@procedures/privacy-scan", privacyScanProcedures);

export default privacyScanModule;

/**
 * This function registers the procedures of @procedures/privacy-scan in a registry. The default is the
 * global registry.
 */
export function registerPrivacyScanProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [privacyScanModule]);
}
