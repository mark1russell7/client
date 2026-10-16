# @procedures/sqlite

[![npm](https://img.shields.io/npm/v/@procedures/sqlite?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/sqlite)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

SQLite database operations via client procedures. Execute queries and store structured logs via `client.call()`.

## Overview

`client-sqlite` provides SQLite database access through the client procedure ecosystem, with:
- **Database procedures**: Execute SQL queries and mutations
- **Logging procedures**: Store and query structured application logs
- **Migration support**: Schema versioning and migration utilities
- **Default log database**: Pre-configured logging at `~/logs/cli/cli.db`
- **A collection storage**: `SqliteStorage` keeps a collection in a SQLite table, with a change log

The package has 4 procedures. Its register entry (`import "@procedures/sqlite/register"`) registers them:
- **Database**: `db.query`, `db.execute`
- **Logs**: `logs.store`, `logs.query`

## Architecture

```mermaid
graph TB
    subgraph "Client Ecosystem"
        Client["@procedures/client"]
        Registry["Procedure Registry"]
    end

    subgraph "client-sqlite Package"
        Register["register.ts<br/>(Auto-registers procedures)"]

        subgraph "Procedure Categories"
            DB["Database Procedures<br/>db.query, db.execute"]
            Logs["Log Procedures<br/>logs.store, logs.query"]
        end

        Migrations["Log Table Migrations<br/>(Auto-created on first use)"]
        Types["types.ts<br/>(Type Definitions)"]
    end

    subgraph "docker-sqlite Layer"
        DockerSqlite["@mark1russell7/docker-sqlite"]
        Utilities["withConnection<br/>query, execute<br/>runMigrations"]
    end

    subgraph "SQLite Engine"
        SqlJs["sql.js<br/>(SQLite WASM)"]
    end

    subgraph "Storage"
        LogDB["~/logs/cli/cli.db<br/>(Default log database)"]
        CustomDB["Custom databases<br/>(via dbPath parameter)"]
    end

    Register --> Client
    Register --> Registry

    DB --> DockerSqlite
    Logs --> DockerSqlite
    Logs --> Migrations

    DockerSqlite --> Utilities
    Utilities --> SqlJs

    SqlJs --> LogDB
    SqlJs --> CustomDB

    Types -.-> DB
    Types -.-> Logs

    style Register fill:#e1f5ff
    style Migrations fill:#fff4e1
    style Types fill:#f0f0f0
```

### Package Dependency Flow

```mermaid
graph LR
    App["Your Application"]
    ClientSqlite["@procedures/sqlite"]
    Client["@procedures/client"]
    DockerSqlite["@mark1russell7/docker-sqlite"]
    SqlJs["sql.js"]

    App --> ClientSqlite
    ClientSqlite --> Client
    ClientSqlite --> DockerSqlite
    DockerSqlite --> SqlJs

    App -.client.call.-> Client
    Client -.executes.-> ClientSqlite
    ClientSqlite -.queries.-> DockerSqlite
    DockerSqlite -.uses.-> SqlJs
```

### Log Storage Flow

```mermaid
sequenceDiagram
    participant App
    participant LogsStore
    participant DockerSqlite
    participant Migration
    participant SQLite

    App->>LogsStore: logs.store({ level, message, ... })
    LogsStore->>Migration: ensureLogsTable()
    Migration->>DockerSqlite: withConnection()
    DockerSqlite->>SQLite: Open ~/logs/cli/cli.db
    Migration->>DockerSqlite: runMigrations()
    DockerSqlite->>SQLite: CREATE TABLE IF NOT EXISTS logs
    LogsStore->>DockerSqlite: execute(INSERT INTO logs ...)
    DockerSqlite->>SQLite: INSERT
    SQLite-->>DockerSqlite: lastInsertRowId
    DockerSqlite-->>LogsStore: { id }
    LogsStore-->>App: { id: 123 }
```

## Installation

```bash
npm install @procedures/sqlite
```

Since 0.2.0, an import of the package registers nothing. To register its procedures in the global registry:

```ts
import "@procedures/sqlite/register";
```

## Configuration

### Default Database Path

The package uses a default database path for CLI logs:

```typescript
// Default: ~/logs/cli/cli.db
const DEFAULT_DB_PATH = join(homedir(), "logs", "cli", "cli.db");
```

You can override this path in each procedure call:

```typescript
await client.exec(
  ["db", "query"],
  {
    sql: "SELECT * FROM logs",
    dbPath: "./custom/path/database.db"
  }
);
```

## API Reference

### Database Procedures

#### `db.query`

Execute a SQL SELECT query and return rows.

```typescript
const result = await client.exec(
  ["db", "query"],
  {
    sql: "SELECT * FROM logs WHERE level = ? ORDER BY timestamp DESC",
    params: ["error"]
  }
);

console.log(result.rows);
console.log(result.columns);
```

**Input:**
```typescript
interface DbQueryInput {
  sql: string;              // SQL SELECT query
  params?: unknown[];       // Query parameters (uses ? placeholders)
  dbPath?: string;          // Database path (default: ~/logs/cli/cli.db)
}
```

**Output:**
```typescript
interface DbQueryOutput<T = Record<string, unknown>> {
  columns: string[];        // Column names
  rows: T[];                // Query results
}
```

**Example:**
```typescript
const result = await client.exec(
  ["db", "query"],
  {
    sql: `
      SELECT level, COUNT(*) as count
      FROM logs
      WHERE session_id = ?
      GROUP BY level
    `,
    params: ["session-123"]
  }
);

// result.rows = [{ level: "info", count: 45 }, { level: "error", count: 2 }]
```

#### `db.execute`

Execute a SQL statement (INSERT, UPDATE, DELETE) and return the number of affected rows.

```typescript
const result = await client.exec(
  ["db", "execute"],
  {
    sql: "DELETE FROM logs WHERE timestamp < ?",
    params: ["2024-01-01"]
  }
);

console.log(`Deleted ${result.changes} rows`);
```

**Input:**
```typescript
interface DbExecuteInput {
  sql: string;              // SQL statement (INSERT, UPDATE, DELETE, etc.)
  params?: unknown[];       // Statement parameters
  dbPath?: string;          // Database path (default: ~/logs/cli/cli.db)
}
```

**Output:**
```typescript
interface DbExecuteOutput {
  changes: number;          // Number of rows affected
}
```

**Examples:**
```typescript
// INSERT
await client.exec(
  ["db", "execute"],
  {
    sql: "INSERT INTO users (name, email) VALUES (?, ?)",
    params: ["Alice", "alice@example.com"]
  }
);

// UPDATE
await client.exec(
  ["db", "execute"],
  {
    sql: "UPDATE users SET active = ? WHERE id = ?",
    params: [true, 123]
  }
);

// DELETE
await client.exec(
  ["db", "execute"],
  {
    sql: "DELETE FROM users WHERE active = ?",
    params: [false]
  }
);
```

### Log Procedures

#### `logs.store`

Store a structured log entry in the database. Automatically creates the logs table on first use.

```typescript
await client.exec(
  ["logs", "store"],
  {
    level: "error",
    message: "Failed to connect to database",
    sessionId: "session-123",
    command: "db.connect",
    context: "user-service",
    data: {
      host: "localhost",
      port: 5432
    },
    errorStack: new Error().stack
  }
);
```

**Input:**
```typescript
interface LogsStoreInput {
  level: LogLevel;                    // Log level
  message: string;                    // Log message
  sessionId?: string;                 // Session ID for grouping logs
  command?: string;                   // Command that generated this log
  context?: string;                   // Additional context (e.g., package name)
  data?: Record<string, unknown>;     // Structured data (stored as JSON)
  errorStack?: string;                // Error stack trace
  dbPath?: string;                    // Database path (default: ~/logs/cli/cli.db)
}

type LogLevel = "trace" | "debug" | "info" | "warn" | "error";
```

**Output:**
```typescript
interface LogsStoreOutput {
  id: number;               // ID of the inserted log row
}
```

**Log Table Schema:**
```sql
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  level TEXT NOT NULL CHECK (level IN ('trace', 'debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL,
  data TEXT,                    -- JSON string
  session_id TEXT,
  command TEXT,
  context TEXT,
  error_stack TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for fast queries
CREATE INDEX idx_logs_session ON logs(session_id);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_command ON logs(command);
```

#### `logs.query`

Query log entries with filtering, pagination, and sorting.

```typescript
const result = await client.exec(
  ["logs", "query"],
  {
    sessionId: "session-123",
    level: ["error", "warn"],
    limit: 100,
    orderBy: "desc"
  }
);

console.log(result.logs);
```

**Input:**
```typescript
interface LogsQueryInput {
  sessionId?: string;           // Filter by session ID
  command?: string;             // Filter by command
  level?: LogLevel | LogLevel[]; // Filter by log level(s)
  limit?: number;               // Maximum number of logs to return
  offset?: number;              // Offset for pagination
  orderBy?: "asc" | "desc";     // Order by timestamp (default: desc)
  dbPath?: string;              // Database path (default: ~/logs/cli/cli.db)
}
```

**Output:**
```typescript
interface LogsQueryOutput {
  logs: LogEntry[];
  total?: number;               // Total count (if limit was applied)
}

interface LogEntry {
  id: number;
  timestamp: string;            // ISO timestamp
  level: LogLevel;
  message: string;
  data: Record<string, unknown> | null;
  sessionId: string | null;
  command: string | null;
  context: string | null;
  errorStack: string | null;
}
```

**Examples:**
```typescript
// Get all errors from a session
const { logs } = await client.exec(
  ["logs", "query"],
  {
    sessionId: "session-123",
    level: "error"
  }
);

// Get recent warnings and errors
const { logs } = await client.exec(
  ["logs", "query"],
  {
    level: ["warn", "error"],
    limit: 50,
    orderBy: "desc"
  }
);

// Paginated query
const { logs } = await client.exec(
  ["logs", "query"],
  {
    command: "lib.build",
    limit: 20,
    offset: 40  // Page 3 (0-indexed)
  }
);
```

## The collection storage

`SqliteStorage` keeps the items of one collection in one table of a SQLite database. It implements `CollectionStorage` of `@procedures/client`. A `ProcedureServer`, an `ApiStorage` server and a `HybridStorage` use it as they use `InMemoryStorage`.

```ts
import { SqliteStorage } from "@procedures/sqlite/storage";

const users = new SqliteStorage<User>({ path: "./data/app.db", table: "users" });
await users.set("u1", { name: "Ada" });
await users.setBatch([["u2", { name: "Bob" }], ["u3", { name: "Cy" }]]);
const changes = await users.getChangesSince(); // { version, full: true, changed, deleted: [] }
await users.close();
```

The entry `@procedures/sqlite/storage` has the storage alone. The package root exports it too.

### The table and the values

- The option `path` is a database file, or `:memory:` for a database that lives as long as the storage.
- The option `table` is the name of the table. It starts with a letter, and it has only letters, digits and underscores. The prefix `sqlite_` is not permitted.
- The table has the columns `id` and `value`. The value is the JSON text of the item.
- A value without JSON text, for example `undefined` or a `BigInt`, is a `TypeError`. The storage writes nothing then.
- A read gives a new copy of the item.
- The order of the items is the order of the first write of each id, as in a `Map`.

### The change log and the versions

- `getChangesSince(version)` gives the items that changed and the ids that were deleted after a version. `HybridStorage` uses it for a delta sync.
- A version is `<epoch>:<seq>`, as in `InMemoryStorage`. The table `_storage_versions` keeps the epoch, so a version stays valid after a restart.
- The table `_storage_log` keeps the last change of each id. The option `maxTombstones` (10000 by default) limits the deletes that it keeps.
- A version that is older than the dropped deletes gives all items (`full: true`).
- Write the table only through the storage. A change from other SQL is not in the change log.

### The transactions and the file

- Each write runs in a transaction with the change log. A batch that fails changes nothing.
- The storage keeps the database in memory, and it writes the file after each write. The write ends after the file write.
- When several writes wait, one file write holds their changes.
- A failed file write fails the write. The change stays in memory, and `flush()` or the next write writes it.
- A storage that only reads does not make the file.
- The storages of one file in one process share one database. Thus the storages of two tables in one file keep their items.
- Another process, and the procedures `db.query` and `db.execute`, do not share this database. Do not write the file from them while a storage has it open.

### The durable local copy of `HybridStorage`

`HybridStorage` of `@procedures/store` takes the storage of its local copy in the option `local`. With a `SqliteStorage`, the local copy stays after a restart. A new storage in `local-only` mode then reads the items of the last run, without the remote.

```ts
import { HybridStorage } from "@procedures/store";
import { FileQueueStore } from "@procedures/store/file-queue";
import { SqliteStorage } from "@procedures/sqlite/storage";

const users = new HybridStorage(remote, {
  mode: "write-back",
  local: new SqliteStorage({ path: "./users.db", table: "users" }),
  queueStore: new FileQueueStore("./users.queue.jsonl"),
});
```

## Usage Examples

### Basic Database Operations

```typescript
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@procedures/client";
import "@procedures/sqlite/register"; // registers its procedures

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

// Create a table
await client.exec(
  ["db", "execute"],
  {
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        active BOOLEAN DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `,
    dbPath: "./app.db"
  }
);

