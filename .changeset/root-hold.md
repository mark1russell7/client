---
"@procedures/fs": patch
"@procedures/archive": patch
---

The check of a path in a root and the operation on the path start in one hold of the roots. Thus the operation reads the links that the check read, for the calls of this process.

- `fs.move`, `fs.copy`, `archive.extract` and each confined procedure that writes files or starts a process hold the roots alone. The other calls share the hold.
- The calls get the hold in the order that they came. A nested call starts in the hold of its caller.
- A call in a shared hold that starts a nested call that needs the hold alone gets an error. This nested call writes files, and its caller declares no file writes.
- `holdRoots()` and `RootHoldMode` of `@procedures/fs/root`, and `rootHoldOf()` of `@procedures/fs`, give the hold to other packages.
- `@procedures/fs` uses `rwLock()` of `@mark1russell7/collections`.
