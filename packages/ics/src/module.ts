/**
 * The procedures of @procedures/ics as data. Importing this file registers nothing.
 */

import { defineModule, definePackage, type ProcedureModule, type PackageDefinition } from "@procedures/client/browser";
import { createIcsProcedures, icsProcedures, type IcsProceduresOptions } from "./procedures.js";

const icsPackage: PackageDefinition = definePackage("@procedures/ics", icsProcedures);

export const icsModule: ProcedureModule = icsPackage.module;

export default icsModule;

/**
 * This function gives the module with the settings of the host: the `fetch` of `ics.fetch`.
 * Without options, it gives `icsModule`. A Node host that takes calls from others gives
 * `createHostFetch()` of `@procedures/http`, so the host policy examines each feed address.
 *
 * ```ts
 * createRegistry(createIcsModule({ fetch: createHostFetch() }));
 * ```
 */
export function createIcsModule(options: IcsProceduresOptions = {}): ProcedureModule {
  if (options.fetch === undefined) return icsModule;
  return defineModule("@procedures/ics", createIcsProcedures(options));
}

/**
 * This function registers the procedures of @procedures/ics in a registry. The default is the
 * global registry.
 */
export const registerIcsProcedures: PackageDefinition["register"] = icsPackage.register;
