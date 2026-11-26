---
"@procedures/geo": patch
---

`geoSend` reads the bytes of a body. A request with `read: "bytes"` in its exchange gets `bytes` in its reply, for example the bytes of an image.

- `fetchLikeOf` gives `arrayBuffer()` when the response of the fetch has it. Before this change, a request that read bytes failed with "The fetch function gives no arrayBuffer".
- `GeoFetchResponse` has the optional member `arrayBuffer()`. The global `fetch` has it. `createHostFetch()` of `@procedures/http` does not have it.

PATCH: before 1.0.0, a backward-compatible fix raises PATCH. The new member is optional.
