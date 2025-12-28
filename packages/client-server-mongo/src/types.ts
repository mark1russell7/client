/**
 * Type definitions for client-server-mongo procedures
 */

import { z } from "zod";

// ============================================================================
// server.mongo.start - Start MongoDB peer server
// ============================================================================

/**
 * Transport configuration for the server
 */
export const TransportConfigSchema: z.ZodObject<{
  type: z.ZodEnum<["http", "websocket", "local"]>;
  port: z.ZodOptional<z.ZodNumber>;
  host: z.ZodOptional<z.ZodString>;
  basePath: z.ZodOptional<z.ZodString>;
  cors: z.ZodOptional<z.ZodBoolean>;
  corsOrigins: z.ZodOptional<z.ZodArray<z.ZodString>>;
  path: z.ZodOptional<z.ZodString>;
}> = z.object({
  type: z.enum(["http", "websocket", "local"]),
  port: z.number().optional(),
  host: z.string().optional(),
  basePath: z.string().optional(),
  cors: z.boolean().optional(),
  corsOrigins: z.array(z.string()).optional(),
  path: z.string().optional(),
});

export type TransportConfig = z.infer<typeof TransportConfigSchema>;

export const ServerMongoStartInputSchema: z.ZodObject<{
  port: z.ZodOptional<z.ZodNumber>;
  host: z.ZodOptional<z.ZodString>;
  mongoUri: z.ZodOptional<z.ZodString>;
  database: z.ZodOptional<z.ZodString>;
  transports: z.ZodOptional<z.ZodArray<typeof TransportConfigSchema>>;
}> = z.object({
  /** Port to listen on (default: 3000) */
  port: z.number().optional(),
  /** Host to bind to (default: 0.0.0.0) */
  host: z.string().optional(),
  /** MongoDB connection URI */
  mongoUri: z.string().optional(),
  /** Database name */
  database: z.string().optional(),
  /** Custom transport configuration (overrides port/host) */
  transports: z.array(TransportConfigSchema).optional(),
});

export type ServerMongoStartInput = z.infer<typeof ServerMongoStartInputSchema>;

export interface PeerEndpoint {
  type: string;
  address: string;
}

export interface ServerMongoStartOutput {
  /** Server identifier */
  serverId: string;
  /** Active endpoints */
  endpoints: PeerEndpoint[];
  /** Number of registered procedures */
  procedureCount: number;
}

// ============================================================================
// server.mongo.stop - Stop MongoDB peer server
// ============================================================================

export const ServerMongoStopInputSchema: z.ZodObject<{
  serverId: z.ZodString;
}> = z.object({
  /** Server ID to stop */
  serverId: z.string(),
});

export type ServerMongoStopInput = z.infer<typeof ServerMongoStopInputSchema>;

export interface ServerMongoStopOutput {
  /** Whether stop succeeded */
  success: boolean;
}

// ============================================================================
// server.mongo.status - Get MongoDB server status
// ============================================================================

export const ServerMongoStatusInputSchema: z.ZodObject<{
  serverId: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Optional server ID to filter */
  serverId: z.string().optional(),
});

export type ServerMongoStatusInput = z.infer<typeof ServerMongoStatusInputSchema>;

export interface ServerInfo {
  serverId: string;
  endpoints: PeerEndpoint[];
  startedAt: string;
  procedureCount: number;
}

export interface ServerMongoStatusOutput {
  servers: ServerInfo[];
}

// ============================================================================
// server.mongo.connect - Connect to MongoDB
// ============================================================================

export const ServerMongoConnectInputSchema: z.ZodObject<{
  uri: z.ZodOptional<z.ZodString>;
  database: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** MongoDB connection URI */
  uri: z.string().optional(),
  /** Database name */
  database: z.string().optional(),
});

export type ServerMongoConnectInput = z.infer<typeof ServerMongoConnectInputSchema>;

export interface ServerMongoConnectOutput {
  /** Whether connection succeeded */
  success: boolean;
  /** Connected database name */
  database: string;
}
