# @procedures/http

## 0.4.0

### Minor Changes

- ff87747: `http.ndjson` and `http.sse` send a POST too. Their inputs have `method` (`GET` or `POST`), `json` (a body of JSON) and `body` (a body of text), as `http.request` has them. The default method is `POST` with a body, and `GET` without one. An LLM API sends its answer to a POST as server-sent events: `http.sse` now reads such a stream.
  
  A POST of a stream gets the host check, the size limit of the request body, `timeoutMs`, `idleTimeoutMs` and the deadline of the call. Two bodies, or a `GET` with a body, fail before the request.
  
  A POST can change remote data, so the two streams now declare `writes: ["network"]`, as `http.json` does. Before, they declared `writes: []`.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0

## 0.3.0

### Minor Changes

- a6b01a9: The new package `@procedures/http` (roadmap R38) has four procedures: `http.request` (each method, a body of text, JSON or base64, and a response as text, JSON or base64), `http.json` (a GET or a POST of JSON), `http.ndjson` (a stream of the JSON values of the lines) and `http.sse` (a stream of server-sent events). `http.request` and `http.json` declare `reads: ["network"]` and `writes: ["network"]`. The two streams send only a GET, so they declare `writes: []`, and they declare `stream: { unbounded: true }`.
  
  The default module reaches each public host and refuses loopback, private, link-local, shared, multicast and reserved addresses. `createHttpModule({ allow, publicHosts, maxRequestBytes, maxResponseBytes, resolve })` gives the procedures with more hosts: host names, wildcards, IP addresses and CIDR ranges, each with an optional port. The check resolves the host name, and the connection uses only the addresses that passed the check. Each redirect gets the same check. A refusal has the code `FORBIDDEN` and the new reason `host-not-allowed` (the type `ForbiddenReason` of `@procedures/client`).
  
  A call stops at the earliest of its deadline, the abort of the caller and `timeoutMs`. A stream also stops after `idleTimeoutMs` without data. The body of a response has a limit of 10 MiB by default, and the limit counts the decoded bytes of a compressed body.

### Patch Changes

- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
