---
"@procedures/client": patch
"@procedures/mcp-server": patch
"@procedures/mark": patch
---

Each handler runs in the context of OpenTelemetry of its caller (roadmap item C10 of otel-ts). Thus its logs, metrics, spans and nested calls carry the ids of the trace of the caller, also on a host with no tracing interceptor.

- `ProcedureServer` makes the remote span of the `traceparent` and `tracestate` of the metadata the parent of the handler. It uses the `baggage` of the metadata only from a trusted caller: a local request, a request with the token of the server, or a request that the new option `trustBaggage(request)` names. For another caller, the handler runs with no baggage, also when the HTTP instrumentation of an SDK read a `baggage` header.
- The MCP face puts the keys `traceparent`, `tracestate` and `baggage` of the `_meta` of a tool call into the metadata of the call. Over Streamable HTTP, the headers with these names apply when `_meta` does not have the key.
- `mark` sends the environment variables `TRACEPARENT`, `TRACESTATE` and `BAGGAGE` with its call, as the metadata keys `traceparent`, `tracestate` and `baggage`.
