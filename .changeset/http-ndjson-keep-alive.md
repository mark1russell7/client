---
"@procedures/client": minor
---

An NDJSON stream over HTTP gets keep-alive lines. Before, a proxy or a client with an idle timeout (for example 300 s) closed a long procedure that was quiet for that time.

- `HttpServerTransport` writes a keep-alive line, a blank line, after each quiet time of the new option `keepAlive` (default `seconds(15)`, `TIMER_DEFAULTS.httpServer.keepAliveMs`). Each line starts the time again. No keep-alive line comes after the `done` line, an `error` line, an abort or a closed connection. `keepAlive: false` turns it off.
- The new option `clock` of `HttpServerTransport` is the clock of the keep-alive timers. A test gives the `fakeClock` of `@mark1russell7/service/testing`.
- A keep-alive line has no `seq`, so the sequence check of the reader sees no gap. `WIRE-PROTOCOL.md` specifies the line: it is an additive change of protocol v1, because each reader skipped a blank line before.
- New `writeNdjsonStream(res, items, options?)` in `@procedures/client/node`. It writes the NDJSON stream response of protocol v1 for a `ServerResponse` of `node:http`, without Express. It writes the headers, the `item`, `done` and `error` lines with `seq`, and the keep-alive lines. It waits for `drain` when the buffer is full, and it stops when the connection closes or `signal` aborts. Its options are `signal`, `keepAlive`, `errorOf` and `clock`. `HttpServerTransport` uses it, so the two write the same bytes.
- `HttpTransport` gives each item of an NDJSON stream the metadata key `stream` with the value `true` (the new constant `STREAM_ITEM_METADATA_KEY`). The error item that ends the stream has it too. The key does not cross the wire, and the client removes a key `stream` that the peer sent.
- When the client goes away while the handler is quiet, the writer of the stream stops at once. Before, it waited for the next item of a handler that ignores its signal.
