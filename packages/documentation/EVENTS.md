# Remote events

> **Status:** design of 2026-10-16. The owner chose to complete the event feature of the WebSocket transport, not to remove it. The implementation is in `@procedures/client`: `src/events/publisher.ts` and `src/events/remote.ts`. The change of 2026-10-17 adds the shared subscriptions, the end at `clear()` and the limit of the resubscribe tries.

This document specifies how a peer subscribes to the topics of the event bus of another peer. It extends [wire protocol v1](./WIRE-PROTOCOL.md) and keeps its rules.

## The problem

- Each side has an event bus in its process: `DefaultEventBus`, with channels, `on()`, `stream()` and `emit()`. Procedures publish on it through `ctx.bus`.
- The WebSocket client had an `onEvent` option, and it handled a frame of the type `event` with `topic`, `data` and `subscriptionId`.
- No server sent that frame, and no frame made a subscription. The feature had a receiver and nothing else.

## The decision: a subscription is a streaming call

A peer subscribes with a call of the procedure `events.subscribe`. The input names the topics. The output is a stream without an end: one item for each event of these topics.

The reasons:

1. **No new frame.** A subscription uses the frames `request`, `stream`, `credit`, `cancel` and `error`. These frames have golden tests, leak tests and a soak test already.
2. **One admission.** The call passes the token, the authenticate function and the capability of the host, as each other call does.
3. **Each transport with streams carries it.** WebSocket carries it in the two directions. HTTP carries it as NDJSON. The message port and the local transport carry it too.
4. **The protocol stays v1.** The change adds a procedure path, an error code and a reason. Refer to "The protocol version".

The options that this design does not use:

- **An `event` frame with a `subscriptionId`.** It needs its own credit, cancel, errors and tests, and only WebSocket has it.
- **Server-sent events (SSE) for HTTP.** The HTTP transport streams NDJSON already, with the backpressure of TCP. An `EventSource` of a browser cannot send an `Authorization` header. A second stream format also doubles the tests.

## The procedure `events.subscribe`

The publisher is a `ProcedureServer` with the option `events`. The server pins the procedure as always on, as a host pins `host.health` (CLI-47).

The input is `{ "topics": ["orders.created", "orders.paid"] }`:

- It names 1 to 64 topics. Each topic has 1 to 256 characters.
- A topic is a channel name of the bus of the publisher. The publisher merges two equal names.

The output is a stream of items. Each item has a `type`:

| `type` | Fields | Meaning |
|---|---|---|
| `subscribed` | `topics` | The first item. From this item on, the publisher has a listener on each topic. |
| `event` | `topic`, `data`, `seq`, `dropped` | One event of the bus. |

- `seq` is the number of the event in the subscription. It starts at 1. A gap in the numbers shows lost events.
- The `stream` frame of each item has a `seq` of its own (WIRE-PROTOCOL.md). That number counts the frames of the call, and the `subscribed` item has the number 1.
- `dropped` is in an item only after a loss. It is the number of events that the publisher dropped immediately before this event.
- `data` crosses the wire as JSON. The publisher keeps a reference to the data until it sends the event. Do not change an object after you publish it.
- An item of another `type` comes from a newer publisher. A subscriber ignores it.

The metadata of the procedure:

- `effects: { reads: ["events"], writes: [] }`. A subscription reads the resource `events`, and it changes nothing.
- `stream: { unbounded: true }`. The stream has no end. HTTP without NDJSON refuses the call with `NOT_ACCEPTABLE` (roadmap R15).

## The frames

Over WebSocket, a subscription is a call. The subscriber sends the request with its credit:

```json
{"id":"events-1.1~7","type":"request","method":{"service":"events","operation":"subscribe"},"payload":{"topics":["orders.created"]},"metadata":{},"credit":64}
```

The publisher answers with stream items. The first item confirms the subscription:

