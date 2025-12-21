# @mark1russell7/test

Shared test utilities for the ecosystem. Fixtures, mocks, and helpers.

## Installation

```bash
npm install github:mark1russell7/test#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              @mark1russell7/test                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                           Fixtures                                       ││
│  │                                                                          ││
│  │   createTempDir()   - Create isolated temp directory                    ││
│  │   cleanupTempDir()  - Remove temp directory                             ││
│  │   copyFixture()     - Copy test fixtures                                ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                            Mocks                                         ││
│  │                                                                          ││
│  │   Re-exports from mock-client, mock-fs, mock-logger                     ││
│  │   createMockContext() - Create procedure test context                   ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                           Utils                                          ││
│  │                                                                          ││
│  │   waitFor()  - Wait for condition                                       ││
│  │   sleep()    - Async delay                                              ││
│  │   retry()    - Retry with backoff                                       ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      Vitest Configuration                                ││
│  │                                                                          ││
│  │   sharedConfig - Base vitest.config.ts settings                         ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
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

## Exports

### Fixtures

```typescript
import {
  createTempDir,
  cleanupTempDir,
  copyFixture,
} from "@mark1russell7/test/fixtures";
```

#### createTempDir()

Create an isolated temporary directory.

```typescript
const tempDir = await createTempDir();
// Returns: /tmp/test-abc123

// Use for isolated file operations
await fs.writeFile(path.join(tempDir, "file.txt"), "content");
```

#### cleanupTempDir(dir)

Remove a temporary directory and all contents.

```typescript
await cleanupTempDir(tempDir);
// Directory and all contents removed
```

#### copyFixture(name, dest)

Copy test fixtures from a fixtures directory.

```typescript
await copyFixture("sample-project", tempDir);
// Copies fixtures/sample-project/* to tempDir
```

### Mocks

```typescript
import {
  createMockContext,
  createMockClient,
  createMockFs,
  createMockLogger,
} from "@mark1russell7/test/mocks";
```

Re-exports all mock utilities from the mock-* packages for convenience.

#### createMockContext(options?)

Create a mock procedure context for testing handlers.

```typescript
const ctx = createMockContext({
  path: ["my", "procedure"],
  metadata: { userId: "123" },
});

// Use in procedure tests
const result = await myProcedure(input, ctx);
```

### Utils

```typescript
import { waitFor, sleep, retry } from "@mark1russell7/test/utils";
```

#### waitFor(condition, options?)

Wait for a condition to become true.

```typescript
// Wait for file to exist
await waitFor(
  () => fs.existsSync("/path/to/file"),
  { timeout: 5000, interval: 100 }
);

// Wait for async condition
await waitFor(async () => {
  const status = await getStatus();
  return status === "ready";
});
```

#### sleep(ms)

Async delay.

```typescript
await sleep(1000); // Wait 1 second
```

#### retry(fn, options?)

Retry a function with exponential backoff.

```typescript
const result = await retry(
  async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Not ready");
    return response.json();
  },
  { retries: 3, delay: 100, backoff: 2 }
);
```

### Vitest Configuration

```typescript
import { sharedConfig } from "@mark1russell7/test";
```

#### sharedConfig

Base Vitest configuration for ecosystem packages.

```typescript
// vitest.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import { sharedConfig } from "@mark1russell7/test";

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      // Package-specific overrides
    },
  })
);
```

Shared config includes:
- TypeScript path resolution
- Coverage settings
- Common test patterns
- Reporter configuration

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
