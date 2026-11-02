---
"@procedures/collections": patch
---

Add `SummaryTree<Leaf, Summary>` and `summaryTree(spec, leaves)`: a persistent sequence of leaves with a monoid summary in each node. `concat`, `splitAt`, `split` (a monotone predicate over the prefix summary), `search`, `slice`, `splice`, `insert`, `remove`, `set` and `at` are O(log n). The tree is an AVL tree with the join algorithms.
