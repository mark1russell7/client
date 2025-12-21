# @mark1russell7/client-pnpm

pnpm package manager commands as RPC procedures.

## Installation

```bash
npm install github:mark1russell7/client-pnpm#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application                                     │
│                                                                              │
│   await client.call(["pnpm", "install"], { packages: ["lodash"], dev: true })│
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            client-pnpm                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│
│  │pnpm.install │  │  pnpm.add   │  │ pnpm.remove │  │     pnpm.link       ││
│  │             │  │             │  │             │  │                     ││
│  │ Install all │  │ Add packages│  │ Remove pkgs │  │ Link local packages ││
│  │ from lock   │  │ to project  │  │ from project│  │                     ││
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                          pnpm.run                                        ││
│  │              Run package.json scripts via pnpm                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         client-shell                                     ││
│  │                  shell.run("pnpm", [...args])                           ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { Client } from "@mark1russell7/client";
import "@mark1russell7/client-pnpm/register";

const client = new Client({ /* transport */ });

// Install all dependencies
await client.call(["pnpm", "install"], {
  cwd: "/path/to/project",
});

// Add a dev dependency
await client.call(["pnpm", "add"], {
  packages: ["typescript", "@types/node"],
  dev: true,
});

// Run a script
await client.call(["pnpm", "run"], {
  script: "build",
  cwd: "/path/to/project",
});
```

## Procedures

| Path | Description |
|------|-------------|
| `pnpm.install` | Install dependencies from package.json/lockfile |
| `pnpm.add` | Add packages to project |
| `pnpm.remove` | Remove packages from project |
| `pnpm.link` | Link local packages |
| `pnpm.run` | Run package.json scripts |

### pnpm.install

Install dependencies from package.json.

```typescript
interface PnpmInstallInput {
  packages?: string[];   // Specific packages to install (optional)
  dev?: boolean;         // Save as devDependency
  frozen?: boolean;      // Use --frozen-lockfile
  cwd?: string;          // Working directory
  timeout?: number;      // Timeout in ms
}

interface PnpmCommandOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
  duration: number;
}
```

**Example:**
```typescript
// Install all from lockfile
await client.call(["pnpm", "install"], {
  frozen: true,
  cwd: "/my/project",
});

// Install specific packages
await client.call(["pnpm", "install"], {
  packages: ["lodash", "zod"],
  dev: true,
});
```

### pnpm.add

Add packages to the project.

```typescript
interface PnpmAddInput {
  packages: string[];    // Packages to add
  dev?: boolean;         // Save as devDependency
  global?: boolean;      // Install globally
  cwd?: string;          // Working directory
  timeout?: number;      // Timeout in ms
}
```

**Example:**
```typescript
await client.call(["pnpm", "add"], {
  packages: ["vitest", "@vitest/coverage-v8"],
  dev: true,
});
```

### pnpm.remove

Remove packages from the project.

```typescript
interface PnpmRemoveInput {
  packages: string[];    // Packages to remove
  global?: boolean;      // Remove from global
  cwd?: string;          // Working directory
  timeout?: number;      // Timeout in ms
}
```

**Example:**
```typescript
await client.call(["pnpm", "remove"], {
  packages: ["old-package"],
});
```

### pnpm.link

Link local packages for development.

```typescript
interface PnpmLinkInput {
  path?: string;         // Path to package to link
  global?: boolean;      // Link globally
  cwd?: string;          // Working directory
  timeout?: number;      // Timeout in ms
}
```

**Example:**
```typescript
// Link current directory globally
await client.call(["pnpm", "link"], {
  global: true,
  cwd: "/path/to/my-package",
});

// Link a local package
await client.call(["pnpm", "link"], {
  path: "../my-local-package",
});
```

### pnpm.run

Run package.json scripts.

```typescript
interface PnpmRunInput {
  script: string;        // Script name
  args?: string[];       // Additional arguments
  cwd?: string;          // Working directory
  timeout?: number;      // Timeout in ms
}
```

**Example:**
```typescript
// Run build script
await client.call(["pnpm", "run"], {
  script: "build",
  cwd: "/my/project",
});

// Run test with arguments
await client.call(["pnpm", "run"], {
  script: "test",
  args: ["--coverage", "--watch"],
});
```

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLI Wrapper Layer                                    │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   client-pnpm   │  │    client-git   │  │       client-cli            │ │
│  │   pnpm.*        │  │    git.*        │  │       cli.run               │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────┬───────────────┘ │
│           │                    │                         │                  │
│           └────────────────────┼─────────────────────────┘                  │
│                                ▼                                            │
│                     ┌─────────────────────┐                                │
│                     │    client-shell     │                                │
│                     │ shell.run/exec/which│                                │
│                     └─────────────────────┘                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## License

MIT
