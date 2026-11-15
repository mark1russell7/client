---
"@procedures/client": minor
"@procedures/mcp-server": patch
---

A call limit takes a cost for each call (roadmap CLI-122). The new field `cost` of `CallLimit` is a whole number of 1 or more, or a function of the call. The default is 1. A cost for each item keeps a batch within the limit.

A call whose cost is over the burst or the limit of the policy gets a capacity refusal. Its code changes from `RATE_LIMITED` to `PAYLOAD_TOO_LARGE`, not retryable. The metadata gives `reason: "capacity"`, `units` and `capacity`. The HTTP face answers 413 in place of 429, with `units` and `capacity` in the body and no `Retry-After`. The HTTP client, the batch, the WebSocket and the MCP faces carry both numbers.

Migration steps:

1. Code that reads a capacity refusal as `RATE_LIMITED` with `reason: "capacity"` reads `PAYLOAD_TOO_LARGE`. An HTTP client reads 413 in place of 429.
2. A store with pushes of batches sets `pushBatch` of `HybridStorage` within the capacity of the limit. A 413 with `units` and `capacity` lowers the cap of later pushes.
3. A host with a limit of each call gives no `cost`. Its limits keep one unit for each call.
