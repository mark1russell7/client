---
"@procedures/procedure": patch
---

`procedure.new` ends its `operations` with the step "Write metadata.effects: lib audit reports a procedure without them". The scaffold writes no effects on purpose, because a default of "pure" can be false.
