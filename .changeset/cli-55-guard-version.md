---
"@procedures/client": patch
---

The guard of the writes of a collection closes the gap between its read and the write, and `find` with the rule of the rows gets a bound of its scan (roadmap CLI-55).

PATCH: a correction of a race and a new optional option. Without the new options, nothing changes.

- New option `admission.versionOf` of `createCollectionProcedures()`: the version of a stored item, the same function as the option `versionOf` of the storage. With it, each `set`, `delete`, `setBatch` and `patch` that the guard permits expects the version of the item that the guard examined (`expectedVersion`, `expectedVersions`, roadmap CLI-16). An id without an item expects `null`. An expected version of the caller stays.
- A change for callers: before, a write of another writer between the read of the guard and the write was lost, and the guard did not examine the new item. With `admission.versionOf`, such a write now fails with `VERSION_CONFLICT`, and the storage does not change. A guarded `patch` writes the merged item that the guard examined with `set`, not with `patch()` of the storage. A storage without `versionOf` refuses each guarded write with `PRECONDITION_NOT_SUPPORTED`.
- `deleteBatch`, `clear` and an item without a version get no precondition, because the storage cannot test one for them.
- A `VERSION_CONFLICT` of a write through the procedures has no value for a current item that the rule `admit` refuses. Before, the conflict gave that item to the caller.
- New option `admission.maxScanned`: the largest number of rows that one `find` examines with the rule `admit`. At the bound, `find` gives the admitted rows that it found, and that page can be shorter than the limit. The result has no other mark, because the output of `find` is a list and the protocol has no code for this case.
