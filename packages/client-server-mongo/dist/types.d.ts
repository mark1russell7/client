/**
 * Type definitions for client-server-mongo procedures
 */
import { z } from "zod";
/**
 * Transport configuration for the server
 */
export declare const TransportConfigSchema: z.ZodObject<{
    type: z.ZodEnum<["http", "websocket", "local"]>;
    port: z.ZodOptional<z.ZodNumber>;
    host: z.ZodOptional<z.ZodString>;
    basePath: z.ZodOptional<z.ZodString>;
    cors: z.ZodOptional<z.ZodBoolean>;
    corsOrigins: z.ZodOptional<z.ZodArray<z.ZodString>>;
    path: z.ZodOptional<z.ZodString>;
}>;
export type TransportConfig = z.infer<typeof TransportConfigSchema>;
export declare const ServerMongoStartInputSchema: z.ZodObject<{
    port: z.ZodOptional<z.ZodNumber>;
    host: z.ZodOptional<z.ZodString>;
    mongoUri: z.ZodOptional<z.ZodString>;
    database: z.ZodOptional<z.ZodString>;
    transports: z.ZodOptional<z.ZodArray<typeof TransportConfigSchema>>;
}>;
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
export declare const ServerMongoStopInputSchema: z.ZodObject<{
    serverId: z.ZodString;
}>;
export type ServerMongoStopInput = z.infer<typeof ServerMongoStopInputSchema>;
export interface ServerMongoStopOutput {
    /** Whether stop succeeded */
    success: boolean;
}
export declare const ServerMongoStatusInputSchema: z.ZodObject<{
    serverId: z.ZodOptional<z.ZodString>;
}>;
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
export declare const ServerMongoConnectInputSchema: z.ZodObject<{
    uri: z.ZodOptional<z.ZodString>;
    database: z.ZodOptional<z.ZodString>;
}>;
export type ServerMongoConnectInput = z.infer<typeof ServerMongoConnectInputSchema>;
export interface ServerMongoConnectOutput {
    /** Whether connection succeeded */
    success: boolean;
    /** Connected database name */
    database: string;
}
//# sourceMappingURL=types.d.ts.map