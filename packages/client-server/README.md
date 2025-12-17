# @mark1russell7/client-server

Transport-agnostic peer for bidirectional RPC. Exposes procedures and generates manifests.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            client-server                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                              Peer                                       │ │
│  │   ┌───────────────────────────────────────────────────────────────┐   │ │
│  │   │ createPeer({ id, transports: [http, ws, local] })             │   │ │
│  │   └───────────────────────────────────────────────────────────────┘   │ │
│  │                              │                                         │ │
│  │              ┌───────────────┼───────────────┐                        │ │
│  │              ▼               ▼               ▼                        │ │
│  │   ┌─────────────────┐ ┌────────────┐ ┌─────────────────┐             │ │
│  │   │ HTTP Transport  │ │ WebSocket  │ │ Local Transport │             │ │
│  │   │ (REST endpoints)│ │ (realtime) │ │ (in-process)    │             │ │
│  │   └─────────────────┘ └────────────┘ └─────────────────┘             │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                           Procedures                                    │ │
│  │                                                                         │ │
│  │   ┌─────────────────────┐  ┌─────────────────────┐                    │ │
│  │   │   server.create     │  │   server.connect    │                    │ │
│  │   │   Create a peer     │  │   Connect to remote │                    │ │
│  │   └─────────────────────┘  └─────────────────────┘                    │ │
│  │                                                                         │ │
│  │   ┌─────────────────────┐  ┌─────────────────────┐                    │ │
│  │   │  server.disconnect  │  │  manifest.generate  │                    │ │
│  │   │  Disconnect peer    │  │  Generate procedure │                    │ │
│  │   │                     │  │  manifest (TS/JSON) │                    │ │
│  │   └─────────────────────┘  └─────────────────────┘                    │ │
│  │                                                                         │ │
│  │   ┌─────────────────────┐                                              │ │
│  │   │ discovery.announce  │                                              │ │
│  │   │ Announce procedures │                                              │ │
│  │   │ to connected peers  │                                              │ │
│  │   └─────────────────────┘                                              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                       Manifest Generation                               │ │
│  │                                                                         │ │
│  │   generateTypeScript()  →  .ts file with typed procedure definitions   │ │
│  │   generateJson()        →  JSON manifest of all procedures             │ │
│  │   generateJsonString()  →  Stringified JSON                            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         Connection Manager                              │ │
│  │                                                                         │ │
│  │   connect(opts)      →  Establish connection                           │ │
│  │   disconnect(id)     →  Close connection                               │ │
│  │   getConnection(id)  →  Get active connection                          │ │
│  │   getConnectionIds() →  List all connection IDs                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install github:mark1russell7/client-server#main
```

## Quick Start

### Creating a Peer

```typescript
import { createPeer } from "@mark1russell7/client-server";

const peer = createPeer({
  id: "my-server",
  transports: [
    { type: "http", port: 3000 },
    { type: "websocket", port: 3001 },
  ],
});

await peer.start();
```

### Via Procedures

```typescript
import { Client } from "@mark1russell7/client";

const client = new Client({ /* transport */ });

// Create a peer
await client.call(["server", "create"], {
  id: "my-server",
  transports: [{ type: "http", port: 3000 }],
});

// Connect to another peer
await client.call(["server", "connect"], {
  peerId: "my-server",
  remoteUrl: "http://other-server:3000",
});

// Generate manifest
const { manifest } = await client.call(["manifest", "generate"], {
  format: "typescript",
  outputPath: "./procedures.ts",
});
```

## Procedures

| Path | Description |
|------|-------------|
| `server.create` | Create a new peer with transport configuration |
| `server.connect` | Connect to a remote peer |
| `server.disconnect` | Disconnect from a peer |
| `manifest.generate` | Generate TypeScript or JSON procedure manifest |
| `discovery.announce` | Announce local procedures to connected peers |

## Transport Types

| Type | Description | Options |
|------|-------------|---------|
| `http` | REST-based RPC | `port`, `host`, `cors` |
| `websocket` | WebSocket for streaming | `port`, `host` |
| `local` | In-process (testing) | - |

## Manifest Generation

Generate typed client code from procedure definitions:

```typescript
import { generateTypeScript, generateJson } from "@mark1russell7/client-server";

// TypeScript with full types
const tsCode = generateTypeScript(procedures);

// JSON for external tools
const jsonManifest = generateJson(procedures);
```

### TypeScript Output

```typescript
// Generated procedures.ts
export interface Procedures {
  "lib.scan": {
    input: { rootPath?: string };
    output: { packages: Package[]; registry: Record<string, string> };
  };
  // ...
}
```

## Discovery

Peers can announce and discover procedures from connected peers:

```typescript
import { watchProcedures, getProcedureInfos } from "@mark1russell7/client-server";

// Get currently known remote procedures
const infos = getProcedureInfos();

// Watch for procedure updates
const unsubscribe = watchProcedures((update) => {
  console.log("Procedure update:", update);
});
```

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          @mark1russell7/client                               │
│                        (Core RPC framework)                                  │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       @mark1russell7/client-server                           │
│                    (Transport + Discovery layer)                             │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             ┌───────────┐   ┌───────────┐   ┌───────────┐
             │  Peer A   │◄──│  Network  │──►│  Peer B   │
             │ (exposes  │   │           │   │ (consumes │
             │ procedures)│   │           │   │ procedures)│
             └───────────┘   └───────────┘   └───────────┘
```

## License

MIT
