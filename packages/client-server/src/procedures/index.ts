/**
 * Server Procedures
 *
 * All procedures exported from this module.
 */

export { serverCreateProcedure, getPeer, getActivePeerIds } from "./server.create.js";
export type { ServerCreateInput, ServerCreateOutput } from "./server.create.js";

export { serverConnectProcedure } from "./server.connect.js";
export type { ServerConnectInput, ServerConnectOutput } from "./server.connect.js";

export { serverDisconnectProcedure } from "./server.disconnect.js";
export type { ServerDisconnectInput, ServerDisconnectOutput } from "./server.disconnect.js";

export { manifestGenerateProcedure } from "./manifest.generate.js";
export type { ManifestGenerateInput, ManifestGenerateOutput } from "./manifest.generate.js";

// server.start, server.stop and server.status are in @procedures/server (the package of the host)

export { serverCallProcedure } from "./server.call.js";
export type { ServerCallInput, ServerCallOutput } from "./server.call.js";

export { serverConnectionsProcedure } from "./server.connections.js";
export type { ServerConnectionsInput, ServerConnectionsOutput } from "./server.connections.js";
