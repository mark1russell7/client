---
"@procedures/mongo": patch
---

The `ViewMaterializer` does not lose a change of a view document or of a source that comes at once after `start()`, or during the open of a stream (roadmap O63).

PATCH: a fix, with no change to the API. Before 1.0.0, a fix raises the PATCH.

- The cause: the driver sends the `aggregate` of a change stream only after `watch()` returns. `start()` read the views, and then started the stream of the views without a wait. A change of a view before the stream was open on the server did not reach the materializer.
- `start()` now waits until the stream of the views is open on the server, and then reads the views. A change between the two reaches both.
- A run of a view now starts after the streams of its sources are open on the server. A pass after a rewatch also waits for the new stream.
- The changes of the set of views run one at a time, in the order of the stream. A change of a view during a resync applies after the read of the resync.
- When a change of a view document replaces a view while its streams open, the run of the old view does not start.
