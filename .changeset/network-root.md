---
"@procedures/fs": patch
"@procedures/git": patch
---

On Windows, the root check refuses a network or device path of another share before it opens the path.

- A path that starts with two slashes (`\\host\share\name`, `//host/share/name`, `\\?\UNC\host\share\name` or `\\.\pipe\name`) is outside the root, unless the root is on the same share. The check gets `FORBIDDEN` with the reason `outside-root` and does not open the path.
- `realPathIsInside()` gives false for such a path, and the root check of the git procedures does the same.
- The new function `isOtherShare()` of the entry `@procedures/fs/root` gives this decision.
- On other systems, nothing changes.
