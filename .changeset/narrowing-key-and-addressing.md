---
"@procedures/client": patch
"@procedures/mcp-server": patch
---

A narrowing key on the wire, and an addressing hook for HTTP (server stack CLI-30 and CLI-31). Each change is additive: without the new key or the new option, the behavior stays the same.

- A call can ask for a narrower capability than its principal holds, with the narrowing key `procedure-narrowing`. Its value is a `CapabilityRequest` as JSON (`clearance`, `effects` and `timeoutMs`), or a list of them.
- Each face carries the key. HTTP has each line of the header `Procedure-Narrowing` (raw or URI-encoded JSON), the key in `X-Metadata` and a query parameter. WebSocket has the key in the metadata of a `request` frame. MCP has the key in the `_meta` of `tools/call` and the header of Streamable HTTP. In the process, the key of the metadata of `ProcedureServer.handle()`, `LocalTransport`, `invokeProcedure()` and `Client.exec()` applies.
- No source replaces another: a gateway's header and the client's key of `X-Metadata` both apply. `invokeProcedure()` is the one place that applies the sources, for the call of a host, with the narrowing of `principalOf` and the new option `narrow`. The clearance is the meet of the clearance order, the effects are the intersection, and the deadline is the earliest. Each source can only narrow, in each sequence.
- A part that asks for more, or a part that the server cannot compare, has no effect. A source that the server cannot read refuses the call with `INVALID_REQUEST`. Two different clearances without a clearance order refuse the call with `FORBIDDEN` (reason `clearance`).
- New option `debug` of `ProcedureServer`: `true` writes each report with `console.debug`, and a function gets each `ServerDebugReport`. The server reports each part of the narrowing that has no effect, and each refusal.
- New options of `invokeProcedure()` and `invokePath()`: `narrow` (one more source) and `onNarrowingNotes` (the notes of the narrowing). New option `metadata` of `Client.exec()` and `Client.execStream()`: a local procedure gets it as `ctx.metadata`, and a remote call sends it.
- New exports: `NARROWING_METADATA_KEY`, `NARROWING_HEADER`, `narrowingOf()` (the decoder of the key), `addNarrowing()` (adds a source to the key) and `narrowWithin()` (a narrowing of many sources that does not throw and gives notes). New types: `NarrowingNote`, `WireNarrowing`, `NarrowedCapability` and `ServerDebugReport`.
- The default CORS headers include `Procedure-Narrowing`.
- `procedureHandler` and `HttpServerTransport` copy each key of the query as an own property, so a `__proto__` key changes no prototype.
- `@procedures/client/node`: new option `addressing` of `procedureHandler`. The hook gets the request and its body, and it gives `{ method, payload }`. `urlAddressing()` is the default, the URL format of `HttpTransport`. `bodyPathAddressing()` reads the path and the input from the body of a single endpoint, for example `POST /api/proc` with `{"path": ["notes", "list"], "input": {}}`. With it, the handler also takes the base path itself.
- `HttpServerTransport` takes the same option `addressing`. With `bodyPathAddressing()`, its route also takes the base path itself.
- New types of `@procedures/client/node`: `Addressing`, `CallAddress`, `UrlAddressingOptions` and `BodyPathAddressingOptions`.
- `WIRE-PROTOCOL.md` specifies the narrowing key and its sources, the addressing hook, `procedureHandler`, the credentials of a request and the reasons of `FORBIDDEN`, with the four reasons of the browser checks.
