# @mark1russell7/client-vitest

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Vitest-3.x-6E9F18.svg)](https://vitest.dev/)

> Vitest-specific test procedures. Run and watch tests with full coverage reporting.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [vitest.run](#vitestrun)
  - [vitest.watch](#vitestwatch)
- [Coverage Reporting](#coverage-reporting)
- [CLI Usage](#cli-usage)
- [Integration](#integration)
- [Requirements](#requirements)
- [License](#license)

---

## Overview

**client-vitest** provides procedures for running Vitest tests:

- **Test Execution** - Run tests once with configurable patterns
- **Watch Mode** - Continuous testing during development
- **Coverage Reports** - Line, branch, function, and statement coverage
- **Multiple Reporters** - Default, verbose, JSON, and JUnit output

---

## Installation

```bash
npm install github:mark1russell7/client-vitest#main
```

---

## Architecture

### System Overview

```mermaid
graph TB
    subgraph "Application Layer"
        App[Your Application / CLI / MCP]
    end

    subgraph "client-vitest"
        Run[vitest.run<br/>Execute tests]
        Watch[vitest.watch<br/>Watch mode]
    end

    subgraph "Execution Layer"
        Shell[client-shell<br/>shell.run]
    end

    subgraph "Test Runner"
        Vitest[Vitest CLI<br/>npx vitest]
    end

    subgraph "Output"
        Results[Test Results]
        Coverage[Coverage Report]
    end

    App --> Run
    App --> Watch
    Run --> Shell
    Watch --> Shell
    Shell --> Vitest
    Vitest --> Results
    Vitest --> Coverage
```

### Test Execution Flow

```mermaid
sequenceDiagram
    participant App as Application
    participant CV as client-vitest
    participant Shell as client-shell
    participant Vitest as Vitest CLI
    participant FS as File System

    App->>CV: vitest.run({ coverage: true })
    CV->>CV: Build CLI args
    CV->>Shell: shell.run("npx", ["vitest", "run", "--coverage"])
    Shell->>Vitest: Execute vitest

    loop For each test file
        Vitest->>FS: Read test file
        Vitest->>Vitest: Execute tests
    end

    Vitest->>FS: Write coverage report
    Vitest-->>Shell: Exit code + stdout
    Shell-->>CV: Command result
    CV->>CV: Parse output
    CV-->>App: { passed, failed, coverage }
```

### Package Dependencies

```mermaid
graph BT
    subgraph "Test Packages"
        ClientVitest[client-vitest]
        ClientTest[client-test]
    end

    subgraph "Execution"
        Shell[client-shell]
    end

    subgraph "Core"
        Client[client]
    end

    subgraph "External"
        Vitest[vitest]
    end

    ClientVitest --> Shell
    ClientVitest --> Client
    ClientTest --> Shell
    ClientTest --> Client
    Shell --> Client
    ClientVitest -.->|executes| Vitest
```

---

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

---

## API Reference

### Procedures Summary

| Path | Description |
|------|-------------|
| `vitest.run` | Run tests once |
| `vitest.watch` | Start watch mode |

---

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

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | string | "." | Working directory |
| `include` | string[] | - | Glob patterns to include |
| `exclude` | string[] | - | Glob patterns to exclude |
| `coverage` | boolean | false | Enable coverage reporting |
| `reporter` | string | "default" | Output format |
| `passWithNoTests` | boolean | false | Don't fail if no tests |

**Example:**
```typescript
// Run specific tests
const result = await client.call(["vitest", "run"], {
  include: ["src/**/*.test.ts"],
  exclude: ["**/*.e2e.test.ts"],
  reporter: "verbose",
});

// Run with coverage threshold check
const coverage = await client.call(["vitest", "run"], {
  coverage: true,
});

if (coverage.coverage && coverage.coverage.lines < 80) {
  console.warn("Coverage below 80%!");
  process.exit(1);
}
```

---

### vitest.watch

Start Vitest in watch mode for continuous testing.

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

// Later: stop watch mode by killing PID
```

---

## Coverage Reporting

### Enabling Coverage

```typescript
const result = await client.call(["vitest", "run"], {
  coverage: true,
});
```

### Coverage Output Format

```typescript
{
  success: true,
  passed: 42,
  failed: 0,
  skipped: 2,
  duration: 5432,
  coverage: {
    lines: 87.5,      // Percentage of lines covered
    branches: 72.3,   // Percentage of branches covered
    functions: 91.2,  // Percentage of functions covered
    statements: 86.8  // Percentage of statements covered
  }
}
```

### Coverage Visualization

```mermaid
graph LR
    subgraph "Coverage Metrics"
        Lines[Lines: 87.5%]
        Branches[Branches: 72.3%]
        Functions[Functions: 91.2%]
        Statements[Statements: 86.8%]
    end

    subgraph "Thresholds"
        Good[">= 80%: Good"]
        Warning["60-80%: Warning"]
        Bad["< 60%: Needs work"]
    end

    Lines --> Good
    Functions --> Good
    Statements --> Good
    Branches --> Warning
```

---

## CLI Usage

```bash
# Run tests via mark CLI
mark vitest run

# Run with coverage
mark vitest run --coverage

# Run specific patterns
mark vitest run --include "src/**/*.unit.test.ts"

# Multiple patterns
mark vitest run --include "src/**/*.test.ts" --exclude "**/*.e2e.test.ts"

# Start watch mode
mark vitest watch

# Verbose output
mark vitest run --reporter verbose
```

---

## Integration

### With MCP (Claude)

When using the MCP server, Claude can:
- Run tests: "Run the tests for this project"
- Check coverage: "Run tests with coverage and tell me the results"
- Watch mode: "Start test watch mode"

### With DAG Traverse

```typescript
// Run tests across all packages in dependency order
await client.call(["dag", "traverse"], {
  visit: ["vitest", "run"],
  concurrency: 2,
});
```

### With CI/CD

```typescript
// CI script example
const result = await client.call(["vitest", "run"], {
  coverage: true,
  reporter: "junit",
});

if (!result.success) {
  process.exit(1);
}

if (result.coverage && result.coverage.lines < 80) {
  console.error("Coverage threshold not met");
  process.exit(1);
}
```

### With Other Test Packages

```mermaid
graph TB
    subgraph "Generic Testing"
        Test[client-test<br/>test.run, test.coverage]
    end

    subgraph "Framework-Specific"
        Vitest[client-vitest<br/>vitest.run, vitest.watch]
        Jest[client-jest<br/>future]
        Mocha[client-mocha<br/>future]
    end

    subgraph "Execution"
        Shell[client-shell]
    end

    Test --> Shell
    Vitest --> Shell
    Jest --> Shell
    Mocha --> Shell
```

---

## Requirements

- **Node.js** >= 20
- **Vitest** >= 3.0 (peer dependency)
- **Dependencies:**
  - `@mark1russell7/client`
  - `@mark1russell7/client-shell`

---

## License

MIT
