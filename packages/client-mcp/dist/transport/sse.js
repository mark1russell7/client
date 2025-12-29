/**
 * SSE Transport Wrapper
 *
 * Creates an MCP SSE (Server-Sent Events) transport for HTTP streaming.
 * NOTE: SSE transport requires HTTP server integration - use with Express or similar.
 */
/**
 * SSE transport is not yet implemented as a standalone transport.
 *
 * SSE requires HTTP server integration with:
 * - GET endpoint for SSE connection
 * - POST endpoint for messages
 *
 * For now, use stdio transport or implement SSE with your HTTP framework directly.
 *
 * @throws Error - SSE transport requires HTTP server integration
 */
export function createSseTransport(_options) {
    throw new Error("SSE transport requires HTTP server integration. " +
        "Use stdio transport for standalone MCP server, or integrate SSE " +
        "with your HTTP framework (Express, etc.) using SSEServerTransport directly.");
}
//# sourceMappingURL=sse.js.map