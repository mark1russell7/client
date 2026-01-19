# @mark1russell7/server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

> General procedure server - run any procedure packages via HTTP or WebSocket transports.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [Examples](#examples)
- [Integration](#integration)
- [Requirements](#requirements)
- [License](#license)

---

## Overview

**server** is a CLI tool that runs procedure packages as HTTP/WebSocket servers:

- **Universal** - Run any combination of procedure packages
- **Multi-Transport** - HTTP, WebSocket, or both simultaneously
- **Dogfooding** - Uses `server.create` procedure internally
- **Zero Config** - Sensible defaults, fully configurable

---

## Installation

```bash
npm install -g @mark1russell7/server
```

---

## Architecture

### System Overview

```mermaid
graph TB
    subgraph "CLI Entry"
        CLI[server CLI]
        Args[--procedures, --transport, --port]
    end

    subgraph "server package"
        Parse[Parse Arguments]
        Call[client.call]
    end

    subgraph "client-server"
        Create[server.create]
        Peer[Peer Instance]
    end

    subgraph "Transports"
        HTTP[HTTP Transport<br/>:3000/api]
        WS[WebSocket Transport<br/>ws://]
    end

    subgraph "Procedure Packages"
        Mongo[client-mongo<br/>mongo.*]
        FS[client-fs<br/>fs.*]
        Git[client-git<br/>git.*]
    end

    CLI --> Parse
    Args --> Parse
    Parse --> Call
    Call --> Create
    Create --> Peer
    Peer --> HTTP
    Peer --> WS
    HTTP --> Mongo
    HTTP --> FS
    WS --> Git
```

### Request Flow

```mermaid
sequenceDiagram
    participant Client as HTTP Client
    participant HTTP as HTTP Transport
    participant Peer as Peer Server
    participant Registry as PROCEDURE_REGISTRY
    participant Handler as Procedure Handler

    Client->>HTTP: POST /api/mongo.documents.find
    HTTP->>Peer: route(path, input)
    Peer->>Registry: get(["mongo", "documents", "find"])
    Registry-->>Peer: Procedure
    Peer->>Handler: handler(input, ctx)
    Handler-->>Peer: Result
    Peer-->>HTTP: Response
    HTTP-->>Client: JSON Response
```

### Dogfooding Pattern

```mermaid
graph LR
    subgraph "server CLI"
        Entry[Entry Point]
        ParseArgs[Parse CLI Args]
    end

    subgraph "Procedure Call"
        Call["client.call(['server', 'create'], {...})"]
    end

    subgraph "client-server"
        ServerCreate[server.create procedure]
        PeerManager[Peer Manager]
    end

    Entry --> ParseArgs
    ParseArgs --> Call
    Call --> ServerCreate
    ServerCreate --> PeerManager
```

---

## Quick Start

```bash
# Start MongoDB procedure server
server --procedures @mark1russell7/client-mongo/register --port 3000

# Start with multiple procedure packages
server -p @mark1russell7/client-fs/register,@mark1russell7/client-git/register

# Start with multiple transports
server -p @mark1russell7/client-mongo/register -t http,websocket
```

---

## CLI Reference

### Options

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--procedures` | `-p` | - | Comma-separated procedure packages to load |
| `--transport` | `-t` | `http` | Transports: http, websocket, local |
| `--port` | - | `3000` | Port for the primary transport |
| `--host` | - | `0.0.0.0` | Host to bind to |
| `--base-path` | - | `/api` | Base path for HTTP transport |
| `--cors` | - | `true` | Enable CORS |
| `--no-cors` | - | - | Disable CORS |
| `--verbose` | `-v` | - | Verbose output |
| `--help` | `-h` | - | Show help |

### Transport Configuration

```mermaid
graph TB
    subgraph "HTTP Transport"
        HTTPOpts["--transport http<br/>--port 3000<br/>--base-path /api<br/>--cors"]
    end

    subgraph "WebSocket Transport"
        WSOpts["--transport websocket<br/>--port 3001"]
    end

    subgraph "Both Transports"
        BothOpts["--transport http,websocket<br/>--port 3000"]
    end

    HTTPOpts --> Result1["http://0.0.0.0:3000/api"]
    WSOpts --> Result2["ws://0.0.0.0:3001"]
    BothOpts --> Result3["http + ws on :3000"]
```

---

## Examples

### MongoDB Server

```bash
server --procedures @mark1russell7/client-mongo/register --port 3000
```

**Output:**
```
Starting procedure server...
  Loading: @mark1russell7/client-mongo/register

Server started!
  Server ID: server-1703694523456
  Procedures: 16

Endpoints:
  [http] http://0.0.0.0:3000/api

Press Ctrl+C to stop the server.
```

### Multi-Package Server

```bash
server -p @mark1russell7/client-fs/register,@mark1russell7/client-git/register \
       -t http,websocket \
       --port 3000
```

### Calling Procedures

```bash
# HTTP call
curl -X POST http://localhost:3000/api/mongo.documents.find \
  -H "Content-Type: application/json" \
  -d '{"collection": "users", "filter": {"active": true}}'

# Response
{"documents": [{"_id": "...", "name": "Alice"}], "count": 1}
```

---

## Integration

### Replacing Domain-Specific Servers

The `server` package replaces domain-specific server packages:

```bash
# OLD (deprecated)
npx @mark1russell7/server-mongo

# NEW (general)
npx server --procedures @mark1russell7/client-mongo/register
```

### With client-server

The server CLI uses `server.create` procedure internally:

```typescript
// What the CLI does internally:
await client.call(["server", "create"], {
  transports: [{ type: "http", port: 3000, cors: true }],
  autoRegister: true,
});
```

### Package Hierarchy

```mermaid
graph BT
    subgraph "CLI"
        Server[server<br/>CLI entry point]
    end

    subgraph "Procedure Layer"
        ClientServer[client-server<br/>server.create]
    end

    subgraph "Core"
        Client[client<br/>Peer, Transport]
    end

    subgraph "Procedure Packages"
        Mongo[client-mongo]
        FS[client-fs]
        Git[client-git]
    end

    Server --> ClientServer
    ClientServer --> Client
    Mongo --> Client
    FS --> Client
    Git --> Client
```

---

## Requirements

- **Node.js** >= 20
- **Dependencies:**
  - `@mark1russell7/client`
  - `@mark1russell7/client-server`
  - One or more procedure packages

---

## License

MIT
