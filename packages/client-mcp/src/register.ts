/**
 * MCP Procedure Registration
 *
 * Auto-registers MCP procedures when this module is imported.
 */

import { PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { mcpServeProcedure } from "./procedures/mcp/serve.js";
import { mcpListToolsProcedure } from "./procedures/mcp/list-tools.js";

/**
 * Register all MCP procedures.
 */
export function registerMcpProcedures(): void {
  const procedures = [mcpServeProcedure, mcpListToolsProcedure];

  for (const proc of procedures) {
    if (!PROCEDURE_REGISTRY.has(proc.path)) {
      PROCEDURE_REGISTRY.register(proc);
    }
  }
}

// Auto-register when this module is imported
registerMcpProcedures();
