---
"@procedures/store": patch
---

Added: the option `aroundRemoteApply` of `HybridStorage` puts each apply of the remote changes inside a hook (graph W8). Graph uses it to start a span of a trace with the `traceparent` that the server sends with a change.

- `aroundRemoteApply(hint, apply, context)` starts `apply` one time and gives back its promise. `context.cause` is `"delta"`, `"hint"`, `"gap"` or `"pull"`. `context.hints` has the hints of the apply.
- A delta and a hint of the feed give their hint. A gap and a pull of the storage (the timer of `pullInterval`, `syncFromRemote()`, `sync()` and the first sync) give the hint `undefined`.
- `RemoteChangeHint` and `RemoteChanges` have the new optional field `extra`. `EventsChangeFeed` puts the other fields of a change event in it, for example `traceparent`.
- An error of `apply` or of the hook makes the pull fail, and the status keeps it. A hook cannot hide an error of `apply`.
- When the hook does not start `apply` one time, the pull fails with the new `RemoteApplyHookError`. The changes apply one time all the same.
- Only the leader of a `TabCoordinator` or a `TabGroup` uses the hook.
- The package root and `@procedures/store/browser` export `RemoteApplyHookError` and the types `RemoteApplyHook`, `RemoteApplyContext` and `RemoteApplyCause`.
- Without the hook, the storage applies the changes as before.
