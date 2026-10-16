/**
 * The procedures of @procedures/restic as data. Importing this file registers nothing.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { createResticProcedures, resticProcedures, type ResticProceduresOptions } from "./procedures.js";

export const resticModule: ProcedureModule = defineModule("@procedures/restic", resticProcedures);

export default resticModule;

/**
 * This function gives the module with the settings of the host, for example the secrets of the
 * repository in `env`. Without options, it gives `resticModule`.
 *
 * @example
 * ```ts
 * const registry = createRegistry(createResticModule({ env: { RESTIC_REPOSITORY: repository, RESTIC_PASSWORD: password } }));
 * ```
 */
export function createResticModule(options: ResticProceduresOptions = {}): ProcedureModule {
  if (Object.values(options).every((value) => value === undefined)) return resticModule;
  return defineModule("@procedures/restic", createResticProcedures(options));
}

/**
 * This function registers the procedures of @procedures/restic in a registry. The default is the
 * global registry. The options are the options of `createResticModule()`.
 */
export function registerResticProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY, options: ResticProceduresOptions = {}): void {
  registerModules(registry, [createResticModule(options)]);
}
