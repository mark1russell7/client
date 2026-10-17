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
  /**
   * The topic patterns of the remote events (`--events`): exact names, prefixes (`orders.*`) or
   * `*`. Empty: the server serves no topic, and each subscription gets `TOPIC_NOT_FOUND`.
   */
  events?: string[] | undefined;
  /** The root of the files (`--fs-root`): each procedure keeps its paths in it, or it is refused. Undefined: no root. */
  fsRoot?: string | undefined;
}

export interface ServerCreateResult {
  serverId: string;
  endpoints: Array<{ type: string; address: string }>;
  procedureCount: number;
}

// =============================================================================
// server.start Types (from @procedures/peer)
// =============================================================================

export interface ServerStartInput {
  /** Port to listen on */
  port?: number | undefined;
  /** Host to bind to */
  host?: string | undefined;
  /** Transport type */
  transport?: "http" | "websocket" | "both" | undefined;
}

export interface ServerStartOutput {
  /** Whether start succeeded */
  success: boolean;
  /** Process ID of server */
  pid?: number | undefined;
  /** Port server is running on */
  port?: number | undefined;
  /** Endpoint URL */
  endpoint?: string | undefined;
  /** Log file path */
  logFile?: string | undefined;
  /** Status message */
  message: string;
}

// =============================================================================
// server.stop Types (from @procedures/peer)
// =============================================================================

export interface ServerStopInput {
  /** Port of server to stop (stops all if omitted) */
  port?: number | undefined;
  /** Force kill with SIGKILL instead of SIGTERM */
  force?: boolean | undefined;
}

export interface ServerStopOutput {
  /** Whether stop succeeded */
  success: boolean;
  /** Status message */
  message: string;
}

// =============================================================================
// server.status Types (from @procedures/peer)
// =============================================================================

export interface ServerStatusInput {
  /** Port to check (shows all if omitted) */
  port?: number | undefined;
}

export interface ServerStatusOutput {
  /** Whether server is running */
  running: boolean;
  /** Process ID */
  pid?: number | undefined;
  /** Port */
  port?: number | undefined;
  /** Endpoint URL */
  endpoint?: string | undefined;
  /** Transport type */
  transport?: string | undefined;
  /** When server started (ISO string) */
  startedAt?: string | undefined;
  /** Human-readable uptime */
  uptime?: string | undefined;
  /** Log file path */
  logFile?: string | undefined;
  /** Status message */
  message: string;
}
