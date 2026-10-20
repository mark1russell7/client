---
"@procedures/mark": patch
---

Deprecated (D13): three behaviors of a `mark` command in this process (the cold mode). The MINOR of CLI-26 changes them, when each command starts under `run()` of `@mark1russell7/service` (decision D17). This release changes no behavior.

- The first Ctrl-C of a cold command gives the exit code 1. After the change, it gives 130, as the profile `ephemeral` of the runner does.
- A second Ctrl-C of a cold command ends the process at once with the exit code 130. After the change, a second signal gives 1.
- A cold `mark server create` keeps its peer alive after the command. After the change, the peer stops at the end of the command. For a server in the foreground, use `mark --server` or `procedure-server`.

A command on the CLI server (the warm mode) and the exit codes 0 and 1 of a command that ends do not change.
