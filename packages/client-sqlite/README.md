# @procedures/sqlite

[![npm](https://img.shields.io/npm/v/@procedures/sqlite?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/sqlite)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.13+-green.svg)](https://nodejs.org/)

SQLite database operations via client procedures. Execute queries and store structured logs via `client.call()`.

## Overview

`client-sqlite` provides SQLite database access through the client procedure ecosystem, with:
- **Database procedures**: Execute SQL queries and mutations
- **Logging procedures**: Store and query structured application logs
- **Migration support**: Schema versioning and migration utilities
- **Default log database**: Pre-configured logging at `~/logs/cli/cli.db`
- **A collection storage**: `SqliteStorage` keeps a collection in a SQLite table, with a change log

The package has 18 procedures. Its register entry (`import "@procedures/sqlite/register"`) registers them:
- **Database**: `sqlite.query`, `sqlite.execute`, `sqlite.tables`, `sqlite.schema`, `sqlite.transaction`, `sqlite.migrate`, `sqlite.backup`
- **Logs**: `logs.store`, `logs.query`
- **Generated**: one procedure for each of 9 functions of `@mark1russell7/sqlite`, on database handles. The section [The generated procedures](#the-generated-procedures) gives them.

The register entry also registers `handle.list` and `handle.close` of `@procedures/client`.

### The old names `db.*`

In version 0.3.0 and before, the database procedures had the namespace `db`. The general name `db` did not tell the database. Since version 0.4.0, the namespace is `sqlite`.

Version 0.4.0 kept the old names for one release as deprecated aliases. Version 0.6.0 removed them: `db.query`, `db.execute`, `db.tables`, `db.schema`, `db.transaction`, `db.migrate` and `db.backup` give `NOT_FOUND`. Use the `sqlite.*` names.

The tools of the MCP server (`bundle-mcp`) are `sqlite.query`, `sqlite.execute`, `sqlite.tables` and `sqlite.schema`. The `logs.*` procedures keep their names.

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
            DB["Database Procedures<br/>sqlite.query, sqlite.execute, sqlite.tables, sqlite.schema,<br/>sqlite.transaction, sqlite.migrate, sqlite.backup"]
            Logs["Log Procedures<br/>logs.store, logs.query"]
        end

        Migrations["Log Table Migrations<br/>(Auto-created on first use)"]
        Storage["SqliteStorage<br/>(collection storage)"]
        Types["types.ts<br/>(Type Definitions)"]
    end

    subgraph "The engine: @mark1russell7/sqlite"
        Home["openDatabase, transaction<br/>migrate, snapshot"]
    end

    subgraph "SQLite"
        NodeSqlite["node:sqlite<br/>(Node.js 22.13 or later)"]
    end

    subgraph "Files"
        LogDB["~/logs/cli/cli.db<br/>(Default log database)"]
        CustomDB["Custom databases<br/>(via dbPath parameter)"]
    end

    Register --> Client
    Register --> Registry

    DB --> Home
    Logs --> Home
    Logs --> Migrations
    Storage --> Home

    Home --> NodeSqlite

    NodeSqlite --> LogDB
    NodeSqlite --> CustomDB

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
    Home["@mark1russell7/sqlite"]
    NodeSqlite["node:sqlite"]

    App --> ClientSqlite
    ClientSqlite --> Client
    ClientSqlite --> Home
    Home --> NodeSqlite

    App -.client.call.-> Client
    Client -.executes.-> ClientSqlite
    ClientSqlite -.opens the file.-> Home
    Home -.uses.-> NodeSqlite
```

### Log Storage Flow

```mermaid
sequenceDiagram
    participant App
    participant LogsStore
    participant Home as @mark1russell7/sqlite
    participant SQLite as node:sqlite

    App->>LogsStore: logs.store({ level, message, ... })
    LogsStore->>Home: openDatabase(~/logs/cli/cli.db)
    Home->>SQLite: Open the file, set the busy timeout
    LogsStore->>Home: transaction()
    Home->>SQLite: BEGIN IMMEDIATE
    LogsStore->>SQLite: CREATE TABLE IF NOT EXISTS logs (version 1 in _migrations)
    LogsStore->>SQLite: INSERT INTO logs
    SQLite-->>LogsStore: lastInsertRowid
    Home->>SQLite: COMMIT
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

### The Node.js versions

The package needs Node.js 22.13 or later. Each procedure opens the file through the engine of `@mark1russell7/sqlite`, on `node:sqlite`.

`sqlite.query`, `sqlite.execute`, `sqlite.transaction` and `sqlite.migrate` need Node.js 24.10 or later: they refuse with `CONFINE_UNAVAILABLE` before it. They refuse before they open or make the file. The other procedures and `SqliteStorage` work on Node.js 22.13 or later.

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
  ["sqlite", "query"],
  {
    sql: "SELECT * FROM logs",
    dbPath: "./custom/path/database.db"
  }
);
```

## API Reference

### Database Procedures

#### `sqlite.query`

Execute a SQL SELECT query and return rows.

```typescript
const result = await client.exec(
  ["sqlite", "query"],
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

- The procedure runs only the first statement of `sql`.
- The procedure only reads. A missing file reads as an empty database, and the procedure does not make it.

**Example:**
```typescript
const result = await client.exec(
  ["sqlite", "query"],
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

#### `sqlite.execute`

Execute a SQL statement (INSERT, UPDATE, DELETE) and return the number of affected rows.

```typescript
const result = await client.exec(
  ["sqlite", "execute"],
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

- One statement runs alone. `changes` is the number of rows that it changed. A change of the schema gives `0`.
- A script of several statements runs in one transaction: all its statements take effect, or none does. `changes` is the total of the script.
- A script that starts with `BEGIN`, `SAVEPOINT` or another statement that controls a transaction runs as written. After an error, the procedure rolls back the open transaction.
- In a script that does not start with such a statement, a later one is refused. `VACUUM` cannot run in a transaction, so send it alone.
- SQL that leaves a transaction open fails, also `BEGIN` alone. The procedure rolls the transaction back, so the file keeps none of its changes. End each transaction with `COMMIT` or `ROLLBACK`.
- `params` bind to one statement. A script with `params` is refused.
- The procedure makes a missing file.

**Examples:**
```typescript
// INSERT
await client.exec(
  ["sqlite", "execute"],
  {
    sql: "INSERT INTO users (name, email) VALUES (?, ?)",
    params: ["Alice", "alice@example.com"]
  }
);

// UPDATE
await client.exec(
  ["sqlite", "execute"],
  {
    sql: "UPDATE users SET active = ? WHERE id = ?",
    params: [true, 123]
  }
);

// DELETE
await client.exec(
  ["sqlite", "execute"],
  {
    sql: "DELETE FROM users WHERE active = ?",
    params: [false]
  }
);
```

#### `sqlite.tables`

The procedure lists the tables and the views of a database, without the internal `sqlite_` tables. Each item has the `name`, the `type` and the `sql` that made it. With `views: false`, it gives only the tables. The procedure only reads. A missing file is an error (`ENOENT`), and the procedure does not make it.

```typescript
const { tables } = await client.exec(["sqlite", "tables"], { dbPath: "./app.db" });
```

#### `sqlite.schema`

The procedure gives the `columns`, the `indexes` and the `foreignKeys` of a table, or the columns of a view. The name of the table goes to SQLite as a bound value, not as SQL text. The procedure only reads.

```typescript
const schema = await client.exec(["sqlite", "schema"], { dbPath: "./app.db", table: "users" });
// schema.columns: [{ name: "id", type: "INTEGER", notNull: false, defaultValue: null, primaryKey: 1 }, ...]
```

#### `sqlite.transaction`

The procedure puts a list of statements in one transaction. When one statement fails, it rolls back the transaction, and the file stays as it was. The `params` of a statement bind to one statement. Without `params`, one `sql` can hold several statements. A statement that gives rows (`SELECT`, or `RETURNING`) gives its `rows` in its result. The procedure refuses `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT` and `RELEASE`, because it controls the transaction itself.

```typescript
const { results, changes } = await client.exec(["sqlite", "transaction"], {
  dbPath: "./app.db",
  statements: [
    { sql: "UPDATE accounts SET balance = balance - ? WHERE id = ?", params: [10, 1] },
    { sql: "UPDATE accounts SET balance = balance + ? WHERE id = ?", params: [10, 2] },
    { sql: "SELECT id, balance FROM accounts" },
  ],
});
```

#### `sqlite.migrate`

The procedure applies the numbered migrations that the database does not have, in the order of their numbers. The migrations come from a `folder` or from a list (`migrations`). In a folder, each migration is a file `<number>_<name>.sql`, for example `001_create_users.sql`. The procedure ignores the files that do not end in `.sql`.

- The table `schema_migrations` (or the `table` of the input) records each applied migration and the sha256 of its SQL.
- The pending migrations are in one transaction. When one fails, the procedure applies none of them.
- A second call applies nothing, and does not write the file.
- When the SQL of an applied migration changes, the procedure refuses the call. The sha256 reads CRLF line ends as LF.
- A migration must not hold `BEGIN`, `COMMIT` or `ROLLBACK`.

```typescript
const { applied, skipped, version } = await client.exec(["sqlite", "migrate"], {
  dbPath: "./app.db",
  folder: "./migrations",
});
```

#### `sqlite.backup`

The procedure copies a database to a new file (`to`). It does not replace a file, and it does not write the source. A missing source is an error (`ENOENT`).

The procedure writes a snapshot of the database (`snapshot` of `@mark1russell7/sqlite`) to a temporary file next to the target. It checks the copy with `PRAGMA integrity_check`, and then it renames the copy. The copy has the changes in the WAL file of the source, and it is always compact.

The option `vacuum` is deprecated and has no effect. A later minor version removes it.

```typescript
const { path, bytes } = await client.exec(["sqlite", "backup"], { dbPath: "./app.db", to: "./backups/app-2026-10-16.db" });
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

## The generated procedures

The package has a procedure for each function of `@mark1russell7/sqlite` with JSON inputs and a JSON output. These are 9 of the 26 functions. The generator of `@procedures/compiler` makes them from the types of the library. Thus a procedure cannot drift from its function.

- `sqlite.openDatabase` opens a database and gives a handle, for example `{ "handle": "h_..." }`. The handle is in the scope of the caller.
- The other 8 procedures take the handle in the input `db`: `sqlite.userVersion`, `sqlite.schemaVersion`, `sqlite.tableColumns`, `sqlite.addMissingColumns`, `sqlite.checkIntegrity`, `sqlite.checkpoint`, `sqlite.snapshot` and `sqlite.clearDatabase`.
- `handle.list` gives the open handles of the caller. `handle.close` closes a handle and its database. The end of the scope closes each database that is open.
- The procedures refuse the handle of a different caller.
- Under the root of a host, a relative `path` starts at the root. The host refuses a path outside the root. `:memory:` is not a path.
- The first call loads `@mark1russell7/sqlite`, as the other procedures do.

`sqliteManifest` gives the names, the schemas and the effects of each procedure. The MCP server of `@procedures/bundle-mcp` shows seven of them as tools. `sqlite.clearDatabase` and `sqlite.snapshot` are not tools, because they destroy data. Each MCP session has its own handles, and the end of the session closes them.

```ts
import { createRegistry, HandleScope, invokePath, outputValue } from "@procedures/client";
import { sqliteModule } from "@procedures/sqlite";

const registry = createRegistry(sqliteModule);
const handles = new HandleScope();
const db = await outputValue(await invokePath(["sqlite", "openDatabase"], { path: "./app.db" }, { registry, handles }));
const columns = await outputValue(await invokePath(["sqlite", "tableColumns"], { db, table: "logs" }, { registry, handles }));
await handles.end(); // This closes the database.
```

### The functions with no procedure

16 functions have no procedure. The manifest gives the reason for each function:

- A parameter is a function, for example the migrations of `migrate` and the callback of `transaction`. A JSON input cannot give a function.
- An input is not JSON, for example a `Date` of `quarantine` or a connection of a different engine (`sqlJsConnection`, `wasmConnection`).
- The output is not JSON, for example the `Error` of `sqliteFault`.

The procedures `sqlite.transaction` and `sqlite.migrate` above do the work of two of these functions.

### Update the manifest

After an update of `@mark1russell7/sqlite`, start this command from the root of the repository:

```bash
node scripts/wraps.ts generate --package client-sqlite
```

The command writes `src/manifest.ts` from the types of the library and the overlay in `wrap.json`. The overlay gives the effects of each function and its rules under a root. CI starts `node scripts/wraps.ts check`. The check fails when the manifest is not current.

## The collection storage

`SqliteStorage` keeps the items of one collection in one table of a SQLite database. It implements `CollectionStorage` of `@procedures/client`. A `ProcedureServer`, an `ApiStorage` server and a `HybridStorage` use it as they use `InMemoryStorage`.

```ts
import { SqliteStorage } from "@procedures/sqlite/storage";

const users = new SqliteStorage<User>({ path: "./data/app.db", table: "users" });
await users.set("u1", { name: "Ada" });
await users.setBatch([["u2", { name: "Bob" }], ["u3", { name: "Cy" }]]);
const changes = await users.getChangesSince(); // { version, full: true, changed, deleted: [] }
await users.getEngine(); // "node"
await users.close();
```

The entry `@procedures/sqlite/storage` has the storage alone. The package root exports it too.

### The engine

The storage uses `node:sqlite` of Node.js, through the engine of `@mark1russell7/sqlite`. SQLite writes only the changed pages, and the file is in WAL mode. The option `engine` takes `auto` (the default) or `node`. Both select `node:sqlite`.

Version 0.61.0 removed the engine `sqljs` (sql.js, SQLite in WebAssembly). The option `engine: "sqljs"` is a `TypeError`. A file of the engine `sqljs` opens with the engine `node`, with its items and its versions.

- Node.js 22.13 and later have `node:sqlite` without a flag.
- Node.js 22 shows the warning `ExperimentalWarning: SQLite is an experimental feature` at the first open. Node.js 24 and 26 do not show it.
- Node.js 26.11 renamed the class `DatabaseSync` to `Database`. The storage uses `Database` when the module has it, and else `DatabaseSync`.
- When the import of `node:sqlite` fails, the open fails, and each operation gives the error.
- `getEngine()` gives the engine of the storage. `getMetadata()` gives it in `stats.engine`. `isNodeSqliteAvailable()` tells if this Node.js has `node:sqlite`.

<!-- measured
The nightly benchmarks (`bench/storage.bench.ts`) measure the storage in a file. These are the median times of [the nightly run of {run.date}]({run.url}), on the code of commit `{run.commit}` (`@procedures/sqlite` {engine:@procedures/sqlite}), with Node.js 26 on Linux. The site takes them from the newest nightly run, and its build fails when they are more than {run.limit} days old:

| The benchmark | The time |
|---|---|
| 1,000 calls of `set()`, one after the other, in a table of 1,000 items | {nightly.sqlite-node-file-write-1000} |
| One `getAll()` of a table of 10,000 items | {nightly.sqlite-node-file-read-10000} |
-->
The nightly benchmarks (`bench/storage.bench.ts`) measure the storage in a file. [The page of this package on the site](https://mark1russell7.github.io/client/docs/packages/client-sqlite/) shows the times of the newest nightly run, with its date and its commit.
<!-- /measured -->

### The table and the values

- The option `path` is a database file, or `:memory:` for a database that lives as long as the storage.
- The option `table` is the name of the table. It starts with a letter, and it has only letters, digits and underscores. The prefix `sqlite_` is not permitted.
- The table has the columns `id` and `value`. The value is the JSON text of the item.
- A value without JSON text, for example `undefined` or a `BigInt`, is a `TypeError`. The storage writes nothing then.
- A read gives a new copy of the item.
- `getIds()` gives the ids in the order of the items, and it does not read the values. A full sync of `HybridStorage` uses it.
- The order of the items is the order of the first write of each id, as in a `Map`.
- `query(selector, { sort, skip, limit })` runs a JSON selector of `@procedures/client/query` on the rows of one read. The procedure `collections.<name>.find` uses it. The option `queryPolicy` limits the calls without a policy, and the default policy does not permit `$regex`.
- `patch(id, fields)` changes the item in one transaction: a JSON Merge Patch, or the operations `$set` and `$unset`. Two processes that patch one item at the same time keep the fields of each.

### The change log and the versions

- `getChangesSince(version)` gives the items that changed and the ids that were deleted after a version. `HybridStorage` uses it for a delta sync.
- A version is `<epoch>:<seq>`, as in `InMemoryStorage`. The table `_storage_versions` keeps the epoch, so a version stays valid after a restart.
- The table `_storage_log` keeps the last change of each id. The option `maxTombstones` (10000 by default) limits the deletes that it keeps.
- A version that is older than the dropped deletes gives all items (`full: true`).
- A delta follows the order of the last change of each id, as in each other storage. A full result follows the order of the items.
- Write the table only through the storage. A change from other SQL is not in the change log.

### The transactions and the file

- Each write runs in a transaction with the change log. A batch that fails changes nothing.
- A write ends after its change is in the file.
- A storage that only reads does not make the file. The storage makes the file, and its folder, at the first write that changes an item.
- `close()` releases the database. After it, each operation rejects, also `flush()` and an empty batch. A second `close()` does nothing.
- The storages of one file in one process share one database. Thus the storages of two tables in one file keep their items.
- The commit of a transaction writes the change to the file. `flush()` has nothing to write.
- The file is in WAL mode, with `synchronous = NORMAL`. After a crash, the file stays consistent. A power loss can lose the last commits.
- A write that cannot make the file fails, and it changes nothing.
- A read-only file opens. The reads work, and each write fails.

### Two processes on one file

- Two processes can use one file at the same time.
- SQLite locks the file for each write. A write waits for the lock of another process for `busyTimeout` (5 seconds by default). After it, the write fails with `database is locked`.
- In WAL mode, a read does not wait for a write of another process.
- Each write reads the version counter in its transaction, so the versions of the two processes agree. `getChangesSince()` reads in one read transaction.
- A storage that opened before the file existed opens the file when another process makes it.
- Each procedure opens the file through the engine of `@mark1russell7/sqlite`. A procedure waits for the lock as a storage does, so the procedures and the storages can use one file at the same time.

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
  ["sqlite", "execute"],
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
  ["sqlite", "execute"],
  {
    sql: "INSERT INTO users (name, email) VALUES (?, ?)",
    params: ["Alice Johnson", "alice@example.com"],
    dbPath: "./app.db"
  }
);

// Query data
const result = await client.exec(
  ["sqlite", "query"],
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

### Direct database access (without a procedure)

Version 0.61.0 removed the functions of `@mark1russell7/docker-sqlite` from this package. For direct access, use `@mark1russell7/sqlite`:

```typescript
import { openDatabase, transaction } from "@mark1russell7/sqlite";

const db = openDatabase("./data/app.db");
try {
  const id = transaction(db, () => {
    const result = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)").run("Bob Smith", "bob@example.com");
    return Number(result.lastInsertRowid);
  });
  console.log(db.prepare("SELECT * FROM users WHERE id = ?").all(id));
} finally {
  db.close();
}
```

For migrations, use the procedure `sqlite.migrate`, or `migrate` of `@mark1russell7/sqlite`.

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
  ["sqlite", "query"],
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
- **@mark1russell7/sqlite** - The SQLite engine on `node:sqlite`: the open of a file, transactions, migrations and snapshots

### Development Dependencies

- **@mark1russell7/cue** - Configuration and type utilities
- **typescript** (^5.9.3) - TypeScript compiler
- **@types/node** (^22.0.0) - Node.js type definitions

## Package Structure

```
client-sqlite/
├── src/
│   ├── types.ts              # Type definitions
│   ├── module.ts             # The procedures as data, and the sqlite.query, sqlite.execute and logs.* handlers
│   ├── register.ts           # The ./register entry: registers the module
│   ├── storage.ts            # SqliteStorage, the collection storage (the ./storage entry)
│   ├── engines.ts            # The engine of SqliteStorage: node:sqlite through @mark1russell7/sqlite
│   ├── load.ts               # The load of @mark1russell7/sqlite
│   ├── procedures/db/        # sqlite.tables, sqlite.schema, sqlite.transaction, sqlite.migrate, sqlite.backup
│   └── index.ts              # Main entry point
├── bench/                    # The benchmarks of the storage (the nightly workflow runs them)
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
