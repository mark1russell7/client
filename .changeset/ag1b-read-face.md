---
"@procedures/peer": patch
"@procedures/client": patch
"@procedures/mcp-server": patch
---

`httpFace()` and `wsFace()` of `@procedures/peer` take two optional options, `narrowing` and `expose` (AG1-B). With them, a host serves a read-only face for a browser next to its full faces. This change is additive. Thus it is a PATCH of the client group (decision D13).

- `narrowing` is the narrowing of `mcpFace({ narrowing })` (CLI-43). The face adds it as one more source of the narrowing key. The server applies the meet of all the sources, so a header of the caller cannot make the face wider.
- `expose` is a list of patterns, a tool surface or a function, as `hostPolicy({ expose })`. The server meets it with the rule of the host, for the call and for each nested call. A path outside it gets `NOT_FOUND`.
- `@procedures/client` exports `faceRules()`, the one helper of these rules. `mcpFace()` of `@procedures/mcp-server` uses it too.
- `ServerRequest` has the optional field `expose`: the expose rule of the face that took the request. A face sets it, not the caller.
- A face without these options serves the same calls as before.
