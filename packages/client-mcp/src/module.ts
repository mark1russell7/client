/**
 * Module (no side effects): the MCP procedures as data, for `createRegistry()`.
 */

import { defineModule, type AnyProcedure, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import { mcpServeProcedure } from "./procedures/mcp/serve.js";
import { mcpListToolsProcedure } from "./procedures/mcp/list-tools.js";

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const mcpModule: ProcedureModule = defineModule("@procedures/mcp-server", [
  mcpServeProcedure as AnyProcedure,
  mcpListToolsProcedure as AnyProcedure,
]);

export default mcpModule;

/**
 * This function registers the procedures of @procedures/mcp-server, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerMcpProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [mcpModule]);
}
