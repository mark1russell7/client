/**
 * The procedures of @procedures/exif as data. Importing this file registers nothing.
 */

import { definePackage, type ProcedureModule, type PackageDefinition } from "@procedures/client";
import { exifProcedures } from "./procedures.js";

const exifPackage: PackageDefinition = definePackage("@procedures/exif", exifProcedures);

export const exifModule: ProcedureModule = exifPackage.module;

export default exifModule;

/**
 * This function registers the procedures of @procedures/exif in a registry. The default is the
 * global registry.
 */
export const registerExifProcedures: PackageDefinition["register"] = exifPackage.register;
