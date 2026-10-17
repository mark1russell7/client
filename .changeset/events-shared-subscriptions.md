---
"@procedures/client": minor
---

Three gaps of the remote events (`documentation/EVENTS.md`) are closed. The option `backoff` of a subscription changes, so this release is breaking for a caller that gives it.

- **Shared subscriptions.** The subscribers of the same topics with the same options on one transport share one call: one `request` on the wire, with a count of its subscribers. Only the last unsubscribe sends the `cancel`. Before, each `subscribeRemote()`, `remoteEvents()` or `transport.subscribe()` made its own call. Each subscriber keeps its own id, its own `ready` and its own queue of at most 1024 events. A late subscriber gets no replay: its `ready` resolves at once, and its `seq` starts at 1. An error or an end of the shared call goes to each subscriber. `WebSocketServerTransport` shares the subscriptions of one connection.
- **The end at `clear()`.** `clear()` and `clearAll()` of the bus of the publisher end each subscription of a cleared topic. The subscriber first gets the events of the queue, then the error `TOPIC_CLEARED` (new protocol code, HTTP 410, not retryable) through `onError`, `ready` or the iterator. Before, the listeners went, and the subscriber saw no end. The new option `onClear` of `EventBus.on(channel, handler, { onClear })` (type `EventListenOptions`) gives the same notice to a local handler.
- **The limit of the resubscribe.** The new option `maxAttempts` (default 10) is the number of resubscribe tries without a confirmation. When the tries run out, the subscription ends with a `SubscriptionError` that has the code of the last failure. Before, a subscription over HTTP resubscribed forever. The WebSocket transport uses `reconnect.maxAttempts` (default `Infinity`), so its behavior stays. The new option `clock` is the clock of the backoff, for a fake clock in a test. `SubscriptionHooks` has the new fields `maxAttempts` and `clock`.

Migration: the option `backoff` is an object of durations (type `ResubscribeBackoff`), with the names of the `reconnect` options of `WebSocketTransport`: `initialDelay` (default `ms(250)`), `maxDelay` (default `seconds(30)`), `backoffMultiplier` (default 2) and `jitter` (default 1). Before, it was a function of milliseconds. A function or a plain number throws a `TypeError` at the call. For the old behavior over HTTP, give `maxAttempts: Infinity`.

```ts
// Before
subscribeRemote(transport, "orders.created", handler, { backoff: (attempt) => Math.min(30_000, 500 * 2 ** (attempt - 1)) });
// Now
subscribeRemote(transport, "orders.created", handler, { backoff: { initialDelay: ms(500), maxDelay: seconds(30), jitter: 0 }, maxAttempts: Infinity });
```
