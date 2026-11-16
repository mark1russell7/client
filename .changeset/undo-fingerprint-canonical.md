---
"@procedures/collections": patch
---

`fingerprintOf` of the undo log uses `canonicalJson` of `@mark1russell7/rigor-generators` (CLI-128). The local copy of the canonical text is removed.

- A JSON value, a `Date`, a `RegExp`, a `Map` and a `Set` keep their fingerprint. A test pins these fingerprints.
- A `bigint` gets a tag with its value. Before, it caused a `TypeError`.
- An object with a `toJSON` method gets the fingerprint of the result of that method. Before, the fingerprint read the own keys of the object.
- A function, a symbol and a cycle cause a `TypeError`. Before, a function and a symbol had the fingerprint of `null`, and a cycle overflowed the stack.

Migration: an entry that an older version recorded for an item with a `toJSON` object (not a `Date`) keeps its old fingerprint. Its undo refuses with `UndoConflictError`, as after a change by another writer. The other entries do not change.
