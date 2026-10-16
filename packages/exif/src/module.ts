/**
 * The procedures of @procedures/exif as data. Importing this file registers nothing.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { exifProcedures } from "./procedures.js";

export const exifModule: ProcedureModule = defineModule("@procedures/exif", exifProcedures);

export default exifModule;

/**
 * This function registers the procedures of @procedures/exif in a registry. The default is the
 * global registry.
 */
export function registerExifProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [exifModule]);
}
