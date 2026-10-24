---
"@procedures/store": patch
---

Added: `TabGroup` does the sync of many collections with one lock and one channel (roadmap CLI-64). The option `snapshot` gives a new tab the entries of the leader (roadmap CLI-66). `TabCoordinator` does not change: its options, its messages and its lock stay the same.

- `new TabGroup({ name, open })` holds one Web Lock and one `BroadcastChannel` for each name, for example for each tenant. `collection(name, options)` gives a `TabCollection`, with `observe()`, `onRole()`, `getStatus()`, `onStatus()`, `role` and `syncStorage`.
- The leader of the group has one `HybridStorage` for each collection. Each message has the field `collection`. Each collection has its own batches, acknowledgements and status.
- Each collection tells the other tabs when it leads. Thus a slow collection does not stop the batches of the other collections.
- A collection whose setup fails tries again alone after its backoff (CLI-67), and the other collections keep their sync. The tab sends a status with the error to the other tabs (CLI-65).
- When no collection of the group leads or loads its queue, the tab releases the lock, as a `TabCoordinator` does. This also applies to a collection that the application adds after the tab got the lock.
- A `TabCoordinator` and a `TabGroup` do not see each other. When you move a collection to a `TabGroup`, give it a new queue store, or close the tabs of the older release first.
- With the option `open`, the leader also makes a collection that only another tab opened.
- The lock and the channel of a group have the prefix `@procedures/store/tabs:`, and those of a coordinator have `@procedures/store/tab:`. A group and a coordinator do not share a lock or a channel.
- `snapshot: true` (only with `copy: "tab"`) lets a new tab ask the leader for the entries of its copy. The leader sends them in chunks of `snapshot.chunk` entries (500). Each chunk has the number of the last batch of each tab that the entries hold.
- The new tab writes the entries first, and then only the batches after the snapshot. It keeps the values of its own writes. When the leader changes, it asks the new leader.
- The snapshot can repeat a set that also comes in a later batch. The second write gives the same state. `snapshot.chunk` counts entries, not bytes.
- When no chunk comes in `snapshot.timeout` (10 seconds), the tab gives an error to `onError` and continues without a snapshot. A leader of an older release does not answer.
- In the tab that holds the lock, the wait renews itself while the collection loads its queue, at most 5 times.
- The new message types `snapshot-request` and `snapshot` keep the version 1 of the messages. A tab of an older release ignores them.