```json
{"id":"events-1.1~7","type":"stream","seq":1,"payload":{"type":"subscribed","topics":["orders.created"]},"stream":{"done":false}}
{"id":"events-1.1~7","type":"stream","seq":2,"payload":{"type":"event","topic":"orders.created","data":{"order":1},"seq":1},"stream":{"done":false}}
{"id":"events-1.1~7","type":"stream","seq":3,"payload":{"type":"event","topic":"orders.created","data":{"order":5},"seq":5,"dropped":3},"stream":{"done":false}}
```

The `seq` of a frame and the `seq` of an event are different numbers:

- The `seq` of the frame counts the frames of the call. The subscriber drops a duplicate frame or a late frame by this number.
- The `seq` of the event counts the events of the subscription. In the example, the publisher dropped the events 2, 3 and 4 from its queue. Thus the event `seq` has a gap, and the frame `seq` has none.

The subscriber gives credit as it reads, and it cancels to unsubscribe:

```json
{"id":"events-1.1~7","type":"credit","credit":32}
{"id":"events-1.1~7","type":"cancel"}
```

A refusal is an `error` frame, before any item:

```json
{"id":"events-2.1~8","type":"error","status":{"type":"error","code":"TOPIC_NOT_FOUND","message":"The host has no topic \"orders.missing\"","retryable":false},"error":{"code":"TOPIC_NOT_FOUND","message":"The host has no topic \"orders.missing\"","retryable":false},"metadata":{}}
```

Over HTTP, the subscriber posts the input to `{base}/events/subscribe` with `Accept: application/x-ndjson`. Each item is a line `{"type":"item","payload":...}`. A refusal is the HTTP status of its code, for example 404 for `TOPIC_NOT_FOUND`.

## The unsubscribe

- Over WebSocket and a message port, the subscriber sends `cancel` with the id of the request. The publisher removes its listeners at once. No frame answers the cancel.
- A `stream` frame that left before the cancel can still arrive. The subscriber ignores the frames of a call that it stopped.
- Over HTTP, the subscriber aborts the request. The server sees the closed request and removes the listeners.
- A closed connection ends each subscription of that connection. The publisher removes their listeners.
- `clear()` and `clearAll()` of the bus end each subscription with a listener on a cleared topic. Refer to "The end at `clear()`".
- Two subscribers of one topic on one transport share one call. Only the last unsubscribe sends the `cancel`. Refer to "The shared subscriptions".

## The end at `clear()`

`clear(topic)` and `clearAll()` of the bus of the publisher remove the listeners of the subscriptions. Before, such a subscription got no more events, and the subscriber saw no end. The subscription ends with notice:

- The publisher ends each subscription with a listener on a cleared topic. A subscription of two topics ends too, and the publisher removes the listener of the other topic.
- The stream of the call ends with the error `TOPIC_CLEARED`. The error is not retryable, so the subscriber does not resubscribe. The host removed the topic on purpose.
- The subscriber first gets the events in the queue of the subscription, and then the error.
- The error is the signal of each other end with an error. `subscribeRemote()` gives it to `onError`, `ready` rejects with it before the confirmation, and the iterator of `remoteEvents()` throws it.
- The bus gives this notice through the option `onClear` of `on()`. The function `onClear` starts one time when `clear()` or `clearAll()` removes the handler. An unsubscribe does not start it.

## The shared subscriptions

Before, each subscriber made its own call, also for the same topic in one process. The subscribers of the same topics on one transport share one call. The share has a count of its subscribers.

- Two subscribers share a call when they have the same transport, the same set of topics and the same options of the call. These options are `metadata`, `resubscribe`, `maxAttempts`, `backoff` and `clock`.
- The order of the topics and a repeated topic do not change the set.
- The first subscriber sends the call. The id of each request of the call starts with the id of that subscriber.
- Each other subscriber joins the call. The wire gets no second `request`.
- An unsubscribe removes one subscriber. The last unsubscribe sends the `cancel`, and the publisher removes its listeners.
- After the end of a call, a new subscriber makes a new call.
- Each subscriber keeps its own id. Its events have its id in `subscription`, and `onEvent` of `WebSocketTransport` gets each event of each subscriber.
- `WebSocketServerTransport` shares the subscriptions of one connection.
- The hooks of the first subscriber apply to the call. A transport gives equal hooks to each of its subscribers.

