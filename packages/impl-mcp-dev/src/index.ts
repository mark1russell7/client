/**
 * @procedures/mcp-dev-tools (folder packages/impl-mcp-dev)
 *
 * Ready-to-use MCP server exposing the procedure ecosystem to Claude. Importing this entry
 * starts nothing: `runDevToolsServer()` runs the server under `run()` of the service (as
 * `dist/server.js` and `mark mcp` do), and `createDevToolsHost()` builds the host without a
 * transport.
 */

export { loadConfig, parsePeers, type McpServerConfig, type PeerConfig } from "./config.js";
export { DEFAULT_PEER_TIMEOUT_MS, loadPeers, peerAddress, readDiscovery, type LoadPeersOptions, type LoadedPeers, type PeerState } from "./peers.js";
export {
  createDevToolsHost,
  runDevToolsServer,
  loadBundles,
  type DevToolsHost,
  type LoadedBundles,
  type RunningDevToolsServer,
} from "./host.js";
