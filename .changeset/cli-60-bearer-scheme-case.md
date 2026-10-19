---
"@procedures/client": patch
"@procedures/mcp-server": patch
"@procedures/peer": patch
---

Fixed: `bearerOf` reads the scheme of an `Authorization` header in any case (CLI-60). RFC 7235 makes the scheme case-insensitive, with one or more spaces (`1*SP`) before the token. Before, `bearerOf` accepted only `Bearer` with one space, so a correct `bearer <token>` got 401.

- `bearer`, `BEARER` and each other case pass. One or more spaces can come before the token, and spaces or tabs can come after it.
- The token is the text after the spaces. It has no whitespace (`token68`).
- A tab before the token is not `1*SP`, so it gives no token.
- `Basic x`, `Bearer` with no token and an empty header give no token, as before. `Bearer ` and `Bearer a b` also give no token.
- When the header gives no token, the `token` query applies, as for a request without the header.
- The token comparison (`tokenMatches`) does not change.

For a server token without whitespace, this change accepts more correct requests, and it refuses no request that it accepted before. A server token with whitespace does not match after this change, because `Bearer a b` gives no token. Such a token is not a valid bearer token.

Each user of `bearerOf` gets the change. These users are `credentialsOf`, `requestCredentials`, `procedureHandler` and the WebSocket server. The WebSocket admission of `createProcedureHost()`, `guardMcpRequest` and the credentials of the MCP face also get it.
