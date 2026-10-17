---
"@procedures/dag": minor
---

`dag.traverse` reports the packages that it did not visit. A failed visit stops the traversal after its level when `continueOnError` is false. Before, the output did not list the packages of the later levels.

- Each package without a visit has a result with `skipped: true`, `success: false`, `duration: 0` and a `reason`. These results come after the results of the visits, in dependency order.
- The output has the new count `skipped`. `failed` counts only the visits that failed.
- The loop that "ensured a result for each node" is removed. It could not add a result, because each visit records its own result.