### A late subscriber

A subscriber that joins a call after its confirmation gets the same events as a new subscription:

- It gets no replay. It gets only the events that the call gets after the join.
- Its `ready` resolves at once, and its `onSubscribed` gets the topics of the confirmation.
- Its `seq` starts at 1 with its first event. Each subscriber thus counts its own events, and a gap shows a loss as before.
- The first event after the join can have `dropped`: the publisher dropped these events immediately before it. The subscriber cannot know if they came before the join.
- A subscriber that joins during a resubscribe waits for the new confirmation.
- At a resubscribe, each subscriber gets the new confirmation, and its `seq` starts again at 1.

### A queue for each subscriber

- The call reads the next item of the wire only when a subscriber waits for an event. Thus a slow subscriber alone holds the credit, as before the share.
- When one subscriber waits, the call reads the next item. Each other subscriber gets the event in its own queue. A slow subscriber thus does not slow a fast one.
- The queue of a subscriber holds at most 1024 events. When it is full, the oldest event goes. The next event of that subscriber has the lost events in `dropped`, as at the publisher.

### The end of a call goes to each subscriber

- An error that ends the call goes to each subscriber. `onError` gets it, `ready` rejects with it before the confirmation, and an iterator throws it.
- Each subscriber first gets the events of its own queue, and then the end.
- An end without an error, for example the `close()` of the transport, ends each iterator. `ready` rejects with `ABORTED` before the confirmation.

## The delivery

### At most once

- The publisher sends each event of a subscription one time or not at all. It does not send an event again, and the subscriber does not acknowledge an event.
- The publisher loses an event in three cases: the subscriber is slow (refer to "A slow subscriber"), the connection drops, or the event comes before the `subscribed` item.
- A duplicate `stream` frame gives no second event: the subscriber drops it by the `seq` of the frame. A gap of the frames does not end the subscription. The subscriber continues, as for a gap of the events.
- A subscription that starts again after a reconnect is a new subscription. It gets only the events after its own `subscribed` item.

### The order

- The events of one subscription arrive in the order of `emit()` on the bus of the publisher. This order includes the events of each topic of the subscription.
- Two subscriptions of one topic on one bus get the events in the same order.
- There is no order between two buses, or between two connections.
- `seq` increases by one for each event that the subscription accepts. A dropped event uses its number too.

### Credit as backpressure

- The request of the subscription gives the publisher credit, as each stream does. The default is 64 items (`streamWindow`).
- The publisher sends an item only when it has credit. The subscriber gives more credit as its handler takes the items.
- The bus of the publisher does not wait for a subscriber. `emit()` only puts the event into the queue of each subscription.
- `subscribeRemote()` waits for a promise that the handler gives. A slow handler thus holds the credit of its own call. It does not slow another call.
- In a shared call, a slow handler holds the credit only when no other subscriber of the call waits. Refer to "A queue for each subscriber".

### A slow subscriber

- The queue of a subscription holds at most `buffer` events. The default is 1024.
- When the queue is full, the publisher drops the oldest event of the queue. The next event that the subscriber gets has `dropped` with the number of events that it lost.
- The memory of a subscription thus stays below `buffer` events plus the credit window. The publisher does not block, and a slow subscriber does not slow the others.

## The resubscribe after a reconnect

