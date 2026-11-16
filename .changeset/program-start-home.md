---
"@procedures/shell": patch
"@procedures/server": patch
"@procedures/claude-cli": patch
"@procedures/node": patch
---

Only the shell package starts a program. On Windows, each start finds a program name with no folder only in the folders of `PATH`, not in the working folder.

- `@procedures/shell/command` has two new helpers. `spawnProgram(command, args, options)` starts a program that the caller keeps, for example a detached process. `spawnProgramSync(command, args, options)` starts a program and waits for its end. They take the options of `spawn` and `spawnSync` of Node, without `shell`: the option `shell` is always `false`. The default of `windowsHide` is `true`. The error of a failed start names the command.
- `@procedures/server`: the background `mark --server` starts with `spawnProgram`. Before, on Windows, a start of `mark` by its name looked first in the working folder of the call.
- `@procedures/claude-cli`: `startTurn()` starts `claude` with `spawnProgram`. Before, on Windows, a start of a name with no folder (from the option `executable` or from the environment variable) looked first in the working folder.
- `@procedures/node`: the fresh bundle starts its build with `spawnProgramSync`. It starts `process.execPath`, so its behavior does not change.
- A Windows caller that put a program in the working folder, and not in a folder of `PATH`, gets ENOENT after this change. Such a caller gives the path of the program, for example `.\mark.exe`.
