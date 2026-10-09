# @mark1russell7/client-shell

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

> Generic shell command execution procedures - the foundation layer for all CLI wrapper packages in the Mark ecosystem.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [shell.run](#shellrun)
  - [shell.exec](#shellexec)
  - [shell.which](#shellwhich)
- [Use Cases](#use-cases)
- [Cross-Platform Notes](#cross-platform-notes)
- [Integration](#integration)
- [Requirements](#requirements)
- [License](#license)

---

## Overview

**client-shell** provides low-level shell command execution as RPC procedures:

- **shell.run** - Spawn processes with arguments (no shell interpretation, safer)
- **shell.exec** - Execute command strings via shell (supports pipes, redirects)
- **shell.which** - Find command paths cross-platform
- **shell.stream** - Run a command with arguments, and give each output line while it runs

This package is the **foundation** for all CLI wrapper packages.

### Command helpers

The wrapper packages start their programs with the helpers of `@mark1russell7/client-shell/command`. This entry point registers no procedures.

| Helper | What it does |
|---|---|
| `runCommand(command, options)` | It runs a program to its end and gives `exitCode`, `stdout`, `stderr` and `duration`. It does not throw. |
| `streamCommand(command, options)` | It gives each output line while the program runs, then an `exit` item. |
| `processes` | It records a long-running program: `start`, `list`, `waitFor`, `output`, `stop`. |
| `killTree(child)` | It kills a child process and all the processes that it started. |

The rules of the helpers:

- A helper passes the arguments as a list. No shell reads them.
- The `timeout` and the `signal` kill the whole process tree. Windows uses `taskkill /T /F`. The other systems use a process group.
- Each output stream has a limit (`maxOutputBytes`, 64 MiB by default). The helper keeps the first bytes, or the last bytes with `keep: "tail"`.
- A program without an `input` gets an empty stdin.
- When the reader of `streamCommand` is slow, the helper stops reading the pipes, so the program waits.
- When the host ends, the helpers kill each child that still runs.

```typescript
import { runCommand } from "@mark1russell7/client-shell/command";

const result = await runCommand("git", { args: ["status", "--porcelain"], cwd, signal: ctx.signal });
```

---

## Installation

```bash
npm install github:mark1russell7/client-shell#main
```

---

## Architecture

### System Overview

```mermaid
graph TB
    subgraph "Application Layer"
        App[Your Application]
    end

    subgraph "client-shell"
        Run[shell.run<br/>Spawn with args]
        Exec[shell.exec<br/>Shell string]
        Which[shell.which<br/>Find command]
    end

    subgraph "Node.js"
        Spawn[child_process.spawn]
        ExecFn[child_process.exec]
        WhichFn[which / where]
    end

    subgraph "Output"
        Result[exitCode, stdout, stderr,<br/>success, duration]
    end

    App --> Run
    App --> Exec
    App --> Which
    Run --> Spawn
    Exec --> ExecFn
    Which --> WhichFn
    Spawn --> Result
    ExecFn --> Result
```

### Command Execution Flow

```mermaid
sequenceDiagram
    participant App as Application
    participant Shell as client-shell
    participant Node as Node.js
    participant OS as Operating System

    App->>Shell: shell.run({ command: "git", args: ["status"] })
    Shell->>Shell: Validate input
    Shell->>Node: spawn("git", ["status"], options)
    Node->>OS: Execute process
    OS-->>Node: stdout, stderr, exitCode
    Node-->>Shell: Process result
    Shell->>Shell: Build output
    Shell-->>App: { success, stdout, stderr, exitCode, duration }
```

### Dependency Tree

```mermaid
graph TB
    subgraph "CLI Wrapper Packages"
        CLI[client-cli]
        Pnpm[client-pnpm]
        Git[client-git]
        Docker[client-docker]
        Vitest[client-vitest]
        Cue[client-cue]
    end

    subgraph "Foundation"
        Shell[client-shell]
    end

    subgraph "Core"
        Client[client]
    end

    CLI --> Shell
    Pnpm --> Shell
    Git --> Shell
    Docker --> Shell
    Vitest --> Shell
    Cue --> Shell
    Shell --> Client
```

---

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

---

## API Reference

### Procedures Summary

| Path | Description |
|------|-------------|
| `shell.run` | Spawn process with arguments (no shell) |
| `shell.exec` | Execute command string through shell |
| `shell.which` | Find full path to a command |

---

### shell.run

Spawn a process directly without shell interpretation. **Safer for untrusted input.**

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

---

### shell.exec

Execute a command string through the system shell. Supports pipes, redirects, etc.

```typescript
interface ShellExecInput {
  command: string;              // Full command string
  cwd?: string;                 // Working directory
  env?: Record<string, string>; // Environment variables
  timeout?: number;             // Timeout in ms
  shell?: boolean | string;     // Shell to use (default: true)
  maxBuffer?: number;           // Max stdout/stderr buffer
  stdin?: string;               // Input to pipe to stdin
}

interface ShellExecOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
  duration: number;
  signal?: string;  // Signal that terminated process
}
```

**Example:**
```typescript
await client.call(["shell", "exec"], {
  command: "git log --oneline | head -5",
  cwd: "/my/repo",
});
```

---

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

---

## Use Cases

### Building CLI Wrappers

The `shell.run` procedure is the foundation for CLI wrapper packages:

```typescript
// In client-git/src/procedures/git/status.ts
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

### Piping Commands

```typescript
// Using shell.exec for pipes
const result = await client.call(["shell", "exec"], {
  command: "cat package.json | jq '.dependencies'",
  cwd: "/my/project",
});
```

---

## Cross-Platform Notes

### shell.which Behavior

```mermaid
graph LR
    subgraph "Unix/macOS"
        UnixWhich["which command"]
    end

    subgraph "Windows"
        WinWhere["where command"]
    end

    subgraph "Result"
        Path["/usr/bin/git<br/>or C:\\Program Files\\Git\\bin\\git.exe"]
    end

    UnixWhich --> Path
    WinWhere --> Path
```

### shell.run vs shell.exec

| Feature | shell.run | shell.exec |
|---------|-----------|------------|
| Shell interpretation | No | Yes |
| Pipes & redirects | No | Yes |
| Argument safety | Safer | Less safe |
| Use case | Known commands | Shell scripts |
| Platform quoting | Handled | Manual |

---

## Integration

### With Other Packages

```mermaid
graph TB
    subgraph "High-Level"
        Lib[client-lib<br/>lib.refresh]
    end

    subgraph "Mid-Level"
        Git[client-git<br/>git.commit]
        Pnpm[client-pnpm<br/>pnpm.install]
    end

    subgraph "Foundation"
        Shell[client-shell<br/>shell.run]
    end

    Lib --> Git
    Lib --> Pnpm
    Git --> Shell
    Pnpm --> Shell
```

### With MCP (Claude)

When using the MCP server with bundle-dev, Claude has access to shell.* procedures:

```
User: "Run npm install in /my/project"
Claude: [Uses shell.run with command: "npm", args: ["install"]]
```

---

## Requirements

- **Node.js** >= 20
- **Dependencies:**
  - `@mark1russell7/client` (peer dependency)
  - `zod` ^3.24.0

---

## License

MIT
