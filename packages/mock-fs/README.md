# @mark1russell7/mock-fs

In-memory file system mock for unit testing.

## Installation

```bash
npm install github:mark1russell7/mock-fs#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Test Suite                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                          Mock FS                                         ││
│  │                                                                          ││
│  │  ┌────────────────────────────────────────────────────────────────────┐ ││
│  │  │                    In-Memory File Store                             │ ││
│  │  │                                                                     │ ││
│  │  │   Map<string, MockFsEntry>                                          │ ││
│  │  │                                                                     │ ││
│  │  │   "/src/index.ts"  →  { type: "file", content: "...", mtime: ... } │ ││
│  │  │   "/src"           →  { type: "directory", mtime: ... }            │ ││
│  │  │   "/package.json"  →  { type: "file", content: "...", mtime: ... } │ ││
│  │  │                                                                     │ ││
│  │  └────────────────────────────────────────────────────────────────────┘ ││
│  │                                                                          ││
│  │  ┌────────────────────────────────────────────────────────────────────┐ ││
│  │  │                        Operations                                   │ ││
│  │  │                                                                     │ ││
│  │  │   readFile  │  writeFile  │  exists  │  unlink  │  mkdir  │ readdir│ ││
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
import { createMockFs, type MockFs } from "@mark1russell7/mock-fs";

describe("file operations", () => {
  let fs: MockFs;

  beforeEach(() => {
    fs = createMockFs({
      initialFiles: {
        "/config.json": '{"key": "value"}',
        "/src/index.ts": 'export const foo = "bar";',
      },
      initialDirs: ["/src", "/dist"],
    });
  });

  it("should read files", () => {
    const content = fs.readFile("/config.json");
    expect(content).toBe('{"key": "value"}');
  });

  it("should write files", () => {
    fs.writeFile("/output.txt", "Hello, World!");
    expect(fs.exists("/output.txt")).toBe(true);
    expect(fs.readFile("/output.txt")).toBe("Hello, World!");
  });

  it("should list directories", () => {
    const entries = fs.readdir("/src");
    expect(entries).toContain("index.ts");
  });
});
```

## API Reference

### createMockFs(options?)

Create a new mock file system.

```typescript
interface CreateMockFsOptions {
  initialFiles?: Record<string, string>;  // Initial file contents
  initialDirs?: string[];                  // Initial directories
}

const fs = createMockFs({
  initialFiles: {
    "/package.json": '{"name": "my-app"}',
    "/src/index.ts": 'console.log("Hello");',
  },
  initialDirs: ["/src", "/dist", "/node_modules"],
});
```

### MockFs Interface

```typescript
interface MockFsEntry {
  type: "file" | "directory";
  content?: string;     // For files only
  mtime: Date;          // Last modified time
}

interface MockFs {
  files: Map<string, MockFsEntry>;  // Direct access to store

  // File operations
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  exists(path: string): boolean;
  unlink(path: string): void;

  // Directory operations
  mkdir(path: string, opts?: { recursive?: boolean }): void;
  readdir(path: string): string[];

  // Reset
  reset(): void;
}
```

### Methods

#### readFile(path)

Read file contents. Throws if file doesn't exist.

```typescript
try {
  const content = fs.readFile("/config.json");
  console.log(content);
} catch (e) {
  console.error("File not found");
}
```

#### writeFile(path, content)

Write content to a file. Creates parent directories automatically.

```typescript
fs.writeFile("/deep/nested/file.txt", "content");
// Creates /deep and /deep/nested directories
```

#### exists(path)

Check if a path exists.

```typescript
if (fs.exists("/package.json")) {
  const content = fs.readFile("/package.json");
}
```

#### unlink(path)

Delete a file. Throws if file doesn't exist.

```typescript
fs.writeFile("/temp.txt", "temporary");
fs.unlink("/temp.txt");
expect(fs.exists("/temp.txt")).toBe(false);
```

#### mkdir(path, options?)

Create a directory.

```typescript
// Create single directory
fs.mkdir("/new-dir");

// Create with parents
fs.mkdir("/a/b/c", { recursive: true });
```

#### readdir(path)

List directory contents.

```typescript
fs.writeFile("/src/a.ts", "");
fs.writeFile("/src/b.ts", "");
const entries = fs.readdir("/src");
// ["a.ts", "b.ts"]
```

#### reset()

Clear all files and directories.

```typescript
fs.reset();
expect(fs.files.size).toBe(0);
```

## Testing Patterns

### Test File Processing

```typescript
it("should process all TypeScript files", () => {
  const fs = createMockFs({
    initialFiles: {
      "/src/a.ts": "const a = 1;",
      "/src/b.ts": "const b = 2;",
      "/src/c.js": "const c = 3;",
    },
  });

  const tsFiles = fs.readdir("/src").filter(f => f.endsWith(".ts"));
  expect(tsFiles).toEqual(["a.ts", "b.ts"]);
});
```

### Test File Generation

```typescript
it("should generate output files", () => {
  const fs = createMockFs({ initialDirs: ["/dist"] });

  // Function under test
  generateOutput(fs, "/dist");

  expect(fs.exists("/dist/index.js")).toBe(true);
  expect(fs.exists("/dist/index.d.ts")).toBe(true);
});
```

### Direct Store Access

For advanced testing, access the underlying Map:

```typescript
it("should track modification times", () => {
  const fs = createMockFs();
  fs.writeFile("/file.txt", "content");

  const entry = fs.files.get("/file.txt");
  expect(entry?.mtime).toBeInstanceOf(Date);
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
