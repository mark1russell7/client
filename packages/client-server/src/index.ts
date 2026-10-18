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

// The procedures host (CLI-7): the parts of a service, its faces, and its run outside a service
export {
  createProcedureHost,
  httpFace,
  wsFace,
  LOCAL_LISTENER_KNOBS,
  callOperations,
  faceHandler,
  operationOfCall,
} from "./host/index.js";
export type {
  ProcedureHost,
  ProcedureHostOptions,
  ProcedureHostFaces,
  HostListener,
  HostCollection,
  HostServerOptions,
  HostPart,
  HostDependency,
  HostCheck,
  HostPattern,
  HostController,
  HostEndpoint,
  HostInfo,
  HostKnobs,
  HostFace,
  HostFaceContext,
  HostFaceEndpoint,
  HostFaceFactory,
  HostFaceUpgrade,
  CallDetail,
  CallOperation,
  FaceHandler,
  FaceHandlerOptions,
} from "./host/index.js";
export { runOutsideService, type OutsideRun } from "./host/outside.js";

// Peer: a procedures host outside a service
export { createPeer, type Peer, type PeerOptions, type PeerEndpoint } from "./peer/index.js";
export { exposeRule } from "./expose.js";

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
export { procedures, registerServerProcedures } from "./module.js";
