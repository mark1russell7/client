/**
 * Server Configuration Types
 */
export interface TransportConfig {
    type: "http" | "websocket" | "local";
    port?: number;
    host?: string;
    basePath?: string;
    cors?: boolean;
    corsOrigins?: string[];
    path?: string;
}
export interface ServerConfig {
    procedures: string[];
    transports: TransportConfig[];
    verbose: boolean;
}
export interface ServerCreateResult {
    serverId: string;
    endpoints: Array<{
        type: string;
        address: string;
    }>;
    procedureCount: number;
}
//# sourceMappingURL=types.d.ts.map