- The WebSocket client keeps each subscription until its unsubscribe or `close()`.
- When the connection drops, the call of the subscription fails. After the reconnect and the `hello`, the client sends the call of the subscription again.
- The new call makes a new subscription on the publisher: new listeners, `seq` from 1 and a new `subscribed` item. The `onSubscribed` handler gets each `subscribed` item.
- The events between the drop and the new `subscribed` item are lost. This is the rule of "at most once".
- The client also resubscribes after these errors of the publisher: `UNAVAILABLE`, `TIMEOUT`, `CONNECTION_CLOSED`, `ABORTED` and each retryable error. It waits for a backoff before it tries again.
- Each other error ends the subscription. The client tells the `onError` handler, and the `ready` promise rejects when the first `subscribed` item did not come.
- A server that subscribes to the bus of a client does not resubscribe. A reconnect is a new connection with a new id. The server subscribes again in its `onConnect` handler.
- Over HTTP, `subscribeRemote()` sends the call again after a failed request, with a backoff.

### The limit of the tries

Before, the subscriber over HTTP resubscribed forever. The option `maxAttempts` sets the limit of the resubscribe tries:

- `maxAttempts` is the number of resubscribe tries, one after the other, without a confirmation. Each confirmation starts the count again.
- When the tries run out, the subscription ends with a `SubscriptionError`. The error has the code of the last failure, and its message tells the number of tries.
- The default is 10 tries. With the default backoff, the waits are at most approximately two minutes.
- 0 is the same as `resubscribe: false`: the first failure ends the subscription.
- The WebSocket transport uses `reconnect.maxAttempts` of its options. The default of that option is `Infinity`, so a subscription over WebSocket keeps its behavior.

### The backoff

The option `backoff` is an object of durations, as each other time of the client since 0.3.0. It has the names of the `reconnect` options of `WebSocketTransport`:

| Field | Type | Default |
|---|---|---|
| `initialDelay` | `Duration` | `ms(250)` |
| `maxDelay` | `Duration` | `seconds(30)` |
| `backoffMultiplier` | number | 2 |
| `jitter` | number from 0 to 1 | 1 (full jitter) |

- The delay before try `n` is `initialDelay × backoffMultiplier^(n − 1)`, at most `maxDelay`. With `jitter`, the delay is a random time below it.
- A plain number throws a `TypeError`, as for each other duration option. A function throws a `TypeError` too: before, `backoff` was a function of milliseconds.
- The WebSocket transport uses its reconnect backoff when the options give none.
- The option `clock` is the clock of the backoff. A test gives the `fakeClock` of `@mark1russell7/service/testing`. The WebSocket transport uses its own clock.

To migrate from a function of milliseconds:

```ts
// Before
subscribeRemote(transport, "orders.created", handler, { backoff: (attempt) => Math.min(30_000, 500 * 2 ** (attempt - 1)) });
// Now
subscribeRemote(transport, "orders.created", handler, {
  backoff: { initialDelay: ms(500), maxDelay: seconds(30), jitter: 0 },
  maxAttempts: Infinity, // the old behavior: no limit
});
```

## The authorization

A peer can subscribe to a topic only when each of these rules lets it:

1. **The topic rule of the host (`events.topics`).** This rule is the expose rule of the topics. It is a list of patterns or a function. A pattern is an exact name (`orders.created`), a prefix that ends with `*` (`orders.*`) or `*`. A topic outside the rule is unknown: `TOPIC_NOT_FOUND`.
2. **The capability of the call.** `events.subscribe` declares that it reads the resource `events`. A capability that does not permit the read of `events` refuses each subscription: `FORBIDDEN` with the reason `effects-exceeded`. A read-only host (`readOnly`) permits subscriptions, because they change nothing.
3. **The function `events.allow`.** This function gets each topic, the capability of the call and its metadata. It can compare the clearance of the topic with the clearance of the capability. A topic that it refuses gives `FORBIDDEN` with the reason `topic-not-allowed`.
4. **The output filter of the host (`admitItem`).** This filter examines each item of the stream, as for each other stream. It can drop an event that the clearance of the caller does not permit.

The publisher examines all topics before it adds a listener. A call with one bad topic thus makes no subscription.

Other facts:

