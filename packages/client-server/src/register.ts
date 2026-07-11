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
import { serverStartProcedure } from "./procedures/server.start.js";
import { serverStopProcedure } from "./procedures/server.stop.js";
import { serverStatusProcedure } from "./procedures/server.status.js";
import { serverCallProcedure } from "./procedures/server.call.js";
import { serverConnectionsProcedure } from "./procedures/server.connections.js";

/**
 * All server procedures
 */
export const procedures: readonly AnyProcedure[] = [
  serverCreateProcedure,
  serverConnectProcedure,
  serverDisconnectProcedure,
  manifestGenerateProcedure,
  discoveryAnnounceProcedure,
  serverStartProcedure,
  serverStopProcedure,
  serverStatusProcedure,
  serverCallProcedure,
  serverConnectionsProcedure,
];

/**
 * Register all server procedures with the client system
 */
export function registerServerProcedures(): void {
  registerProcedures([...procedures]);
}

// Auto-register when this module is loaded
registerServerProcedures();
