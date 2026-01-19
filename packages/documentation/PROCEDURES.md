# Mark Ecosystem Procedure Catalog

> Complete reference of all available procedures in the Mark ecosystem.

## Table of Contents

- [Overview](#overview)
- [File System (fs.*)](#file-system-fs)
- [Git Operations (git.*)](#git-operations-git)
- [Shell Execution (shell.*)](#shell-execution-shell)
- [Package Management (pnpm.*)](#package-management-pnpm)
- [Docker (docker.*)](#docker-docker)
- [MongoDB (mongo.*)](#mongodb-mongo)
- [SQLite (db.*)](#sqlite-db)
- [S3 Storage (s3.*)](#s3-storage-s3)
- [Ecosystem Management (lib.*)](#ecosystem-management-lib)
- [CLI (cli.*)](#cli-cli)
- [Procedures (procedure.*)](#procedures-procedure)
- [Configuration (cue.*)](#configuration-cue)
- [Testing (vitest.*, test.*)](#testing-vitest-test)
- [Snapshots (snapshot.*)](#snapshots-snapshot)
- [DAG Execution (dag.*)](#dag-execution-dag)
- [Logging (logs.*)](#logging-logs)
- [Aggregations (agg.*)](#aggregations-agg)

---

## Overview

Procedures are organized by namespace. Each procedure has:
- **Path**: Array of strings (e.g., `["fs", "read"]` → `fs.read`)
- **Input**: Zod schema for validation
- **Output**: Zod schema for validation
- **Handler**: Async function that executes the operation

### Calling Procedures

```typescript
import { Client } from "@mark1russell7/client";

// Via client.call()
const result = await client.call(["fs", "read"], { path: "/etc/hosts" });

// Via MCP (Claude)
// Claude automatically maps tool names like "fs.read" to procedure paths
```

---

## File System (fs.*)

**Package:** `@mark1russell7/client-fs`

| Procedure | Description |
|-----------|-------------|
| `fs.read` | Read file contents |
| `fs.write` | Write content to file |
| `fs.append` | Append content to file |
| `fs.delete` | Delete file or directory |
| `fs.copy` | Copy file or directory |
| `fs.move` | Move/rename file or directory |
| `fs.mkdir` | Create directory |
| `fs.list` | List directory contents |
| `fs.exists` | Check if path exists |
| `fs.stat` | Get file/directory stats |
| `fs.read.json` | Read and parse JSON file |
| `fs.write.json` | Write object as JSON file |
| `fs.glob` | Find files matching pattern |
| `fs.watch` | Watch for file changes |

### Examples

```typescript
// Read file
const { content } = await client.call(["fs", "read"], {
  path: "/path/to/file.txt",
  encoding: "utf8"
});

// Write file
await client.call(["fs", "write"], {
  path: "/path/to/file.txt",
  content: "Hello, World!",
  createParents: true
});

// List directory
const { entries } = await client.call(["fs", "list"], {
  path: "/path/to/dir",
  recursive: false
});

// Find files
const { files } = await client.call(["fs", "glob"], {
  pattern: "**/*.ts",
  cwd: "/project"
});
```

---

## Git Operations (git.*)

**Package:** `@mark1russell7/client-git`

| Procedure | Description |
|-----------|-------------|
| `git.clone` | Clone repository |
| `git.pull` | Pull changes |
| `git.push` | Push commits |
| `git.commit` | Create commit |
| `git.add` | Stage files |
| `git.status` | Get working tree status |
| `git.log` | Get commit history |
| `git.diff` | Show changes |
| `git.branch` | List/create branches |
| `git.checkout` | Switch branches |
| `git.merge` | Merge branches |
| `git.remote` | Manage remotes |
| `git.stash` | Stash changes |
| `git.tag` | Manage tags |

### Examples

```typescript
// Clone repository
await client.call(["git", "clone"], {
  url: "git@github.com:user/repo.git",
  path: "/path/to/clone",
  branch: "main"
});

// Get status
const { staged, unstaged, untracked } = await client.call(["git", "status"], {
  repoPath: "/path/to/repo"
});

// Commit changes
await client.call(["git", "commit"], {
  repoPath: "/path/to/repo",
  message: "feat: add new feature",
  all: true
});
```

---

## Shell Execution (shell.*)

**Package:** `@mark1russell7/client-shell`

| Procedure | Description |
|-----------|-------------|
| `shell.run` | Run command with args array |
| `shell.exec` | Execute shell command string |
| `shell.which` | Find command path |

### Examples

```typescript
// Run command with arguments
const { stdout, stderr, exitCode } = await client.call(["shell", "run"], {
  command: "ls",
  args: ["-la", "/path"],
  cwd: "/working/dir",
  env: { NODE_ENV: "production" }
});

// Execute shell string
const result = await client.call(["shell", "exec"], {
  command: "echo $HOME && pwd",
  shell: true
});

// Find command
const { path } = await client.call(["shell", "which"], {
  command: "node"
});
```

---

## Package Management (pnpm.*)

**Package:** `@mark1russell7/client-pnpm`

| Procedure | Description |
|-----------|-------------|
| `pnpm.install` | Install dependencies |
| `pnpm.add` | Add package |
| `pnpm.remove` | Remove package |
| `pnpm.run` | Run script |
| `pnpm.exec` | Execute binary |
| `pnpm.list` | List dependencies |
| `pnpm.outdated` | Check for updates |
| `pnpm.update` | Update packages |

### Examples

```typescript
// Install dependencies
await client.call(["pnpm", "install"], {
  cwd: "/project",
  frozen: true
});

// Add package
await client.call(["pnpm", "add"], {
  packages: ["lodash", "zod"],
  dev: false,
  cwd: "/project"
});

// Run script
await client.call(["pnpm", "run"], {
  script: "build",
  cwd: "/project"
});
```

---

## Docker (docker.*)

**Package:** `@mark1russell7/client-docker`

| Procedure | Description |
|-----------|-------------|
| `docker.run` | Run container |
| `docker.build` | Build image |
| `docker.pull` | Pull image |
| `docker.push` | Push image |
| `docker.exec` | Execute in container |
| `docker.stop` | Stop container(s) |
| `docker.rm` | Remove container(s) |
| `docker.ps` | List containers |
| `docker.logs` | Get container logs |
| `docker.images` | List images |
| `docker.compose.up` | Start compose services |
| `docker.compose.down` | Stop compose services |

### Examples

```typescript
// List containers
const { containers } = await client.call(["docker", "ps"], {
  all: true,
  filter: { status: "running" }
});

// Run container
await client.call(["docker", "run"], {
  image: "nginx:latest",
  name: "my-nginx",
  detach: true,
  ports: { "80": "8080" }
});

// Docker compose up
await client.call(["docker", "compose", "up"], {
  file: "docker-compose.yml",
  detach: true,
  build: true
});

// Get logs
const { logs } = await client.call(["docker", "logs"], {
  container: "my-container",
  tail: 100,
  timestamps: true
});
```

---

## MongoDB (mongo.*)

**Package:** `@mark1russell7/client-mongo`

### Database Operations

| Procedure | Description |
|-----------|-------------|
| `mongo.database.ping` | Health check |
| `mongo.database.info` | Get database info |

### Collection Operations

| Procedure | Description |
|-----------|-------------|
| `mongo.collections.list` | List collections |
| `mongo.collections.create` | Create collection |
| `mongo.collections.drop` | Drop collection |
| `mongo.collections.stats` | Get collection stats |

### Document Operations

| Procedure | Description |
|-----------|-------------|
| `mongo.documents.find` | Query documents |
| `mongo.documents.get` | Get by ID |
| `mongo.documents.insert` | Insert document(s) |
| `mongo.documents.update` | Update documents |
| `mongo.documents.delete` | Delete documents |
| `mongo.documents.count` | Count documents |
| `mongo.documents.aggregate` | Run aggregation pipeline |

### Index Operations

| Procedure | Description |
|-----------|-------------|
| `mongo.indexes.list` | List indexes |
| `mongo.indexes.create` | Create index |
| `mongo.indexes.drop` | Drop index |

### Examples

```typescript
// Query documents
const { documents } = await client.call(["mongo", "documents", "find"], {
  collection: "users",
  filter: { age: { $gte: 18 } },
  projection: { name: 1, email: 1 },
  limit: 10
});

// Insert document
const { insertedId } = await client.call(["mongo", "documents", "insert"], {
  collection: "users",
  document: { name: "Alice", email: "alice@example.com" }
});

// Aggregation pipeline
const { results } = await client.call(["mongo", "documents", "aggregate"], {
  collection: "orders",
  pipeline: [
    { $match: { status: "completed" } },
    { $group: { _id: "$userId", total: { $sum: "$amount" } } }
  ]
});
```

---

## SQLite (db.*)

**Package:** `@mark1russell7/client-sqlite`

| Procedure | Description |
|-----------|-------------|
| `db.query` | Execute SELECT query |
| `db.execute` | Execute INSERT/UPDATE/DELETE |

### Examples

```typescript
// Query
const { rows } = await client.call(["db", "query"], {
  sql: "SELECT * FROM users WHERE age > ?",
  params: [18]
});

// Execute
const { changes, lastInsertRowId } = await client.call(["db", "execute"], {
  sql: "INSERT INTO users (name, email) VALUES (?, ?)",
  params: ["Alice", "alice@example.com"]
});
```

---

## S3 Storage (s3.*)

**Package:** `@mark1russell7/client-s3`

| Procedure | Description |
|-----------|-------------|
| `s3.upload` | Upload file/data |
| `s3.download` | Download file |
| `s3.list` | List objects |
| `s3.delete` | Delete object |
| `s3.copy` | Copy object |
| `s3.exists` | Check if object exists |
| `s3.getUrl` | Get presigned URL |

### Examples

```typescript
// Upload file
await client.call(["s3", "upload"], {
  bucket: "my-bucket",
  key: "path/to/file.txt",
  body: "File content",
  contentType: "text/plain"
});

// List objects
const { objects } = await client.call(["s3", "list"], {
  bucket: "my-bucket",
  prefix: "uploads/"
});
```

---

## Ecosystem Management (lib.*)

**Package:** `@mark1russell7/client-lib`

| Procedure | Description |
|-----------|-------------|
| `lib.scan` | Discover ecosystem packages |
| `lib.install` | Clone and build all packages |
| `lib.new` | Create new package |
| `lib.refresh` | Install + build package(s) |
| `lib.audit` | Validate packages |
| `lib.rename` | Rename package |
| `lib.pull` | Pull all packages |

### Examples

```typescript
// Scan ecosystem
const { packages } = await client.call(["lib", "scan"], {
  rootPath: "~/git"
});

// Create new package
await client.call(["lib", "new"], {
  name: "my-new-package",
  preset: "lib"
});

// Refresh all packages
await client.call(["lib", "refresh"], {
  all: true,
  force: true
});
```

---

## CLI (cli.*)

**Package:** `@mark1russell7/client-cli`

| Procedure | Description |
|-----------|-------------|
| `cli.run` | Run mark CLI command |

### Examples

```typescript
// Run mark CLI command
await client.call(["cli", "run"], {
  path: ["lib", "new"],
  positional: ["my-package"],
  args: { preset: "lib" }
});
// Equivalent to: mark lib new my-package --preset lib
```

---

## Procedures (procedure.*)

**Package:** `@mark1russell7/client-procedure`

| Procedure | Description |
|-----------|-------------|
| `procedure.new` | Create new procedure |
| `procedure.list` | List procedures in package |
| `procedure.delete` | Delete procedure |
| `procedure.register` | Register procedure at runtime |
| `procedure.get` | Get procedure definition |
| `procedure.store` | Persist procedure |
| `procedure.load` | Load procedures |
| `procedure.sync` | Sync with storage |
| `procedure.define` | Define from aggregation |

### Examples

```typescript
// Create new procedure
await client.call(["procedure", "new"], {
  package: "my-package",
  path: ["fs", "custom"],
  description: "Custom file operation"
});
```

---

## Configuration (cue.*)

**Package:** `@mark1russell7/client-cue`

| Procedure | Description |
|-----------|-------------|
| `cue.init` | Initialize dependencies.json |
| `cue.add` | Add feature |
| `cue.remove` | Remove feature |
| `cue.generate` | Generate config files |
| `cue.validate` | Validate dependencies.json |

### Examples

```typescript
// Initialize with preset
await client.call(["cue", "init"], {
  preset: "lib",
  cwd: "/path/to/package"
});

// Add TypeScript feature
await client.call(["cue", "add"], {
  feature: "typescript",
  cwd: "/path/to/package"
});

// Generate config files
await client.call(["cue", "generate"], {
  cwd: "/path/to/package"
});
```

---

## Testing (vitest.*, test.*)

**Package:** `@mark1russell7/client-vitest`, `@mark1russell7/client-test`

### Vitest

| Procedure | Description |
|-----------|-------------|
| `vitest.run` | Run vitest tests |
| `vitest.watch` | Start watch mode |

### Test

| Procedure | Description |
|-----------|-------------|
| `test.run` | Run tests |
| `test.coverage` | Run with coverage |

### Examples

```typescript
// Run tests
const { passed, failed, duration } = await client.call(["vitest", "run"], {
  cwd: "/path/to/project",
  include: ["**/*.test.ts"],
  coverage: true
});

// Watch mode
await client.call(["vitest", "watch"], {
  cwd: "/path/to/project"
});
```

---

## Snapshots (snapshot.*)

**Package:** `@mark1russell7/client-snapshot`

| Procedure | Description |
|-----------|-------------|
| `snapshot.create` | Create state snapshot |
| `snapshot.restore` | Restore from snapshot |
| `snapshot.list` | List snapshots |
| `snapshot.delete` | Delete snapshot |

---

## DAG Execution (dag.*)

**Package:** `@mark1russell7/client-dag`

| Procedure | Description |
|-----------|-------------|
| `dag.traverse` | Execute procedure across DAG |
| `dag.build` | Build DAG from packages |
| `dag.visualize` | Generate DOT visualization |

---

## Logging (logs.*)

**Package:** `@mark1russell7/client-sqlite` (logs feature)

| Procedure | Description |
|-----------|-------------|
| `logs.store` | Store log entry |
| `logs.query` | Query log entries |

---

## Aggregations (agg.*)

**Package:** `@mark1russell7/client-lib` (aggregation procedures)

Aggregations are declarative procedure compositions:

| Procedure | Description |
|-----------|-------------|
| `agg.lib.install` | Aggregation version of lib.install |

### Example Aggregation Definition

```typescript
const libInstallAggregation = {
  type: "chain",
  procedures: [
    { ref: ["lib", "scan"], name: "scan" },
    {
      type: "map",
      over: "$scan.packages",
      procedure: { ref: ["pnpm", "install"] }
    },
    {
      type: "map",
      over: "$scan.packages",
      procedure: { ref: ["pnpm", "run"], input: { script: "build" } }
    }
  ]
};
```

---

## Procedure Counts by Package

| Package | Procedure Count |
|---------|-----------------|
| client-fs | 15 |
| client-git | 14 |
| client-shell | 3 |
| client-pnpm | 8 |
| client-docker | 12 |
| client-mongo | 16 |
| client-sqlite | 4 |
| client-s3 | 7 |
| client-lib | 8 |
| client-cli | 1 |
| client-procedure | 9 |
| client-cue | 5 |
| client-vitest | 2 |
| client-test | 2 |
| client-snapshot | 4 |
| client-dag | 3 |
| **Total** | **~100+** |

---

## See Also

- [Architecture](./ARCHITECTURE.md) - System architecture diagrams
- [Onboarding](./ONBOARDING.md) - Getting started guide
- [Packages](./PACKAGES.md) - Detailed package descriptions
