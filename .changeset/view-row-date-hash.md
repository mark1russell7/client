---
"@procedures/mongo": patch
---

`ViewMaterializer` writes a row of a plain target again when only a Date or a RegExp of its content changes (CLI-126). Before this fix, the hash of a row gave `{}` for each Date, RegExp, Map, Set, MinKey and MaxKey. A row that changed only in one of these values kept its hash, so the view kept the old value.

The hash of a row with one of these values changes. At the first pass after the upgrade, a view writes each of these rows one time. The hashes of the other rows do not change.
