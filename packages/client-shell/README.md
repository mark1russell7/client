# @mark1russell7/client-shell

Low-level shell command execution as RPC procedures. Foundation layer for all CLI wrapper packages.

## Installation

```bash
npm install github:mark1russell7/client-shell#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application                                     │
│                                                                              │
│   await client.call(["shell", "run"], { command: "git", args: ["status"] }) │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            client-shell                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   shell.run     │  │   shell.exec    │  │       shell.which           │ │
│  │                 │  │                 │  │                             │ │
│  │  Spawn process  │  │  Execute via    │  │  Find command path          │ │
│  │  with arguments │  │  shell string   │  │  (uses `where` on Windows)  │ │
│  │                 │  │                 │  │                             │ │
│  │  spawn(cmd,args)│  │  exec(cmdStr)   │  │  which git → /usr/bin/git   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│           │                   │                                             │
│           └───────────────────┼─────────────────────────────────────────────│
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                       Shared Output Format                               ││
│  │                                                                          ││
│  │   { exitCode, stdout, stderr, success, duration, signal? }              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Dependent Packages                                  │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│
│  │ client-cli  │  │ client-pnpm │  │ client-git  │  │ Other CLI wrappers  ││
│  │ (mark CLI)  │  │ (pnpm)      │  │ (git)       │  │                     ││
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { Client } from "@mark1russell7/client";
import "@mark1russell7/client-shell/register"; // Auto-registers procedures

const client = new Client({ /* transport */ });

// Run a command with arguments
const result = await client.call(["shell", "run"], {
  command: "git",
  args: ["status", "--short"],
  cwd: "/path/to/repo",
});

console.log(result.stdout);
// M  src/index.ts
// ?? new-file.ts
```

## Procedures

| Path | Description |
|------|-------------|
| `shell.run` | Spawn a command with arguments (no shell interpretation) |
| `shell.exec` | Execute a command string through the shell |
| `shell.which` | Find the full path to a command |

### shell.run

Spawn a process directly without shell interpretation. Safer for untrusted input.

```typescript
interface ShellRunInput {
  command: string;              // Command to run
  args?: string[];              // Arguments (default: [])
  cwd?: string;                 // Working directory
  env?: Record<string, string>; // Environment variables
  timeout?: number;             // Timeout in ms
  encoding?: string;            // Output encoding (default: "utf8")
}

interface ShellRunOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;  // true if exitCode === 0
  duration: number;  // ms
}
```

**Example:**
```typescript
await client.call(["shell", "run"], {
  command: "npm",
  args: ["install", "--save-dev", "typescript"],
  cwd: "/my/project",
  timeout: 60000,
});
```

### shell.exec

Execute a command string through the system shell. Supports pipes, redirects, etc.

```typescript
interface ShellExecInput {
  command: string;              // Full command string
  cwd?: string;                 // Working directory
  env?: Record<string, string>; // Environment variables
  timeout?: number;             // Timeout in ms
  shell?: boolean | string;     // Shell to use (default: true = system shell)
  maxBuffer?: number;           // Max stdout/stderr buffer size
  stdin?: string;               // Input to pipe to stdin
}

interface ShellExecOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
  duration: number;
  signal?: string;  // Signal that terminated the process
}
```

**Example:**
```typescript
await client.call(["shell", "exec"], {
  command: "git log --oneline | head -5",
  cwd: "/my/repo",
});
```

### shell.which

Find the full path to a command. Uses `where` on Windows, `which` on Unix.

```typescript
interface ShellWhichInput {
  command: string;  // Command to find
}

interface ShellWhichOutput {
  path: string | null;  // Full path or null if not found
  found: boolean;
}
```

**Example:**
```typescript
const { path, found } = await client.call(["shell", "which"], {
  command: "node",
});
// { path: "/usr/local/bin/node", found: true }
```

## Use Cases

### Building CLI Wrappers

The `shell.run` procedure is the foundation for CLI wrapper packages:

```typescript
// In client-git/src/procedures/git/status.ts
import type { ProcedureContext } from "@mark1russell7/client";

export async function gitStatus(input: GitStatusInput, ctx: ProcedureContext) {
  const args = ["status"];
  if (input.short) args.push("--short");

  const result = await ctx.client.call(["shell", "run"], {
    command: "git",
    args,
    cwd: input.cwd,
  });

  return parseGitStatus(result.stdout);
}
```

### Checking Command Availability

```typescript
async function ensureGitAvailable() {
  const { found } = await client.call(["shell", "which"], { command: "git" });
  if (!found) {
    throw new Error("Git is not installed or not in PATH");
  }
}
```

## Cross-Platform Notes

- `shell.which` uses `where` on Windows and `which` on Unix
- `shell.run` uses `spawn()` without shell, avoiding platform-specific quoting issues
- `shell.exec` uses the system default shell (`cmd.exe` on Windows, `/bin/sh` on Unix)

## Package Ecosystem

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       CLI Wrapper Packages                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ client-cli  │  │ client-pnpm │  │ client-git  │  │ client-cue  │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │                │             │
│         └────────────────┼────────────────┼────────────────┘             │
│                          ▼                ▼                               │
│                   ┌────────────────────────────┐                         │
│                   │       client-shell         │                         │
│                   │  shell.run | exec | which  │                         │
│                   └────────────────────────────┘                         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## License

MIT
