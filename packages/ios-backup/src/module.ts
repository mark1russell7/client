/**
 * The procedures of @procedures/ios-backup as data. Importing this file registers nothing.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { iosBackupProcedures } from "./procedures.js";

export const iosBackupModule: ProcedureModule = defineModule("@procedures/ios-backup", iosBackupProcedures);

export default iosBackupModule;

/**
 * This function registers the procedures of @procedures/ios-backup in a registry. The default is the
 * global registry.
 */
export function registerIosBackupProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [iosBackupModule]);
}
