/**
 * Procedure Registration Helpers
 *
 * Manual registration helpers for procedures. For compile-time auto-discovery,
 * use the CLI: `npx client discover`
 *
 * Libraries that depend on client should:
 * 1. Add `"client": { "procedures": "./dist/register.js" }` to package.json
 * 2. Create a register.ts that uses createAndRegister()
 * 3. Consumers run `npx client discover` to generate imports
 */
import { PROCEDURE_REGISTRY } from "./registry.js";
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
export function registerModule(module) {
    PROCEDURE_REGISTRY.registerModule(module);
}
/**
 * Register an array of procedures.
 *
 * @param procedures - Procedures to register
 */
export function registerProcedures(procedures) {
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
export function createAndRegister(name, procedures) {
    const module = { name, procedures };
    PROCEDURE_REGISTRY.registerModule(module);
    return module;
}
//# sourceMappingURL=discovery.js.map