---
"@procedures/mcp-server": minor
"@procedures/mcp-dev-tools": minor
---

The Streamable HTTP face of an MCP host has no listener of its own (CLI-11, step 2). The runner of the process owns the port, the stop in stages and the exit.

MINOR: a breaking change before 1.0. Version 0.14.x deprecated each part that this release removes (decision D13).

Removed:

- The options `port`, `host` and `server` of `HttpTransportOptions`, and the function `listen()` of `McpHttpTransport`. The endpoint answers only through its handler: `McpHost.handleHttp`, `McpServerTransport.handleHttp` or the face of `mcpFace()`. A request of another path gets false from the handler, and the listener answers it.
- `McpServerTransportState.url` of an HTTP face is the path of the endpoint (`/mcp`), not a URL. The owner of the listener knows the address.
- `startDevToolsServer()` of `@procedures/mcp-dev-tools`. Use `runDevToolsServer()`, which runs the server under `run()` of `@mark1russell7/service`.

The option `mount` has no effect now, because the endpoint is always mounted. It stays one more release as a deprecated option, so code that followed the migration of 0.14.x compiles.

Migration:

- A host with `faces.http: { port, host }`: give `faces.http: {}`. Mount `host.handleHttp` on a listener, for example an `httpTransport` of `@mark1russell7/service/http`, and declare the listener and the host on a service (`host.declare(svc)`). The README of `@procedures/mcp-server` has the example.
- A caller of `startDevToolsServer()`: call `runDevToolsServer(config)`.
- The site, MiniMongo, Graph and jarvis: no change. Graph mounts `mcpFace()` on its procedures host, and its stdio MCP host and the host of jarvis use stdio and SDK faces.
