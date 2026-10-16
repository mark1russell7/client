---
"@procedures/fs": minor
"@procedures/client": minor
---

The file procedures can have a root (roadmap R33). `createFsModule({ root })` gives the procedures of `fsModule`, and each path of each input must be in the root folder. A relative path starts at the root. Without a root, the procedures operate as before.

The procedures refuse a path that goes up with `..`, an absolute path outside the root and another drive. They also refuse a symlink or a junction that goes out of the root. The error has the code `FORBIDDEN` and the new reason `outside-root` (the type `ForbiddenReason` of `@procedures/client`). For a path that does not exist, the check uses the real path of the nearest existing folder. `registerFsProcedures(registry, { root })` takes the root too.
