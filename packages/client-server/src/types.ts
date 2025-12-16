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
