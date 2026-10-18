---
"@procedures/client": patch
"@procedures/mcp-server": patch
---

A narrowing key on the wire, and an addressing hook for HTTP (server stack CLI-30 and CLI-31). Each change is additive: without the new key or the new option, the behavior stays the same.

- A call can ask for a narrower capability than its principal holds, with the narrowing key `procedure-narrowing`. Its value is a `CapabilityRequest` as JSON: `clearance`, `effects` and `timeoutMs`.
- Each face carries the key. HTTP has the header `Procedure-Narrowing`, raw or URI-encoded JSON, or the same key in `X-Metadata`. WebSocket has the key in the metadata of a `request` frame. MCP has the key in the `_meta` of `tools/call`. `ProcedureServer.handle()` and `LocalTransport` read the key of the metadata.
- `ProcedureServer` applies the key after the narrowing of `principalOf`, with the meet of the clearance order, the intersection of the effects and the earlier deadline. A key can only make the capability narrower. A part that asks for more, or a part that is not valid, has no effect.
- New option `debug` of `ProcedureServer`: `true` writes each report with `console.debug`, and a function gets each `ServerDebugReport`. The server reports each part of a narrowing key that has no effect.
- New option `narrow` of `invokeProcedure()` and `invokePath()`: the invocation narrows its capability with it. The nested calls get the narrowed capability.
- New exports: `NARROWING_METADATA_KEY`, `NARROWING_HEADER`, `narrowingOf()` (the decoder of the key) and `narrowWithin()` (a `narrowCapability` that does not throw and gives notes). New types: `NarrowingNote`, `WireNarrowing`, `NarrowedCapability` and `ServerDebugReport`.
- The default CORS headers include `Procedure-Narrowing`.
- `@procedures/client/node`: new option `addressing` of `procedureHandler`. The hook gets the request and its body, and it gives `{ method, payload }`. `urlAddressing()` is the default, the URL format of `HttpTransport`. `bodyPathAddressing()` reads the path and the input from the body of a single endpoint, for example `POST /api/proc` with `{"path": ["notes", "list"], "input": {}}`. With it, the handler also takes the base path itself.
- `HttpServerTransport` takes the same option `addressing`. With `bodyPathAddressing()`, its route also takes the base path itself.
- New types of `@procedures/client/node`: `Addressing`, `CallAddress`, `UrlAddressingOptions` and `BodyPathAddressingOptions`.
- `WIRE-PROTOCOL.md` specifies the narrowing key, the addressing hook, `procedureHandler` and the reasons of `FORBIDDEN`, with the four reasons of the browser checks.
