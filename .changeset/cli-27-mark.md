---
"@procedures/mark": patch
---

The optional auto-warm of `mark` (CLI-27): a cold command can start the background host, so the next command is warm.

- The setting is `MARK_AUTO_WARM`, with the values `never` and `after-cold`. The default is `never`, so the behavior does not change.
- With `after-cold`, a cold command starts `mark --server --idle-timeout <ms>` before it exits. The command starts no host when a warm host runs, when another command starts one, or when the port is in use.
- `MARK_IDLE_TIMEOUT_MS` gives the idle time of that host (the default is 10 minutes). `MARK_AUTO_WARM_PORT` gives its port (the default is 3000).
- `mark --server` has the new option `--idle-timeout <ms>`. Without it, the server has no idle stop, as before.
- The auto-warm does not change the result or the exit code of a command.
