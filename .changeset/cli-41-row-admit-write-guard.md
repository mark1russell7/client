---
"@procedures/client": patch
"@procedures/access": patch
---

New: the rules of the rows of a served collection (roadmap CLI-41). Before, the collection procedures checked only the partition of a call. A right that depends on the document, for example a `when` condition of an access list, had no place in a read or a write. The new option `admission` of `createCollectionProcedures()` gives two rules. `admit` examines each row `{ id, value }` of each read, and it has the shape of `AdmitItem`. `guard` examines each write `{ op, id, doc, prev }` before the storage changes, and a refused write gets `FORBIDDEN` with the reason `write-not-allowed`. The procedures apply the two rules in one place, the view of the storage of each call (`admittedStorage()`). A refused row is absent from `get`, `has`, `getAll`, `entries`, `ids`, `size`, `getBatch`, `find` and `changes`, and a delta of `changes` puts its id in `deleted`. The change events with values apply `admit` for each subscriber. The context of a call has its invocation (`ctx.invocation`). `@procedures/access` gets `accessWriteGuard()`, and `accessAdmitItem()` gets the option `docOf`. Without the option `admission`, nothing changes.
