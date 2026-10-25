---
"@procedures/client": patch
---

Fixes of the low findings of the second code audit (roadmap O57).

- `client.min` and `client.max` use a loop. A spread of a long array as arguments overflowed the stack.
- The cache middleware: a call that waits for the same call in flight follows its own abort signal. An abort gives `ABORTED` at once.
- The WebSocket server: a request that ends late does not delete the stream credit of a newer request with the same id.
- The batch executor removes its listener from the signal of the batch when each call ends. A long-lived signal kept a listener for each call.
