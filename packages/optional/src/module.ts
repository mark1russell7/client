/**
 * The procedures of `@mark1russell7/optional` as data. An import of this file registers nothing.
 *
 * The manifest comes from the types of the home: `node scripts/wraps.ts generate` writes
 * `src/manifest.ts`. No procedure is written by hand, so no procedure can drift from its function.
 */

import * as optional from "@mark1russell7/optional";
import { registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { exportsModule } from "@procedures/compiler";
import { manifest } from "./manifest.js";

/** The manifest of the procedures: the names, the schemas, the effects and each exemption with its reason. */
export { manifest as optionalManifest };

/** The procedures `optional.*`: one for each function of the home with JSON inputs and a JSON output. */
export const optionalModule: ProcedureModule = exportsModule(manifest, optional, { name: "@procedures/optional" });

export default optionalModule;

/**
 * This function registers the procedures of `@procedures/optional` in a registry. The default is
 * the global registry.
 */
export function registerOptionalProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [optionalModule]);
}
