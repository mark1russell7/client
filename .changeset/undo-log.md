---
"@procedures/collections": patch
---

New: `inversePatch` and `UndoLog` (Graph's split, wave 2, W10). `inversePatch(before, patch)` gives the patch that undoes a patch. The inverse of a removal of an element is an insertion, and the inverse of an insertion is a removal, so an undo does not keep the whole array. The function applies the inverse to check it, and gives `undefined` when no patch undoes the change exactly. `UndoLog` keeps the undo of each change in a collection storage, with a cap, and the fingerprint of the item after the change (`fingerprintOf`). `undo()` undoes the newest change and the other changes of its group. It reads each item first, and refuses the whole group with an `UndoConflictError` when another writer changed an item. Then each item gets one write.
