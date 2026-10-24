---
"@procedures/client": minor
"@procedures/mcp-server": minor
---

Breaking: an in-band end of a stream before its first item gets the default flag of its code (roadmap CLI-68, decision D25). The release before this one marked the old flag `false` as deprecated (D13).

The new behavior:

- A handler error without a `retryable` flag that ends a stream before its first item gets the flag of its code in `ERROR_CODES`. Thus `UNAVAILABLE`, `CONNECTION_CLOSED` and `RATE_LIMITED` are retryable there. The other codes stay `false`.
- This applies on each face: the `error` line of NDJSON, the `error` frame of WebSocket and the `_meta.retryable` of the MCP stream result. The HTTP status of an NDJSON stream stays 200.
- An error before the stream starts already got this default (CLI-48). Thus a streaming handler and a unary handler that throw the same error before their first item now give the same flag.
- After the first item, an error without a flag still gets `false` (CLI-58). An error with its own flag keeps it, before and after the first item.
- The retry middleware of the client retries while no item reached the reader. Thus it now retries a stream that fails with `UNAVAILABLE` before its first item. The caller gets the items of the retry, not the error.
- A keyed call to a procedure that is not idempotent: a retryable end of its stream lets the next try with the same idempotency key run again. Before, the next try got `DUPLICATE`.
- Without NDJSON (the last item as JSON), a stream error before the first item gets the flag and the HTTP status of its code, for example 503 for `UNAVAILABLE`. After an item, the flag is `false`, thus 500.

What a caller sees:

| Stream error without a `retryable` flag | Before | From this release |
|---|---|---|
| Before the first item, code `UNAVAILABLE` | `retryable: false`, no retry | `retryable: true`, the retry middleware sends the call again |
| Before the first item, a code that is not retryable | `retryable: false` | `retryable: false` |
| After the first item | `retryable: false` | `retryable: false` |
| A handler gives `retryable: true` or `false` | that flag | that flag |

The retry costs time and calls: each try waits for the backoff, and the server gets one more call for each try. A handler with an effect before its error does that effect again on each try.

New exports and options:

- `retryableOf(error, items)` of `@procedures/client` gives the flag of an error that ends a call, after `items` items. Each face uses it.
- The `errorOf` option of `writeNdjsonStream` also gets the count of the item lines before the error. A function with one parameter still works.
- `IdempotencyCache.forget(key, result)` removes the result of a key.

The opt-out:

- A handler that is not safe to run again gives `retryable: false` in its error. For example, `throw Object.assign(new Error("busy"), { code: "UNAVAILABLE", retryable: false })`.
- Or the caller does not use the retry middleware for that call. For example, give `shouldRetry` that gives `false` for that method, or set `retry: { maxAttempts: 1 }` in the context of the call.

Migration steps:

- A streaming handler that throws `UNAVAILABLE`, `CONNECTION_CLOSED` or `RATE_LIMITED` without a flag before its first item: is a second run safe? If not, give `retryable: false`.
- A test that expects `retryable: false` for such an end before the first item: expect the flag of the code.
- A custom `errorOf` of `writeNdjsonStream`: read its second parameter to give the same rule.
- The site: no change is necessary. The lab simulates its server with explicit flags. The streams of the journey do not fail.
- MiniMongo: no change is necessary. Its browser client has the retry middleware, but its procedures throw no `UNAVAILABLE`, `CONNECTION_CLOSED` or `RATE_LIMITED` without a flag.
- Graph: no change is necessary. Its handlers give `UNAVAILABLE` with an explicit flag, and it serves no stream procedure of its own.
- jarvis: no change is necessary. The cuts of its host have their own flag, and it uses no retry middleware.
