/**
 * Type definitions for client-server-mongo procedures
 */

import { z } from "zod";

// ============================================================================
// server.mongo.start - Start MongoDB peer server
// ============================================================================

export const ServerMongoStartInputSchema: z.ZodObject<{
  port: z.ZodOptional<z.ZodNumber>;
  host: z.ZodOptional<z.ZodString>;
  mongoUri: z.ZodOptional<z.ZodString>;
  database: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Port to listen on */
  port: z.number().optional(),
  /** Host to bind to */
  host: z.string().optional(),
  /** MongoDB connection URI */
  mongoUri: z.string().optional(),
  /** Database name */
  database: z.string().optional(),
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
