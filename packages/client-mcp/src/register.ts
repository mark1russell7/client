/**
 * Importing this file registers the MCP procedures in the global registry (DECISIONS-2026-10,
 * "Every package root registers its procedures"). The procedures as data are in `module.ts`,
 * which registers nothing: a host with its own registry uses that one.
 */

import { PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { mcpModule } from "./module.js";

export * from "./module.js";

/**
 * Register all MCP procedures.
 */
export function registerMcpProcedures(): void {
  for (const proc of mcpModule.procedures) {
    if (!PROCEDURE_REGISTRY.has(proc.path)) {
      PROCEDURE_REGISTRY.register(proc);
    }
  }
}

// Auto-register when this module is imported
registerMcpProcedures();
