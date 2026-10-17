---
"@procedures/client": patch
---

`ProcedureServer.useStorage` with `close` waits for the calls on the old storage before it closes it. Before, it closed the old storage at once, and a call that started on it could fail as closed.

- The new calls use the new storage at once. The server waits only for the calls that took the old storage. A stream holds its storage until its end.
- The new option `grace` of `UseStorageOptions` is the longest wait, a `Duration`. A plain number throws a `TypeError`. The default is 30 seconds, `TIMER_DEFAULTS.server.storageGraceMs`. 0 closes at once.
- When the time ends, the server closes the old storage. A call that still uses it then fails with the error of a closed storage.
- The new option `clock` of `ProcedureServerOptions` is the clock of this wait. A test gives a fake clock.
