/**
 * @procedures/mcp-dev-tools (folder packages/impl-mcp-dev)
 *
 * Ready-to-use MCP server exposing the procedure ecosystem to Claude. Importing this entry
 * starts nothing: `runDevToolsServer()` runs the server under `run()` of the service (as
 * `dist/server.js` and `mark mcp` do), and `createDevToolsHost()` builds the host without a
 * transport. `startDevToolsServer()` is deprecated (CLI-11).
 */

export { loadConfig, type McpServerConfig } from "./config.js";
export {
  createDevToolsHost,
  runDevToolsServer,
  startDevToolsServer,
  loadBundles,
  type DevToolsHost,
  type DevToolsHostOptions,
  type LoadedBundles,
  type RunningDevToolsServer,
} from "./host.js";
