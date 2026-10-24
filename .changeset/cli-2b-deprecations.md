---
"@procedures/mcp-server": patch
---

Deprecated (D13): the token options of the MCP face, and the token check of `guardMcpRequest`. The next MINOR of the client group changes them (roadmap CLI-2b). This release changes no behavior.

- After the change, the server of the face checks the credentials of each request one time. The face has no token check of its own.
- `HttpTransportOptions.token`: give the token to the server, for example `policy.token` of `createMcpHost()`. In `faces.http` of `createMcpHost()`, the token then becomes the token of the policy. A different token in the policy throws an error.
- `httpOptions.token` of `McpServerTransport`: give the token to the server, `new ProcedureServer({ token })`. After the change, `start()` throws an error for a token in `httpOptions`.
- `McpFaceOptions.token`: give the token only in `hostPolicy({ token })`. After the change, `mcpFace()` throws an error for a token that is not the token of the policy.
- `McpRequestGuardOptions.token`: give the token to the server. After the change, the option is removed, and a `token` option throws an error.
- The token check of `guardMcpRequest`: after the change, the function does only the browser checks. The owner of a listener then admits each request with `admission()` of the server.
- A token refusal of the server stays 401 with `UNAUTHORIZED` and the `WWW-Authenticate` header.

The doc comments of these options, of `guardMcpRequest` and of `McpHostFaces.http` have the deprecation notes. The README of the package has the section "Deprecated token options".

`mark mcp --http --token` and `@procedures/mcp-dev-tools`: no change for a client. The site, MiniMongo, Graph and jarvis: no change in this release.
