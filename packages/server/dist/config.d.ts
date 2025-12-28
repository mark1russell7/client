/**
 * Configuration Parser
 *
 * Parses command line arguments for the server.
 */
import type { ServerConfig } from "./types.js";
/**
 * Parse command line arguments into server configuration.
 *
 * Usage:
 *   server --procedures @mark1russell7/client-mongo/register --port 3000
 *   server --procedures pkg1,pkg2 --transport http,websocket
 */
export declare function parseConfig(argv: string[]): ServerConfig;
//# sourceMappingURL=config.d.ts.map