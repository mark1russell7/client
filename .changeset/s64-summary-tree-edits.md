---
"@procedures/collections": patch
---

`SummaryTree` gets `locate(key, target)`, which finds the leaf and the offset of a position of an additive key and calls no `combine`. The new optional `spec.merge(left, right)` joins two neighbor leaves at each seam of `concat`, `append`, `prepend`, `splice`, `insert` and `remove`. `set` and a `splice` of 8 leaves or fewer copy only the paths to their leaves. A rope edit of 100k characters in leaves of 256 calls `combine` at most 35 times, and 133 times before. The new type `SummaryLocation` is the result of `locate`.
