# @mark1russell7/test

[![npm version](https://img.shields.io/npm/v/@mark1russell7/test.svg)](https://www.npmjs.com/package/@mark1russell7/test)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18.svg)](https://vitest.dev/)

Comprehensive testing utilities for the Mark ecosystem. Provides fixtures, mocks, test helpers, and shared Vitest configuration for consistent testing across all packages.

## Overview

`@mark1russell7/test` is the central testing package that aggregates all testing utilities. It provides:

- **Fixtures** - Temporary directories, package.json factories, git repo setup
- **Mocks** - Re-exports from mock-client, mock-fs, and mock-logger
- **Utils** - Async helpers (waitFor, sleep, assertions, timeouts)
- **Vitest Config** - Shared configuration for consistent testing across packages

## Installation

```bash
npm install github:mark1russell7/test#main
```

## Architecture

```mermaid
graph TB
    subgraph "Test Package"
        Test[@mark1russell7/test]
        Fixtures[Fixtures Module]
        Mocks[Mocks Module]
        Utils[Utils Module]
        VitestCfg[Vitest Config]
    end

    subgraph "Mock Dependencies"
        MockClient[@mark1russell7/mock-client]
        MockFs[@mark1russell7/mock-fs]
        MockLogger[@mark1russell7/mock-logger]
    end

    subgraph "Ecosystem Packages"
        ClientPkgs[client-*]
        OtherPkgs[Other Packages]
    end

    Test -->|exports| Fixtures
    Test -->|exports| Mocks
    Test -->|exports| Utils
    Test -->|exports| VitestCfg

    Mocks -->|re-exports| MockClient
    Mocks -->|re-exports| MockFs
    Mocks -->|re-exports| MockLogger

    ClientPkgs -.->|import| Test
    OtherPkgs -.->|import| Test

    style Test fill:#e1f5ff
    style MockClient fill:#fff4e1
    style MockFs fill:#fff4e1
    style MockLogger fill:#fff4e1
```

### Package Exports

```mermaid
graph LR
    Test[@mark1russell7/test]
    Main[Main Export]
    FixturesExp[/fixtures Export]
    MocksExp[/mocks Export]
    UtilsExp[/utils Export]
    VitestExp[/vitest.shared Export]

    Test -->|.| Main
    Test -->|./fixtures| FixturesExp
    Test -->|./mocks| MocksExp
    Test -->|./utils| UtilsExp
    Test -->|./vitest.shared| VitestExp

    Main -.->|re-exports all| FixturesExp
    Main -.->|re-exports all| MocksExp
    Main -.->|re-exports all| UtilsExp
    Main -.->|exports| VitestExp

    style Test fill:#e1f5ff
```

## Quick Start

```typescript
import { describe, it, beforeEach, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  createMockContext,
  waitFor,
  sleep,
} from "@mark1russell7/test";

describe("my feature", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should work with temp files", async () => {
    // Use tempDir for isolated file operations
  });
});
```

## API Reference

### Package Structure

```typescript
// Main export - re-exports everything
import * as test from "@mark1russell7/test";

// Specific exports
import { createTempDir, cleanupTempDir } from "@mark1russell7/test/fixtures";
import { createMockClient, MockClient } from "@mark1russell7/test/mocks";
import { waitFor, sleep } from "@mark1russell7/test/utils";
import { sharedConfig } from "@mark1russell7/test/vitest.shared";
```

### Fixtures (`@mark1russell7/test/fixtures`)

Test fixture utilities for creating temporary directories and test data.

#### `createTempDir(prefix?)`

Create an isolated temporary directory for test operations.

```typescript
function createTempDir(prefix?: string): Promise<string>
```

**Parameters:**
- `prefix` - Optional prefix for the directory name (default: `"test-"`)

**Returns:** Promise resolving to the absolute path of the created directory

**Example:**
```typescript
import { createTempDir, cleanupTempDir } from "@mark1russell7/test/fixtures";

const tempDir = await createTempDir("my-test-");
// Returns something like: /tmp/my-test-abc123xyz

// Use for isolated file operations
await fs.promises.writeFile(path.join(tempDir, "file.txt"), "content");

// Cleanup when done
await cleanupTempDir(tempDir);
```

#### `cleanupTempDir(dirPath)`

Remove a temporary directory and all its contents.

```typescript
function cleanupTempDir(dirPath: string): Promise<void>
```

**Parameters:**
- `dirPath` - Absolute path to the directory to remove

**Returns:** Promise that resolves when cleanup is complete

**Example:**
```typescript
afterEach(async () => {
  await cleanupTempDir(tempDir);
});
```

#### `createPackageJson(options)`

Create a package.json object for testing.

```typescript
interface PackageJsonFixture {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function createPackageJson(options: PackageJsonFixture): object
```

**Parameters:**
- `options.name` - Package name (required)
- `options.version` - Package version (default: `"1.0.0"`)
- `options.dependencies` - Production dependencies
- `options.devDependencies` - Development dependencies

**Returns:** Package.json object with standard fields

**Example:**
```typescript
const pkg = createPackageJson({
  name: "@test/my-package",
  version: "2.0.0",
  dependencies: { "lodash": "^4.17.21" },
  devDependencies: { "vitest": "^3.0.0" },
});
// Returns: { name, version, type: "module", dependencies, devDependencies }
```

#### `writePackageJson(dirPath, options)`

Write a package.json file to a directory.

```typescript
function writePackageJson(
  dirPath: string,
  options: PackageJsonFixture
): Promise<void>
```

**Parameters:**
- `dirPath` - Directory where package.json will be written
- `options` - Package.json content options

**Example:**
```typescript
await writePackageJson(tempDir, {
  name: "@test/package",
  dependencies: { "react": "^18.0.0" },
});
// Creates tempDir/package.json
```

#### `writeTsFile(filePath, content)`

Write a TypeScript file with automatic parent directory creation.

```typescript
function writeTsFile(filePath: string, content: string): Promise<void>
```

**Parameters:**
- `filePath` - Absolute path to the TypeScript file
- `content` - File content

**Example:**
```typescript
await writeTsFile(
  path.join(tempDir, "src/index.ts"),
  'export const hello = () => console.log("Hello");'
);
// Creates tempDir/src/index.ts with parent directory
```

#### `initGitRepo(dirPath, options?)`

Initialize a git repository in a directory.

```typescript
function initGitRepo(
  dirPath: string,
  options?: { initialCommit?: boolean }
): Promise<void>
```

**Parameters:**
- `dirPath` - Directory to initialize as git repo
- `options.initialCommit` - Whether to create an initial commit (default: `false`)

**Example:**
```typescript
await initGitRepo(tempDir, { initialCommit: true });
// Creates .git directory, sets user.name/email, creates initial commit
```

### Mocks (`@mark1russell7/test/mocks`)

Re-exports all mock utilities from standalone mock packages for convenience.

**Available Exports:**

```typescript
// From @mark1russell7/mock-client
export {
  createMockClient,
  createMockContext,
  mockOutput,
  mockError,
  mockDelayed,
  type MockClient,
  type MockProcedureContext,
  type MockCallRecord,
  type MockResponse,
  type MockFn,
  type ProcedurePath,
  type CreateMockClientOptions,
} from "@mark1russell7/mock-client";

// From @mark1russell7/mock-fs
export {
  createMockFs,
  type MockFs,
  type MockFsEntry,
  type CreateMockFsOptions,
} from "@mark1russell7/mock-fs";

// From @mark1russell7/mock-logger
export {
  createMockLogger,
  LogLevel,
  LOG_LEVEL_NAMES,
  type MockLogger,
  type CapturedLogEntry,
  type LogOptions,
  type CreateMockLoggerOptions,
} from "@mark1russell7/mock-logger";
```

**Usage:**

```typescript
import {
  createMockClient,
  createMockFs,
  createMockLogger,
  createMockContext,
} from "@mark1russell7/test/mocks";

// All mock utilities in one import
const client = createMockClient();
const fs = createMockFs();
const logger = createMockLogger();
const ctx = createMockContext({ client });
```

See individual package READMEs for detailed documentation:
- [@mark1russell7/mock-client](../mock-client/README.md)
- [@mark1russell7/mock-fs](../mock-fs/README.md)
- [@mark1russell7/mock-logger](../mock-logger/README.md)

### Utils (`@mark1russell7/test/utils`)

General-purpose test utilities for async operations and assertions.

#### `waitFor(condition, options?)`

Wait for a condition to become true with timeout and polling.

```typescript
function waitFor(
  condition: () => boolean | Promise<boolean>,
  options?: { timeout?: number; interval?: number }
): Promise<void>
```

**Parameters:**
- `condition` - Function returning boolean (sync or async)
- `options.timeout` - Maximum time to wait in ms (default: `5000`)
- `options.interval` - Polling interval in ms (default: `100`)

**Throws:** Error if condition is not met within timeout

**Example:**
```typescript
import { waitFor } from "@mark1russell7/test/utils";

// Wait for file to exist
await waitFor(
  () => fs.existsSync("/path/to/file"),
  { timeout: 5000, interval: 100 }
);

// Wait for async condition
await waitFor(async () => {
  const status = await getServerStatus();
  return status === "ready";
}, { timeout: 10000 });
```

#### `sleep(ms)`

Async delay utility.

```typescript
function sleep(ms: number): Promise<void>
```

**Parameters:**
- `ms` - Milliseconds to sleep

**Example:**
```typescript
import { sleep } from "@mark1russell7/test/utils";

await sleep(1000); // Wait 1 second
```

#### `captureOutput(fn)`

Capture console output during test execution.

```typescript
interface CapturedOutput {
  stdout: string[];
  stderr: string[];
}

function captureOutput(
  fn: () => void | Promise<void>
): Promise<CapturedOutput>
```

**Parameters:**
- `fn` - Function to execute while capturing output

**Returns:** Promise resolving to captured stdout and stderr

**Example:**
```typescript
import { captureOutput } from "@mark1russell7/test/utils";

const { stdout, stderr } = await captureOutput(() => {
  console.log("Hello");
  console.error("Error");
});

expect(stdout).toEqual(["Hello"]);
expect(stderr).toEqual(["Error"]);
```

#### `assertThrows(fn, expectedMessage?)`

Assert that a function throws with an optional message check.

```typescript
function assertThrows(
  fn: () => void | Promise<void>,
  expectedMessage?: string | RegExp
): Promise<Error>
```

**Parameters:**
- `fn` - Function that should throw
- `expectedMessage` - Optional message pattern to match (string or regex)

**Returns:** Promise resolving to the thrown error

**Throws:** If function doesn't throw or message doesn't match

**Example:**
```typescript
import { assertThrows } from "@mark1russell7/test/utils";

// Assert throws any error
const error = await assertThrows(() => {
  throw new Error("Something failed");
});

// Assert throws with specific message
await assertThrows(
  () => { throw new Error("File not found"); },
  "not found"
);

// Assert throws matching regex
await assertThrows(
  () => { throw new Error("ENOENT: file missing"); },
  /ENOENT/
);
```

#### `createDeferred<T>()`

Create a deferred promise for advanced async testing.

```typescript
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T = void>(): Deferred<T>
```

**Returns:** Deferred object with promise and resolver functions

**Example:**
```typescript
import { createDeferred } from "@mark1russell7/test/utils";

const deferred = createDeferred<string>();

// Start async operation
setTimeout(() => {
  deferred.resolve("done");
}, 1000);

// Wait for completion
const result = await deferred.promise;
expect(result).toBe("done");
```

#### `withTimeout(fn, timeout, message?)`

Run a function with a timeout.

```typescript
function withTimeout<T>(
  fn: () => Promise<T>,
  timeout: number,
  message?: string
): Promise<T>
```

**Parameters:**
- `fn` - Async function to execute
- `timeout` - Timeout in milliseconds
- `message` - Optional timeout error message (default: `"Operation timed out"`)

**Returns:** Promise resolving to function result

**Throws:** Error if timeout is exceeded

**Example:**
```typescript
import { withTimeout } from "@mark1russell7/test/utils";

const result = await withTimeout(
  async () => {
    await fetchData();
    return "success";
  },
  3000,
  "Fetch operation timed out"
);
```

### Vitest Configuration (`@mark1russell7/test/vitest.shared`)

Shared Vitest configuration for consistent testing across all ecosystem packages.

#### `sharedConfig`

Base Vitest configuration object.

```typescript
import type { ViteUserConfig } from "vitest/config";

export const sharedConfig: ViteUserConfig = {
  test: {
    // Global settings
    globals: false,
    environment: "node",

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Reporter
    reporters: ["default"],

    // Coverage settings
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/*.d.ts",
        "**/*.test.ts",
        "**/index.ts",
      ],
    },

    // Pool settings for parallel execution
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },
};
```

**Configuration Details:**

- `globals: false` - Disable global test functions (use explicit imports)
- `environment: "node"` - Run tests in Node.js environment
- `testTimeout: 10000` - 10-second timeout for individual tests
- `hookTimeout: 10000` - 10-second timeout for hooks (beforeEach, etc.)
- `coverage.provider: "v8"` - Use V8 coverage provider
- `coverage.reporter` - Generate text, JSON, and HTML coverage reports
- `pool: "threads"` - Run tests in parallel using worker threads

**Usage:**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { sharedConfig } from "@mark1russell7/test/vitest.shared";

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    // Package-specific overrides
    include: ["src/**/*.test.ts"],
  },
});
```

**Alternative: Merge Config**

```typescript
// vitest.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import { sharedConfig } from "@mark1russell7/test/vitest.shared";

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
      coverage: {
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
      },
    },
  })
);
```

## Usage Patterns

### Isolated File Tests

```typescript
describe("file processing", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await copyFixture("sample-files", tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should process files", async () => {
    const result = await processFiles(tempDir);
    expect(result.processed).toBe(3);
  });
});
```

### Procedure Testing

```typescript
describe("myProcedure", () => {
  it("should handle input correctly", async () => {
    const mockClient = createMockClient();
    mockClient.mockResponse(["fs", "read"], {
      output: { content: "data" },
    });

    const ctx = createMockContext({ client: mockClient });
    const result = await myProcedure({ path: "/file" }, ctx);

    expect(result.success).toBe(true);
  });
});
```

### Async Operations

```typescript
it("should wait for completion", async () => {
  const task = startAsyncTask();

  await waitFor(() => task.isComplete, { timeout: 5000 });

  expect(task.result).toBeDefined();
});
```

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              @mark1russell7/test                             │
│                          (Shared test utilities)                             │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
     ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
     │   mock-client   │   │    mock-fs      │   │   mock-logger   │
     │  (RPC mocking)  │   │ (FS mocking)    │   │  (Log mocking)  │
     └─────────────────┘   └─────────────────┘   └─────────────────┘
```

## License

MIT
