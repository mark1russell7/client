# @procedures/node

[![npm](https://img.shields.io/npm/v/@procedures/node?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/node)

Node.js process management procedures for the client ecosystem. Provides procedures for running scripts, spawning long-running processes, and managing process lifecycles.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Application                              │
│                                                                              │
│   await client.exec(["node", "run"], { script: "build.js" })                │
│   await client.exec(["node", "spawn"], { script: "server.js" })             │
│   await client.exec(["node", "kill"], { processId: "abc123" })              │
│   await client.exec(["node", "status"], {})                                 │
│   await client.exec(["node", "logs"], { processId: "abc123", lines: 50 })   │
│                                                                              │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Procedure Registry                                 │
│                                                                              │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐ │
│   │   node.run    │  │  node.spawn   │  │   node.kill   │  │ node.status │ │
│   │               │  │               │  │               │  │             │ │
│   │ Run to        │  │ Start         │  │ Kill by       │  │ List all    │ │
│   │ completion    │  │ detached      │  │ process ID    │  │ processes   │ │
│   └───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └──────┬──────┘ │
│           │                  │                  │                 │        │
└───────────┼──────────────────┼──────────────────┼─────────────────┼────────┘
            │                  │                  │                 │
            ▼                  ▼                  ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ProcessManager (Singleton)                          │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        Active Processes Map                          │   │
│   │                                                                      │   │
│   │   processId: "abc123"  ──►  { script, pid, startedAt, status }      │   │
│   │   processId: "def456"  ──►  { script, pid, startedAt, status }      │   │
│   │   processId: "ghi789"  ──►  { script, pid, startedAt, status }      │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Node.js child_process                               │
│                                                                              │
│   spawn("node", ["script.js"], { detached: true, stdio: "pipe" })           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
pnpm add @procedures/node
```

## Procedures

The package has 5 procedures. Its register entry (`import "@procedures/node/register"`) registers them: `node.run`, `node.spawn`, `node.kill`, `node.status`, `node.logs`.

### node.run

Run a Node.js script to completion and return the output.

```typescript
import { Client } from "@procedures/client";

const result = await client.exec<{
  stdout: string;
  stderr: string;
  exitCode: number;
}>(["node", "run"], {
  script: "./scripts/build.js",
  args: ["--production"],
  cwd: "/path/to/project",
  env: { NODE_ENV: "production" },
  timeout: 60000 // 1 minute timeout
});

console.log("Exit code:", result.exitCode);
console.log("Output:", result.stdout);
```

**Input Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `script` | `string` | Yes | Path to script file |
| `args` | `string[]` | No | Command line arguments |
| `cwd` | `string` | No | Working directory |
| `env` | `Record<string, string>` | No | Environment variables |
| `timeout` | `number` | No | Timeout in milliseconds. At the timeout, the script and its child processes are killed, and the call throws. |
| `maxOutputBytes` | `number` | No | The most bytes kept of each output stream (default: 64 MiB) |

The script runs with the Node.js of the host (`process.execPath`). The signal of the call also kills the script and its child processes.

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `stdout` | `string` | Standard output |
| `stderr` | `string` | Standard error |
| `exitCode` | `number` | Process exit code |
| `truncated` | `boolean` | Present when an output stream was longer than `maxOutputBytes` |

### node.spawn

Start a long-running Node.js process. The process is a record of the process registry of `client-shell`: `node.status` shows it, `node.kill` ends it, and it ends with the host.

```typescript
const result = await client.exec<{
  processId: string;
  pid: number;
}>(["node", "spawn"], {
  script: "./server.js",
  args: ["--port", "3000"],
  cwd: "/path/to/project",
  env: { NODE_ENV: "production" },
  ready: { pattern: "Server listening on", timeout: 30000 } // Wait for this output
});

console.log("Process ID:", result.processId);
console.log("PID:", result.pid);
```

**Input Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `script` | `string` | Yes | Path to script file |
| `args` | `string[]` | No | Command line arguments |
| `cwd` | `string` | No | Working directory |
| `env` | `Record<string, string>` | No | Environment variables |
| `ready` | `{ pattern: string; timeout?: number }` | No | Wait until the output matches `pattern` (a regular expression). When the process does not get ready, the procedure stops it and throws. |

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `processId` | `string` | Internal process identifier |
| `pid` | `number` | System process ID |

### node.kill

Kill a spawned process by its process ID, with the processes that it started, and wait for its end.

```typescript
const result = await client.exec<{
  success: boolean;
}>(["node", "kill"], {
  processId: "abc123"
});

if (result.success) {
  console.log("Process killed successfully");
}
```

**Input Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `processId` | `string` | Yes | Process ID from spawn |

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether kill succeeded |

### node.status

Get status of all running processes or a specific one.

```typescript
// Get all processes
const result = await client.exec<{
  processes: ProcessInfo[];
}>(["node", "status"], {});

// Get specific process
const result = await client.exec<{
  processes: ProcessInfo[];
}>(["node", "status"], {
  processId: "abc123"
});

for (const proc of result.processes) {
  console.log(`${proc.processId}: ${proc.status} (PID: ${proc.pid})`);
}
```

**Input Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `processId` | `string` | No | Specific process ID to query |
| `output` | `boolean` | No | Also give the end of the output of each process (the last 64 KiB) |

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `processes` | `ProcessInfo[]` | Array of process information |

**ProcessInfo:**

| Field | Type | Description |
|-------|------|-------------|
| `processId` | `string` | Internal process identifier |
| `script` | `string` | Script path |
| `pid` | `number` | System process ID |
| `status` | `"running" \| "stopped"` | Process status |
| `startedAt` | `string` | ISO timestamp when started |

### node.logs

The procedure gives the output of one process that `node.spawn` started. The process registry of `client-shell` reads the output of each process and keeps its end: the last 64 KiB of stdout and stderr together. Thus the procedure gives that end, also after the process ended. The registry keeps the records of the last 50 ended processes.

```typescript
const { status, exitCode, output } = await client.exec(["node", "logs"], {
  processId: "node-abc123-1",
  lines: 50,
  stripAnsi: true,
});
```

The input has these fields:

- `processId` (necessary): the process ID that `node.spawn` gave.
- `lines`: give only the last lines of the output.
- `stripAnsi`: remove the ANSI escape codes (colors) from the output.
- `follow`: give a stream of lines (see below).

The output has the `processId`, the `status` (`running`, `exited` or `error`), the `exitCode` of an ended process and the `output`.

The procedure knows only the processes of its host. The process writes to two pipes, stdout and stderr. Thus `output` has their lines in the order of their arrival. A process that `node.spawn` did not start is an error.

#### `follow`: a stream of the lines

With `follow: true`, the result is a stream. It uses `processes.follow` of `@procedures/shell/command`.

```typescript
for await (const item of client.stream(["node", "logs"], { processId, follow: true, lines: 20 })) {
  if (item.type === "exit") break;
  console.log(item.type, item.line);
}
```

| Item | Meaning |
|---|---|
| `{ type: "output", line }` | A line of the kept output. `lines` limits these lines. The kept output has stdout and stderr together. |
| `{ type: "stdout" \| "stderr", line }` | A new line of the process, without its line end. |
| `{ type: "dropped", bytes }` | The reader was slow, and the stream dropped this many bytes of output. |
| `{ type: "exit", status, exitCode, signal }` | The end of the process. It is the last item. |

- The stream ends at the end of the process, at an abort of the caller, and when the reader stops. Each end removes the subscription from the process registry.
- A line without a line end at the end of the process is the last line of its stream.
- The procedure declares `stream: { unbounded: true }`, because a process can run without an end.

## Process Lifecycle

```
┌─────────────┐     spawn()      ┌─────────────┐
│             │ ───────────────► │             │
│   (none)    │                  │   running   │
│             │                  │             │
└─────────────┘                  └──────┬──────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
             kill() called       process exits       crash/error
                    │                   │                   │
                    ▼                   ▼                   ▼
             ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
             │   stopped   │     │   stopped   │     │   stopped   │
             │  (killed)   │     │  (exited)   │     │  (crashed)  │
             └─────────────┘     └─────────────┘     └─────────────┘
```

## Ready Pattern Detection

To wait until a server is ready, give `ready.pattern` (and optionally `ready.timeout` in milliseconds):

```typescript
// The spawn resolves when "Server listening on port" appears in stdout
const result = await client.exec(["node", "spawn"], {
  script: "./server.js",
  ready: { pattern: "Server listening on port", timeout: 30000 },
});
```

```
Timeline:

spawn() called
     │
     ▼
┌─────────────────────────────────────────────┐
│  Process Starting                           │
│                                             │
│  stdout: "Loading configuration..."         │
│  stdout: "Connecting to database..."        │
│  stdout: "Server listening on port 3000" ◄──┼── Pattern matched!
│                                             │
└─────────────────────────────────────────────┘
     │
     ▼
Promise resolves with { processId, pid }
```

## Integration Example

```typescript
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@procedures/client";
import "@procedures/node/register"; // registers its procedures

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

// Start a dev server
const server = await client.exec(["node", "spawn"], {
  script: "./server.js",
  args: ["--port", "3000"],
  ready: { pattern: "listening on" },
  env: { NODE_ENV: "development" }
});

console.log(`Server started with PID ${server.pid}`);

// Check status
const status = await client.exec(["node", "status"], {
  processId: server.processId
});

console.log(`Status: ${status.processes[0].status}`);

// Cleanup
await client.exec(["node", "kill"], {
  processId: server.processId
});
```

## Error Handling

```typescript
try {
  const result = await client.exec(["node", "run"], {
    script: "./nonexistent.js"
  });
} catch (error) {
  if (error.code === "ENOENT") {
    console.error("Script not found");
  } else if (error.code === "TIMEOUT") {
    console.error("Script timed out");
  }
}
```

## Registration

Import the register entry to register all procedures:

```typescript
import "@procedures/node/register"; // registers its procedures
```

Or register manually:

```typescript
import { registerNodeProcedures } from "@procedures/node";

registerNodeProcedures();
```

## The fresh bundle: a fast start for a TypeScript CLI

The subpath `@procedures/node/fresh-bundle` starts a TypeScript entry from an esbuild bundle in a cache folder. The package root does not load it, and it registers no procedure.

- The launcher starts the last build only when each file of that build has the same content hash. These files are the sources that esbuild compiled and the files of `inputs`.
- When a file changed, the launcher makes a new build in a child process. An edit that keeps the size and the modification time also makes a new build.
- When the build fails, the launcher starts the source through `tsx`. It writes the error output to `build-error.txt` in the cache folder.
- Each package in `node_modules` stays outside the bundle. It loads from the file that Node.js resolves from its importer, at the same version as under `tsx`.
- Each file of the bundle keeps its own `import.meta.url`, `import.meta.dirname` and `import.meta.filename`. A different use of `import.meta` makes the build fail.
- The bundle is an ES module. Use the launcher in a project with `"type": "module"`.
- A build that no launch used for 6 hours goes away at the next build.

Add the optional peer dependencies `esbuild` and `tsx` to the project:

```sh
pnpm add @procedures/node esbuild tsx
```

Write the launcher in JavaScript, so that Node.js starts it without a build:

```js
// bin/cli.mjs
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "@procedures/node/fresh-bundle";

const root = fileURLToPath(new URL("..", import.meta.url));

await launch({
  entry: join(root, "src", "cli.ts"),
  // A folder that Git ignores. A new install removes it.
  outDir: join(root, "node_modules", ".cache", "my-cli"),
  // The files that decide a build in addition to the sources
  inputs: [
    join(root, "package.json"),
    join(root, "pnpm-lock.yaml"),
    join(root, "tsconfig.json"),
    fileURLToPath(import.meta.url),
  ],
});
```

| Export | Description |
|---|---|
| `launch(spec)` | It starts the fresh build of the entry, else a new build, else the source through `tsx`. In the entry, `process.argv[1]` is the entry. |
| `freshEntry(spec)` | It gives the entry file of the fresh build, or `undefined` when a file changed. |
| `build(spec)` | It makes a build in this process. The process needs the flag `--experimental-import-meta-resolve`. |
| `FreshBundleSpec` | The type of `spec`: the absolute paths `entry`, `outDir` and `inputs`, and the optional module name `esbuild` (the default is `esbuild`). |

## Related Packages

- `@procedures/client` - Core client framework
- `@procedures/shell` - Shell command execution
- `@procedures/vite` - Vite dev server management

## License

MIT
