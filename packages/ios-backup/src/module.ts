/**
 * The procedures of @procedures/ios-backup as data. Importing this file registers nothing.
 */

import { definePackage, type ProcedureModule, type PackageDefinition } from "@procedures/client";
import { iosBackupProcedures } from "./procedures.js";

const iosBackupPackage: PackageDefinition = definePackage("@procedures/ios-backup", iosBackupProcedures);

export const iosBackupModule: ProcedureModule = iosBackupPackage.module;

export default iosBackupModule;

/**
 * This function registers the procedures of @procedures/ios-backup in a registry. The default is the
 * global registry.
 */
export const registerIosBackupProcedures: PackageDefinition["register"] = iosBackupPackage.register;
