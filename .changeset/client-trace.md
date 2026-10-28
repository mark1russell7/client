---
"@procedures/client": patch
---

The new procedure `client.trace` runs the steps of a `client.chain` program one at a time. It gives one row for each step, with the result of the step. The result of each step equals the result of the same step in `client.chain`. A step that can write does not start: its row is `not-run` with the reason `writes`.

Each call of `client.trace` asks for a capability without writes, so the capability also refuses a nested write. Thus `client.trace` changes nothing, also through a face with no limits. The input field `upTo` stops the run after a step, and `sampleLimit` cuts the arrays of each row. The kernel hook `onStep` of `runControl()` gives the result of each step of a chain.
