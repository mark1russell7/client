---
"@procedures/client": patch
"@procedures/mcp-server": patch
---

Procedure paths of each length on each face (server stack CLI-28). A path has one segment or more. Each change is additive: each path of two segments or more keeps its method, its URL and its tool name.

- `pathToMethod()` takes a path of one segment, for example `["morning"]`: its method has the empty service, `{ service: "", operation: "morning" }`. An empty path still throws. New `methodName(method)` gives the name with dots (`morning`, `docker.compose.up`).
- HTTP: the URL of a path of one segment is `{base}/{operation}`, for example `/api/morning`. `procedureHandler`, `HttpServerTransport` and `rpcServerUrlStrategy` (`/rpc/morning`) read it, and `bodyPathAddressing()` takes a path of one segment too. A URL with one segment under the base path names a procedure now: an unknown one gets `NOT_FOUND`, not `INVALID_REQUEST`.
- The version of the URL keeps its old form `{base}/{version}/{service}/{operation}`. Only the version makes three URL segments, so the forms do not collide. A path of one segment has no version in the URL, because `{base}/{version}/{operation}` reads as a service and an operation. The server ignores the version (wire protocol v1).
- `defaultUrlPattern` URI-encodes each URL segment and decodes it again. Thus a segment with `/`, `?` or a space round-trips, and a segment never makes a URL separator. A segment of letters, digits, `-`, `.`, `_` and `~` keeps its URL.
- `methodToPath()` keeps each empty segment but the empty service. Thus a method with `..` or a stray dot names no procedure and gets `NOT_FOUND`. Before, the empty segments fell away, so `/api/notes/..` could reach the procedure `notes`.
- WebSocket, the message port and `LocalTransport` call a path of one segment. A handler of `LocalTransport` with the key `morning` answers it.
- MCP: a path of one segment has a tool name, for example `morning`. When two procedures have one tool name after the join of the segments (`["a_b", "c"]` and `["a", "b_c"]` with `path.join("_")`), the face leaves out the two tools and writes the reason to stderr. Before, the face kept the last one, so a call could reach the wrong procedure. `host.tools()` gives the same list.
- `WIRE-PROTOCOL.md` states the rule.
