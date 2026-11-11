---
"@procedures/shell": patch
"@procedures/fs": patch
---

Two security fixes:

- `@procedures/shell`: on Windows, a program name with no folder starts only from a folder of `PATH`, never from the working folder of the call. Before, a call such as "run `git` in this cloned repository" started a `git.exe` from the top folder of the repository. When no folder of `PATH` has the program, the start fails with `ENOENT`, as for a missing program, and the error names the program as before. `taskkill` starts by its full path in the system folder, and `shell.which` gives a match from `PATH` only.
- `@procedures/fs`: under a root, a link to a missing target is resolved against the real folder of the link. Before, the check resolved a relative target against the text of the path. When an earlier part of the path was a link to a folder, the check said "inside the root" for a write that went outside it. A `..` in a relative target follows the rule of the system: POSIX goes up from the real folder of the name before it, and Windows removes that name as text. The archive procedures and the other users of `@procedures/fs/root` get the same fix.
