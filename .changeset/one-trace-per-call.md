---
"@procedures/client": patch
---

One call of a client makes one trace again, also in a browser with an instrumentation of `fetch`.

- The span of each try of a call is active while the transport sends. So an instrumentation of `fetch` or of the HTTP module of Node starts its span in the trace of the call. Before, the instrumentation started a second trace, and the `traceparent` header of the request carried a trace that differed from the trace in the metadata of the call.
- The context manager of a browser keeps a context only during a synchronous function. So the client starts each step of the transport in the span, not only the first step.
- A batched request starts in the context of its first call. A request of one call thus carries one trace in its header and its metadata, and a request of many calls makes no trace of its own.
