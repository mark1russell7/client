/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration
 *
 * Registers server procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { type AnyProcedure, defineModule, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";

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
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const serverModule: ProcedureModule = defineModule("@procedures/peer", [...procedures]);

export default serverModule;

/**
 * This function registers the procedures of @procedures/peer, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerServerProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [serverModule]);
}
