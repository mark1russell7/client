/**
 * @procedures/server
 *
 * General procedure server - run any procedure packages via HTTP/WebSocket. Importing this entry
 * starts nothing: `runServer(argv)` is the CLI (`server` and `mark serve`), and `startServer()`
 * starts a server from a parsed configuration.
 */

export { parseConfig } from "./config.js";
export { runServer, startServer, loadProcedureModule, type RunningServer, type ServerRunOptions } from "./run.js";
export type { ServerConfig, TransportConfig, ServerCreateResult } from "./types.js";
