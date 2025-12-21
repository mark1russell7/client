# @mark1russell7/bundle-dev

Development workflow bundle. Aggregates core development procedures.

## Installation

```bash
npm install github:mark1russell7/bundle-dev#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            bundle-dev                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   import "@mark1russell7/bundle-dev/register";                              │
│                          │                                                   │
│                          ▼                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    Auto-Registered Procedures                        │   │
│   │                                                                      │   │
│   │  ┌─────────────────────────────────────────────────────────────┐   │   │
│   │  │              Core Infrastructure                             │   │   │
│   │  │  ┌───────────────┐  ┌───────────────┐                       │   │   │
│   │  │  │ client-shell  │  │  client-fs    │                       │   │   │
│   │  │  │ shell.*       │  │  fs.*         │                       │   │   │
│   │  │  └───────────────┘  └───────────────┘                       │   │   │
│   │  └─────────────────────────────────────────────────────────────┘   │   │
│   │                                                                      │   │
│   │  ┌─────────────────────────────────────────────────────────────┐   │   │
│   │  │              CLI Wrappers                                    │   │   │
│   │  │  ┌───────────────┐  ┌───────────────┐                       │   │   │
│   │  │  │  client-cli   │  │  client-pnpm  │                       │   │   │
│   │  │  │  cli.*        │  │  pnpm.*       │                       │   │   │
│   │  │  └───────────────┘  └───────────────┘                       │   │   │
│   │  └─────────────────────────────────────────────────────────────┘   │   │
│   │                                                                      │   │
│   │  ┌─────────────────────────────────────────────────────────────┐   │   │
│   │  │              Dev Workflow                                    │   │   │
│   │  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │   │   │
│   │  │  │  client-lib   │  │  client-git   │  │  client-dag   │   │   │   │
│   │  │  │  lib.*        │  │  git.*        │  │  dag.*        │   │   │   │
│   │  │  └───────────────┘  └───────────────┘  └───────────────┘   │   │   │
│   │  └─────────────────────────────────────────────────────────────┘   │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import "@mark1russell7/bundle-dev/register";

// All dev procedures are now registered
const client = new Client({
  transport: new LocalTransport(PROCEDURE_REGISTRY),
});

// Use lib procedures
await client.call(["lib", "scan"], {});
await client.call(["lib", "refresh"], { all: true });

// Use git procedures
await client.call(["git", "status"], {});
await client.call(["git", "commit"], { message: "Update" });

// Use fs procedures
await client.call(["fs", "read"], { path: "./package.json" });

// Use pnpm procedures
await client.call(["pnpm", "install"], {});
```

## Included Packages

| Package | Procedures | Description |
|---------|------------|-------------|
| `client-shell` | `shell.run`, `shell.exec`, `shell.which` | Low-level shell execution |
| `client-fs` | `fs.read`, `fs.write`, `fs.glob`, ... | File system operations |
| `client-cli` | `cli.run` | Mark CLI wrapper |
| `client-pnpm` | `pnpm.install`, `pnpm.add`, ... | pnpm package manager |
| `client-lib` | `lib.scan`, `lib.refresh`, `lib.new`, ... | Ecosystem management |
| `client-git` | `git.status`, `git.commit`, `git.push`, ... | Git operations |
| `client-dag` | DAG utilities | Dependency graph execution |
| `client-procedure` | Procedure utilities | Procedure management |

## Available Procedures

### Shell Operations
- `shell.run` - Spawn a command with arguments
- `shell.exec` - Execute via shell string
- `shell.which` - Find command path

### File System
- `fs.read` - Read file
- `fs.write` - Write file
- `fs.exists` - Check existence
- `fs.mkdir` - Create directory
- `fs.rm` - Remove file/directory
- `fs.readdir` - List directory
- `fs.glob` - Find files by pattern

### Git
- `git.status` - Repository status
- `git.add` - Stage files
- `git.commit` - Create commit
- `git.push` - Push to remote
- `git.pull` - Pull from remote
- `git.log` - Commit history
- `git.diff` - Show changes

### pnpm
- `pnpm.install` - Install dependencies
- `pnpm.add` - Add packages
- `pnpm.remove` - Remove packages
- `pnpm.run` - Run scripts

### Library Management
- `lib.scan` - Discover packages
- `lib.refresh` - Install, build, commit
- `lib.install` - Clone ecosystem
- `lib.new` - Create new package
- `lib.audit` - Validate packages
- `lib.rename` - Rename across codebase

### DAG
- `dag.traverse` - Execute across DAG

## Usage in CLI

The mark CLI imports this bundle to provide all development commands:

```bash
# All procedures available via mark CLI
mark lib scan
mark lib refresh -a
mark git status
mark pnpm install
mark fs read ./package.json
```

## Creating Custom Bundles

Use this pattern to create your own bundles:

```typescript
// my-bundle/src/register.ts

// Import client packages to trigger auto-registration
import "@mark1russell7/client-shell";
import "@mark1russell7/client-fs";
import "@mark1russell7/client-git";
// ... add your custom packages
import "@my-org/client-custom";
```

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Applications                                      │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │      cli        │  │   Your App      │  │     Other Apps              │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────┬───────────────┘ │
│           │                    │                         │                  │
│           └────────────────────┼─────────────────────────┘                  │
│                                ▼                                            │
│                     ┌─────────────────────┐                                │
│                     │     bundle-dev      │◄── Import this for all dev     │
│                     │   (this package)    │    procedures                  │
│                     └─────────────────────┘                                │
│                                │                                            │
│           ┌────────────────────┼────────────────────┐                      │
│           ▼                    ▼                    ▼                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│  │  client-shell   │  │   client-fs     │  │   client-git    │  ...      │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## License

MIT
