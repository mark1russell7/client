/**
 * Server Configuration
 *
 * Environment-based configuration for the MongoDB server.
 */
export interface ServerConfig {
    /** Port to listen on */
    port: number;
    /** Host to bind to */
    host: string;
    /** MongoDB connection URI */
    mongoUri: string;
    /** Database name */
    database: string;
}
export declare function loadConfig(): ServerConfig;
export declare const config: ServerConfig;
//# sourceMappingURL=config.d.ts.map