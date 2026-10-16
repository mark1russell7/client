/**
 * Procedure Registration Helpers
 *
 * These helpers add procedures to the global registry.
 *
 * A package with procedures declares `"client": { "procedures": "./dist/register.js" }` in its
 * `package.json`. Its `src/register.ts` registers its module. `mark` finds the packages by the
 * `client.procedures` field, and an app imports the `/register` entry of each package that it uses.
 */

import { PROCEDURE_REGISTRY } from "./registry.js";
import type { AnyProcedure, ProcedureModule } from "./types.js";

// =============================================================================
// Manual Registration Helpers
// =============================================================================

/**
 * Register procedures from a module.
 * Use this for explicit registration when auto-discovery isn't suitable.
 *
 * @param module - Module with procedures array
 *
 * @example
 * ```typescript
 * // In repo-b/src/register.ts
 * import { registerModule } from 'client/procedures';
 * import { weatherModule } from './procedures';
 *
 * registerModule(weatherModule);
 * ```
 */
export function registerModule(module: ProcedureModule): void {
  PROCEDURE_REGISTRY.registerModule(module);
}

/**
 * Register an array of procedures.
 *
 * @param procedures - Procedures to register
 */
export function registerProcedures(procedures: AnyProcedure[]): void {
  PROCEDURE_REGISTRY.registerAll(procedures);
}

/**
 * Create a self-registering module.
 * Returns the module and registers it immediately.
 *
 * @param name - Module name
 * @param procedures - Procedures in the module
 * @returns The registered module
 *
 * @example
 * ```typescript
 * // In repo-b/src/register.ts
 * import { createAndRegister } from 'client/procedures';
 * import { forecastProcedure, currentWeatherProcedure } from './procedures';
 *
 * // Registers immediately when this file is imported
 * export const weatherModule = createAndRegister('weather', [
 *   forecastProcedure,
 *   currentWeatherProcedure,
 * ]);
 * ```
 */
export function createAndRegister(
  name: string,
  procedures: AnyProcedure[]
): ProcedureModule {
  const module: ProcedureModule = { name, procedures };
  PROCEDURE_REGISTRY.registerModule(module);
  return module;
}
