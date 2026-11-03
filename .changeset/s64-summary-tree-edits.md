---
"@procedures/collections": patch
---

`SummaryTree` gets `locate(key, target)`, which finds the leaf and the offset of a position of an additive key and calls no `combine`. The new optional `spec.merge(left, right)` joins two neighbor leaves at each seam of `concat`, `append`, `prepend`, `splice`, `insert` and `remove`. `set` and a `splice` of 8 leaves or fewer copy only the paths to their leaves. A rope edit of 100k characters in leaves of 256 calls `combine` and `measure` 21 times at most, and 135 times before. Each node keeps the summary of its left subtree and its leaf, so a copy that changes only the right subtree calls `combine` once. The new type `SummaryLocation` is the result of `locate`.