- The procedure is not in a registry. Thus it is not a tool of the MCP server, and `procedure.list` does not show it. The impl-mcp-dev snapshots do not change.
- The expose rule of the procedures does not apply to it, as for `host.health`. The topic rule is its expose rule. The server pins it with `{ alwaysOn: true }`. The expose rule applies to each other pin (CLI-47).
- A nested call cannot reach it. The context client finds only the procedures of the registry.

### The re-check of an open subscription

A right can change after the start of a subscription, for example when the app removes a user from a group. The publisher can examine an open subscription again (roadmap CLI-44):

```ts
const server = new ProcedureServer({
  registry,
  events: {
    bus,
    topics: ["collections.*"],
    allow: (topic, call) => rights.canRead(call.principal, topic),
    recheck: { maxAge: minutes(1), rightsChanges: (listener) => rights.onChange(listener) },
  },
});
server.publisher?.rightsChanged("ann"); // the subscriptions of the principal "ann"
```

- The check is the same function as at the start: the topic rule, the reads of the capability, `events.allow` and the partition of each topic. The capability and the principal stay the values of the call.
- `rightsChanged(change)` of `EventPublisher` starts a check of each open subscription that the change touches. The change is the id of a principal, or a test of the principal. Without it, each open subscription gets a check.
- The source `recheck.rightsChanges` gets one listener of the publisher while the publisher has an open subscription. Each call of the listener is a call of `rightsChanged()`.
- `recheck.maxAge` starts a check when this time passed after the last check. The time is on the clock of the publisher. A `ProcedureServer` gives its own clock to the publisher that it makes. The option has no default.
- While a check runs, the events of the subscription wait in its queue. The option `buffer` (default 1024) limits the queue, so a slow check holds at most that number of events. When the queue is full, the oldest event goes, and the next event tells the loss (`dropped`).
- When the check passes, the subscription continues with the events that waited.
- When the check refuses, the subscription ends with the error of the check, for example `FORBIDDEN` with the reason `topic-not-allowed`. The events that waited do not reach the subscriber.
- When the resolver refuses the partition at the check, the subscription ends with `FORBIDDEN` and the reason `partition-not-allowed`. When the resolver gives another partition, the subscription ends in the same way. The subscriber then subscribes to the new partition.
- The output filter of the host (`admitItem`) examines the rows of each event already, so a row whose right changed stays out at once.
- Without a call of `rightsChanged()` and without the option `recheck`, a subscription keeps the checks of its start.

## The errors

| Case | Code | HTTP | Reason |
|---|---|---|---|
| A topic outside the topic rule | `TOPIC_NOT_FOUND` | 404 | |
| A topic that `events.allow` refuses | `FORBIDDEN` | 403 | `topic-not-allowed` |
| A capability that does not permit the read of `events` | `FORBIDDEN` | 403 | `effects-exceeded` |
| A host without the option `events`, or an older host | `NOT_FOUND` | 404 | |
| An empty list of topics, or a topic that is not a string | `VALIDATION_ERROR` | 400 | |
| The publisher stops (`ProcedureServer.stop()`) | `UNAVAILABLE` | 503 | |
| The time limit of the host passed | `TIMEOUT` | 504 | |
| `clear()` or `clearAll()` of the bus removed a listener of the subscription | `TOPIC_CLEARED` | 410 | |

- `TOPIC_NOT_FOUND` is a new code of the protocol. Its message names the first unknown topic.
- `TOPIC_CLEARED` is a new code of the protocol too. Its message names the cleared topic. The error comes in the stream, after the confirmation, so the HTTP status of the response stays 200.
- An unknown topic comes before a refused topic. The publisher examines each topic for the topic rule first.
- A re-check that refuses an open subscription (CLI-44) gives its error in the stream, after the confirmation. The HTTP status of the response thus stays 200.

## The stop of a publisher

