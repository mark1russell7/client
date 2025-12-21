# @mark1russell7/client-cli

Mark CLI wrapper as an RPC procedure. Executes mark commands programmatically.

## Installation

```bash
npm install github:mark1russell7/client-cli#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application                                     │
│                                                                              │
│   await client.call(["cli", "run"], {                                       │
│     path: ["lib", "new"],                                                   │
│     positional: ["my-package"],                                             │
│     args: { preset: "lib" },                                                │
│   })                                                                         │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            client-cli                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                           cli.run                                        ││
│  │                                                                          ││
│  │   Converts structured input to CLI arguments:                           ││
│  │                                                                          ││
│  │   { path: ["lib", "new"],                                               ││
│  │     positional: ["my-package"],        ──►  mark lib new my-package     ││
│  │     args: { preset: "lib" } }                     --preset lib          ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         client-shell                                     ││
│  │              shell.run("node", ["dist/index.js", ...args])              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { Client } from "@mark1russell7/client";
import "@mark1russell7/client-cli/register";

const client = new Client({ /* transport */ });

// Run a mark CLI command
await client.call(["cli", "run"], {
  path: ["lib", "new"],
  positional: ["my-package"],
  args: { preset: "lib" },
});

// Equivalent to: mark lib new my-package --preset lib
```

## Procedures

| Path | Description |
|------|-------------|
| `cli.run` | Execute a mark CLI command |

### cli.run

Execute a mark CLI command programmatically.

```typescript
interface CliRunInput {
  path: string[];                    // Command path (e.g., ["lib", "new"])
  positional?: string[];             // Positional arguments
  args?: Record<string, unknown>;    // Named arguments (converted to --flags)
  cwd?: string;                      // Working directory
  timeout?: number;                  // Timeout in ms
}

interface CliRunOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
  duration: number;
}
```

## Examples

### Create a new package

```typescript
await client.call(["cli", "run"], {
  path: ["lib", "new"],
  positional: ["my-package"],
  args: { preset: "lib", skipGit: true },
});
// Runs: mark lib new my-package --preset lib --skipGit
```

### Refresh all packages

```typescript
await client.call(["cli", "run"], {
  path: ["lib", "refresh"],
  args: { all: true, force: true },
});
// Runs: mark lib refresh --all --force
```

### Scan packages

```typescript
const result = await client.call(["cli", "run"], {
  path: ["lib", "scan"],
});
// Runs: mark lib scan
console.log(result.stdout);
```

### Git operations

```typescript
await client.call(["cli", "run"], {
  path: ["git", "commit"],
  args: { message: "feat: add new feature" },
});
// Runs: mark git commit --message "feat: add new feature"
```

### pnpm operations

```typescript
await client.call(["cli", "run"], {
  path: ["pnpm", "install"],
  cwd: "/path/to/project",
});
// Runs: mark pnpm install (in /path/to/project)
```

## Argument Conversion

Named arguments are converted to CLI flags:

| Input | Output |
|-------|--------|
| `{ force: true }` | `--force` |
| `{ force: false }` | (omitted) |
| `{ preset: "lib" }` | `--preset lib` |
| `{ count: 5 }` | `--count 5` |
| `{ items: ["a", "b"] }` | `--items a --items b` |

## Use Cases

### CI/CD Integration

Run mark commands in automated pipelines:

```typescript
// In a build script
const result = await client.call(["cli", "run"], {
  path: ["lib", "audit"],
  args: { fix: true },
});

if (!result.success) {
  throw new Error("Audit failed");
}
```

### Scripted Workflows

Combine multiple commands:

```typescript
// Refresh and test
await client.call(["cli", "run"], {
  path: ["lib", "refresh"],
  args: { all: true },
});

await client.call(["cli", "run"], {
  path: ["test", "run"],
});
```

### Remote Execution

Execute mark commands on remote servers:

```typescript
// Via HTTP transport
const remoteClient = new Client({
  transport: new HttpTransport({ baseUrl: "http://build-server:3000" }),
});

await remoteClient.call(["cli", "run"], {
  path: ["lib", "refresh"],
  args: { all: true },
});
```

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLI Wrapper Layer                                    │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   client-cli    │  │   client-pnpm   │  │       client-git            │ │
│  │   cli.run       │  │   pnpm.*        │  │       git.*                 │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────┬───────────────┘ │
│           │                    │                         │                  │
│           └────────────────────┼─────────────────────────┘                  │
│                                ▼                                            │
│                     ┌─────────────────────┐                                │
│                     │    client-shell     │                                │
│                     │ shell.run/exec/which│                                │
│                     └─────────────────────┘                                │
│                                │                                            │
│                                ▼                                            │
│                     ┌─────────────────────┐                                │
│                     │      mark CLI       │                                │
│                     │   (node dist/...)   │                                │
│                     └─────────────────────┘                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## License

MIT
