/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration
 *
 * Registers server procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { definePackage, type AnyProcedure, type ProcedureModule, type PackageDefinition } from "@procedures/client";

// Import all procedures
import { serverCreateProcedure } from "./procedures/server.create.js";
import { serverConnectProcedure } from "./procedures/server.connect.js";
import { serverDisconnectProcedure } from "./procedures/server.disconnect.js";
import { manifestGenerateProcedure } from "./procedures/manifest.generate.js";
import { discoveryAnnounceProcedure } from "./discovery/index.js";
import { serverCallProcedure } from "./procedures/server.call.js";
import { serverConnectionsProcedure } from "./procedures/server.connections.js";

/**
 * All server procedures. `server.start`, `server.stop` and `server.status` manage the background
 * server of the `mark` CLI: they are in `@procedures/server`, the package of the host.
 */
export const procedures: readonly AnyProcedure[] = [
  serverCreateProcedure,
  serverConnectProcedure,
  serverDisconnectProcedure,
  manifestGenerateProcedure,
  discoveryAnnounceProcedure,
  serverCallProcedure,
  serverConnectionsProcedure,
];

const serverPackage: PackageDefinition = definePackage("@procedures/peer", [...procedures]);

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const serverModule: ProcedureModule = serverPackage.module;

export default serverModule;

/**
 * This function registers the procedures of @procedures/peer, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export const registerServerProcedures: PackageDefinition["register"] = serverPackage.register;
