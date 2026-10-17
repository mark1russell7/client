---
"@procedures/llm": minor
---

Streaming, tool use and an automatic retry for the procedures of `@procedures/llm`:

- The new procedure `llm.stream` sends the request with `"stream": true`. It gives the server-sent events of the Messages API as stream items: `start`, `text`, `tool_use` and `stop`. The `stop` item has the stop reason, the usage and the full text. `sseEvents` of `@procedures/http` parses the stream. The procedure declares `streaming: true` and `stream: { unbounded: false }`.
- `llm.complete` and `llm.stream` take `tools` (name, description, input schema, strict) and `toolChoice`. The output gives each `tool_use` block.
- With `procedures`, `llm.complete` gives the model the named procedures as tools. It calls each one through `ctx.client`, sends the `tool_result` back, and asks again until the model stops. `maxRounds` (default 8) ends the loop. The output has `toolCalls`, `rounds` and `roundLimit`.
- `llm.complete` is data-driven (`markDataDriven`), so the host examines each nested call with its capability and its expose rule. A refused procedure gives `FORBIDDEN` or `NOT_EXPOSED` before a request goes out.
- A request that fails with `retryable: true` (408, 409, 429, 529 and the other 5xx statuses, a connection error, an early error event of a stream) gets new tries. The wait is the `retry-after-ms` or `retry-after` header, or `backoffDelay` of `@mark1russell7/service/backoff`. The deadline stops the retry, and a stream tries again only before its first item.
- The input `retries` (0 to 10, default 2) of `llm.complete` and `llm.stream` sets the new tries. `retries: 0` turns them off. `llm.structured` keeps `retries` for the answers that are not valid, and gets `requestRetries`.
- `createLlmModule()` takes `retries` and `backoff`. `LlmError` has `retryAfterMs` and the new code `BAD_TOOL`.
- `timeoutMs` limits each request to the API.
