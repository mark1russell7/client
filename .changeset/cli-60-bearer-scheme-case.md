---
"@procedures/client": patch
"@procedures/mcp-server": patch
"@procedures/peer": patch
---

Fixed: `bearerOf` also reads the scheme of an `Authorization` header in another case (CLI-60). RFC 7235 makes the scheme case-insensitive, with one or more spaces (`1*SP`) before the token. Before, `bearerOf` read only a header that starts with `Bearer ` and one space, so a correct `bearer <token>` got 401.

Each header that `bearerOf` read before gives the same token. A correct header in another case passes too, also with more spaces before the token.

- A header that starts with `Bearer ` gives the rest of the header, as before.
- A header with the scheme in another case, for example `bearer` or `BEARER`, gives the token after one or more spaces. Spaces or tabs can come after the token. The token has no whitespace (`token68`).
- A tab between the scheme and the token is not `1*SP`, so it gives no token.
- `Basic x`, `Bearer` with no space and an empty header give no token, as before.
- The token comparison (`tokenMatches`) does not change.

Each user of `bearerOf` gets the change. These users are `credentialsOf`, `requestCredentials`, `procedureHandler` and the WebSocket server. The WebSocket admission of `createProcedureHost()`, `guardMcpRequest` and the credentials of the MCP face also get it.
