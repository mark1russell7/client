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
  /**
   * The token that every request must send. `undefined`: the server makes a random token and
   * prints it. `null` (`--no-token`): no token.
   */
  token: string | null | undefined;
  /** The procedures to serve (`--expose`): exact keys or `prefix.*`. Empty: every procedure. */
  expose: string[];
}

export interface ServerCreateResult {
  serverId: string;
  endpoints: Array<{ type: string; address: string }>;
  procedureCount: number;
}
