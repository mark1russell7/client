---
"@procedures/store": patch
---

Changed: a `TabCoordinator` whose setup of the sync fails asks for the lock again after a backoff (roadmap CLI-67). Before, it released the lock and never asked again.

- A tab becomes the leader only after its `HybridStorage` loaded the queue. Until then, the tab is a follower.
- When `remote()` throws or the load of the queue fails, the tab gives the error to `onError` and releases the lock. Another tab can lead.
- The tab stays a follower and asks again after the wait. `close()` stops the wait. In the single mode, the tab tries its setup again.
- The new option `retry` sets the backoff: `delay` (1 second), `factor` (2), `maxDelay` (1 minute) and `jitter` (0.5). The options `clock` and `random` serve a test.

Added: the status of the sync in each tab (roadmap CLI-65).

- `TabCoordinator.getStatus()` gives the `SyncStatus` of the leader in each tab, or `undefined` before the first status.
- `TabCoordinator.onStatus()` tells each new status to a listener, one time.
- The leader sends each change of its status to the followers, and it answers the hello of a new tab with its status.
- In a follower, `error.error` is an `Error` with the `name`, the `message` and the `code` of the error of the leader, because a message keeps only the values that a structured clone copies.
- The new message type `status` keeps the version 1 of the messages. A tab of an older release ignores it and still copies the batches.

PATCH: new methods, a new option with a default and a new message type that are backward compatible, before 1.0.0 (decision D13).
