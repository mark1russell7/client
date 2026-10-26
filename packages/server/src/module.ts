/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * The package holds the host: the `server` CLI, `mark serve`, and the procedures that manage the
 * background server of the `mark` CLI. `server.start`, `server.stop` and `server.status` came
 * from `@procedures/peer`. Their names stay the same. The other `server.*` procedures
 * (`server.create`, `server.connect` and the others) stay in the peer package.
 */

import { definePackage, type AnyProcedure, type ProcedureModule, type PackageDefinition } from "@procedures/client";
import { serverStartProcedure } from "./procedures/server.start.js";
import { serverStopProcedure } from "./procedures/server.stop.js";
import { serverStatusProcedure } from "./procedures/server.status.js";

/** The procedures of the host: `server.start`, `server.stop` and `server.status`. */
export const hostProcedures: readonly AnyProcedure[] = [serverStartProcedure, serverStopProcedure, serverStatusProcedure];

const serverPackage: PackageDefinition = definePackage("@procedures/server", [...hostProcedures]);

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const serverModule: ProcedureModule = serverPackage.module;

export default serverModule;

/**
 * This function registers the procedures of @procedures/server in a registry. The default is the
 * global registry. Importing this file registers nothing: the `./register` entry starts this
 * function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export const registerServerProcedures: PackageDefinition["register"] = serverPackage.register;
