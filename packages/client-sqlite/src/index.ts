/**
 * client-sqlite
 *
 * SQLite database operations via client procedures.
 * Enables database queries and logging via client.call().
 *
 * @example
 * ```typescript
 * import { Client } from "client";
 *
 * const client = new Client(...);
 *
 * // Execute a query (sqlite.query: version 0.6.0 removed the old name db.query)
 * const result = await client.call(["sqlite", "query"], {
 *   sql: "SELECT * FROM logs WHERE level = ?",
 *   params: ["error"]
 * });
 * console.log(result.rows);
 *
 * // Store a log entry
 * await client.call(["logs", "store"], {
 *   level: "info",
 *   message: "Task completed",
 *   sessionId: "20241215-143052-a7b3",
 *   command: "lib.refresh"
 * });
 *
 * // Query logs
 * const { logs } = await client.call(["logs", "query"], {
 *   sessionId: "20241215-143052-a7b3",
 *   level: ["error", "warn"],
 *   limit: 100
 * });
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  DbQueryInput,
  DbQueryOutput,
  DbExecuteInput,
  DbExecuteOutput,
  LogsStoreInput,
  LogsStoreOutput,
  LogsQueryInput,
  LogsQueryOutput,
  LogEntry,
  LogLevel,
  DbTablesInput,
  DbTablesOutput,
  DbTableInfo,
  DbSchemaInput,
  DbSchemaOutput,
  DbColumnInfo,
  DbIndexInfo,
  DbForeignKeyInfo,
  DbStatement,
  DbStatementResult,
  DbTransactionInput,
  DbTransactionOutput,
  DbMigration,
  DbMigrateInput,
  DbMigrateOutput,
  DbBackupInput,
  DbBackupOutput,
} from "./types.js";

export { DEFAULT_DB_PATH, LOG_LEVELS } from "./types.js";

// The sqlite.* procedures of roadmap R44, for direct use
export { dbTables, dbSchema, dbTransaction, dbMigrate, dbBackup } from "./procedures/db/index.js";

// =============================================================================
// Registration
// =============================================================================

export { registerSqliteProcedures } from "./module.js";

// =============================================================================
// The collection storage (roadmap R45). The entry @procedures/sqlite/storage has it alone.
// =============================================================================

export {
  SqliteStorage,
  checkTableName,
  isNodeSqliteAvailable,
  MEMORY_PATH,
  type SqliteEngine,
  type SqliteEngineName,
  type SqliteStorageOptions,
} from "./storage.js";

// =============================================================================
// Re-export docker-sqlite utilities for direct use
// =============================================================================

export {
  withConnection,
  createConnection,
  query,
  execute,
  execMultiple,
  lastInsertRowId,
  tableExists,
  getMigrationStatus,
  runMigrations,
  rollbackMigration,
  createMigration,
} from "@mark1russell7/docker-sqlite";

export type {
  ConnectionConfig,
  ConnectionCallback,
  QueryResult,
  ExecuteResult,
  Migration,
  MigrationStatus,
  Database,
} from "@mark1russell7/docker-sqlite";
