---
"@procedures/client": minor
"@procedures/mcp-server": patch
---

Each face refuses a request above its size limit with the code `PAYLOAD_TOO_LARGE` (roadmap CLI-85). The transport contract suite found the faces that did not.

- `@procedures/client`: the HTTP handler answers a body above `bodyLimit` with the code `PAYLOAD_TOO_LARGE` and the status 413. Before, the code was `INVALID_REQUEST`. A caller that compares the code of a 413 with `INVALID_REQUEST` must compare it with `PAYLOAD_TOO_LARGE`. This change of behavior is a minor change.
- `@procedures/client`: when a server closes a WebSocket with the close code 1009 (a message above its limit), each pending call of `WebSocketTransport` fails with the code `PAYLOAD_TOO_LARGE` and `retryable: false`. Before, the error had no code.
- `@procedures/client`: the new entry point `@procedures/client/testing` has the transport contract suite: `describeTransportContract(face, runner)`, `clientCaller()`, `mcpCaller()` and the collection storage `LogStorage`. A face of the procedures server in another package or in an app runs the same cases as the faces of the client. The suite imports no test runner: give it `{ describe, it, afterEach, expect }` of Vitest. This new entry point is a minor change.
- `@procedures/mcp-server`: the Streamable HTTP endpoint reads the body of a request in a session with `maxBodyBytes`. A body above the limit gets the status 413 with the code `PAYLOAD_TOO_LARGE`. Before, the SDK refused it without a code.

Migration:

- A caller that reads the code of a 413 from the HTTP handler compares it with `PAYLOAD_TOO_LARGE`, not `INVALID_REQUEST`.
- A caller of `WebSocketTransport` that retries each failed call stops at `retryable: false`. A call above the limit of the server fails the same way each time.
- The site, MiniMongo, Graph and jarvis: no step, unless one of them compares the code of a refused large request with `INVALID_REQUEST`.
