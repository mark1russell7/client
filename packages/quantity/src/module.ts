/**
 * The procedures of `@mark1russell7/quantity` as data. An import of this file registers nothing.
 *
 * The manifest comes from the types of the home: `node scripts/wraps.ts generate` writes
 * `src/manifest.ts`. No procedure is written by hand, so no procedure can drift from its function.
 */

import * as quantity from "@mark1russell7/quantity";
import { registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { exportsModule } from "@procedures/compiler";
import { manifest } from "./manifest.js";

/** The manifest of the procedures: the names, the schemas, the effects and each exemption with its reason. */
export { manifest as quantityManifest };

/** The procedures `quantity.*`: one for each function of the home with JSON inputs and a JSON output. */
export const quantityModule: ProcedureModule = exportsModule(manifest, quantity, { name: "@procedures/quantity" });

export default quantityModule;

/**
 * This function registers the procedures of `@procedures/quantity` in a registry. The default is
 * the global registry.
 */
export function registerQuantityProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [quantityModule]);
}
