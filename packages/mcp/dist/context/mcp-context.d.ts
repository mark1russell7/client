/**
 * MCP Context Types
 *
 * Extended procedure context types when called via MCP transport.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { McpTransportType } from "../types.js";
/**
 * MCP-specific context data available when a procedure is called via MCP.
 */
export interface McpCallContext {
    /** MCP request ID */
    requestId: string;
    /** Transport type used (stdio or sse) */
    transport: McpTransportType;
    /** Client information from MCP connection (if available) */
    clientInfo?: {
        name?: string;
        version?: string;
    };
    /** Raw MCP metadata */
    rawMetadata?: Record<string, unknown>;
}
/**
 * Extended procedure context when called via MCP transport.
 *
 * Provides access to MCP-specific metadata through the `mcp` property.
 */
export interface McpProcedureContext extends ProcedureContext {
    /** MCP-specific context data */
    mcp: McpCallContext;
}
/**
 * Type guard to check if context is from MCP transport.
 *
 * @param context - Procedure context to check
 * @returns True if context has MCP metadata
 *
 * @example
 * ```typescript
 * handler: async (input, ctx) => {
 *   if (isMcpContext(ctx)) {
 *     console.log(`Called via MCP: ${ctx.mcp.transport}`);
 *   }
 *   // ... handle request
 * }
 * ```
 */
export declare function isMcpContext(context: ProcedureContext): context is McpProcedureContext;
/**
 * Get MCP context if available, undefined otherwise.
 *
 * @param context - Procedure context to check
 * @returns MCP context data or undefined
 */
export declare function getMcpContext(context: ProcedureContext): McpCallContext | undefined;
//# sourceMappingURL=mcp-context.d.ts.map