---
"@procedures/mongo": patch
---

`ViewMaterializer` writes a row of a target again when only a value that is not JSON changes, for example a Date (CLI-126). Before this fix, the hash of a row of a plain target gave `{}` for each Date. A row that changed only in a Date kept its hash, so the view kept the old value.

The hash of a row reads one text in both kinds of target. A JSON value stays as it is. Each other value gives its canonical Extended JSON form. These values are a Date, a RegExp, a BSON value, NaN, an infinity and -0. A BSON value is, for example, an ObjectId, a Decimal128, a Binary, a Timestamp or a Long.

Fix: a target in a stored form stopped its run at a row with a RegExp that has the flag `g`. The old hash read the canonical Extended JSON of the row, and Extended JSON refuses the flag `g`. The driver (bson 7.3.3) reads the BSON option `s` of a regular expression as the flag `g`. So a row read back from MongoDB with the option `s` also stopped the run. The hash text of a RegExp is `{"$regularExpression": {"options", "pattern"}}`, with its flags in order, so the run continues.

Migration: a plain target keeps the hash of each row in `_viewHash`. The hash of a row with a value that is not JSON changes. At the first pass after the upgrade, a view writes each of these rows one time. The rows of JSON values keep their hash, and the view does not write them.
