/**
 * The procedures of @procedures/better-auth as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/better-auth
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";

export const betterAuthModule: ProcedureModule = defineModule("@procedures/better-auth", []);

export default betterAuthModule;

/**
 * This function registers the procedures of @procedures/better-auth in a registry. The default is the
 * global registry.
 */
export function registerBetterAuthProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [betterAuthModule]);
}
