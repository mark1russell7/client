/**
 * The procedures of @procedures/geo as data. Importing this file registers nothing.
 *
 * The module has two parts. The hand-written procedures call the network (`geo.geocode`,
 * `geo.route`) or keep an older form (`geo.distance`, `geo.geohash`). The generated procedures
 * come from the types of `@mark1russell7/geo`: `node scripts/wraps.ts generate` writes
 * `src/manifest.ts`, so no generated procedure can drift from its function.
 */

import * as geo from "@mark1russell7/geo";
import { defineModule, definePackage, type AnyProcedure, type ProcedureModule, type PackageDefinition } from "@procedures/client/browser";
import { exportsModule } from "@procedures/compiler";
import { manifest } from "./manifest.js";
import { createGeoProcedures, geoProcedures, type GeoProceduresOptions } from "./procedures.js";

/** The manifest of the generated procedures: the names, the schemas, the effects and each exemption with its reason. */
export { manifest as geoManifest };

/** The generated procedures `geo.*`: one for each function of the home with JSON inputs and a JSON output. */
export const geoHomeProcedures: readonly AnyProcedure[] = exportsModule(manifest, geo, { name: "@procedures/geo" }).procedures;

const geoPackage: PackageDefinition = definePackage("@procedures/geo", [...geoProcedures, ...geoHomeProcedures]);

export const geoModule: ProcedureModule = geoPackage.module;

export default geoModule;

/**
 * This function gives the module with the settings of the host: the `fetch` of `geo.geocode` and
 * `geo.route`. Without options, it gives `geoModule`. A Node host that takes calls from others
 * gives `createHostFetch()` of `@procedures/http`, so the host policy examines each `baseUrl`.
 *
 * ```ts
 * createRegistry(createGeoModule({ fetch: createHostFetch() }));
 * ```
 */
export function createGeoModule(options: GeoProceduresOptions = {}): ProcedureModule {
  if (options.fetch === undefined) return geoModule;
  return defineModule("@procedures/geo", [...createGeoProcedures(options), ...geoHomeProcedures]);
}

/**
 * This function registers the procedures of @procedures/geo in a registry. The default is the
 * global registry.
 */
export const registerGeoProcedures: PackageDefinition["register"] = geoPackage.register;
