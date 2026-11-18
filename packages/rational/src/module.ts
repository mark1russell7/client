/**
 * The procedures of `@mark1russell7/rational` as data. An import of this file registers nothing.
 *
 * The manifest comes from the types of the home: `node scripts/wraps.ts generate` writes
 * `src/manifest.ts`. No procedure is written by hand, so no procedure can drift from its function.
 */

import * as rational from "@mark1russell7/rational";
import { registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { exportsModule } from "@procedures/compiler";
import { manifest } from "./manifest.js";

/** The manifest of the procedures: the names, the schemas, the effects and each exemption with its reason. */
export { manifest as rationalManifest };

/** The procedures `rational.*`: one for each function of the home with JSON inputs and a JSON output. */
export const rationalModule: ProcedureModule = exportsModule(manifest, rational, { name: "@procedures/rational" });

export default rationalModule;

/**
 * This function registers the procedures of `@procedures/rational` in a registry. The default is
 * the global registry.
 */
export function registerRationalProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [rationalModule]);
}
