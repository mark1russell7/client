---
"@procedures/client": patch
---

The error codes of the HTTP client agree more with `ERROR_REGISTRY` (the deferred findings of the invariants audit of O70).

- `ERROR_REGISTRY` and `ErrorCode` have the codes `STREAM_ENDED` and `METADATA_TOO_LARGE` of `HttpTransport`. `STREAM_ENDED` is retryable, and `METADATA_TOO_LARGE` is not. At this time, `isKnownErrorCode()` gives `true` for the two codes, so a server with `expose: "coded"` shows their message.
- When a status has no entry in `ERROR_REGISTRY`, `createHTTPStatusError()` takes the code from `HTTPStatusToCode`. Three of these codes are deprecated as error codes. The next MINOR of the client group replaces them with codes of `ERROR_REGISTRY`:
  - 408: `REQUEST_TIMEOUT` becomes `TIMEOUT`, with `retryable: true`.
  - 500: `INTERNAL_SERVER_ERROR` becomes `INTERNAL_ERROR`, with `retryable: false`.
  - 599: `HTTP_NETWORK_CONNECT_TIMEOUT_ERROR` becomes `HTTP_NETWORK_CONNECT_TIMEOUT`, with `retryable: true`.
- This release does not change a code or a `retryable` flag of the fallback.
