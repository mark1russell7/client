/**
 * Type definitions for client-server procedures
 */

// =============================================================================
// Transport Configuration
// =============================================================================

export type TransportType = "http" | "websocket" | "local";

export interface HttpTransportConfig {
  type: "http";
  port?: number;
  host?: string;
  basePath?: string;
  cors?: boolean;
  corsOrigins?: string[];
  /** URL strategy: "rest" (default) or "rpc" for /rpc/service/operation format */
  urlStrategy?: "rest" | "rpc";
}

export interface WebSocketTransportConfig {
  type: "websocket";
  port?: number;
  host?: string;
  path?: string;
}

export interface LocalTransportConfig {
  type: "local";
}

export type TransportConfig = HttpTransportConfig | WebSocketTransportConfig | LocalTransportConfig;

// =============================================================================
// server.create Types
// =============================================================================

export interface ServerCreateInput {
  /** Transports to enable */
  transports?: TransportConfig[];
  /** Auto-register all procedures from registry */
  autoRegister?: boolean;
}

export interface ServerCreateOutput {
  /** Server ID for reference */
  serverId: string;
  /** Active transport endpoints */
  endpoints: Array<{
    type: TransportType;
    address: string;
  }>;
  /** Number of registered procedures */
  procedureCount: number;
}

// =============================================================================
// server.connect Types
// =============================================================================

export interface ServerConnectInput {
  /** Remote server address */
  address: string;
  /** Transport type to use */
  transport?: TransportType;
  /** Connection timeout in ms */
  timeout?: number;
}

export interface ProcedureInfo {
  /** Procedure path */
  path: string[];
  /** Description from metadata */
  description?: string;
  /** Input schema as JSON schema */
  inputSchema?: Record<string, unknown>;
  /** Output schema as JSON schema */
  outputSchema?: Record<string, unknown>;
}

export interface ServerConnectOutput {
  /** Connection ID */
  connectionId: string;
  /** Remote peer ID */
  remotePeerId: string;
  /** Procedures available on remote */
  remoteProcedures: ProcedureInfo[];
}

// =============================================================================
// server.disconnect Types
// =============================================================================

export interface ServerDisconnectInput {
  /** Connection ID to disconnect */
  connectionId: string;
}

export interface ServerDisconnectOutput {
  /** Whether disconnect succeeded */
  success: boolean;
}

// =============================================================================
// manifest.generate Types
// =============================================================================

export type ManifestFormat = "json" | "typescript";

export interface ManifestGenerateInput {
  /** Output formats to generate */
  formats?: ManifestFormat[];
  /** Namespace filter (only include procedures under this path) */
  namespace?: string[];
  /** Output directory for files */
  outputDir?: string;
}

export interface ManifestGenerateOutput {
  /** Generated JSON manifest */
  json?: {
    procedures: ProcedureInfo[];
    generatedAt: string;
    version: string;
  };
  /** Generated TypeScript declaration */
  typescript?: string;
  /** Files written if outputDir provided */
  filesWritten?: string[];
}

// =============================================================================
// Peer Connection Types
// =============================================================================

export interface PeerConnection {
  /** Unique connection ID */
  id: string;
  /** Remote peer ID */
  remotePeerId: string;
  /** Transport type used */
  transport: TransportType;
  /** Connection state */
  state: "connecting" | "connected" | "disconnected" | "error";
  /** Remote procedures */
  remoteProcedures: ProcedureInfo[];
  /** When connection was established */
  connectedAt?: Date;
}

// =============================================================================
// Procedure Discovery Protocol Messages
// =============================================================================

export interface ProcedureAnnounceMessage {
  type: "procedure-announce";
  peerId: string;
  procedures: ProcedureInfo[];
}

export interface ProcedureUpdateMessage {
  type: "procedure-update";
  peerId: string;
  added?: ProcedureInfo[];
  removed?: string[]; // Procedure paths as strings
}

// =============================================================================
// server.start Types
// =============================================================================

export interface ServerStartInput {
  /** Port to listen on */
  port?: number;
  /** Host to bind to */
  host?: string;
  /** Transport type */
  transport?: "http" | "websocket" | "both";
}

export interface ServerStartOutput {
  /** Whether start succeeded */
  success: boolean;
  /** Process ID of server */
  pid?: number;
  /** Port server is running on */
  port?: number;
  /** Endpoint URL */
  endpoint?: string;
  /** Log file path */
  logFile?: string;
  /** Status message */
  message: string;
}

// =============================================================================
// server.stop Types
// =============================================================================

export interface ServerStopInput {
  /** Force kill with SIGKILL instead of SIGTERM */
  force?: boolean;
}

export interface ServerStopOutput {
  /** Whether stop succeeded */
  success: boolean;
  /** Status message */
  message: string;
}

// =============================================================================
// server.status Types
// =============================================================================

export interface ServerStatusInput {
  // No input required
}

export interface ServerStatusOutput {
  /** Whether server is running */
  running: boolean;
  /** Process ID */
  pid?: number;
  /** Port */
  port?: number;
  /** Endpoint URL */
  endpoint?: string;
  /** Transport type */
  transport?: string;
  /** When server started (ISO string) */
  startedAt?: string;
  /** Human-readable uptime */
  uptime?: string;
  /** Log file path */
  logFile?: string;
  /** Status message */
  message: string;
}
