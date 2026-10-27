---
"@procedures/client": patch
---

A batch of calls in one HTTP request (roadmap CLI-32). Refer to "A batch of calls" in WIRE-PROTOCOL.md.

- `procedureHandler` and `HttpServerTransport` take `POST {base}` with the header `Procedures-Batch: 1` and the body `{"calls": [{"id", "path", "input", "headers", "metadata"}]}`. The answer is one NDJSON stream. Each item is a frame that names its call: `response`, `item`, `done` or `error`. Each call goes through `handle()` as a call of its own. Thus the request hook, the token check, the limits and the error policy apply to each call.
- The new option `batch` (`HandlerBatchOptions`: `maxCalls`, default 64, and `concurrency`, default 8) sets the limits. The default is on. `batch: false` turns batches off.
- `HttpTransport` has the new option `batch` (`HttpBatchOptions`), default off. With it, the `POST` calls that start in the same turn of the event loop go in one request. Calls with other secret headers go in another batch. A server without batches gets each call alone.
- SemVer: PATCH. Before 1.0, a backward-compatible feature raises PATCH. A request without the new header gets the same answer as before, and the client option is off by default.
