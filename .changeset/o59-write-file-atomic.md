---
"@procedures/fs": patch
"@procedures/schedule": patch
"@procedures/mark": patch
"@procedures/node": patch
---

The atomic writes use `writeFileAtomic()` of `@procedures/fs/files` (dedupe review F3, tracker item O59).

PATCH (pre-1.0): this change is internal. It changes no export and no signature.

- `fs.write.json`, the file store of `@procedures/schedule`, the manifest of `mark` and the `current.json` record of `@procedures/node/fresh-bundle` replace their own temporary file and rename with `writeFileAtomic()` or `writeFileAtomicSync()`.
- Each write now flushes the file to the disk. On Windows, a locked target gets more tries of the rename, for 2 seconds.
- A replaced file keeps the permissions of the old file. A symlink target stays a symlink, and the write goes to the file of the link.
- The temporary file has the name `.<name>.<16 hex digits>.tmp` in the folder of the target.
- `@procedures/schedule`, `@procedures/mark` and `@procedures/node` declare `@procedures/fs` in `dependencies`.
