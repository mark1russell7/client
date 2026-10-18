---
"@procedures/client": patch
"@procedures/collections": patch
---

New: the patch operations `$remove` and `$insert` (Graph's split, wave 2, W5). `$remove` takes an element out of an array, and the next elements move down by one, as the operation `remove` of JSON Patch (RFC 6902). For a field of an object, it is the same as `$unset`. `$insert` adds an element to an array at an index, as the operation `add` of JSON Patch. Each index of one patch refers to the item before the patch. A patch that removes and inserts elements of the same array is refused, and so is an `$insert` past the end of an array. `$unset` keeps the rule of MongoDB: an element of an array becomes `null`. The storage contract has a case for the two operations, so each storage gets them through `applyPatch`.
