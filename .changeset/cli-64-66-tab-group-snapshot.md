---
"@procedures/store": patch
---

Added: `TabGroup` does the sync of many collections with one lock and one channel (roadmap CLI-64). The option `snapshot` gives a new tab the entries of the leader (roadmap CLI-66). `TabCoordinator` does not change: its options, its messages and its lock stay the same.

- `new TabGroup({ name, open })` holds one Web Lock and one `BroadcastChannel` for each name, for example for each tenant. `collection(name, options)` gives a `TabCollection`, with `observe()`, `onRole()`, `getStatus()`, `onStatus()`, `role` and `syncStorage`.
- The leader of the group has one `HybridStorage` for each collection. Each message has the field `collection`. Each collection has its own batches, acknowledgements and status.
- A collection whose setup fails tries again alone after its backoff (CLI-67), and the other collections keep their sync. When no collection can lead, the tab releases the lock, as a `TabCoordinator` does.
- With the option `open`, the leader also makes a collection that only another tab opened.
- The lock and the channel of a group have the prefix `@procedures/store/tabs:`, and those of a coordinator have `@procedures/store/tab:`. A group and a coordinator do not share a lock or a channel.
- `snapshot: true` (only with `copy: "tab"`) lets a new tab ask the leader for the entries of its copy. The leader sends them in chunks of `snapshot.chunk` entries (500). Each chunk has the number of the last batch of each tab that the entries hold.
- The new tab writes the entries first, and then only the batches after the snapshot. It keeps the values of its own writes. When the leader changes, it asks the new leader.
- When no chunk comes in `snapshot.timeout` (10 seconds), the tab gives an error to `onError` and continues without a snapshot. A leader of an older release does not answer.
- The new message types `snapshot-request` and `snapshot` keep the version 1 of the messages. A tab of an older release ignores them.
