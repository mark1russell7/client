# @mark1russell7/server

General procedure server - run any procedure packages via HTTP/WebSocket.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         server                                   │
│                                                                  │
│  CLI entry that runs any procedure packages:                     │
│                                                                  │
│  server --procedures @mark1russell7/client-mongo/register       │
│         --transport http --port 3000                             │
│                                                                  │
│  Internally calls: client.call(["server", "create"], {...})     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     client-server                                │
│                                                                  │
│  server.create: Creates peer with transports[], exposes procs   │
│                                                                  │
│  Transports:                                                     │
│    ├─ { type: "http", port, host, basePath, cors }              │
│    ├─ { type: "websocket", port, host, path }                   │
│    └─ { type: "local" }                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install -g @mark1russell7/server
```

## Usage

### Start MongoDB Procedure Server

```bash
server --procedures @mark1russell7/client-mongo/register --port 3000
```

### Start with Multiple Procedure Packages

```bash
server -p @mark1russell7/client-fs/register,@mark1russell7/client-git/register
```

### Start with Multiple Transports

```bash
server -p @mark1russell7/client-mongo/register -t http,websocket
```

## Options

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--procedures` | `-p` | | Comma-separated procedure packages to load |
| `--transport` | `-t` | `http` | Comma-separated transports: http, websocket, local |
| `--port` | | `3000` | Port for the primary transport |
| `--host` | | `0.0.0.0` | Host to bind to |
| `--base-path` | | `/api` | Base path for HTTP transport |
| `--cors` | | | Enable CORS (default) |
| `--no-cors` | | | Disable CORS |
| `--verbose` | `-v` | | Verbose output |
| `--help` | `-h` | | Show help |

## Output

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

## Architecture

This package uses the **dogfooding** pattern - it uses `server.create` procedure from `client-server` internally to create the actual server:

```typescript
// Internally calls:
await client.call(["server", "create"], {
  transports: [{ type: "http", port: 3000, cors: true }],
  autoRegister: true,
});
```

This ensures maximum reuse of existing infrastructure and consistent behavior.

## Replacing server-mongo

This package is a general replacement for domain-specific server packages:

```bash
# OLD (deprecated)
npx @mark1russell7/server-mongo

# NEW (general)
npx server --procedures @mark1russell7/client-mongo/register
```

## Related Packages

- `@mark1russell7/client` - Core client framework
- `@mark1russell7/client-server` - Server procedures and peer management
- `@mark1russell7/client-mongo` - MongoDB procedures

## License

MIT
