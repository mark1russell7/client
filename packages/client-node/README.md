# @mark1russell7/client-node

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
pnpm add @mark1russell7/client-node
```

## Procedures

### node.run

Run a Node.js script to completion and return the output.

```typescript
import { Client } from "@mark1russell7/client";

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
| `timeout` | `number` | No | Timeout in milliseconds |

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `stdout` | `string` | Standard output |
| `stderr` | `string` | Standard error |
| `exitCode` | `number` | Process exit code |

### node.spawn

Start a long-running Node.js process in detached mode.

```typescript
const result = await client.exec<{
  processId: string;
  pid: number;
}>(["node", "spawn"], {
  script: "./server.js",
  args: ["--port", "3000"],
  cwd: "/path/to/project",
  env: { NODE_ENV: "production" },
  readyPattern: "Server listening on", // Wait for this output
  readyTimeout: 30000 // Timeout waiting for ready
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
| `readyPattern` | `string` | No | Pattern to detect when process is ready |
| `readyTimeout` | `number` | No | Timeout waiting for ready pattern |

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `processId` | `string` | Internal process identifier |
| `pid` | `number` | System process ID |

### node.kill

Kill a spawned process by its process ID.

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

When spawning servers, use `readyPattern` to wait until the server is ready:

```typescript
// The spawn will resolve when "Server listening" appears in stdout
const result = await client.exec(["node", "spawn"], {
  script: "./server.js",
  readyPattern: "Server listening on port",
  readyTimeout: 30000
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
import { Client } from "@mark1russell7/client";
import "@mark1russell7/client-node/register";

const client = new Client({ transport });

// Start a dev server
const server = await client.exec(["node", "spawn"], {
  script: "./server.js",
  args: ["--port", "3000"],
  readyPattern: "listening on",
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

## Auto-Registration

Import the register module to auto-register all procedures:

```typescript
import "@mark1russell7/client-node/register";
```

Or register manually:

```typescript
import { registerNodeProcedures } from "@mark1russell7/client-node";

registerNodeProcedures();
```

## Related Packages

- `@mark1russell7/client` - Core client framework
- `@mark1russell7/client-shell` - Shell command execution
- `@mark1russell7/client-vite` - Vite dev server management

## License

MIT
