# @mark1russell7/client-fs

File system operations as RPC procedures. Read, write, copy, move, and glob files.

## Installation

```bash
npm install github:mark1russell7/client-fs#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application                                     │
│                                                                              │
│   await client.call(["fs", "read"], { path: "./config.json" })              │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              client-fs                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        File Operations                                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │  │
│  │  │ fs.read  │  │ fs.write │  │ fs.exists│  │ fs.stat  │  │ fs.rm   │ │  │
│  │  │ Read file│  │Write file│  │Check path│  │Get stats │  │ Delete  │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     Directory Operations                               │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │  │
│  │  │ fs.mkdir │  │fs.readdir│  │ fs.copy  │  │ fs.move  │              │  │
│  │  │Create dir│  │List dir  │  │Copy files│  │Move files│              │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       Pattern Matching                                 │  │
│  │  ┌──────────────────────────────┐  ┌────────────────────────────────┐ │  │
│  │  │          fs.glob             │  │         fs.json.read           │ │  │
│  │  │  Find files by glob pattern  │  │  Read and parse JSON file      │ │  │
│  │  └──────────────────────────────┘  └────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        ┌─────────────────────┐
                        │  Node.js fs module  │
                        │  + fast-glob        │
                        └─────────────────────┘
```

## Quick Start

```typescript
import { Client } from "@mark1russell7/client";
import "@mark1russell7/client-fs/register";

const client = new Client({ /* transport */ });

// Read a file
const { content } = await client.call(["fs", "read"], {
  path: "./config.json",
});

// Write a file
await client.call(["fs", "write"], {
  path: "./output.txt",
  content: "Hello, World!",
});

// Find files by pattern
const { matches } = await client.call(["fs", "glob"], {
  pattern: "src/**/*.ts",
  cwd: "/my/project",
});
```

## Procedures

| Path | Description |
|------|-------------|
| `fs.read` | Read file contents |
| `fs.write` | Write content to file |
| `fs.exists` | Check if path exists |
| `fs.stat` | Get file/directory stats |
| `fs.mkdir` | Create directory |
| `fs.rm` | Remove file or directory |
| `fs.readdir` | List directory contents |
| `fs.copy` | Copy file or directory |
| `fs.move` | Move/rename file or directory |
| `fs.glob` | Find files matching pattern |
| `fs.json.read` | Read and parse JSON file |

### fs.read

Read file contents as string.

```typescript
interface ReadInput {
  path: string;          // File path
  encoding?: string;     // Encoding (default: "utf8")
}

interface ReadOutput {
  content: string;       // File contents
  path: string;          // Resolved path
  size: number;          // File size in bytes
}
```

### fs.write

Write content to file.

```typescript
interface WriteInput {
  path: string;          // File path
  content: string;       // Content to write
  encoding?: string;     // Encoding (default: "utf8")
  mode?: "write" | "append";  // Write mode (default: "write")
}

interface WriteOutput {
  path: string;          // Path written
  bytesWritten: number;  // Bytes written
}
```

### fs.exists

Check if path exists.

```typescript
interface ExistsInput {
  path: string;          // Path to check
}

interface ExistsOutput {
  exists: boolean;
  path: string;
  type?: "file" | "directory" | "other";
}
```

### fs.stat

Get file or directory stats.

```typescript
interface StatOutput {
  path: string;
  type: "file" | "directory" | "other";
  size: number;          // Size in bytes
  mtime: string;         // Modified time (ISO)
  ctime: string;         // Created time (ISO)
  atime: string;         // Accessed time (ISO)
  mode: number;          // Unix permissions
}
```

### fs.mkdir

Create a directory.

```typescript
interface MkdirInput {
  path: string;          // Directory path
  recursive?: boolean;   // Create parents (default: true)
}

interface MkdirOutput {
  path: string;
  created: boolean;      // false if already existed
}
```

### fs.rm

Remove file or directory.

```typescript
interface RmInput {
  path: string;          // Path to remove
  recursive?: boolean;   // Remove contents (default: false)
  force?: boolean;       // Ignore if not exists (default: false)
}

interface RmOutput {
  path: string;
  removed: boolean;
}
```

### fs.readdir

List directory contents.

```typescript
interface ReaddirInput {
  path: string;          // Directory path
  recursive?: boolean;   // Include subdirectories (default: false)
  includeStats?: boolean; // Include file stats (default: false)
}

interface ReaddirEntry {
  name: string;          // Entry name
  path: string;          // Full path
  type: "file" | "directory" | "other";
  stats?: { size, mtime, ctime };  // If includeStats=true
}

interface ReaddirOutput {
  path: string;
  entries: ReaddirEntry[];
}
```

### fs.copy

Copy file or directory.

```typescript
interface CopyInput {
  src: string;           // Source path
  dest: string;          // Destination path
  recursive?: boolean;   // Copy directories (default: true)
  overwrite?: boolean;   // Overwrite existing (default: false)
}
```

### fs.move

Move or rename file/directory.

```typescript
interface MoveInput {
  src: string;           // Source path
  dest: string;          // Destination path
  overwrite?: boolean;   // Overwrite existing (default: false)
}
```

### fs.glob

Find files matching glob pattern.

```typescript
interface GlobInput {
  pattern: string;       // Glob pattern (e.g., "**/*.ts")
  cwd?: string;          // Base directory
  absolute?: boolean;    // Return absolute paths (default: false)
  dot?: boolean;         // Include dotfiles (default: false)
}

interface GlobOutput {
  pattern: string;
  matches: string[];
}
```

**Example:**
```typescript
const { matches } = await client.call(["fs", "glob"], {
  pattern: "src/**/*.{ts,tsx}",
  cwd: "/my/project",
  absolute: true,
});
// ["/my/project/src/index.ts", "/my/project/src/components/App.tsx", ...]
```

### fs.json.read

Read and parse a JSON file.

```typescript
interface ReadJsonInput {
  path: string;          // JSON file path
}

interface ReadJsonOutput {
  path: string;
  data: unknown;         // Parsed JSON
}
```

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              client                                          │
│                         (Core RPC framework)                                 │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            client-fs                                         │
│                    (File system procedures)                                  │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             ┌───────────┐   ┌───────────┐   ┌───────────┐
             │  node:fs  │   │ node:path │   │ fast-glob │
             └───────────┘   └───────────┘   └───────────┘
```

## License

MIT
