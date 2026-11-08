---
"@procedures/server": patch
---

The procedures `server.start` and `server.status` get the folder `~/.mark` and the folder of the lockfiles from `getMarkDir()` and `getServersDir()` of `@procedures/peer/lockfile`. Before, each of the two files made its own copy of the path. The paths do not change.
