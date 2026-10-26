/**
 * The procedures of @procedures/privacy-scan as data. Importing this file registers nothing.
 */

import { definePackage, type ProcedureModule, type PackageDefinition } from "@procedures/client";
import { privacyScanProcedures } from "./procedures.js";

const privacyScanPackage: PackageDefinition = definePackage("@procedures/privacy-scan", privacyScanProcedures);

export const privacyScanModule: ProcedureModule = privacyScanPackage.module;

export default privacyScanModule;

/**
 * This function registers the procedures of @procedures/privacy-scan in a registry. The default is the
 * global registry.
 */
export const registerPrivacyScanProcedures: PackageDefinition["register"] = privacyScanPackage.register;
