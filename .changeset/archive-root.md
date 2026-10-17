---
"@procedures/archive": minor
---

A root for the files of the archive procedures (roadmap R33): `createArchiveModule({ root })` confines each path of the inputs to one folder, with the rules of `createFsModule({ root })`.

- A relative path starts at the root. Without `cwd`, the files of `archive.create` start at the root.
- The archive of each procedure must be in the root. So must the `source`, the `cwd`, the folder of each file and the `target`.
- A path outside the root gives `FORBIDDEN` with the reason `outside-root`. These are `..` out of the root, an absolute path outside it, another drive, and a link or a junction that leads out.
- The check uses the real path, also for a path that does not exist yet.
- The extract keeps its checks of the entries in the target folder ("zip slip"), and the target folder must be in the root.
- Without a root, the procedures work as before.
- The new exports: `OUTSIDE_ROOT`, `isInside` and `isOutsideRoot`.
