# @mark1russell7/client-vite

Vite development server management procedures for the client ecosystem. Start, stop, build, and preview Vite applications programmatically.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Application                              │
│                                                                              │
│   await client.exec(["vite", "dev"], { port: 3000, open: true })            │
│   await client.exec(["vite", "build"], { mode: "production" })              │
│   await client.exec(["vite", "preview"], { port: 4173 })                    │
│   await client.exec(["vite", "stop"], { serverId: "abc123" })               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Procedure Registry                                 │
│                                                                              │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐ │
│   │   vite.dev    │  │  vite.build   │  │ vite.preview  │  │  vite.stop  │ │
│   │               │  │               │  │               │  │             │ │
│   │ Start dev     │  │ Production    │  │ Preview       │  │ Stop        │ │
│   │ server        │  │ build         │  │ build         │  │ server      │ │
│   └───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └──────┬──────┘ │
│           │                  │                  │                 │        │
└───────────┼──────────────────┼──────────────────┼─────────────────┼────────┘
            │                  │                  │                 │
            ▼                  ▼                  ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ServerManager (Singleton)                           │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        Active Servers Map                            │   │
│   │                                                                      │   │
│   │   serverId: "dev-123"  ──►  { type: "dev", url, port, pid }         │   │
│   │   serverId: "prev-456" ──►  { type: "preview", url, port, pid }     │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Vite Process                                    │
│                                                                              │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│   │   vite dev      │  │   vite build    │  │  vite preview   │            │
│   │   (HMR Server)  │  │   (Bundle)      │  │  (Static)       │            │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
pnpm add @mark1russell7/client-vite
```

## Procedures

### vite.dev

Start Vite development server with hot module replacement (HMR).

```typescript
import { Client } from "@mark1russell7/client";

const result = await client.exec<{
  serverId: string;
  url: string;
  port: number;
}>(["vite", "dev"], {
  cwd: "/path/to/project",
  port: 3000,
  host: "localhost",
  open: true,
  mode: "development"
});

console.log(`Dev server running at ${result.url}`);
console.log(`Server ID: ${result.serverId}`);
```

**Input Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | `string` | No | Project directory |
| `port` | `number` | No | Port number (default: 5173) |
| `host` | `string` | No | Host to bind (default: localhost) |
| `open` | `boolean` | No | Open browser automatically |
| `mode` | `string` | No | Vite mode (development/production) |
| `config` | `string` | No | Path to vite.config.ts |

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `serverId` | `string` | Server identifier for stopping |
| `url` | `string` | Full URL where server is running |
| `port` | `number` | Port number assigned |

### vite.build

Run production build.

```typescript
const result = await client.exec<{
  success: boolean;
  outDir: string;
  duration: number;
}>(["vite", "build"], {
  cwd: "/path/to/project",
  mode: "production",
  outDir: "dist",
  minify: true,
  sourcemap: true
});

console.log(`Build completed in ${result.duration}ms`);
console.log(`Output: ${result.outDir}`);
```

**Input Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | `string` | No | Project directory |
| `mode` | `string` | No | Build mode |
| `outDir` | `string` | No | Output directory |
| `minify` | `boolean` | No | Enable minification |
| `sourcemap` | `boolean` | No | Generate sourcemaps |
| `config` | `string` | No | Path to vite.config.ts |

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether build succeeded |
| `outDir` | `string` | Absolute path to output |
| `duration` | `number` | Build time in milliseconds |

### vite.preview

Preview production build locally.

```typescript
const result = await client.exec<{
  serverId: string;
  url: string;
  port: number;
}>(["vite", "preview"], {
  cwd: "/path/to/project",
  port: 4173,
  open: true
});

console.log(`Preview server at ${result.url}`);
```

**Input Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | `string` | No | Project directory |
| `port` | `number` | No | Port number (default: 4173) |
| `host` | `string` | No | Host to bind |
| `open` | `boolean` | No | Open browser automatically |

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `serverId` | `string` | Server identifier for stopping |
| `url` | `string` | Full URL where preview is running |
| `port` | `number` | Port number assigned |

### vite.stop

Stop a running dev or preview server.

```typescript
const result = await client.exec<{
  success: boolean;
}>(["vite", "stop"], {
  serverId: "dev-abc123"
});

