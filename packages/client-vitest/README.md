# @mark1russell7/client-vitest

Vitest-specific test procedures. Run and watch tests with Vitest.

## Installation

```bash
npm install github:mark1russell7/client-vitest#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application                                     │
│                                                                              │
│   await client.call(["vitest", "run"], { coverage: true })                  │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           client-vitest                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │        vitest.run           │  │         vitest.watch                │  │
│  │                             │  │                                     │  │
│  │  Run tests once:            │  │  Start watch mode:                  │  │
│  │  • Include/exclude patterns │  │  • File watching                   │  │
│  │  • Coverage reporting       │  │  • Incremental testing             │  │
│  │  • Multiple reporters       │  │  • Hot reloading                   │  │
│  │  • Pass with no tests       │  │                                     │  │
│  └─────────────────────────────┘  └─────────────────────────────────────┘  │
│                                                                              │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         client-shell                                     ││
│  │              shell.run("npx", ["vitest", ...args])                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { Client } from "@mark1russell7/client";
import "@mark1russell7/client-vitest/register";

const client = new Client({ /* transport */ });

// Run all tests
const result = await client.call(["vitest", "run"], {
  cwd: "/path/to/project",
});

console.log(`Passed: ${result.passed}, Failed: ${result.failed}`);

// Run with coverage
const coverage = await client.call(["vitest", "run"], {
  coverage: true,
});

if (coverage.coverage) {
  console.log(`Line coverage: ${coverage.coverage.lines}%`);
}
```

## Procedures

| Path | Description |
|------|-------------|
| `vitest.run` | Run tests once |
| `vitest.watch` | Start watch mode |

### vitest.run

Run Vitest tests with configurable options.

```typescript
interface VitestRunInput {
  cwd?: string;          // Working directory
  include?: string[];    // Include patterns
  exclude?: string[];    // Exclude patterns
  watch?: boolean;       // Watch mode
  coverage?: boolean;    // Enable coverage
  reporter?: "default" | "verbose" | "json" | "junit";
  passWithNoTests?: boolean;  // Pass if no tests found
}

interface VitestRunOutput {
  success: boolean;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;      // ms
  coverage?: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
  };
}
```

**Example:**
```typescript
// Run specific tests
const result = await client.call(["vitest", "run"], {
  include: ["src/**/*.test.ts"],
  exclude: ["**/*.e2e.test.ts"],
  reporter: "verbose",
});

// Run with coverage
const coverage = await client.call(["vitest", "run"], {
  coverage: true,
});

if (coverage.coverage && coverage.coverage.lines < 80) {
  console.warn("Coverage below 80%!");
}
```

### vitest.watch

Start Vitest in watch mode.

```typescript
interface VitestWatchInput {
  cwd?: string;          // Working directory
  include?: string[];    // Include patterns
}

interface VitestWatchOutput {
  pid: number;           // Process ID
  status: "started" | "stopped";
}
```

**Example:**
```typescript
// Start watch mode
const { pid } = await client.call(["vitest", "watch"], {
  include: ["src/**/*.test.ts"],
});

console.log(`Vitest watching (PID: ${pid})`);
```

## CLI Usage

```bash
# Run tests via mark CLI
mark vitest run

# Run with coverage
mark vitest run --coverage

# Run specific patterns
mark vitest run --include "src/**/*.unit.test.ts"

# Start watch mode
mark vitest watch
```

## Coverage Output

When `coverage: true`, the output includes detailed coverage metrics:

```typescript
{
  success: true,
  passed: 42,
  failed: 0,
  skipped: 2,
  duration: 5432,
  coverage: {
    lines: 87.5,
    branches: 72.3,
    functions: 91.2,
    statements: 86.8
  }
}
```

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              client                                          │
│                         (Core RPC framework)                                 │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
     ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
     │  client-test    │   │ client-vitest   │   │  Other test     │
     │  (generic)      │   │ (Vitest-specific)│   │  adapters       │
     └────────┬────────┘   └────────┬────────┘   └─────────────────┘
              │                     │
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │    client-shell     │
              │   (shell.run)       │
              └─────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │       vitest        │
              └─────────────────────┘
```

## License

MIT
