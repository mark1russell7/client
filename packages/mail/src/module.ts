/**
 * The procedures of @procedures/mail as data. Importing this file registers nothing.
 */

import { definePackage, type ProcedureModule, type PackageDefinition } from "@procedures/client";
import { mailProcedures } from "./procedures.js";

const mailPackage: PackageDefinition = definePackage("@procedures/mail", mailProcedures);

export const mailModule: ProcedureModule = mailPackage.module;

export default mailModule;

/**
 * This function registers the procedures of @procedures/mail in a registry. The default is the
 * global registry.
 */
export const registerMailProcedures: PackageDefinition["register"] = mailPackage.register;
