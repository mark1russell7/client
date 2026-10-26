/**
 * Module (no side effects): the MCP procedures as data, for `createRegistry()`.
 */

import { definePackage, type AnyProcedure, type ProcedureModule, type PackageDefinition } from "@procedures/client";
import { mcpServeProcedure } from "./procedures/mcp/serve.js";
import { mcpListToolsProcedure } from "./procedures/mcp/list-tools.js";

const mcpPackage: PackageDefinition = definePackage("@procedures/mcp-server", [
  mcpServeProcedure as AnyProcedure,
  mcpListToolsProcedure as AnyProcedure,
]);

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const mcpModule: ProcedureModule = mcpPackage.module;

export default mcpModule;

/**
 * This function registers the procedures of @procedures/mcp-server, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export const registerMcpProcedures: PackageDefinition["register"] = mcpPackage.register;
