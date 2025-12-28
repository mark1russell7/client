/**
 * CLI Server Mode
 *
 * Runs the CLI as a persistent server, exposing all ecosystem procedures
 * via HTTP. Uses server.create procedure internally (dogfooding).
 */
export interface ServerModeOptions {
    port: number;
    host?: string;
    transport?: "http" | "websocket" | "both";
    verbose?: boolean;
}
/**
 * Start CLI in server mode
 */
export declare function startServerMode(options: ServerModeOptions): Promise<void>;
/**
 * Extract port from argv
 */
export declare function extractPort(argv: string[]): number | null;
/**
 * Extract host from argv
 */
export declare function extractHost(argv: string[]): string | null;
//# sourceMappingURL=server-mode.d.ts.map