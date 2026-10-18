/**
 * @procedures/server
 *
 * General procedure server - run any procedure packages via HTTP/WebSocket. Importing this entry
 * starts nothing: `runServer(argv)` is the CLI (`server` and `mark serve`), `runProcedureHost()`
 * runs a procedures host under `run()`, and `startServer()` starts a server outside a service.
 */

export { parseConfig, parseTopicPatterns } from "./config.js";
export { runServer, startServer, loadProcedureModule, type RunningServer, type ServerRunOptions } from "./run.js";
// The runner entry of the procedures host (CLI-8): the only entry that starts run()
export { runProcedureHost, HOST_PROFILES, type ProcedureHostRunConfig, type RunningHost, type HostRunMode } from "./host.js";
export type {
  ServerConfig,
  TransportConfig,
  ServerCreateResult,
  ServerStartInput,
  ServerStartOutput,
  ServerStopInput,
  ServerStopOutput,
  ServerStatusInput,
  ServerStatusOutput,
} from "./types.js";

// server.start, server.stop and server.status (from @procedures/peer). The root registers
// nothing: import "@procedures/server/register", or give the module to createRegistry().
export * from "./module.js";
export { serverStartProcedure } from "./procedures/server.start.js";
export { serverStopProcedure } from "./procedures/server.stop.js";
export { serverStatusProcedure } from "./procedures/server.status.js";
export {
  serverStartInputSchema,
  serverStopInputSchema,
  serverStatusInputSchema,
  ServerStartOutputSchema,
  ServerStopOutputSchema,
  ServerStatusOutputSchema,
} from "./schemas.js";
