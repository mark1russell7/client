# @mark1russell7/client-lib

Ecosystem library management procedures. Scan, refresh, install, audit, and rename packages.

## Installation

```bash
npm install github:mark1russell7/client-lib#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             client-lib                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     Package Discovery                                  │  │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │  │
│  │  │                       lib.scan                                    │ │  │
│  │  │  Scan ~/git for ecosystem packages                               │ │  │
│  │  │  • Read package.json for @mark1russell7/* dependencies           │ │  │
│  │  │  • Build dependency graph                                        │ │  │
│  │  │  • Detect git remotes and branches                               │ │  │
│  │  └──────────────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     Package Operations                                 │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │ lib.refresh │  │ lib.install │  │  lib.new    │  │ lib.audit   │  │  │
│  │  │ Install +   │  │ Clone all   │  │ Create new  │  │ Validate    │  │  │
│  │  │ build + git │  │ from manifest│  │ package    │  │ all packages│  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │                                                                        │  │
│  │  ┌─────────────┐  ┌─────────────┐                                     │  │
│  │  │ lib.rename  │  │  lib.pull   │                                     │  │
│  │  │ Rename pkg  │  │ Pull all    │                                     │  │
│  │  │ across all  │  │ packages    │                                     │  │
│  │  └─────────────┘  └─────────────┘                                     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      DAG Execution                                     │  │
│  │  ┌───────────────────────────────────────────────────────────────┐   │  │
│  │  │                    dag.traverse                                │   │  │
│  │  │  Execute a procedure across all packages in dependency order  │   │  │
│  │  └───────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │       @mark1russell7/         │
                    │  client-shell, client-git,    │
                    │  client-dag, client-fs        │
                    └───────────────────────────────┘
```

## Quick Start

```typescript
import { Client } from "@mark1russell7/client";
import "@mark1russell7/client-lib/register";

const client = new Client({ /* transport */ });

// Scan for all ecosystem packages
const { packages } = await client.call(["lib", "scan"], {});

// Refresh all packages (install + build)
await client.call(["lib", "refresh"], {
  all: true,
  force: true,
});

// Create a new package
await client.call(["lib", "new"], {
  name: "my-new-package",
  preset: "lib",
});
```

## Procedures

| Path | Description |
|------|-------------|
| `lib.scan` | Discover all ecosystem packages |
| `lib.refresh` | Install, build, and optionally commit packages |
| `lib.install` | Clone and build all packages from manifest |
| `lib.new` | Create a new package |
| `lib.audit` | Validate all packages against template |
| `lib.rename` | Rename a package across the codebase |
| `lib.pull` | Pull all packages from remote |
| `dag.traverse` | Execute a procedure across the DAG |

### lib.scan

Discover all ecosystem packages in ~/git.

```typescript
interface LibScanInput {
  rootPath?: string;     // Root path (default: ~/git)
}

interface PackageInfo {
  name: string;          // Package name
  repoPath: string;      // Absolute path
  gitRemote?: string;    // Git remote URL
  currentBranch?: string;
  mark1russell7Deps: string[];  // Ecosystem dependencies
}

interface LibScanOutput {
  packages: Record<string, PackageInfo>;
  warnings: Array<{ path: string; issue: string }>;
}
```

### lib.refresh

Install dependencies, build, and optionally commit.

```typescript
interface LibRefreshInput {
  path?: string;         // Package path (default: ".")
  recursive?: boolean;   // Refresh dependencies first (default: false)
  all?: boolean;         // Refresh all packages (default: false)
  force?: boolean;       // Clean rebuild (default: false)
  skipGit?: boolean;     // Skip git operations (default: false)
  autoConfirm?: boolean; // Non-interactive (default: false)
  dryRun?: boolean;      // Preview only (default: false)
}

interface RefreshResult {
  name: string;
  path: string;
  success: boolean;
  duration: number;
  error?: string;
  failedPhase?: "cleanup" | "install" | "build" | "git";
}

interface LibRefreshOutput {
  success: boolean;
  results: RefreshResult[];
  totalDuration: number;
}
```

**Example:**
```bash
# Via CLI
mark lib refresh -a -f  # Refresh all, force clean
mark lib refresh -r     # Refresh with dependencies
```

