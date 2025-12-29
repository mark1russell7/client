/**
 * MCP Context Types
 *
 * Extended procedure context types when called via MCP transport.
 */
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
export function isMcpContext(context) {
    return (context !== undefined &&
        typeof context === "object" &&
        "mcp" in context &&
        context.mcp !== undefined);
}
/**
 * Get MCP context if available, undefined otherwise.
 *
 * @param context - Procedure context to check
 * @returns MCP context data or undefined
 */
export function getMcpContext(context) {
    if (isMcpContext(context)) {
        return context.mcp;
    }
    return undefined;
}
//# sourceMappingURL=mcp-context.js.map