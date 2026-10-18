---
"@procedures/collections": patch
---

New: the order of a list as data (Graph's split, wave 2, W1). `keyBetween(prev, next)` gives a string key between two neighbors, so a move writes one item and no other. The keys use fractional indexing with 62 digits: they do not run out, and the list needs no rebalance. `keysBetween` gives several keys, `compareKeys` sorts them, and `dropIndex(point, centers)` gives the index of a point among the items on the screen, in reading order.