if (result.success) {
  console.log("Server stopped successfully");
}
```

**Input Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `serverId` | `string` | Yes | Server ID from dev/preview |

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether stop succeeded |

## Development Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Development Workflow                                │
│                                                                              │
│                              ┌──────────┐                                   │
│                              │  Start   │                                   │
│                              └────┬─────┘                                   │
│                                   │                                         │
│                                   ▼                                         │
│                         ┌─────────────────┐                                 │
│                         │   vite.dev      │                                 │
│                         │   (HMR Server)  │                                 │
│                         └────────┬────────┘                                 │
│                                  │                                          │
│              ┌───────────────────┼───────────────────┐                      │
│              │                   │                   │                      │
│              ▼                   ▼                   ▼                      │
│      ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│      │ Edit Source  │    │  View in     │    │    Ready     │              │
│      │    Files     │───►│   Browser    │    │  to Build?   │              │
│      └──────────────┘    └──────────────┘    └───────┬──────┘              │
│              │                   ▲                   │                      │
│              │    HMR Update     │                   │ Yes                  │
│              └───────────────────┘                   │                      │
│                                                      ▼                      │
│                                            ┌─────────────────┐              │
│                                            │   vite.stop     │              │
│                                            │   (Dev Server)  │              │
│                                            └────────┬────────┘              │
│                                                     │                       │
│                                                     ▼                       │
│                                            ┌─────────────────┐              │
│                                            │   vite.build    │              │
│                                            │  (Production)   │              │
│                                            └────────┬────────┘              │
│                                                     │                       │
│                                                     ▼                       │
│                                            ┌─────────────────┐              │
│                                            │  vite.preview   │              │
│                                            │   (Test Build)  │              │
│                                            └────────┬────────┘              │
│                                                     │                       │
│                                                     ▼                       │
│                                            ┌─────────────────┐              │
│                                            │    Deploy       │              │
│                                            └─────────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Full Example

```typescript
import { Client } from "@mark1russell7/client";
import "@mark1russell7/client-vite/register";

const client = new Client({ transport });

async function developmentCycle() {
  // 1. Start dev server
  console.log("Starting dev server...");
  const dev = await client.exec(["vite", "dev"], {
    cwd: "./my-app",
    port: 3000,
    open: true
  });
  console.log(`Dev server running at ${dev.url}`);

  // ... development happens ...

  // 2. Stop dev server
  console.log("Stopping dev server...");
  await client.exec(["vite", "stop"], { serverId: dev.serverId });

  // 3. Build for production
  console.log("Building for production...");
  const build = await client.exec(["vite", "build"], {
    cwd: "./my-app",
    mode: "production",
    minify: true,
    sourcemap: true
  });
  console.log(`Build completed in ${build.duration}ms`);

  // 4. Preview the build
  console.log("Starting preview server...");
  const preview = await client.exec(["vite", "preview"], {
    cwd: "./my-app",
    port: 4173,
    open: true
  });
  console.log(`Preview at ${preview.url}`);

  // 5. Stop preview when done
  await client.exec(["vite", "stop"], { serverId: preview.serverId });
}
```

## Port Assignment

```
┌─────────────────────────────────────────────────────────────────┐
│                        Port Assignment                           │
│                                                                  │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│   │  Requested  │────►│   Check     │────►│  Assigned   │       │
│   │    Port     │     │ Available?  │     │    Port     │       │
│   └─────────────┘     └──────┬──────┘     └─────────────┘       │
│                              │                                   │
│                              │ No                                │
│                              ▼                                   │
│                       ┌─────────────┐                            │
│                       │  Try Next   │                            │
│                       │   Port      │                            │
│                       └──────┬──────┘                            │
│                              │                                   │
│                              └─────────── (repeat until found)   │
│                                                                  │
│   Default Ports:                                                 │
│   • vite dev:     5173                                          │
│   • vite preview: 4173                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Server Types

| Type | Command | Default Port | Purpose |
|------|---------|--------------|---------|
| `dev` | `vite dev` | 5173 | Development with HMR |
| `preview` | `vite preview` | 4173 | Preview production build |

## Integration with Other Packages

### With client-node (for complete dev environment)

```typescript
// Start backend
const backend = await client.exec(["node", "spawn"], {
  script: "./server/index.js",
  readyPattern: "API listening on"
});

// Start frontend
const frontend = await client.exec(["vite", "dev"], {
  port: 3000
});

// Cleanup
await client.exec(["vite", "stop"], { serverId: frontend.serverId });
await client.exec(["node", "kill"], { processId: backend.processId });
```

## Auto-Registration

Import the register module to auto-register all procedures:

```typescript
import "@mark1russell7/client-vite/register";
```

Or register manually:

```typescript
import { registerViteProcedures } from "@mark1russell7/client-vite";

registerViteProcedures();
```

## Related Packages

- `@mark1russell7/client` - Core client framework
- `@mark1russell7/client-node` - Node.js process management
- `@mark1russell7/client-shell` - Shell command execution

## License

MIT
