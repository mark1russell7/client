---
"@procedures/client": patch
---

The entries `.`, `./browser` and `./procedures` export `mathProcedures`, the math procedures under `client` (roadmap O95). A bundle that registers only these gets no other core procedure. The error policy of a server reads the known codes from `ErrorCode` and `ERROR_CODES`, not from `ERROR_REGISTRY`, so a bundle of the server gets no copy of the error texts. A test makes sure that both sets of codes are equal. `isKnownErrorCode` does not change.