### lib.install

Clone and build all packages from ecosystem manifest.

```typescript
interface LibInstallInput {
  rootPath?: string;     // Root path (default: ~/git)
  dryRun?: boolean;      // Preview only (default: false)
  continueOnError?: boolean;  // Continue on failure (default: false)
  concurrency?: number;  // Parallel operations (default: 4)
}

interface LibInstallOutput {
  success: boolean;
  cloned: string[];      // Newly cloned packages
  skipped: string[];     // Already existed
  results: InstallResult[];
  errors: string[];
  totalDuration: number;
}
```

### lib.new

Create a new package with scaffolding.

```typescript
interface LibNewInput {
  name: string;          // Package name (without @mark1russell7/)
  preset?: string;       // Feature preset (default: "lib")
  rootPath?: string;     // Root path (default: ~/git)
  skipGit?: boolean;     // Skip git init (default: false)
  skipManifest?: boolean; // Skip manifest update (default: false)
  dryRun?: boolean;      // Preview only (default: false)
}

interface LibNewOutput {
  success: boolean;
  packageName: string;   // Full name (@mark1russell7/...)
  packagePath: string;   // Created path
  created: string[];     // Files created
  operations: string[];  // Operations performed
  errors: string[];
}
```

**Example:**
```bash
mark lib new my-package         # Create with default preset
mark lib new my-package -p app  # Create with app preset
```

### lib.audit

Validate all packages against the project template.

```typescript
interface LibAuditInput {
  rootPath?: string;     // Root path (default: ~/git)
  fix?: boolean;         // Fix issues (default: false)
}

interface PackageAuditResult {
  name: string;
  path: string;
  valid: boolean;
  missingFiles: string[];
  missingDirs: string[];
  pnpmIssues: PnpmIssue[];
  fixedFiles?: string[];
  fixedDirs?: string[];
}

interface LibAuditOutput {
  success: boolean;
  template: { files: string[]; dirs: string[] };
  results: PackageAuditResult[];
  summary: { total: number; valid: number; invalid: number };
}
```

### lib.rename

Rename a package across all ecosystem packages.

```typescript
interface LibRenameInput {
  oldName: string;       // Current package name
  newName: string;       // New package name
  rootPath?: string;     // Root path (default: ~/git)
  dryRun?: boolean;      // Preview only (default: false)
}

interface RenameChange {
  type: "package-name" | "dependency" | "import" | "dynamic-import";
  file: string;
  field?: string;
  line?: number;
  oldValue: string;
  newValue: string;
}

interface LibRenameOutput {
  success: boolean;
  changes: RenameChange[];
  errors: string[];
  summary: { packageNames: number; dependencies: number; imports: number; total: number };
}
```

### dag.traverse

Execute a procedure on each package in dependency order.

```typescript
interface DagTraverseInput {
  visit: string[] | { $proc: string[]; input?: unknown };  // Procedure to call
  filter?: string[];     // Package name filter
  root?: string;         // Start from package
  concurrency?: number;  // Parallel ops (default: 4)
  continueOnError?: boolean;  // Continue on failure (default: false)
  dryRun?: boolean;      // Preview only (default: false)
}

interface DagTraverseOutput {
  success: boolean;
  results: TraverseNodeResult[];
  totalDuration: number;
  visited: number;
  failed: number;
}
```

**Example:**
```typescript
// Run tests on all packages in dependency order
await client.call(["dag", "traverse"], {
  visit: ["test", "run"],
  concurrency: 2,
});
```

## DAG Execution

Packages are processed in dependency order:

```
Level 2:  [app-1, app-2]              ← Processed last
              │
Level 1:  [client-lib, client-mongo]  ← Middle layer
              │
Level 0:  [client, logger, cue]       ← Processed first (no deps)
```

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          client-lib                                          │
│               (Ecosystem management procedures)                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
     ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
     │  client-shell   │   │   client-git    │   │   client-dag    │
     │  (shell.run)    │   │   (git ops)     │   │  (parallel exec)│
     └─────────────────┘   └─────────────────┘   └─────────────────┘
```

## License

MIT
