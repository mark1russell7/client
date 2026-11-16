---
"@procedures/shell": patch
---

A time limit, an abort and a stop end a command also when a descendant keeps the output pipes of the command.

- Before, a command ended only when each holder of its stdout and stderr pipes closed them. A descendant that outlived the first process held `runCommand`, `streamCommand` and `ProcessRegistry.stop` after the time limit or the abort.
- At a time limit, an abort or a stop, the pipes get 250 ms after the end of the first process. Then the command closes the pipes and ends.
- On POSIX, `killTree` also signals the process group of a first process that ended, while a process of that group lives.
- `ProcessRegistry.stop` gives `stopped: false` when the process did not end in the grace time. The documented rule of `stopped` is "true when this call ended a running process", so this change is a fix.
- Without a time limit or a signal, a command ends when its pipes close, as in `node:child_process`.
