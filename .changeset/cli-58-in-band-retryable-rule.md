---
"@procedures/client": patch
---

Docs and tests: the rule of the retryable flag of an in-band end (CLI-58). The behavior does not change, thus this change is a PATCH of the client group (decision D13).

- Before the stream starts, an error of a handler without a retryable flag gets the flag of its code in `ERROR_CODES` (CLI-48). Thus `UNAVAILABLE` without a flag is retryable, and the HTTP face answers 503.
- After the stream starts, an error ends the stream in-band. The in-band end is the `error` line of NDJSON, the `error` frame of WebSocket or the `_meta` of the MCP result.
- An in-band end without a retryable flag gets `retryable: false`, also when the stream gave no item. The reader can have items, and a retry can send them again.
- A handler gives `retryable: true` when a retry is safe. Then the in-band end is retryable too.
- The retry middleware of the client does not retry after an item reached the reader. Thus after the first item, the flag only tells the application.
- This rule agrees with the rule of a cut (CLI-48): the flag is false when the call can have had its effect.
- `WIRE-PROTOCOL.md` gives the rule in the section "Error codes". Tests pin it on the wire of HTTP and WebSocket, and on the HTTP, WebSocket and MCP faces of the procedures host.

The site, MiniMongo, Graph and jarvis: no change.
