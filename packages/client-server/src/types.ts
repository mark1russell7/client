/**
 * Type definitions for client-server procedures
 */

import { z } from "zod";

// =============================================================================
// Transport Configuration
// =============================================================================

export const TransportTypeSchema = z.enum(["http", "websocket", "local"]);
export type TransportType = z.infer<typeof TransportTypeSchema>;

export const HttpTransportConfigSchema = z.object({
  type: z.literal("http"),
  port: z.number().default(3000),
  host: z.string().default("0.0.0.0"),
  basePath: z.string().default("/api"),
  cors: z.boolean().default(true),
  corsOrigins: z.array(z.string()).optional(),
});
export type HttpTransportConfig = z.infer<typeof HttpTransportConfigSchema>;

export const WebSocketTransportConfigSchema = z.object({
  type: z.literal("websocket"),
  port: z.number().default(3001),
  host: z.string().default("0.0.0.0"),
  path: z.string().default("/ws"),
});
export type WebSocketTransportConfig = z.infer<typeof WebSocketTransportConfigSchema>;

export const LocalTransportConfigSchema = z.object({
  type: z.literal("local"),
});
export type LocalTransportConfig = z.infer<typeof LocalTransportConfigSchema>;

export const TransportConfigSchema = z.discriminatedUnion("type", [
  HttpTransportConfigSchema,
  WebSocketTransportConfigSchema,
  LocalTransportConfigSchema,
]);
export type TransportConfig = z.infer<typeof TransportConfigSchema>;

// =============================================================================
// server.create Types
// =============================================================================

export const ServerCreateInputSchema = z.object({
  /** Transports to enable */
  transports: z.array(TransportConfigSchema).default([{ type: "http", port: 3000 }]),
  /** Auto-register all procedures from registry */
  autoRegister: z.boolean().default(true),
});
export type ServerCreateInput = z.infer<typeof ServerCreateInputSchema>;

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

export const ServerConnectInputSchema = z.object({
  /** Remote server address */
  address: z.string(),
  /** Transport type to use */
  transport: TransportTypeSchema.default("websocket"),
  /** Connection timeout in ms */
  timeout: z.number().default(30000),
});
export type ServerConnectInput = z.infer<typeof ServerConnectInputSchema>;

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

export const ServerDisconnectInputSchema = z.object({
  /** Connection ID to disconnect */
  connectionId: z.string(),
});
export type ServerDisconnectInput = z.infer<typeof ServerDisconnectInputSchema>;

export interface ServerDisconnectOutput {
  /** Whether disconnect succeeded */
  success: boolean;
}

// =============================================================================
// manifest.generate Types
// =============================================================================

export const ManifestGenerateInputSchema = z.object({
  /** Output formats to generate */
  formats: z.array(z.enum(["json", "typescript"])).default(["json", "typescript"]),
  /** Namespace filter (only include procedures under this path) */
  namespace: z.array(z.string()).optional(),
  /** Output directory for files */
  outputDir: z.string().optional(),
});
export type ManifestGenerateInput = z.infer<typeof ManifestGenerateInputSchema>;

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
