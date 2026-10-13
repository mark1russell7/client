/**
 * Module (no side effects): the procedures of client-store as data, for `createRegistry()`.
 *
 * The procedures of the store: `procedure.register` and the program store procedures
 * `procedure.store`, `load`, `sync` and `remote`. The core registered the older versions of them
 * before they moved here (roadmap 3.2).
 */

import { defineModule, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import { procedureStorageProcedures } from "./procedures.js";

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const storeModule: ProcedureModule = defineModule("@procedures/store", procedureStorageProcedures);

export default storeModule;

/**
 * This function registers the procedures of @procedures/store, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerStoreProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [storeModule], { override: true });
}

/** @deprecated Use `registerStoreProcedures`. The old name stays for one version. */
export const register: (registry?: ProcedureRegistry) => void = registerStoreProcedures;
