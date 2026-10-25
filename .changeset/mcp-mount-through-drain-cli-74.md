---
"@procedures/mcp-server": patch
"@procedures/peer": patch
"@procedures/mcp-dev-tools": patch
---

The MCP face stays on its listener through the drain (roadmap CLI-74).

PATCH: a fix with no API change (D34).

- Before, the mount of the MCP face stopped at the stage `stop intake`. On the listener of a procedures host, the listener closed, and each request got its plain 503. Thus the answer of an elicitation and a cancel did not reach a call in progress.
- Now the handler of `mcpFace()` and `McpHost.handleHttp` have `until: "close transports"`, as a `RequestHandler` of `@mark1russell7/service/http`. The procedures host gives the `until` of the handler of each face to its mount.
- During the drain, the answer of an elicitation, a cancel and a ping reach the session. A new session and a new GET stream get the 503 of the face. A new tool call gets `UNAVAILABLE` from the server.
- The face ends the SSE stream of a cancelled call. The SDK sends no answer to a cancel, so that stream held the drain of the listener until its deadline.
- Mount `host.handleHttp` itself, for example `listener.mount(host.handleHttp)`. A function that wraps it loses `until`. The dev-tools server mounts it in this way.
- Note on the stop time: the cap of the drain does not change, and a stream of the face does not hold the drain past its deadline. A listener with the MCP face now answers a new connection with 503 until the stage `close transports`, and does not refuse it. The test `mcp-stop.test.ts` of `@procedures/peer` measures each stop on the fake clock.
