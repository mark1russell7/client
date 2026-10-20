---
"@procedures/store": patch
---

Added: `TabCoordinator`, so one leader tab of a browser does the sync of a `HybridStorage`, and the other tabs copy its changes (roadmap CLI-25). It is in `@procedures/store/browser` and in the package root.

- The election uses the Web Locks API. When the leader closes, or the browser closes its tab, the next tab becomes the leader.
- Only the leader makes the `HybridStorage`, with `capture: "observe"`. The followers make no remote call and start no timer.
- The tabs send the change batches of their local copies on a `BroadcastChannel`. `observe()` gives each batch of each tab one time, with its origin. A tab does not send again a batch that it got.
- The leader captures the batches of the followers, and its queue store keeps them. Only the leader writes to the shared queue store.
- A follower keeps each own batch until the leader acknowledges it. A new leader gets the batches that no leader acknowledged.
- The option `copy` is `"shared"` for one durable local copy of all tabs, or `"tab"` for a local copy in each tab, for example a SignalDB collection.
- Without the Web Locks API or `BroadcastChannel`, the tab does its own sync in the single mode.

Added: `HybridStorage.whenQueued()`. It resolves when the queue store holds the queue, and it sends nothing.

PATCH: new exports and a new method that are backward compatible, before 1.0.0.