- `ProcedureServer.stop()` ends each subscription at its start, with `UNAVAILABLE`. A graceful stop thus does not wait for the subscriptions, which have no end.
- A time limit of the host (the `timeout` of `hostPolicy`) applies to a subscription as to each stream. It ends the subscription with `TIMEOUT`, and the subscriber resubscribes.

## The protocol version

The change is additive in v1. `PROTOCOL_VERSION` stays 1.

- No frame type is new. A subscription uses the frames of a call.
- The new parts are the path `events.subscribe`, the item types `subscribed` and `event`, the codes `TOPIC_NOT_FOUND` and `TOPIC_CLEARED`, and the reason `topic-not-allowed`.
- An older subscriber does not know `TOPIC_CLEARED`. The code is not retryable, so it ends the subscription with `onError`.
- The shared subscriptions and the limit of the tries change only the subscriber. The wire of one subscriber stays the same.
- An older peer does not know `events.subscribe`. It answers `NOT_FOUND`, and the subscriber reports this error.
- The frame type `event` stays reserved. No side of v1 sends it. Since 0.9.0 the WebSocket client ignores such a frame, as a frame of an unknown type. Before, it gave the frame to `onEvent`, for a server outside this repository.

## The API

### The subscriber

```ts
import { WebSocketTransport } from "@procedures/client";

const transport = new WebSocketTransport({ url });

// A handler: the function gives the unsubscribe
const unsubscribe = transport.subscribe("orders.created", (order, event) => console.log(event.seq, order), {
  onSubscribed: (topics) => console.log("subscribed", topics),
  onError: (error) => console.error(error.code),
});
await unsubscribe.ready;
unsubscribe();

// An async iterator: the reader stops it, or the signal does
for await (const event of transport.events(["orders.created", "orders.paid"], { signal })) {
  console.log(event.topic, event.data);
}
```

- `subscribeRemote(transport, topics, handler, options)` and `remoteEvents(transport, topics, options)` do the same over each transport: HTTP, a message port, the local transport, or `transportFor()` of a WebSocket server.
- The options are `signal`, `onSubscribed`, `metadata`, `resubscribe`, `maxAttempts`, `backoff` and `clock`. `subscribeRemote()` also takes `onError`.
- A bad `backoff` or `maxAttempts` throws a `TypeError` at the call, before any request.
- The `onEvent` option of `WebSocketTransport` is a wrapper. It gets each event of each subscription of the transport, with the id of its subscription.
- `client.subscribe(topics, handler, options)` and `client.events(topics, options)` of a `Client` do the same through the middleware and the context of the client. Thus a token of the auth middleware goes with the call. The subscriptions of one client share their calls.
- A subscription of a `Client` has no deadline. The timeout middleware, the `timeout` of the context and `procedure-timeout` of the client do not apply to it. For a deadline, give `metadata: { timeout: { overall } }` in the options.

### The change events of the collections

Each write of the core collection procedures publishes a change event on the bus of the procedure (server stack CLI-15). The topic is `collections.<name>`.

| Field | Meaning |
|---|---|
| `since` | The version of the storage before the changes. Without it, the event is only a hint. |
| `version` | The version of the storage after the changes. |
| `changed` | The ids of the items that changed. |
| `deleted` | The ids that were deleted. |
| `values` | Only with the option `values`: the changed items, as `{ id, value }`, that the subscriber can read. |
| `withheld` | Only with the option `values`: the changed ids whose values the output filter refused. |
| `origin` | The origin of the writes, when one origin made all the changes. |

- The changes come from the change log of the storage (`getChangesSince`). The events of one storage make a chain: the `since` of an event is the `version` of the event before it.
- A call of `changes` starts the chain. While no one listens to the topic, the procedures publish nothing and do not read the log.
- A storage without a change log gives a hint without `since`. The subscriber then reads the changes.
- The delivery is at most once. `EventsChangeFeed` of `@procedures/store` thus tells each loss to its `HybridStorage`, and the storage pulls.
- The option `changeEvents` of `createCollectionProcedures()` turns the events off, or gives the topic of each call. The partition of a collection goes in the topic.

