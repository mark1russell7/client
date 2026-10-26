/**
 * The procedures of @procedures/geo as data. Importing this file registers nothing.
 */

import { defineModule, definePackage, type ProcedureModule, type PackageDefinition } from "@procedures/client/browser";
import { createGeoProcedures, geoProcedures, type GeoProceduresOptions } from "./procedures.js";

const geoPackage: PackageDefinition = definePackage("@procedures/geo", geoProcedures);

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
  return defineModule("@procedures/geo", createGeoProcedures(options));
}

/**
 * This function registers the procedures of @procedures/geo in a registry. The default is the
 * global registry.
 */
export const registerGeoProcedures: PackageDefinition["register"] = geoPackage.register;
