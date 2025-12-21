# @mark1russell7/mock-logger

Mock Logger for unit testing. Capture and verify log output.

## Installation

```bash
npm install github:mark1russell7/mock-logger#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Test Suite                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        Mock Logger                                       ││
│  │                                                                          ││
│  │  ┌────────────────────────────────────────────────────────────────────┐ ││
│  │  │                     Captured Entries                                │ ││
│  │  │                                                                     │ ││
│  │  │   logger.info("Starting process")                                  │ ││
│  │  │   logger.error("Something failed", { error: e })                   │ ││
│  │  │          │                                                          │ ││
│  │  │          ▼                                                          │ ││
│  │  │   entries: [                                                        │ ││
│  │  │     { level: INFO, message: "Starting process", ... },             │ ││
│  │  │     { level: ERROR, message: "Something failed", data: {...} }     │ ││
│  │  │   ]                                                                 │ ││
│  │  │                                                                     │ ││
│  │  └────────────────────────────────────────────────────────────────────┘ ││
│  │                                                                          ││
│  │  ┌────────────────────────────────────────────────────────────────────┐ ││
│  │  │                      Log Levels                                     │ ││
│  │  │                                                                     │ ││
│  │  │   ERROR (0) ─► WARN (1) ─► INFO (2) ─► DEBUG (3) ─► TRACE (4)      │ ││
│  │  │                                                                     │ ││
│  │  └────────────────────────────────────────────────────────────────────┘ ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createMockLogger, LogLevel, type MockLogger } from "@mark1russell7/mock-logger";

describe("logging behavior", () => {
  let logger: MockLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it("should capture log messages", () => {
    logger.info("Processing started");
    logger.warn("Low memory");
    logger.error("Critical failure");

    expect(logger.hasLogged("Processing started")).toBe(true);
    expect(logger.hasLoggedAtLevel(LogLevel.ERROR, "Critical")).toBe(true);
  });

  it("should filter by level", () => {
    logger.setLevel(LogLevel.WARN);

    logger.debug("Debug message");  // Not captured
    logger.warn("Warning message"); // Captured

    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("Warning message");
  });
});
```

## API Reference

### createMockLogger(options?)

Create a new mock logger.

```typescript
interface CreateMockLoggerOptions {
  level?: LogLevel;      // Initial log level (default: TRACE)
  context?: string;      // Context prefix
}

const logger = createMockLogger({
  level: LogLevel.INFO,
  context: "MyService",
});
```

### Log Levels

```typescript
enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}
```

### MockLogger Interface

```typescript
interface CapturedLogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  timestamp: Date;
  data?: Record<string, unknown>;
  error?: Error;
}

interface LogOptions {
  context?: string;
  data?: Record<string, unknown>;
  error?: Error;
}

interface MockLogger {
  // Log methods (all recorded as vi.fn mocks)
  log(level: LogLevel, message: string, options?: LogOptions): void;
  error(message: string, options?: LogOptions): void;
  warn(message: string, options?: LogOptions): void;
  info(message: string, options?: LogOptions): void;
  debug(message: string, options?: LogOptions): void;
  trace(message: string, options?: LogOptions): void;

  // Child logger
  child(context: string): MockLogger;

  // Level control
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;

  // Entry inspection
  getEntries(): CapturedLogEntry[];
  getEntriesForLevel(level: LogLevel): CapturedLogEntry[];

  // Assertions
  hasLogged(message: string | RegExp): boolean;
  hasLoggedAtLevel(level: LogLevel, message: string | RegExp): boolean;

  // Reset
  clear(): void;
  reset(): void;
}
```

### Logging Methods

```typescript
// Simple messages
logger.info("User logged in");
logger.warn("Rate limit approaching");
logger.error("Database connection failed");

// With context
logger.info("Request received", { context: "HttpServer" });

// With data
logger.info("User created", { data: { userId: "123", email: "user@example.com" } });

// With error
logger.error("Operation failed", { error: new Error("Timeout") });
```

### Child Loggers

Create loggers with inherited context:

```typescript
const logger = createMockLogger({ context: "App" });
const childLogger = logger.child("Database");

childLogger.info("Connected");
// Entry: { context: "App:Database", message: "Connected" }
```

### Inspecting Entries

```typescript
// Get all entries
const entries = logger.getEntries();

// Get by level
const errors = logger.getEntriesForLevel(LogLevel.ERROR);

// Check if logged
if (logger.hasLogged("Connection established")) {
  console.log("Connection was logged");
}

// Check with regex
if (logger.hasLogged(/user.*created/i)) {
  console.log("User creation was logged");
}

// Check at specific level
if (logger.hasLoggedAtLevel(LogLevel.ERROR, "timeout")) {
  console.log("Timeout error was logged");
}
```

### Level Filtering

```typescript
const logger = createMockLogger({ level: LogLevel.WARN });

logger.debug("Debug message");  // Ignored (below WARN)
logger.warn("Warning message"); // Captured
logger.error("Error message");  // Captured

expect(logger.getEntries()).toHaveLength(2);
```

## Testing Patterns

### Verify Error Logging

```typescript
it("should log errors on failure", async () => {
  const logger = createMockLogger();

  await processData(logger, { invalidData: true });

  expect(logger.hasLoggedAtLevel(LogLevel.ERROR, "validation")).toBe(true);
  const errors = logger.getEntriesForLevel(LogLevel.ERROR);
  expect(errors[0].data?.field).toBe("email");
});
```

### Verify No Errors

```typescript
it("should complete without errors", async () => {
  const logger = createMockLogger();

  await processData(logger, { validData: true });

  const errors = logger.getEntriesForLevel(LogLevel.ERROR);
  expect(errors).toHaveLength(0);
});
```

### Verify Specific Messages

```typescript
it("should log progress", async () => {
  const logger = createMockLogger();

  await processItems(logger, ["a", "b", "c"]);

  expect(logger.hasLogged(/Processing item: a/)).toBe(true);
  expect(logger.hasLogged(/Processing item: b/)).toBe(true);
  expect(logger.hasLogged(/Processing item: c/)).toBe(true);
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