#### The values reach a subscriber only through the checks of a read

A value of a collection reaches a caller only through a read with its checks. Thus the events obey these rules:

- By default, an event has the ids and the versions, and no value. The subscriber reads the values with `changes`, so the capability and the output filter of the host apply.
- A subscriber of a topic `collections.<name>` must have a capability that reads `collection:<name>`, as for a read. A topic of a partition, `collections.<name>.<partition>`, has the same rule.
- Without that read, the subscription gets `FORBIDDEN` with the reason `effects-exceeded`. The option `reads` of `EventPublisher` gives the rule of other topics.
- With the option `values: true`, an event also has the values. Each row `{ id, value }` passes the output filter of the host (`admitItem`) for each subscriber.
- A row that the filter refuses stays out of the event of that subscriber, and its id goes in `withheld`. The subscriber then reads that id with `changes`.
- The rule of the rows of the collection (`admission.admit`) applies to each row too, with the invocation of the subscription.
- A procedure that sends the data of other writers later, for example a subscription, gets the output filter of its host as `ctx.admit`.

#### The partitions of a collection

One `collections.<name>.*` surface can serve several partitions, for example one for each tenant (roadmap CLI-17). The host registers the partitions with its server:

```ts
server.usePartitions("notes", {
  storageOf: (partition) => storageOfPartition(partition),
  // The tenant comes from the principal, and the call can ask for a scope under it
  resolve: (ctx, requested) => {
    const tenant = ctx.principal?.claims?.["tenant"];
    if (typeof tenant !== "string") return null; // FORBIDDEN, partition-not-allowed
    return requested === undefined ? tenant : `${tenant}/${requested}`;
  },
});
```

- The input of each collection procedure can ask for a partition (`partition`). The resolver gives the partition of the call, and `null` refuses the call.
- The tenant comes from `ctx.principal`. The input alone does not give it.
- A collection without partitions refuses a call that asks for a partition.
- The repository gives the storage of a partition with `getPartitionStorage`. A repository without it refuses a call with a partition. It does not give the storage of all partitions.
- Give the same storage for the same partition each time, so that the chain of its events stays.
- The events of a partition go to the topic `collections.<name>.<partition>` of the bus, and the option `topic` gets the partition.

A subscriber names a partition as an input does:

- `collections.<name>` asks for no partition, and `collections.<name>.<requested>` asks for one. The publisher resolves the partition with the same resolver, and listens to the topic of the resolved partition.
- A subscriber thus cannot name the topic of another tenant. The events keep the topic that the subscriber named.
- A topic with a partition of a collection without partitions is refused (`FORBIDDEN`, reason `partition-not-allowed`). A call without a repository is refused in the same way.

#### The rules of the rows of a collection

A right can depend on the document, for example a `when` condition of an access list (roadmap CLI-41). The option `admission` of `createCollectionProcedures()` gives two rules:

```ts
const procedures = createCollectionProcedures("notes", {
  admission: {
    // Each row { id, value } of a read: true admits it. The shape of admitItem.
    admit: (row, invocation) => canRead(invocation.principal, row.value),
    // Each set, patch and delete: { op, id, doc, prev }. True permits it.
    guard: (write, invocation) => canWrite(invocation.principal, write),
  },
});
```

- The procedures apply the rules in one place: the view of the storage of each call (`admittedStorage()`).
- A refused row is absent from each read: `get`, `has`, `getAll`, `entries`, `ids`, `size`, `getBatch`, `find` and `changes`.
- `find` counts its skip and its limit in the admitted rows. A storage with `query()` gives the rows page by page.
- A delta of `changes` puts the id of a refused row in `deleted`. A copy of the caller thus drops the row.
- A patch whose new item the rule refuses gives `{ found: true }` without the value.
- An error of the rule fails the read. It does not hide the rows.
- The guard examines each write before the storage changes. A refused write gets `FORBIDDEN` with the reason `write-not-allowed`.
- `setBatch` gives one `set` to the guard for each item. `deleteBatch` and `clear` give one `delete` for each id. One refused write refuses the call.
- A call without an invocation gets no row and makes no write.
- `accessAdmitItem` and `accessWriteGuard` of `@procedures/access` give the two rules from access lists.

