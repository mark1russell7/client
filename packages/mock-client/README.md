# @mark1russell7/mock-client

Mock Client for unit testing procedures. Track calls and configure responses.

## Installation

```bash
npm install github:mark1russell7/mock-client#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Test Suite                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                          Mock Client                                     ││
│  │                                                                          ││
│  │  ┌──────────────────────────────────────────────────────────────────┐  ││
│  │  │                      Call Recording                               │  ││
│  │  │                                                                   │  ││
│  │  │   client.call(["fs", "read"], { path: "..." })                   │  ││
│  │  │          │                                                        │  ││
│  │  │          ▼                                                        │  ││
│  │  │   calls: [{ path: ["fs", "read"], input: {...}, timestamp: ... }]│  ││
│  │  │                                                                   │  ││
│  │  └──────────────────────────────────────────────────────────────────┘  ││
│  │                                                                          ││
│  │  ┌──────────────────────────────────────────────────────────────────┐  ││
│  │  │                   Response Configuration                          │  ││
│  │  │                                                                   │  ││
│  │  │   mockResponse(["fs", "read"], { output: { content: "..." } })   │  ││
│  │  │   mockImplementation(["fs", "read"], (input) => {...})           │  ││
│  │  │   mockError(["fs", "read"], new Error("File not found"))         │  ││
│  │  │                                                                   │  ││
│  │  └──────────────────────────────────────────────────────────────────┘  ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      Procedure Under Test                                ││
│  │                                                                          ││
│  │   async function myProcedure(input, ctx) {                              ││
│  │     const data = await ctx.client.call(["fs", "read"], {...});          ││
│  │     // ... uses mocked response                                         ││
│  │   }                                                                      ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createMockClient, createMockContext, mockOutput } from "@mark1russell7/mock-client";

describe("myProcedure", () => {
  let mockClient: MockClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it("should read and process file", async () => {
    // Configure mock response
    mockClient.mockResponse(["fs", "read"], {
      output: { content: "Hello, World!" },
    });

    // Create context with mock client
    const ctx = createMockContext({ client: mockClient });

    // Call procedure under test
    const result = await myProcedure({ path: "./file.txt" }, ctx);

    // Verify calls were made
    const calls = mockClient.getCallsFor(["fs", "read"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toEqual({ path: "./file.txt" });
  });
});
```

## API Reference

### createMockClient(options?)

Create a new mock client.

```typescript
interface CreateMockClientOptions {
  defaultResponse?: MockResponse;  // Default response for unmocked procedures
  recordCalls?: boolean;           // Record calls (default: true)
}

const mockClient = createMockClient({
  defaultResponse: { output: {} },
  recordCalls: true,
});
```

### MockClient Interface

```typescript
interface MockClient {
  // Execute procedures (recorded)
  call(path: string[], input: unknown): Promise<unknown>;
  exec(refOrPath: unknown, input?: unknown): Promise<unknown>;

  // Call recording
  getCalls(): MockCallRecord[];
  getCallsFor(path: string[]): MockCallRecord[];
  clearCalls(): void;

  // Response configuration
  mockResponse<T>(path: string[], response: MockResponse<T>): void;
  mockImplementation<TInput, TOutput>(
    path: string[],
    impl: (input: TInput) => TOutput | Promise<TOutput>
  ): void;

  // Reset all mocks
  reset(): void;
}

interface MockCallRecord {
  path: string[];
  input: unknown;
  timestamp: number;
}

interface MockResponse<T = unknown> {
  output?: T;            // Response to return
  error?: Error;         // Error to throw
  delay?: number;        // Delay in ms before responding
}
```

### Response Configuration

#### mockResponse

Set a static response for a procedure:

```typescript
mockClient.mockResponse(["fs", "read"], {
  output: { content: "file contents" },
});

// With delay
mockClient.mockResponse(["db", "query"], {
  output: { rows: [] },
  delay: 100,
});

// With error
mockClient.mockResponse(["fs", "write"], {
  error: new Error("Permission denied"),
});
```

#### mockImplementation

Set a dynamic implementation:

```typescript
mockClient.mockImplementation(["math", "add"], (input: { a: number; b: number }) => {
  return { result: input.a + input.b };
});

// Async implementation
mockClient.mockImplementation(["db", "find"], async (input) => {
  const results = await someAsyncOperation(input);
  return { items: results };
});
```

### Helper Functions

```typescript
import { mockOutput, mockError, mockDelayed } from "@mark1russell7/mock-client";

// Quick response helpers
mockClient.mockResponse(["proc"], mockOutput({ data: "value" }));
mockClient.mockResponse(["proc"], mockError("Something went wrong"));
mockClient.mockResponse(["proc"], mockDelayed({ data: "value" }, 500));
```

### createMockContext(options?)

Create a mock procedure context for testing handlers.

```typescript
interface MockProcedureContext {
  metadata: Record<string, unknown>;
  path: string[];
  client: MockClient;
  signal?: AbortSignal;
}

const ctx = createMockContext({
  path: ["my", "procedure"],
  metadata: { userId: "123" },
  client: mockClient,
});
```

## Testing Patterns

### Verify Procedure Calls

```typescript
it("should call git.status", async () => {
  mockClient.mockResponse(["git", "status"], { output: { clean: true } });

  await checkGitStatus(ctx);

  const calls = mockClient.getCallsFor(["git", "status"]);
  expect(calls).toHaveLength(1);
  expect(calls[0].input.cwd).toBe("/repo");
});
```

### Test Error Handling

```typescript
it("should handle errors gracefully", async () => {
  mockClient.mockResponse(["fs", "read"], {
    error: new Error("ENOENT: no such file"),
  });

  const result = await readConfigSafe(ctx);

  expect(result).toEqual({ error: "File not found" });
});
```

### Test with Delays

```typescript
it("should timeout on slow responses", async () => {
  mockClient.mockResponse(["api", "call"], {
    output: { data: "value" },
    delay: 5000,  // 5 seconds
  });

  await expect(callWithTimeout(ctx, 1000)).rejects.toThrow("Timeout");
});
```

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Testing Utilities                                    │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   mock-client   │  │    mock-fs      │  │       mock-logger           │ │
│  │  Mock RPC calls │  │ Mock file system│  │     Mock logging            │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────┬───────────────┘ │
│           │                    │                         │                  │
│           └────────────────────┼─────────────────────────┘                  │
│                                ▼                                            │
│                     ┌─────────────────────┐                                │
│                     │        test         │                                │
│                     │ (Shared test utils) │                                │
│                     └─────────────────────┘                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## License

MIT
