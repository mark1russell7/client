---
"@procedures/client": minor
---

Break: under the expose rule of a host, `procedure.define` makes a procedure only at an exposed path. A hidden path gets `NOT_EXPOSED`, also a free path. Before this release, a new procedure at a free hidden path was possible.

- `procedure.define`, `procedure.get` and `procedure.delete` examine the path before the lookup. A free hidden path and a used hidden path get the same answer.
- A lazy registry loads no package for a hidden path of these procedures.
- A nested `procedure.define` gets the same rule. Under an expose rule, `procedure.load` gives each stored program at a hidden path as a conflict. The scheduler then records `NOT_FOUND` for the run of that program.

Migration steps for the site and each app:

1. Find each call of `procedure.define` and each stored program under a host with an expose rule.
2. For each one at a hidden path, move the program to an exposed path. Or add its path to the expose rule of the host.
3. Store the moved programs again with `procedure.store`. Then remove the old entries from the program store.
