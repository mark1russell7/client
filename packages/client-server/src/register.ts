/**
 * Procedure Registration
 *
 * Registers server procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { registerProcedures, type AnyProcedure } from "@mark1russell7/client";

// Import all procedures
import { serverCreateProcedure } from "./procedures/server.create.js";
import { serverConnectProcedure } from "./procedures/server.connect.js";
import { serverDisconnectProcedure } from "./procedures/server.disconnect.js";
import { manifestGenerateProcedure } from "./procedures/manifest.generate.js";
import { discoveryAnnounceProcedure } from "./discovery/index.js";

/**
 * All server procedures
 */
export const procedures: readonly AnyProcedure[] = [
  serverCreateProcedure,
  serverConnectProcedure,
  serverDisconnectProcedure,
  manifestGenerateProcedure,
  discoveryAnnounceProcedure,
];

/**
 * Register all server procedures with the client system
 */
export function registerServerProcedures(): void {
  registerProcedures([...procedures]);
}

// Auto-register when this module is loaded
registerServerProcedures();
