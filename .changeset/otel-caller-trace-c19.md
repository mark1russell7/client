---
"@procedures/client": patch
---

A call with no active span continues the trace context that the caller gave in its metadata (roadmap item C19 of otel-ts). Before, with an SDK, the client span of such a call started a new trace, and the propagator wrote that trace over the `traceparent` of the metadata. Thus `mark` in a program with an SDK lost the trace of its variables `TRACEPARENT` and `TRACESTATE`: the baggage came to the handler, but its spans and logs were in another trace. An active span is still the parent when there is one, and each try reads the trace context of the caller, not the trace context of the try before it.

The unit tests of `@procedures/mark` use the propagation gate of rigor-testkit on the two entries of `mark`: the MCP face and the CLI call to the CLI server. Each call of the gate runs in the root context, so only the carrier of the entry (`_meta`, or the environment variables) takes the context. The gate found this fault.
