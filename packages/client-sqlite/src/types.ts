/**
 * Type definitions for client-sqlite procedures
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

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

// =============================================================================
// db.tables, db.schema, db.transaction, db.migrate and db.backup (roadmap R44)
// =============================================================================

/** The `dbPath` field of the R44 procedures. Its description does not show the home folder. */
const dbPath = z.string().min(1).optional().describe("The SQLite database file (default: the CLI log database, ~/logs/cli/cli.db)");

export interface DbTablesInput {
  /** Also the views (default true) */
  views?: boolean | undefined;
  dbPath?: string | undefined;
}

export interface DbTableInfo {
  name: string;
  type: "table" | "view";
  /** The SQL that made the table or the view */
  sql: string | null;
}

export interface DbTablesOutput {
  tables: DbTableInfo[];
}

export const DbTablesInputSchema: z.ZodType<DbTablesInput> = z.object({
  views: z.boolean().optional().describe("Also give the views (default true)"),
  dbPath,
});

export const DbTablesOutputSchema: z.ZodType<DbTablesOutput> = z.looseObject({
  tables: z
    .array(
      z.looseObject({
        name: z.string().describe("The name of the table or the view"),
        type: z.enum(["table", "view"]).describe("table or view"),
        sql: z.string().nullable().describe("The SQL that made the table or the view"),
      })
    )
    .describe("The tables (and the views), in the order of their names, without the internal sqlite_ tables"),
});

export interface DbSchemaInput {
  /** The table or the view */
  table: string;
  dbPath?: string | undefined;
}

export interface DbColumnInfo {
  name: string;
  /** The declared type, or "" */
  type: string;
  notNull: boolean;
  /** The SQL of the default value, or null */
  defaultValue: string | null;
  /** The position of the column in the primary key, from 1, or 0 */
  primaryKey: number;
}

export interface DbIndexInfo {
  name: string;
  unique: boolean;
  /** "c": CREATE INDEX, "u": a UNIQUE constraint, "pk": the PRIMARY KEY */
  origin: string;
  partial: boolean;
  columns: string[];
}

export interface DbForeignKeyInfo {
  /** The column of this table */
  from: string;
  /** The table that the key refers to */
  table: string;
  /** The column of that table, or null for its primary key */
  to: string | null;
  onUpdate: string;
  onDelete: string;
}

export interface DbSchemaOutput {
  table: string;
  type: "table" | "view";
  sql: string | null;
  columns: DbColumnInfo[];
  indexes: DbIndexInfo[];
  foreignKeys: DbForeignKeyInfo[];
}

export const DbSchemaInputSchema: z.ZodType<DbSchemaInput> = z.object({
  table: z.string().min(1).describe("The table or the view"),
  dbPath,
});

export const DbSchemaOutputSchema: z.ZodType<DbSchemaOutput> = z.looseObject({
  table: z.string().describe("The table or the view"),
  type: z.enum(["table", "view"]).describe("table or view"),
  sql: z.string().nullable().describe("The SQL that made the table or the view"),
  columns: z
    .array(
      z.looseObject({
        name: z.string().describe("The column"),
        type: z.string().describe('The declared type, or ""'),
        notNull: z.boolean().describe("True for NOT NULL"),
        defaultValue: z.string().nullable().describe("The SQL of the default value, or null"),
        primaryKey: z.number().describe("The position of the column in the primary key, from 1, or 0"),
      })
    )
    .describe("The columns, in their order"),
  indexes: z
    .array(
      z.looseObject({
        name: z.string().describe("The index"),
        unique: z.boolean().describe("True for a unique index"),
        origin: z.string().describe('"c": CREATE INDEX, "u": a UNIQUE constraint, "pk": the PRIMARY KEY'),
        partial: z.boolean().describe("True for an index with a WHERE clause"),
        columns: z.array(z.string()).describe("The columns of the index, in order"),
      })
    )
    .describe("The indexes of the table"),
  foreignKeys: z
    .array(
      z.looseObject({
        from: z.string().describe("The column of this table"),
        table: z.string().describe("The table that the key refers to"),
        to: z.string().nullable().describe("The column of that table, or null for its primary key"),
        onUpdate: z.string().describe("The action ON UPDATE"),
        onDelete: z.string().describe("The action ON DELETE"),
      })
    )
    .describe("The foreign keys of the table"),
});

export interface DbStatement {
  /** One SQL statement, or several without params */
  sql: string;
  /** The values of the ? placeholders */
  params?: unknown[] | undefined;
}

