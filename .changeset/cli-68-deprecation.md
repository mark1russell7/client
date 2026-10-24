---
"@procedures/client": patch
"@procedures/mcp-server": patch
---

Deprecated (D13): the flag `retryable: false` of an in-band end before the first item of a stream, for an error without a flag. The next MINOR of the client group changes it (roadmap CLI-68, decision D25). This release changes no behavior.

- The in-band end is the `error` line of NDJSON, the `error` frame of WebSocket and the `_meta` of the MCP stream result.
- Now, an error of a handler without a flag gets `retryable: false` there, also when the stream gave no item (CLI-58).
- After the change, an in-band end without a flag before the first item gets the flag of its code in `ERROR_CODES`, as an error before the start of the stream does. Thus `UNAVAILABLE` is retryable there.
- Then the retry middleware of the client sends such a stream again. This adds time and calls. A handler with an effect before its error does that effect again.
- After the first item, the flag stays `false` without a flag. This part of the CLI-58 rule does not change.
- To keep the flag `false` before the first item, give `retryable: false` in the error of the handler. Or do not use the retry middleware for that call.

`WIRE-PROTOCOL.md` (section "Error codes") and the doc comments of `errorResponse`, `defaultNdjsonError`, `errorStatus` and `streamErrorMeta` have the deprecation notes.

The site, MiniMongo, Graph and jarvis: no change in this release.
