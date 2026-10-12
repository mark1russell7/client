/**
 * Module (no side effects): the MCP procedures as data, for `createRegistry()`.
 */

import { defineModule, type AnyProcedure, type ProcedureModule } from "@procedures/client";
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