// Insert data
await client.exec(
  ["db", "execute"],
  {
    sql: "INSERT INTO users (name, email) VALUES (?, ?)",
    params: ["Alice Johnson", "alice@example.com"],
    dbPath: "./app.db"
  }
);

// Query data
const result = await client.exec(
  ["db", "query"],
  {
    sql: "SELECT * FROM users WHERE active = ? ORDER BY created_at DESC",
    params: [1],
    dbPath: "./app.db"
  }
);

console.log(result.rows);
```

### Structured Logging

```typescript
// Log an info message
await client.exec(
  ["logs", "store"],
  {
    level: "info",
    message: "Starting build process",
    sessionId: "build-2024-03-15",
    command: "lib.build",
    context: "@myorg/package-name"
  }
);

// Log an error with stack trace
try {
  // Some operation
  throw new Error("Connection timeout");
} catch (error) {
  await client.exec(
    ["logs", "store"],
    {
      level: "error",
      message: error.message,
      sessionId: "build-2024-03-15",
      command: "lib.build",
      context: "@myorg/package-name",
      data: {
        host: "api.example.com",
        timeout: 5000
      },
      errorStack: error.stack
    }
  );
}

// Query logs by session
const { logs } = await client.exec(
  ["logs", "query"],
  {
    sessionId: "build-2024-03-15",
    orderBy: "asc"
  }
);

