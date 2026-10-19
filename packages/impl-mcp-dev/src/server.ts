/**
 * MCP Server Entry Point
 *
 * Starts an MCP server that exposes procedures as tools to Claude Code and Claude Desktop. The
 * MCP configuration of a client runs this file (`node packages/impl-mcp-dev/dist/server.js`).
 * Configurable via environment variables (see `config.ts`). `mark mcp` starts the same server.
 *
 * The server runs under `run()` of `@mark1russell7/service` (CLI-11). The runner owns the signals,
 * the stop in stages and the exit. When the client closes the input of stdio, the trigger
 * `stdin-close` stops the host (the calls in flight get the drain time), and the process exits.
 */

import { runDevToolsServer } from "./host.js";

runDevToolsServer().catch((error) => {
  console.error("[mcp-server] Fatal error:", error);
  process.exit(1);
});