export interface DbTransactionInput {
  statements: DbStatement[];
  dbPath?: string | undefined;
}

export interface DbStatementResult {
  /** The rows that the statements changed */
  changes: number;
  /** The rows of a statement that gives rows (SELECT, or RETURNING) */
  rows?: Record<string, unknown>[] | undefined;
}

export interface DbTransactionOutput {
  /** One result for each statement of the input */
  results: DbStatementResult[];
  /** The rows that the transaction changed */
  changes: number;
}

export const DbTransactionInputSchema: z.ZodType<DbTransactionInput> = z.object({
  statements: z
    .array(
      z.object({
        sql: z.string().min(1).describe("One SQL statement, or several without params. BEGIN, COMMIT and ROLLBACK are refused."),
        params: z.array(z.unknown()).optional().describe("The values of the ? placeholders, in order"),
      })
    )
    .min(1)
    .describe("The statements, in order: they all take effect, or none does"),
  dbPath,
});

export const DbTransactionOutputSchema: z.ZodType<DbTransactionOutput> = z.looseObject({
  results: z
    .array(
      z.looseObject({
        changes: z.number().describe("The rows that the statement changed"),
        rows: z.array(z.record(z.string(), z.unknown())).optional().describe("The rows of a statement that gives rows (SELECT, or RETURNING)"),
      })
    )
    .describe("One result for each statement of the input"),
  changes: z.number().describe("The rows that the transaction changed"),
});

export interface DbMigration {
  /** The number of the migration: the migrations run in the order of their numbers */
  version: number;
  /** A name for people */
  name?: string | undefined;
  /** The SQL of the migration (several statements are allowed) */
  sql: string;
}

export interface DbMigrateInput {
  /** A folder of files named <number>_<name>.sql (not with migrations) */
  folder?: string | undefined;
  /** The migrations (not with folder) */
  migrations?: DbMigration[] | undefined;
  /** The table of the applied migrations (default schema_migrations) */
  table?: string | undefined;
  dbPath?: string | undefined;
}

export interface DbMigrateOutput {
  /** The migrations that this call applied, in order */
  applied: Array<{ version: number; name: string }>;
  /** The number of migrations that the database had already */
  skipped: number;
  /** The highest applied version, or 0 */
  version: number;
}

/** The name of a table that the SQL of db.migrate names: letters, digits and underscores. */
export const MIGRATION_TABLE_PATTERN: RegExp = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export const DbMigrateInputSchema: z.ZodType<DbMigrateInput> = z.object({
  folder: z.string().min(1).optional().describe("A folder of files named <number>_<name>.sql, for example 001_create_users.sql (not with migrations)"),
  migrations: z
    .array(
      z.object({
        version: z.number().int().min(1).describe("The number of the migration: the migrations run in the order of their numbers"),
        name: z.string().optional().describe("A name for people"),
        sql: z.string().min(1).describe("The SQL of the migration (several statements are allowed)"),
      })
    )
    .optional()
    .describe("The migrations (not with folder)"),
  table: z
    .string()
    .regex(MIGRATION_TABLE_PATTERN, "letters, digits and underscores, and not a digit first")
    .optional()
    .describe("The table of the applied migrations (default schema_migrations)"),
  dbPath,
});

export const DbMigrateOutputSchema: z.ZodType<DbMigrateOutput> = z.looseObject({
  applied: z
    .array(z.looseObject({ version: z.number().describe("The number"), name: z.string().describe("The name") }))
    .describe("The migrations that this call applied, in order"),
  skipped: z.number().describe("The number of migrations that the database had already"),
  version: z.number().describe("The highest applied version, or 0"),
});

export interface DbBackupInput {
  /** The new file. The procedure does not replace a file. */
  to: string;
  /** Also compact the copy (VACUUM): it leaves out the free pages */
  vacuum?: boolean | undefined;
  dbPath?: string | undefined;
}

export interface DbBackupOutput {
  /** The path of the copy */
  path: string;
  /** The size of the copy, in bytes */
  bytes: number;
}

export const DbBackupInputSchema: z.ZodType<DbBackupInput> = z.object({
  to: z.string().min(1).describe("The new file. The procedure does not replace a file."),
  vacuum: z.boolean().optional().describe("Also compact the copy (VACUUM): it leaves out the free pages"),
  dbPath,
});

export const DbBackupOutputSchema: z.ZodType<DbBackupOutput> = z.looseObject({
  path: z.string().describe("The path of the copy"),
  bytes: z.number().describe("The size of the copy, in bytes"),
});
