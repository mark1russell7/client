---
"@procedures/http": minor
---

`http.ndjson` and `http.sse` send a POST too. Their inputs have `method` (`GET` or `POST`), `json` (a body of JSON) and `body` (a body of text), as `http.request` has them. The default method is `POST` with a body, and `GET` without one. An LLM API sends its answer to a POST as server-sent events: `http.sse` now reads such a stream.

A POST of a stream gets the host check, the size limit of the request body, `timeoutMs`, `idleTimeoutMs` and the deadline of the call. Two bodies, or a `GET` with a body, fail before the request.

A POST can change remote data, so the two streams now declare `writes: ["network"]`, as `http.json` does. Before, they declared `writes: []`.
