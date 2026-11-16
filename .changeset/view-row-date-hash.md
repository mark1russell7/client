---
"@procedures/mongo": patch
---

`ViewMaterializer` writes a row of a target again when only a value that is not JSON changes, for example a Date (CLI-126). Before this fix, the hash of a row of a plain target gave `{}` for each Date. A row that changed only in a Date kept its hash, so the view kept the old value.

The hash of a row reads one text in both kinds of target. A JSON value stays as it is. Each other value gives its canonical Extended JSON form. These values are a Date, a RegExp, a BSON value, NaN, an infinity and -0. A BSON value is, for example, an ObjectId, a Decimal128, a Binary, a Timestamp or a Long. A RegExp with the flag `g` gives a hash, and the run of a target in a stored form continues.

Migration: a plain target keeps the hash of each row in `_viewHash`. The hash of a row with a value that is not JSON changes. At the first pass after the upgrade, a view writes each of these rows one time. The rows of JSON values keep their hash, and the view does not write them.
