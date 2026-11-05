# Live state on a topic (CLI-101)

This is a design with its first code. No figure below is a measure.

## The problem

Some state changes many times a second, and each reader needs only its latest value: who is here, and where a cursor is. A collection is the wrong home for it. Each write takes a number from the store, and no reader needs that numbered log. A reconnect needs the latest values and nothing older.

The events of `packages/client/src/events` carry such a value, but they keep nothing. So a new subscriber sees nobody until the next set.

## The contract

- `set(topic, key, value)` keeps the latest value for a key and publishes it to the subscribers of the topic. It makes no store write and no numbered change.
- `snapshot(topic)` gives the live values of the topic.
- A key expires after a stated time with no set. A key also ends when the connection of its owner closes. Each end publishes a `gone` event.
- The owner of a key is the connection of its last set.
- A call of `live.leave` ends a key while its connection stays open: a reader that left a view, for example. Readers get `gone` with the reason `left`. The end goes at once on an idle topic, and it joins an open window.
- The option `admitLeave` states who can end a key. Without this option, only the connection of the last set can end the key.

## The parts

| Part | Where | What it does |
|---|---|---|
| `LiveState` | `packages/client/src/events/live-state.ts` | The values, the deadlines, the owners and the window. It uses the bus and the `Clock` of its publisher. It imports no Node built-in, so it stays in the root entry. A host gets it with the option `live` of `EventPublisher`. |
| `live.set`, `live.snapshot` | The same file | The procedures. A host turns them on, and they are not in the MCP bundle. A set crosses the WebSocket of the caller as one call frame. |
| `liveTopic(name, partition)` | The same file | The topic. Each segment has the encoding of CLI-75. |
| `liveView(client, topic)` | `packages/client/src/events/live-view.ts` | It subscribes first, then reads the snapshot, then applies the events that came during the read. |

## The rights

A subscription to a live topic goes through the checks of `EventPublisher`: the topic rule, `reads`, `allow`, and the re-check of CLI-44. These checks already take any topic.

A live topic has a partition rule too, the option `partition` of the state. `EventPublisher.route` asks the state for each topic that is not a topic of a collection, so a subscription ends when its partition changes. `live.set` and `live.snapshot` pass the same checks through `EventPublisher.admitTopic`. The collection topics do not move.

A set goes through `admitSet(call)`, and a host must give this option. So each host states who can write. The hook gets the topic, the key, the value and the principal. It gives null for a refusal, or an admission. The admission can name who set the value, and the name reaches each reader. A value from the caller cannot replace it. The admission can also give the value to keep, so the server stamps owner fields on it.

## The window, and why it is per topic

The request asks for a window that joins sets per key. At 8 sets a second, a key has a set each 125 ms. So a window of 120 ms per key joins almost nothing.

The cost is in the fan-out. With `n` people on a topic, each at 8 sets a second, one subscriber gets `8n` events a second, and the topic sends `8n²`. So one event of the bus carries each key that changed in the window, and the latest value of a key wins. At a window of 120 ms, a subscriber gets at most approximately 8.3 events a second and each `n` adds only bytes.

The first change on an idle topic goes at once and opens the window. A later change in the window waits. The joined event goes at the end of the window and opens the next window. If nothing waits at the end, the topic is idle. So one writer has no added delay, and on a busy topic a change waits at most one window. The option `window` is a time, or a function that gives the time of a topic.

A `gone` event removes a set of the same key that waits in the window, so a reader does not see the key come back.

The event has this form: `{ set: [{ key, value, by, at }], gone: [{ key, reason }] }`.

## The order of a snapshot and a subscription

`liveView()` subscribes first and reads the snapshot second. It applies the snapshot, then the events that came during the read, in their order.

No number is necessary. Each set publishes an event, so a value in the snapshot has an event at or after that read. The last event of a key decides. A key can show an older value for one window. A `dropped` count on an event means that the queue of the subscriber lost events, so `liveView()` reads the snapshot again. Each new confirmation of a subscription starts a new read too.

## More than one host

The state fills from the bus and not from the local call. A shared bus thus shares the state with no further code.

A snapshot holds what this host saw since its first set or snapshot of that topic. After a restart it is partial until each client sends its next set. A client that repeats its value each 5 s heals a snapshot within 5 s. This limit is stated and not hidden, because a store read at each snapshot gives back the cost that this design removes.

Each host runs the deadlines on its own clock. The `gone` of a closed connection comes from the host of that connection. With a shared bus, a second host removes the key at that event. When the first host dies, the second host removes the key at its deadline. So a key lives for at most one stated time after its owner is gone.

## The limits

| Limit | Default | At the limit |
|---|---|---|
| The time with no set | None. The host states it, because only the app knows how often its clients repeat. | The key ends. |
| Keys on a topic | 1,024, until the bench reads its cost | A set of a new key is refused, and the existing values stay. |
| Bytes of a value, as JSON | 16,384, until the bench reads its cost | The set is refused. |
| Topics of a state | 4,096, until the bench reads its cost | A topic with no key and no open window goes. If none exists, a set on a new topic is refused. |
| A set over HTTP | Each set is one request, and it has no owner connection | Only its time ends it. |

A limit comes from a measure, with its run ids and its formula, as for each limit of this repository.

## What is not in this design

- No store write of any kind, at any time. A value that must outlive the host belongs in a collection.
- No history. A reader gets the latest value and the changes after it.
- No ordering across keys.

## Open questions

1. `wsFace()` of `packages/client-server` calls `connectionClosed(id)` from `WebSocketServerTransport.onDisconnect`, and `metadata.connectionId` of a set names the owner. A host that uses `upgradeHandler()` itself calls it from `upgrade.transport.onDisconnect`.
2. A cost to measure: each set goes through the whole invocation path. The bench reads a set at 8 a second per connection, with its prediction first.

## SemVer

PATCH while the group is before 1.0.0: new exports and new procedures that a host turns on. No existing result changes. The new step in the routes of the publisher runs only with the option `live`. It runs only for a topic that is not a topic of a collection.
