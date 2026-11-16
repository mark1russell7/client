---
"@procedures/collections": patch
---

`UndoLog` refuses an undo when another writer changed only a Date of the item (CLI-127). Before this fix, `fingerprintOf` gave the text `{}` for each Date, RegExp, Map and Set. A change of only one of these values kept the fingerprint, so the undo wrote over the change of the other writer.

The fingerprint of an item with one of these values changes. An entry that the log recorded before the upgrade for such an item no longer matches, so its undo is refused. The fingerprints of the other items do not change.
