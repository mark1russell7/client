/**
 * The procedures of @procedures/ics as data. Importing this file registers nothing.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client/browser";
import { createIcsProcedures, icsProcedures, type IcsProceduresOptions } from "./procedures.js";

export const icsModule: ProcedureModule = defineModule("@procedures/ics", icsProcedures);

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
export function registerIcsProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [icsModule]);
}