logs.forEach(log => {
  console.log(`[${log.level}] ${log.message}`);
  if (log.data) {
    console.log("  Data:", log.data);
  }
});
```

### Direct Database Access (Without RPC)

For lower-level access, use re-exported utilities from `docker-sqlite`:

```typescript
import {
  withConnection,
  query,
  execute,
  lastInsertRowId,
  runMigrations,
  createMigration
} from "@procedures/sqlite";

// Managed connection with automatic cleanup
await withConnection({ dbPath: "./data/app.db" }, (db) => {
  // Execute mutations
  execute(db, "INSERT INTO users (name, email) VALUES (?, ?)", [
    "Bob Smith",
    "bob@example.com"
  ]);

  const userId = lastInsertRowId(db);
  console.log("Inserted user ID:", userId);

  // Query data
  const result = query<{ id: number; name: string; email: string }>(
    db,
    "SELECT * FROM users WHERE id = ?",
    [userId]
  );

  console.log(result.rows);
});

// Connection is automatically closed after callback
```

### Database Migrations

```typescript
import {
  withConnection,
  runMigrations,
  getMigrationStatus,
  rollbackMigration,
  type Migration
} from "@procedures/sqlite";

const migrations: Migration[] = [
  {
    version: 1,
    description: "Create users table",
    up: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_users_email ON users(email);
    `,
    down: "DROP TABLE users;"
  },
  {
    version: 2,
    description: "Add users.active column",
    up: "ALTER TABLE users ADD COLUMN active BOOLEAN DEFAULT 1;",
    down: "ALTER TABLE users DROP COLUMN active;"
  }
];

await withConnection({ dbPath: "./app.db" }, (db) => {
  // Run migrations
  runMigrations(db, migrations);

  // Check migration status
  const status = getMigrationStatus(db);
  console.log("Current version:", status.currentVersion);
  console.log("Applied migrations:", status.appliedMigrations);

  // Rollback last migration if needed
  // rollbackMigration(db, migrations);
});
```

### Type-Safe Queries

```typescript
// Define result types for type safety
interface User {
  id: number;
  name: string;
  email: string;
  active: boolean;
  created_at: string;
}

const result = await client.call<DbQueryOutput<User>>(
  ["db", "query"],
  {
    sql: "SELECT * FROM users WHERE active = ?",
    params: [true],
    dbPath: "./app.db"
  }
);

// result.rows is typed as User[]
result.rows.forEach(user => {
  console.log(`${user.name} <${user.email}>`);
});
```

## Integration with Ecosystem

### Bundle Packages

`client-sqlite` can be included in bundle packages:

```typescript
// In bundle-data/src/register.ts
import "@procedures/sqlite/register"; // registers its procedures
import "@procedures/mongo/register"; // registers its procedures
import "@procedures/s3/register.js";
```

## Dependencies

### Runtime Dependencies

- **@procedures/client** - Core client procedure system
- **@mark1russell7/docker-sqlite** - SQLite connection and query utilities

### Development Dependencies

- **@mark1russell7/cue** - Configuration and type utilities
- **typescript** (^5.9.3) - TypeScript compiler
- **@types/node** (^22.0.0) - Node.js type definitions

## Re-exported docker-sqlite Utilities

`client-sqlite` re-exports all utilities from `docker-sqlite` for direct use:

```typescript
// Connection management
export { withConnection, createConnection } from "@mark1russell7/docker-sqlite";

// Query execution
export { query, execute, execMultiple, lastInsertRowId } from "@mark1russell7/docker-sqlite";

// Table utilities
export { tableExists } from "@mark1russell7/docker-sqlite";

// Migration utilities
export {
  getMigrationStatus,
  runMigrations,
  rollbackMigration,
  createMigration
} from "@mark1russell7/docker-sqlite";

// Types
export type {
  ConnectionConfig,
  ConnectionCallback,
  QueryResult,
  ExecuteResult,
  Migration,
  MigrationStatus,
  Database
} from "@mark1russell7/docker-sqlite";
```

## Package Structure

```
client-sqlite/
├── src/
│   ├── types.ts              # Type definitions
│   ├── module.ts             # The procedures as data
│   ├── register.ts           # The ./register entry: it registers the procedures
│   ├── storage.ts            # SqliteStorage, the collection storage (the ./storage entry)
│   └── index.ts              # Main entry point
├── dist/                     # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Build

```bash
npm run build
```

### Type Check

```bash
npm run typecheck
```

### Clean

```bash
npm run clean
```

## License

MIT

## Author

Mark Russell <marktheprogrammer17@gmail.com>
