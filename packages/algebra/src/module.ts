/**
 * The procedures of `@mark1russell7/algebra` as data. An import of this file registers nothing.
 *
 * The manifest comes from the types of the home: `node scripts/wraps.ts generate` writes
 * `src/manifest.ts`. No procedure is written by hand, so no procedure can drift from its function.
 */

import * as algebra from "@mark1russell7/algebra";
import { registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { exportsModule } from "@procedures/compiler";
import { manifest } from "./manifest.js";

/** The manifest of the procedures: the names, the schemas, the effects and each exemption with its reason. */
export { manifest as algebraManifest };

/** The procedures `algebra.*`: one for each function of the home with JSON inputs and a JSON output. */
export const algebraModule: ProcedureModule = exportsModule(manifest, algebra, { name: "@procedures/algebra" });

export default algebraModule;

/**
 * This function registers the procedures of `@procedures/algebra` in a registry. The default is
 * the global registry.
 */
export function registerAlgebraProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [algebraModule]);
}
