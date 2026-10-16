---
"@procedures/client": minor
---

`ERROR_REGISTRY` agrees with `ERROR_CODES` of the wire protocol. `ERROR_CODES` is the source: the registry has an entry for each code of the protocol, and that entry takes its HTTP status and its retry flag from `ERROR_CODES`. Changes that a caller sees:

- `TIMEOUT` has the status 504 and is not retryable (before: 408, retryable).
- `INTERNAL_ERROR` is not retryable (before: retryable).
- `ABORTED` has the status 499 (before: none).
- The codes of the protocol that the registry did not have (`HANDLER_ERROR`, `VALIDATION_ERROR`, `UNAVAILABLE` and the others) have entries, with the meaning of the protocol as their texts.
- `errorCodeToHTTPStatus` gives the status of `ERROR_CODES` for a code of the protocol, for example 504 for `TIMEOUT`.
