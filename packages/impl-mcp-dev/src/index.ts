/**
 * @mark1russell7/mcp-dev-tools (folder packages/impl-mcp-dev)
 *
 * Ready-to-use MCP server exposing the procedure ecosystem to Claude. Importing this entry
 * starts nothing: `startDevToolsServer()` starts the server (as `dist/server.js` and `mark mcp`
 * do), and `createDevToolsHost()` builds the host without a transport.
 */

export { loadConfig, type McpServerConfig } from "./config.js";
export {
  createDevToolsHost,
  startDevToolsServer,
  loadBundles,
  type DevToolsHost,
  type LoadedBundles,
} from "./host.js";
