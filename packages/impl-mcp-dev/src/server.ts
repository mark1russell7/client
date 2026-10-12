/**
 * MCP Server Entry Point
 *
 * Starts an MCP server that exposes procedures as tools to Claude Code and Claude Desktop. The
 * MCP configuration of a client runs this file (`node packages/impl-mcp-dev/dist/server.js`).
 * Configurable via environment variables (see `config.ts`). `mark mcp` starts the same server.
 */

import { startDevToolsServer } from "./host.js";

startDevToolsServer().catch((error) => {
  console.error("[mcp-server] Fatal error:", error);
  process.exit(1);
});
