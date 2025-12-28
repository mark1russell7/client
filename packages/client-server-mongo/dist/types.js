/**
 * Type definitions for client-server-mongo procedures
 */
import { z } from "zod";
// ============================================================================
// server.mongo.start - Start MongoDB peer server
// ============================================================================
export const ServerMongoStartInputSchema = z.object({
    /** Port to listen on */
    port: z.number().optional(),
    /** Host to bind to */
    host: z.string().optional(),
    /** MongoDB connection URI */
    mongoUri: z.string().optional(),
    /** Database name */
    database: z.string().optional(),
});
// ============================================================================
// server.mongo.stop - Stop MongoDB peer server
// ============================================================================
export const ServerMongoStopInputSchema = z.object({
    /** Server ID to stop */
    serverId: z.string(),
});
// ============================================================================
// server.mongo.status - Get MongoDB server status
// ============================================================================
export const ServerMongoStatusInputSchema = z.object({
    /** Optional server ID to filter */
    serverId: z.string().optional(),
});
// ============================================================================
// server.mongo.connect - Connect to MongoDB
// ============================================================================
export const ServerMongoConnectInputSchema = z.object({
    /** MongoDB connection URI */
    uri: z.string().optional(),
    /** Database name */
    database: z.string().optional(),
});
//# sourceMappingURL=types.js.map