### The publisher

```ts
import { ProcedureServer, createEventBus } from "@procedures/client";

const bus = createEventBus();
const server = new ProcedureServer({
  registry,
  autoRegister: true,
  events: { bus, topics: ["orders.*"], allow: (topic, call) => call.capability.clearance !== "public" },
});
server.publish("orders.created", { order: 1 }); // the same as bus.emit()
```

- The procedures of the server get the bus of `events` as `ctx.bus`. A procedure thus publishes with `ctx.bus.emit()`.
- `EventPublisher` is the part that serves `events.subscribe`. A `LocalTransport` takes it with its option `events`.

### The two directions

- The client serves its own bus with a `ProcedureServer` with `events`, given as the `serve` option of `WebSocketTransport`.
- The server subscribes with `wsServer.subscribe(connectionId, topics, handler)` or `wsServer.events(connectionId, topics)`.

### The hosts

`hostPolicy()` takes the option `events`, and `procedureServerOptions()` gives it to the `ProcedureServer` of the host. The hosts of the repository use it as follows:

| Host | Option | Default |
|---|---|---|
| `procedure-server` and `mark serve` | `--events <patterns>`, repeatable or comma-separated | No topic |
| `mark --server` | `--events <patterns>`, repeatable or comma-separated | No topic |
| The MCP server (`mark mcp`) | None | No `events.subscribe` |

- The patterns are the topic rule of `topicMatcher()`: an exact name, a prefix that ends with `*`, or `*`.
- `procedure-server`, `mark serve` and `mark --server` always pin `events.subscribe`. Without `--events`, the topic rule is empty, so each subscription gets `TOPIC_NOT_FOUND`.
- The bus of these hosts is the global bus. It is also the `ctx.bus` of their procedures, so a procedure of the host publishes with `ctx.bus.emit()`.
- These hosts have no capability limits. A read-only host (`readOnly` of `hostPolicy()`) permits a subscription too, because `events.subscribe` writes nothing.
- The MCP server serves no events. Its transport carries only MCP, and `events.subscribe` is not a tool.

## The tests

- `src/events/remote.test.ts`: subscribe, publish, receive and unsubscribe on the local transport, HTTP and WebSocket. The unknown and the refused topic on each face. The shared call, a late subscriber and the end at `clear()` on each face.
- `src/events/remote.test.ts` also tests the share: one call and one cancel, the keys, an error for each subscriber, and a slow subscriber. The limit of the tries and the backoff of durations use a fake clock.
- `src/events/recheck.test.ts` (roadmap CLI-44): a revoked right ends a subscription at the signal, or after the max age on a fake clock without a signal. A right that stays valid keeps the subscription. A partition that changes ends it.
- `src/events/bus.test.ts`: the option `onClear` of `on()`, with `clear()` and `clearAll()`.
- `src/adapters/websocket/events.test.ts`: two subscribers and their order, a slow subscriber with credit, and the resubscribe after a drop. It also tests the two directions, the stop of the publisher, and the listeners after `close()`.
- `src/leaks.test.ts` (roadmap R30): the maps of the two sides and the listeners of the bus are empty after many subscriptions.
- `src/protocol.golden.test.ts` (roadmap R25): the frames of a subscription, of its errors and of its cancel. Two subscribers of one topic send the frames of one subscriber, and the end at `clear()` is an `error` frame with `TOPIC_CLEARED`.
- `src/events/properties.test.ts`: a property test with fast-check. For each subscription, the events arrive in the order of `emit()`, at most once, and `seq` and `dropped` count each loss.
- `src/soak.test.ts` (roadmap R32): the clients of the soak test also subscribe and unsubscribe.
