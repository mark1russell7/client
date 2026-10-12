/**
 * Type definitions for client-sqlite procedures
 */

import { homedir } from "node:os";
import { join } from "node:path";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Default database path for CLI logs
 */
export const DEFAULT_DB_PATH: string = join(homedir(), "logs", "cli", "cli.db");

// =============================================================================
// Log Levels
// =============================================================================

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export const LOG_LEVELS: readonly LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
] as const;

// =============================================================================
// db.query types
// =============================================================================

export interface DbQueryInput {
  /** SQL query to execute */
  sql: string;
  /** Query parameters */
  params?: unknown[] | undefined;
  /** Database path (defaults to CLI log database) */
  dbPath?: string | undefined;
}

export interface DbQueryOutput<T = Record<string, unknown>> {
  /** Column names */
  columns: string[];
  /** Query results */
  rows: T[];
}

// =============================================================================
// db.execute types
// =============================================================================

export interface DbExecuteInput {
  /** SQL statement to execute (INSERT, UPDATE, DELETE, etc.) */
  sql: string;
  /** Statement parameters */
  params?: unknown[] | undefined;
  /** Database path (defaults to CLI log database) */
  dbPath?: string | undefined;
}

export interface DbExecuteOutput {
  /** Number of rows affected */
  changes: number;
}

// =============================================================================
// logs.store types
// =============================================================================

export interface LogsStoreInput {
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Session ID for grouping logs */
  sessionId?: string | undefined;
  /** Command that generated this log */
  command?: string | undefined;
  /** Additional context (e.g., package name) */
  context?: string | undefined;
  /** Additional structured data */
  data?: Record<string, unknown> | undefined;
  /** Error stack trace if applicable */
  errorStack?: string | undefined;
  /** Database path (defaults to CLI log database) */
  dbPath?: string | undefined;
}

export interface LogsStoreOutput {
  /** ID of the inserted log row */
  id: number;
}

// =============================================================================
// logs.query types
// =============================================================================

export interface LogsQueryInput {
  /** Filter by session ID */
  sessionId?: string | undefined;
  /** Filter by command */
  command?: string | undefined;
  /** Filter by log level(s) */
  level?: LogLevel | LogLevel[] | undefined;
  /** Maximum number of logs to return */
  limit?: number | undefined;
  /** Offset for pagination */
  offset?: number | undefined;
  /** Order by (default: timestamp DESC) */
  orderBy?: "asc" | "desc" | undefined;
  /** Database path (defaults to CLI log database) */
  dbPath?: string | undefined;
}

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
  data: Record<string, unknown> | null;
  sessionId: string | null;
  command: string | null;
  context: string | null;
  errorStack: string | null;
}

export interface LogsQueryOutput {
  /** Log entries matching the query */
  logs: LogEntry[];
  /** Total count (if limit was applied) */
  total?: number | undefined;
}
