/**
 * Procedure Registration
 *
 * Registers server procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { registerProcedures, type AnyProcedure } from "@mark1russell7/client";

// Import all procedures
import { serverCreateProcedure } from "./procedures/server.create.js";

/**
 * All server procedures
 */
export const procedures: readonly AnyProcedure[] = [
  serverCreateProcedure,
];

/**
 * Register all server procedures with the client system
 */
export function registerServerProcedures(): void {
  registerProcedures([...procedures]);
}

// Auto-register when this module is loaded
registerServerProcedures();
