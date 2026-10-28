---
"@procedures/mongo": patch
---

`@procedures/mongo` gets one change watcher for a whole database, and its watchers take a logger (CLI-88). This change is additive. Thus it is a PATCH of the client group (decision D13).

- `watchDatabaseChanges(db, options)` watches the change stream of a database and gives each raw change event to `onChange`, one at a time.
- After an error, the watcher waits for a bounded backoff. Then it opens the stream again with `startAfter` and the token of the last change. It loses no change and gives no change twice.
- An `invalidate` event, a lost resume token and an error of the first open that does not go away stop the watcher. The error goes to `onError`.
- `watchStorageChanges` and `ViewMaterializer` take the option `logger` (the `Logger` of `@procedures/client`). The fields of each line hold its context.
- The option `log` is deprecated: use `logger`. When you give both, `logger` wins. Without `logger` and without `log`, the console output does not change.
