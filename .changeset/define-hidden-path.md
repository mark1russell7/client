---
"@procedures/client": patch
---

`procedure.define` under the expose rule of a host makes a procedure only at an exposed path. A hidden path gets `NOT_EXPOSED`, also when no procedure is there.

- `procedure.define`, `procedure.get` and `procedure.delete` examine the path before the lookup. A free hidden path and a used hidden path get the same answer.
- A lazy registry loads no package for a hidden path of these procedures.
- Under an expose rule, `procedure.load` gives each program at a hidden path as a conflict.
