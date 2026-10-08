/**
 * Client Server
 *
 * Transport-agnostic peer for bidirectional RPC.
 * Exposes procedures and generates manifests.
 */

// Types
export type {
  TransportType,
  TransportConfig,
  HttpTransportConfig,
  WebSocketTransportConfig,
  LocalTransportConfig,
  ServerCreateInput,
  ServerCreateOutput,
  ServerConnectInput,
  ServerConnectOutput,
  ServerDisconnectInput,
  ServerDisconnectOutput,
  ManifestGenerateInput,
  ManifestGenerateOutput,
  ProcedureInfo,
  PeerConnection,
  ProcedureAnnounceMessage,
  ProcedureUpdateMessage,
} from "./types.js";

// Peer
export { createPeer, type Peer, type PeerOptions, type PeerEndpoint } from "./peer/index.js";

// Procedures
export {
  serverCreateProcedure,
  getPeer,
  getActivePeerIds,
  serverConnectProcedure,
  serverDisconnectProcedure,
  manifestGenerateProcedure,
} from "./procedures/index.js";

// Manifest generation
export {
  generateTypeScript,
  generateJson,
  generateJsonString,
  type ProcedureManifest,
} from "./manifest/index.js";

// Connection
export {
  connect,
  disconnect,
  getConnection,
  getConnectionIds,
  type Connection,
  type ConnectOptions,
} from "./connection/index.js";

// Discovery
export {
  discoveryAnnounceProcedure,
  getProcedureInfos,
  watchProcedures,
} from "./discovery/index.js";

// Registration
export { procedures, registerServerProcedures } from "./register.js";
