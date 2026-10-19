---
"@procedures/shell": patch
---

A signal kills the process trees of `@procedures/shell` only when no other handler owns the signal. A host under `run()` of `@mark1russell7/service`, and the interrupt of `mark`, own their signals. Their stop aborts each call, and the abort of a procedure kills its tree, so a stream of `shell.stream` ends in band. Before, the first SIGTERM killed each tree before the drain, and the stream ended with `done`. The CI job `lifecycle` (CI-2) found it. The exit hook still kills each tree that runs at the exit of the process.

PATCH: a bug fix. A process without another handler of the signal keeps the old behavior.
