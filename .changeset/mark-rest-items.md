---
"@procedures/mark": patch
---

Each argument of a last array positional is one item, also when there is only one. Before, one argument was read as the whole array: `[]` gave no item, and `["a","b"]` gave two. The README rule says "A last array field takes the rest". A property test of the command line found it.
