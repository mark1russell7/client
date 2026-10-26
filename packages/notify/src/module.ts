/**
 * The procedures of @procedures/notify as data. Importing this file registers nothing.
 */

import { definePackage, type ProcedureModule, type PackageDefinition } from "@procedures/client";
import { notifyProcedures } from "./procedures.js";

const notifyPackage: PackageDefinition = definePackage("@procedures/notify", notifyProcedures);

export const notifyModule: ProcedureModule = notifyPackage.module;

export default notifyModule;

/**
 * This function registers the procedures of @procedures/notify in a registry. The default is the
 * global registry.
 */
export const registerNotifyProcedures: PackageDefinition["register"] = notifyPackage.register;
