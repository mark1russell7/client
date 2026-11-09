---
"@procedures/client": patch
---

The calls of a client and the invocations of a host use the context of OpenTelemetry (roadmap item C8 of otel-ts, decisions D5 and D6).

- `@procedures/client` now depends on `@opentelemetry/api`. The API does nothing until a program registers an SDK, for example with `startNodeTelemetry()` of `@mark1russell7/otel-ts/node`.
- With an SDK, each try of a call is a client span of the API. The registered propagator writes `traceparent`, `tracestate` and `baggage` into the metadata, with the mark of an internal call. The propagator of otel-ts sends the baggage only on a call with this mark.
- With an SDK, `tracingInterceptor` takes the span ids from a span of the API: a host span for a call of a host, an internal span for a nested call. The handler runs in the context of its span. The host reads no baggage from the metadata.
- With no SDK, the behavior does not change: the W3C code of R16 operates.
- The new option `apiSpans: false` of `tracingInterceptor` turns the spans of the API off. `metricsInterceptor` uses it.
- `tracestate` and `baggage` are in the default CORS headers, and the cache key does not use them.
- The W3C exports of `tracing/traceparent.ts` are `@deprecated`. A later MINOR removes them, when the site, MiniMongo, Graph and jarvis register an SDK.
