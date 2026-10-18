/**
 * MCP Server Entry Point
 *
 * Starts an MCP server that exposes procedures as tools to Claude Code and Claude Desktop. The
 * MCP configuration of a client runs this file (`node packages/impl-mcp-dev/dist/server.js`).
 * Configurable via environment variables (see `config.ts`). `mark mcp` starts the same server.
 *
 * When the client closes the input of stdio, the host stops (the calls in flight get their grace
 * time), and this process ends (CLI-10).
 */

import { startDevToolsServer } from "./host.js";

startDevToolsServer()
  .then(async (host) => {
    await host.mcp.closed;
    process.exit(0);
  })
  .catch((error) => {
    console.error("[mcp-server] Fatal error:", error);
    process.exit(1);
  });
