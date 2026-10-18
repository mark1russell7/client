# @procedures/client

## 0.9.2

No changes in this release.

## 0.9.1

### Patch Changes

- 61d60c6: Procedure paths of each length on each face (server stack CLI-28). A path has one segment or more. Each change is additive: each path of two segments or more keeps its method, its URL and its tool name.
  
  - `pathToMethod()` takes a path of one segment, for example `["morning"]`: its method has the empty service, `{ service: "", operation: "morning" }`. An empty path still throws. New `methodName(method)` gives the name with dots (`morning`, `docker.compose.up`).
  - HTTP: the URL of a path of one segment is `{base}/{operation}`, for example `/api/morning`. `procedureHandler`, `HttpServerTransport` and `rpcServerUrlStrategy` (`/rpc/morning`) read it, and `bodyPathAddressing()` takes a path of one segment too. A URL with one segment under the base path names a procedure now: an unknown one gets `NOT_FOUND`, not `INVALID_REQUEST`.
  - The version of the URL keeps its old form `{base}/{version}/{service}/{operation}`. Only the version makes three URL segments, so the forms do not collide. A path of one segment has no version in the URL, because `{base}/{version}/{operation}` reads as a service and an operation. The server ignores the version (wire protocol v1).
  - `defaultUrlPattern` URI-encodes each URL segment and decodes it again. Thus a segment with `/`, `?` or a space round-trips, and a segment never makes a URL separator. A segment of letters, digits, `-`, `.`, `_` and `~` keeps its URL.
  - `methodToPath()` keeps each empty segment but the empty service. Thus a method with `..` or a stray dot names no procedure and gets `NOT_FOUND`. Before, the empty segments fell away, so `/api/notes/..` could reach the procedure `notes`.
  - WebSocket, the message port and `LocalTransport` call a path of one segment. A handler of `LocalTransport` with the key `morning` answers it.
  - MCP: a path of one segment has a tool name, for example `morning`. When two procedures have one tool name after the join of the segments (`["a_b", "c"]` and `["a", "b_c"]` with `path.join("_")`), the face leaves out the two tools and writes the reason to stderr. Before, the face kept the last one, so a call could reach the wrong procedure. `host.tools()` gives the same list.
  - `WIRE-PROTOCOL.md` states the rule.
- 79f750a: A narrowing key on the wire, and an addressing hook for HTTP (server stack CLI-30 and CLI-31). Each change is additive: without the new key or the new option, the behavior stays the same.
  
  - A call can ask for a narrower capability than its principal holds, with the narrowing key `procedure-narrowing`. Its value is a `CapabilityRequest` as JSON (`clearance`, `effects` and `timeoutMs`), or a list of them.
  - Each face carries the key. HTTP has each line of the header `Procedure-Narrowing` (raw or URI-encoded JSON), the key in `X-Metadata` and a query parameter. WebSocket has the key in the metadata of a `request` frame. MCP has the key in the `_meta` of `tools/call` and the header of Streamable HTTP. In the process, the key of the metadata of `ProcedureServer.handle()`, `LocalTransport`, `invokeProcedure()` and `Client.exec()` applies.
  - No source replaces another: a gateway's header and the client's key of `X-Metadata` both apply. `invokeProcedure()` is the one place that applies the sources, for the call of a host, with the narrowing of `principalOf` and the new option `narrow`. The clearance is the meet of the clearance order, the effects are the intersection, and the deadline is the earliest. Each source can only narrow, in each sequence.
  - A valid part that asks for more has no effect: the meet removes it. A part that is not valid refuses the call, so a typo of a gateway does not leave the call wider. A part that is not well formed (not JSON, an unknown field, a time that is not a number) gives `INVALID_REQUEST`. A clearance outside the order, or two different clearances without a clearance order, give `FORBIDDEN` (reason `clearance`).
  - New option `debug` of `ProcedureServer`: `true` writes each report with `console.debug`, and a function gets each `ServerDebugReport`. The server reports each part of the narrowing that has no effect, and each refusal.
  - New options of `invokeProcedure()` and `invokePath()`: `narrow` (one more source) and `onNarrowingNotes` (the notes of the narrowing). New option `metadata` of `Client.exec()` and `Client.execStream()`: a local procedure gets it as `ctx.metadata`, and a remote call sends it.
  - New exports: `NARROWING_METADATA_KEY`, `NARROWING_HEADER`, `narrowingOf()` (the decoder of the key), `addNarrowing()` (adds a source to the key) and `narrowWithin()` (a narrowing of many sources that does not throw and gives notes). New types: `NarrowingNote`, `WireNarrowing`, `NarrowedCapability` and `ServerDebugReport`.
  - The default CORS headers include `Procedure-Narrowing`.
  - `procedureHandler` and `HttpServerTransport` copy each key of the query as an own property, so a `__proto__` key changes no prototype.
  - `@procedures/client/node`: new option `addressing` of `procedureHandler`. The hook gets the request and its body, and it gives `{ method, payload }`. `urlAddressing()` is the default, the URL format of `HttpTransport`. `bodyPathAddressing()` reads the path and the input from the body of a single endpoint, for example `POST /api/proc` with `{"path": ["notes", "list"], "input": {}}`. With it, the handler also takes the base path itself.
  - `HttpServerTransport` takes the same option `addressing`. With `bodyPathAddressing()`, its route also takes the base path itself.
  - New types of `@procedures/client/node`: `Addressing`, `CallAddress`, `UrlAddressingOptions` and `BodyPathAddressingOptions`.
  - `WIRE-PROTOCOL.md` specifies the narrowing key and its sources, the addressing hook, `procedureHandler`, the credentials of a request and the reasons of `FORBIDDEN`, with the four reasons of the browser checks.
- d0c9856: The partitions of a collection (roadmap CLI-17), two follow-ups of the review. A collection without partitions can have a dot in its name, and its topic `collections.<name>` stays a plain topic. `usePartitions` refuses a name with a dot, because the topic names the partition after the first dot. The documentation of `PartitionResolver` gives its contract: a partition of the caller or `null`, and not the partition of another tenant. One rule, `collectionTopicTarget(topic, repository)`, gives the collection of a topic to the read check and to the listener of the publisher. So a reader of `a` does not hear the collection `a.b`.
- b5db4d8: Under the root of the files of a host, the `git.*` procedures are confined, not refused (roadmap R33, tracker item O35). Without a root, nothing changes. PATCH: a procedure that the root refused now works in the root.
  
  - The core: `ProcedureContext.fsRoot` is the root of a confined call. `confineToRoot()` of `@procedures/fs` gives it to the handler of each confined procedure and of each program procedure.
  - The working folder `cwd` of each `git.*` procedure must be in the root, and its default is the root. The pathspecs, the `path` of `git.blame` and of the worktree procedures, and the `dest` of `git.clone` must be in the root too.
  - Under a root, git runs with `GIT_CEILING_DIRECTORIES` at the parent of the root, so it finds no repository above the root. The configuration of the system does not apply. The global configuration has only `user.name`, `user.email` and `init.defaultBranch` of the host.
  - The `-c` options turn off the hooks (an empty `core.hooksPath`) and `core.fsmonitor`. Only the transports https, http, ssh and git are permitted. Git does not go into a submodule.
  - Before the first command in a folder, git examines the repository. A repository outside the root (through a `.git` file or an alternate object folder), a repository with submodules, and a configuration key that starts a program are refused: `filter.*`, `diff.external`, `core.sshCommand`, `credential.helper`, `include.path` and the others. The error names each key.
  - `git.clone` and `git.remote.set` refuse a URL with `::` under a root.
  - `@procedures/git` now depends on `@procedures/fs` (for the rules of `@procedures/fs/root`).

## 0.9.0

### Minor Changes

- dc03903: The WebSocket client ignores a raw frame of the type `event`, as a frame of an unknown type. Before, it gave such a frame to `onEvent`, for a server outside this repository. No side of wire protocol v1 sends that frame (the type is reserved). `onEvent` now gets only the events of the subscriptions of the transport (`events.subscribe`). MINOR: a breaking change of behavior (the API is before 1.0.0).
  
  Migration: a server that sends raw `event` frames sends its events through `events.subscribe` instead (EVENTS.md). The client then gets them in `onEvent`, with the id of the subscription.

### Patch Changes

- 8bb469c: The partitions of a collection (roadmap CLI-17). One `collections.<name>.*` surface serves several partitions, for example one for each tenant. `ProcedureServer.usePartitions(name, { storageOf, resolve })` registers the storage of each partition and the resolver. The resolver gives the partition of each call from its context, so the tenant comes from `ctx.principal`. The input can ask for a partition, and the resolver can refuse the call (`FORBIDDEN`, reason `partition-not-allowed`).
  
  `RepositoryProvider` has the new optional methods `getPartitionStorage`, `hasPartitions` and `resolvePartition`. A repository without them refuses a partition. The events of a partition go to `collections.<name>.<partition>`.
  
  A subscriber of `EventPublisher` names the partition that it asks for, and the publisher resolves it with the same resolver. So a subscriber cannot name the topic of another tenant. A change of behavior for safety: a topic `collections.<name>.<partition>` of a collection without partitions is refused. Before, each subscriber with the read of the collection got it. New exports: `PARTITION_PATTERN`, `collectionTopicPartition`, `CollectionPartitions`, `PartitionInput` and `PartitionResolver`.
- dca28c1: The packages accept `@mark1russell7/service` 0.5.1 and later 0.5 versions, and `@procedures/client` accepts `@mark1russell7/algebra` 0.7.1. Before, the range `^0.4.1` stopped below 0.5. An application on service 0.5 then got a second copy of service inside the client.
  
  - The client uses only the `/backoff`, `/heartbeat` and `/testing` entries of service. The code of `/backoff`, `/heartbeat` and the clock is the same in 0.4.1 and 0.5.1. `/testing` only gets new exports.
  - The public API of the client does not change.

## 0.8.1

### Patch Changes

- 2d3f235: The procedure faces of Node without a framework, a request hook for credentials, and the credentials mode of `fetch`. Each change is additive: the old behavior stays.
  
  - `@procedures/client/node`: new `procedureHandler(server, options)` gives a request handler of `node:http`, `(req, res) => boolean`. It takes each request under `basePath` (default `/api`) and gives `false` for each other request, so the routes of the application share the listener. It speaks the wire of `HttpServerTransport` with the error codes of wire v1, and has CORS, `secretHeaders`, `secretQuery`, a Connect middleware and the stop parts `start`, `stopIntake`, `drain`, `inFlight` and `close`.
  - `@procedures/client/node`: new `upgradeHandler(server, options)` gives an upgrade handler for the "no server" mode of `ws`. Two endpoints of different paths share one listener. The entry also exports `WebSocketServerTransport`, `defaultServerUrlStrategy` and `rpcServerUrlStrategy`.
  - `HttpServerTransport` is a thin Express shim over `procedureHandler`, and keeps its former codes. `WebSocketServerTransport` takes only the upgrades of its path: two transports on one server now both work, and the option `server` is optional.
  - New option `principalOf` of `ProcedureServer` and `hostPolicy`: a request hook that reads the cookies, the headers and the query of a network request. It gives a bearer token for the token check, a principal and a narrowing of the capability. The procedure reads the principal as `ctx.principal`. New `requestCredentials` and `cookiesOf`.
  - A `Cookie` or `Proxy-Authorization` header no longer goes into the root of the metadata of an HTTP request. The secret headers stay in the credentials only.
  - CSRF: ambient credentials (cookies) are trusted only from a named origin. With `principalOf`, a face accepts a browser request only from its own origin or a named origin. On `procedureHandler` and `upgradeHandler`, a request with a `Cookie` header gets the same check: `"*"` does not permit another origin for it. `principalOf` with the origin `"*"` and no named `allowedOrigins` is refused at construction. `HttpServerTransport` and `WebSocketServerTransport` keep their former checks for a server that reads no cookies. With an `authenticate` function, a request with a cookie needs a named origin. The new server option `ambientCredentials` (and `ProcedureServer.ambientCredentials`) tells the faces how the server reads cookies. New `hasAmbientCredentials(headers)`, and `checkBrowserRequest` takes an optional `ambient` flag. A server whose `authenticate` reads no cookie keeps the former check with `ambientCredentials: false`.
  - `HttpTransport`: new options `credentials` (for example `"include"` for a cookie session on another origin), `requestInit` and `fetch`.
- 1aa9ef7: The collection storages get a JSON query language with a query policy, change batches and patches in one step, and the sync of `@procedures/store` runs on the service clock and backoff (server stack CLI-20, CLI-14, CLI-13, CLI-34).
  
  - The query language is in the core, in the new entry `@procedures/client/query`, which imports nothing else. It is the one copy (CLI-34). `@procedures/collections` now depends on `@procedures/client` for it, and exports the same names again.
  - The selector is JSON: a subset of the query selectors of MongoDB. `queryEntries()` is the reference, and `selectorProblems()`, `queryOptionsProblems()`, `compileSelector()`, `matchesSelector()` and `compareStorageValues()` are exported.
  - A query policy (`StorageQueryPolicy`) limits the operators, the length and the flags of a `$regex`, the clauses and the depth of a selector, the lists of `$in`, `$nin` and `$all`, and the limit. The default policy does not permit `$regex`. A pattern that repeats a repetition, for example `(a+)+`, is always an error.
  - `CollectionStorage` of `@procedures/collections` has the optional `query(selector, { sort, skip, limit }, policy)`, `observe(observer)` and `patch(id, fields)`. A caller tests for each one. A storage without them still follows the contract.
  - `observe()` gives one batch of `set`, `delete` and `clear` changes for each write that changes the storage, before the write resolves. The write methods take `{ origin }`, and each change has it.
  - `patch()` takes a JSON Merge Patch (RFC 7386), or the operations `{ $set, $unset }`, which can set `null` and nested field paths. A patch that mixes the two forms is an error. `applyPatch()`, `mergePatch()` and `patchProblems()` are exported.
  - `InMemoryStorage` has the three methods, and the options `queryPolicy` and `onObserverError`. `StorageListeners` is the set of listeners that the storages share.
  - The contract suite of `@procedures/collections/testing` tests the selectors against `queryEntries()`, with fixed and random selectors, the refusal of `$regex` by default, and, with `createWithQueryPolicy`, the opt-in of `$regex` and each limit of a policy. It also tests the two forms of a patch, the patches at the same time, and the batches with their origins.
  - The core collection procedures have `collections.<name>.find` (it reads) and `collections.<name>.patch` (it reads and writes, idempotent). `find` refuses a selector or a limit that the policy does not permit with `VALIDATION_ERROR` and the reason, and a `find` without a limit gets at most `DEFAULT_FIND_LIMIT` (1000) items. It gives the selector and the policy to `query()` of the storage, or runs it on the entries. `patch` uses `patch()` of the storage, or a read and a write, one patch of an id at a time.
  - `createCollectionProcedures(name, { queryPolicy })` and `ProcedureServer.registerCollectionProcedures(name, { queryPolicy })` take the policy of the host.
  - The `CollectionStorage` of the core has the same optional methods and the write options. Its new types are exported from the root, `./browser` and `./procedures`.
  - `ApiStorage` has `query()` (the procedure `find`, or the entries of an older server) and `patch()` (the procedure `patch`). Its option `queryPolicy` adds limits of the client.
  - `ApiStorage` waits `backoffDelay` of `@mark1russell7/service/backoff` between its tries, with full jitter, on the option `clock`. The timeout uses the clock too. The new options are `retryFactor`, `maxRetryDelay`, `retryJitter`, `clock` and `random`. An error with `retryAfterMs` gets at least that wait.
  - `HybridStorage` has `query()` and the option `queryPolicy`. Its timers run on the option `clock`, and the delay after a failure grows with the option `backoff`. `getStatus()` and `onStatus()` give the state of the sync and its failures. The storage writes nothing to the console.
  - `SyncedProcedureRegistry` takes the option `clock` for its auto-sync. Its status has the failures of the auto-sync and of the write-through writes, and `onStatus()` sends them.
  - `SqliteStorage` has `query()`, `patch()` and the option `queryPolicy`. A patch runs in one transaction.
  - `@procedures/store` depends on `@mark1russell7/service`, and `@procedures/collections` depends on `@procedures/client`.
- 2523b1b: One MCP host factory, `createMcpHost()`, and the questions of a procedure to the person at the caller (CLI-10, CLI-12). PATCH: new exports and new optional options before 1.0.0. The old exports and their behavior stay.
  
  - `@procedures/mcp-server`: `createMcpHost(options)` builds the registry (or the modules), the tool surface, the read-only narrowing, the host policy, the `ProcedureServer` and one `McpServerTransport` for each face (stdio, Streamable HTTP, SDK transports). The stdio face stops the host when its input ends, and `host.closed` resolves. `mcp.serve` and the dev-tools server use the factory. Thus `mcp.serve` gets its options from `hostPolicy()`, and it takes `readOnly` and `instructions`.
  - `@procedures/client`: `ctx.elicit` asks the person at the caller for input or a confirmation. The helpers `elicitInput()` and `elicitConfirmation()` give the action `unavailable` with a reason when no one can answer. `elicitWithPolicy()` adds the consents of the operator (`operatorConsent`), and `ask: false` turns the questions off. The operator answers only when the face cannot ask. A failed question of a face that can ask (a timeout, a lost connection) gives `unavailable`, and an abort gives `cancel`. `ServerRequest` and `InvokeOptions` get `elicit` and `progress`.
  - `@procedures/client`: `ctx.progress` tells the caller the progress of the call of the host. `metadata.untrusted` declares the output fields with text from outside the host, and `metadata.title` gives the title of a tool. `metadata.toolHints` can make a tool look more dangerous than its effects (`readOnlyHint: false`, `idempotentHint: false`, `destructiveHint: true`, `openWorldHint: true`). The registry refuses each other value, and `toolHintsOf()` gives the hints with the override.
  - `@procedures/mcp-server`: `McpServerTransport` answers `ctx.elicit` with MCP elicitation (form and URL), over stdio and Streamable HTTP. It sends `ctx.progress` as `notifications/progress`, and it gives the instructions of the server. An untrusted field goes in envelopes with a random id, and its text cannot close its envelope. The option `content` can give other text blocks for a result. The option `json: "compact"` gives the JSON of the default blocks on one line. The option `toolName` gives the name of each tool, so a server that moves to the host keeps its tool names. A call finds its procedure by the tool, not by the decoded name. Each tool call over Streamable HTTP carries the credentials of its HTTP request, so the request hook `principalOf` and the token check of the server apply to it. A server that reads cookies gets the CSRF rule on this face too.
  - `@procedures/mcp`: a tool gets `title` from `metadata.title`. In the output schema, each untrusted field is a string.
  - `@procedures/mcp-dev-tools`: `createDevToolsHost()` gives the MCP host as `mcp`. `dist/server.js` ends its process when the client closes the input of stdio. The tool list stays the same.
- c559b00: `HybridStorage` captures the writes of the application to its local copy, keeps its sync state after a reload and takes a push feed of the remote changes. Each write of the core collection procedures publishes a change event (server stack CLI-21, CLI-15, decision D9).
  
  - `HybridStorage.observe(observer)` gives one batch of changes for each change of the storage. A write of the storage gives its batch with the origin of its options. A pull and a delta of the feed give their changes with the origin of the option `syncOrigin` (`"sync"` by default). In `remote-only` mode, the batches tell the writes of the storage to the remote.
  - The option `origin` of `HybridStorage` is the tag of the storage (a random `hybrid-…` tag by default). Each write of the storage to the local copy and to the remote has it. The write methods of `HybridStorage` and `ApiStorage` take `{ origin }`.
  - `capture: "observe"`: the storage observes the local copy and queues each change with another origin. Thus an application can write to the local copy directly, for example with the synchronous writes of a SignalDB collection. In `write-through` and `remote-only` mode, the storage sends a captured change at once.
  - The option `syncState` takes a `SyncStateStore`: `MemorySyncStateStore`, or `IndexedDbSyncStateStore` of `@procedures/store/indexeddb`. The store keeps the cursor and the base versions. A new storage with the same store and a durable local copy asks only for the changes since the cursor, and it finds the conflicts of the base versions. A failure of the store goes to the status (`operation: "store"`, `SyncStateError`), and the storage goes on.
  - The option `feed` takes a `RemoteChangeFeed`. A delta whose `since` is the cursor applies without a read of the remote. A gap, a lost event, a new subscription or another delta makes one pull. A delta that comes during a pull applies after the pull, so the pull does not erase it (the LiveLog rule of Graph).
  - In `write-through` mode, a pull or a delta does not write over an own write that waits for the remote, a set or a delete. The storage keeps the remote value of the id, and after the write it reads the id again: then the rules of a pull decide. A read of a missing id does not bring back an item whose own delete waits.
  - With `versionOf`, the storage keeps the versions of its own writes until their echoes come (option `echoWindow`, 30 seconds by default). The echo of an older own write does not write over a newer local write (the EchoLedger rule of Graph).
  - `EventsChangeFeed` of `@procedures/store` is the feed of the change events. Its source is a `Client`, a `WebSocketTransport` or another transport. It treats the events as hints: a gap of the numbers, a lost event, a hint and each confirmation of the subscription call `onGap()`.
  - The core collection procedures publish `CollectionChangeEvent` `{ since, version, changed, deleted, origin }` on `ctx.bus`, under the topic `collections.<name>` (`collectionChangeTopic()`), while a subscriber listens. The changes come from `getChangesSince()` of the storage, and the events of one storage make a chain of versions. The option `changeEvents` of `createCollectionProcedures()` turns them off, or gives the topic of each call: the partition of CLI-17 goes there.
  - A value reaches a subscriber only through the checks of a read. By default, an event has the ids and the versions only, and `EventsChangeFeed` gives it to `onHint()`: `HybridStorage` reads the values with `changes`, and a hint with only deletes applies without a read. With `changeEvents: { values: true }`, an event also has `values`: each row `{ id, value }` passes the output filter of the host (`admitItem`) for each subscriber, and a refused id goes in `withheld`, so the storage pulls it.
  - `EventPublisher` refuses a topic whose reads the capability of the call does not permit (`FORBIDDEN`, `effects-exceeded`). Its new option `reads` gives the reads of a topic. The default, `collectionTopicReads()`, gives `collection:<name>` for `collections.<name>` and `collections.<name>.<partition>`. `ctx.admit` gives a procedure the output filter of its host for the data that it sends later.
  - The syncs of one `HybridStorage` run one at a time: the deltas and the hints of the feed, the pulls, the pushes, the reads after an own write and the mode switches. A remote delta and a full sync never run at the same time (Graph R18).
  - The write inputs of the collection procedures take an optional `origin` (1 to 256 characters). The procedure gives it to the storage and to the event. A server before this change ignores the field.
  - `Client.subscribe()` and `Client.events()` subscribe to the topics of the bus of the server through the middleware and the context of the client. A subscription has no deadline: the timeouts of the client do not apply to it, and only `metadata: { timeout }` in its options gives one.
  - New exports: `collectionChangeTopic`, `CollectionChangeEvent` and `CollectionChangeEventsOptions` from `@procedures/client`, `./browser` and `./procedures`. `EventsChangeFeed`, `MemorySyncStateStore`, `SyncStateError` and the types `RemoteChangeFeed`, `RemoteChangeListener`, `RemoteChanges`, `EventSubscriber`, `ChangeEventSource`, `EventsChangeFeedOptions`, `SyncState`, `SyncStateChange` and `SyncStateStore` from `@procedures/store`. `IndexedDbSyncStateStore` and `MemorySyncStateStore` from `@procedures/store/indexeddb`.

## 0.8.0

### Minor Changes

- 4b09a03: `debounceChannel()` and `throttleChannel()` take a `Duration`, as every other time of the client does since 0.3.0. A plain number of milliseconds throws a `TypeError`. A new option `clock` gives the clock of their timers, for example a fake clock in a test. MINOR: a breaking change of a signature (the API is before 1.0.0).
  
  Migration: `debounceChannel(bus, "in", "out", 300)` becomes `debounceChannel(bus, "in", "out", ms(300))`.
- 698e24d: Three gaps of the remote events (`documentation/EVENTS.md`) are closed. The option `backoff` of a subscription changes, so this release is breaking for a caller that gives it.
  
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
- d25805a: `ProcedureServer.useStorage` with `close` waits for the calls on the old storage before it closes it. Before, it closed the old storage at once, and a call that started on it could fail as closed.
  
  MINOR: the call of `useStorage` with `close` can now take up to 30 seconds to resolve. That is a change of behaviour that a caller can see. Give `grace: ms(0)` for the old behaviour.
  
  - The new calls use the new storage at once. The server waits only for the calls that took the old storage. A stream holds its storage until its end.
  - The new option `grace` of `UseStorageOptions` is the longest wait, a `Duration`. A plain number throws a `TypeError`. The default is 30 seconds, `TIMER_DEFAULTS.server.storageGraceMs`. 0 closes at once.
  - When the time ends, the server closes the old storage. A call that still uses it then fails with the error of a closed storage.
  - The new option `clock` of `ProcedureServerOptions` is the clock of this wait. A test gives a fake clock.

### Patch Changes

- 4b09a03: New `callerOf(...modules)` in the root and the browser entry. It gives a function that runs the procedures of the modules and gives one value. It makes the registry of the modules at the first call and does not use the global registry. An app wrote the three steps itself before: `createRegistry`, `invokePath` and `outputValue`. PATCH: a new export (the API is before 1.0.0).
- aa6e3aa: `ApiStorage` has `getIds()`. A full pull through it does not read each entry for the ids.
  
  - The collections have the procedure `collections.<name>.ids`. It gives the ids in the order of the entries, without the values. Its effects read the collection and write nothing. A storage without `getIds()` gives the ids of its entries.
  - The `CollectionStorage` of the core has the optional method `getIds()`, as the `CollectionStorage` of `@procedures/collections` has.
  - `ApiStorage.getIds()` uses the procedure `ids`. An older server without it answers `NOT_FOUND`. Then the storage reads the ids from the entries, and it does not ask for `ids` again.
  - `ApiStorageOptions.operations` takes `ids`, the name of the operation. The default is `ids`.
- 4b09a03: `bus.once()` rejects with an `AbortError` when `clear()` or `clearAll()` removes its channel. Before, its promise never settled.
- 600c497: A server on port 0 tells its real port.
  
  - New `HttpServerTransport.port()` returns the port that the server listens on. With the option `port` 0, the system gives a free port, and the function returns that port.
  - `peer.getEndpoints()` gives the real port of each HTTP and WebSocket endpoint. Before, a peer on port 0 gave the address `:0`.
  - The tests of the body and the stop of the peer listen on port 0. Before, a helper found a free port and closed it before the peer took it, so one CI run failed with `EADDRINUSE`.
- 7c2e7f7: The `onAfterRetry` hook of `createRetryMiddleware` hears of a failure when the reader stops at the error item. A `Client` with `throwOnError` (the default) stops there. Before, the hook ran after the yield of that item, so it ran only for a success. Now it runs when the call ends: after the last item, or when the reader stops. A thrown error and an abort still do not call it. PATCH: a bug fix.
- 90ea741: A procedure can declare its rules under a root of the files in `metadata.fsRoot` (the new type `FsRootRules`): the inputs that name a path, or the reason that a root cannot confine it. A handler gets `ctx.caller`, the procedure whose handler made the nested call. The framework sets it from the invocation, so an input cannot change it (roadmap R33).
- c4cfa34: `ProcedureServer.useStorage` with `close` keeps an old storage open while another collection still uses it. The server closes it when the last collection leaves it. Before, the close broke the calls of the other collection.

## 0.7.0

### Minor Changes

- 841d083: An NDJSON stream over HTTP gets keep-alive lines. Before, a proxy or a client with an idle timeout (for example 300 s) closed a long procedure that was quiet for that time.
  
  - `HttpServerTransport` writes a keep-alive line, a blank line, after each quiet time of the new option `keepAlive` (default `seconds(15)`, `TIMER_DEFAULTS.httpServer.keepAliveMs`). Each line starts the time again. No keep-alive line comes after the `done` line, an `error` line, an abort or a closed connection. `keepAlive: false` turns it off.
  - The new option `clock` of `HttpServerTransport` is the clock of the keep-alive timers. A test gives the `fakeClock` of `@mark1russell7/service/testing`.
  - A keep-alive line has no `seq`, so the sequence check of the reader sees no gap. `WIRE-PROTOCOL.md` specifies the line: it is an additive change of protocol v1, because each reader skipped a blank line before.
  - New `writeNdjsonStream(res, items, options?)` in `@procedures/client/node`. It writes the NDJSON stream response of protocol v1 for a `ServerResponse` of `node:http`, without Express. It writes the headers, the `item`, `done` and `error` lines with `seq`, and the keep-alive lines. It waits for `drain` when the buffer is full, and it stops when the connection closes or `signal` aborts. Its options are `signal`, `keepAlive`, `errorOf` and `clock`. `HttpServerTransport` uses it, so the two write the same bytes.
  - `HttpTransport` gives each item of an NDJSON stream the metadata key `stream` with the value `true` (the new constant `STREAM_ITEM_METADATA_KEY`). The error item that ends the stream has it too. The key does not cross the wire, and the client removes a key `stream` that the peer sent.
  - When the client goes away while the handler is quiet, the writer of the stream stops at once. Before, it waited for the next item of a handler that ignores its signal.

### Patch Changes

- 389b054: A token check no longer tells the length of the token through its time. The peer compares the SHA-256 digests of the two tokens with `timingSafeEqual`. The `tokenMatches` of the client, which runs in a browser too, compares each character of the expected token for each presented token. Before, a token of another length returned at once. The re-audit of jarvis found it.

## 0.6.0

No changes in this release.

## 0.5.0

### Minor Changes

- 09e5566: Remote events (`documentation/EVENTS.md`): a peer subscribes to the topics of the event bus of another peer. A subscription is a streaming call of the procedure `events.subscribe`, so it uses the frames of each call: credit is the backpressure, and a cancel is the unsubscribe. It works over WebSocket in the two directions, HTTP with NDJSON, a message port and the local transport. The protocol stays v1.
  
  - `WebSocketTransport.subscribe(topics, handler)` gives the unsubscribe function, with the `ready` promise of the first confirmation. `WebSocketTransport.events(topics)` gives an async iterator. After a drop, the transport resubscribes on the new connection.
  - `subscribeRemote()` and `remoteEvents()` do the same over each transport. After a failure that a retry can repair, they resubscribe with a backoff.
  - `ProcedureServer` has the option `events`: a bus, a topic rule (`topics`), an `allow` function and a `buffer`. The server pins `events.subscribe` outside its registry, so it is not an MCP tool. `ProcedureServer.publish()` emits on the bus. `stop()` ends each subscription with `UNAVAILABLE`.
  - `WebSocketServerTransport.subscribe(connectionId, topics, handler)` and `events(connectionId, topics)` subscribe to the bus of a client. `LocalTransport` takes an `EventPublisher` with its option `events`.
  - The delivery is at most once, in the order of `emit()`. When the queue of a slow subscriber is full, the publisher drops the oldest event, and the next event tells the loss (`dropped`).
  - The new error code `TOPIC_NOT_FOUND` (404) is for a topic outside the topic rule. A topic that `allow` refuses gives `FORBIDDEN` with the reason `topic-not-allowed`.
  - The `onEvent` option of `WebSocketTransport` is now a wrapper: it gets each event of each subscription of the transport. A raw `event` frame still goes to it.
  - The WebSocket client does not warn about a `stream` frame of a call that it cancelled. The WebSocket server ignores a late `stream`, `response` or `error` frame of a call that it stopped. Before, it answered such a frame with an `error` frame.
- ab77f75: Sequence numbers of the stream frames (`documentation/WIRE-PROTOCOL.md`). Before, a duplicate `stream` frame gave a duplicate item. The change is additive, and the protocol stays v1.
  
  - Each `stream` frame has the field `seq`: 1 in the first frame of a call, and one more in each next frame. The end frame has a number too. Each NDJSON line `item` or `done` has the same field.
  - The receiver drops a frame whose `seq` is not above the last one. Thus a duplicate frame or a late frame gives no item.
  - A gap does not end the stream, because the delivery is at most once. The next item has the number of lost frames in the metadata key `stream-gap` (`STREAM_GAP_METADATA_KEY`), and the console gets a warning. The receiver gives back the credit of the lost frames.
  - A frame without `seq` comes from an older peer. The receiver takes it as before.
  - The rules apply to WebSocket in the two directions, the message port and HTTP with NDJSON. The local transport has no frames.
  - `WebSocketMessage` has the optional field `seq`.
- a47bee6: The hosts serve the remote events (`documentation/EVENTS.md`).
  
  - `hostPolicy()` takes the option `events`: the topic rule, with an optional bus, `allow` function and buffer. `procedureServerOptions()` gives it to the `ProcedureServer`, which pins `events.subscribe`. `HostPolicy` has the new field `events`.
  - `procedure-server` and `mark serve` have the option `--events <patterns>`. The option is repeatable, and it takes comma-separated patterns: exact names, prefixes (`orders.*`) or `*`. `parseTopicPatterns()` checks them.
  - `mark --server` has the same option `--events`.
  - These hosts always serve `events.subscribe`. Without `--events`, they serve no topic, and each subscription gets `TOPIC_NOT_FOUND`. The bus is the global bus, which is also the `ctx.bus` of their procedures.
  - The MCP server serves no events, because its transport carries only MCP.
  - `mark --port`, `--host`, `--transport` and `--events` without `--server` are an error now, also before `serve` and `mcp`. Before, `mark --port 4000 serve` ignored `--port`.
- bc74091: Two changes for the contract of `CollectionStorage`:
  
  - The collection procedure `collections.<name>.get` takes the input `found: true`. Then its output is `{ found, value }`, so a stored `null` and a missing id give different outputs in one call. Without `found`, the output is the item, as before.
  - `ProcedureServer.stop()` and `closeStorages()` close each storage one time, also a storage of two collections, and remove the storages from the server. Before, a server that started again used the closed storages.

### Patch Changes

- 0f75644: The dependencies go to `@mark1russell7/algebra` `^0.7.0` and `@mark1russell7/service` `^0.4.1`. A host that uses algebra 0.7.0 gets one copy of it. Algebra 0.7.0 only adds to 0.6.0.

## 0.4.0

### Minor Changes

- d919678: `ERROR_REGISTRY` agrees with `ERROR_CODES` of the wire protocol. `ERROR_CODES` is the source: the registry has an entry for each code of the protocol, and that entry takes its HTTP status and its retry flag from `ERROR_CODES`. Changes that a caller sees:
  
  - `TIMEOUT` has the status 504 and is not retryable (before: 408, retryable).
  - `INTERNAL_ERROR` is not retryable (before: retryable).
  - `ABORTED` has the status 499 (before: none).
  - The codes of the protocol that the registry did not have (`HANDLER_ERROR`, `VALIDATION_ERROR`, `UNAVAILABLE` and the others) have entries, with the meaning of the protocol as their texts.
  - `errorCodeToHTTPStatus` gives the status of `ERROR_CODES` for a code of the protocol, for example 504 for `TIMEOUT`.
- b2a1a1e: A handler error keeps its own code on each face, as `WIRE-PROTOCOL.md` says. `errorResponse` (the server, and through it HTTP, WebSocket and MCP) and `LocalTransport` give the code of the thrown error when it is a string. Before, they changed it to `HANDLER_ERROR` for a value, and `LocalTransport` also for a stream. An error without a code is still `HANDLER_ERROR`.
  
  The HTTP status follows the code: a code of `ERROR_CODES` gets its status, another code of `ERROR_REGISTRY` gets the status of the registry, and each other code gets 500. For example, a handler error with the code `UNAVAILABLE` now gives 503.
- 057d69a: `client.import` gives `success: true` only for a procedure reference: an object whose `$proc` is a list of texts. Other JSON, for example `42`, an object without `$proc` or a list of calls, gives `success: false` and an error. Before, each JSON value gave `success: true`.
- 057d69a: `client.isObject` gives true only for a plain object: an object literal, or an object without a prototype. A `Date`, a `Map` or another class instance gives false. Before, each object that is not an array gave true.
- 057d69a: `client.stringifyJson` and `client.export` refuse a missing value (undefined) with `VALIDATION_ERROR`, because undefined has no JSON text. Before, the call failed with `OUTPUT_VALIDATION_ERROR`. The `value` field of `client.stringifyJson` and the `procedure` field of `client.export` are now required. A value without JSON text, for example a function, gives an error from `client.stringifyJson` and an error result from `client.export`.
- 057d69a: `client.mod` refuses `b = 0` with the error `Division by zero`, as `client.divide` does. Before, it gave `NaN`.
- afd6a19: The `client-registry` command is removed. `mark` finds the packages, and the `/register` entries register them.
- 057d69a: `client.unique` compares the items by value: two equal JSON values are duplicates. An array compares by its items in order, and a plain object by its fields in any order. With `key`, the values of the field compare by value too. The result keeps the first item of each value, in the order of the input. Before, objects and arrays compared by reference, so two equal objects both stayed.
- 4e751da: The new entry `@procedures/client/node` exports a `WebSocketTransport` whose sockets are of the `WebSocket` class of the `ws` package. A Node application gets `terminate()` without the option `webSocket`: a drop by the heartbeat or by the time limit of the handshake ends the socket at once. The option `webSocket` still gives another class. The other entries keep the global `WebSocket`, and the browser entry does not import `ws`.
  
  A socket of the `ws` package that closes during its handshake emits an error. Before, the transport removed its error handler first, so a handshake timeout or a `close()` during the handshake ended the process with an uncaught error. The transport now keeps a handler that ignores that error.

### Patch Changes

- 057d69a: The description of the `match` field of `client.filter` lists all 11 modes. Before, it did not name `gt`, `gte`, `lt` and `lte`.
- 057d69a: The input schemas of `client.not`, `client.all`, `client.any` and `client.none` say "values", not "values or calls". These procedures do not run a call in their operands: a call is an object, thus truthy. In a program, the calls of their input run first, as for each procedure that is not control flow. `client.and` and `client.or` run calls. The behavior does not change.

## 0.3.0

### Minor Changes

- b2a3e3a: The bidirectional peer (roadmap R24). The calls over one WebSocket go in the two directions with the same frames: a request, then a response, an error or a stream with credit, and a cancel. The client serves the calls of the server with the new `serve` option of `WebSocketTransport` (for example a `ProcedureServer` with its registry), so a call gets validation, the expose rule, the capability, streaming, cancel, the signal and the deadline. The server sends them with `callConnection()`, or with a `Client` over `transportFor(connectionId)`, and a peer has `connections()` and `clientFor(connectionId)`. `callClient()` and `onServerRequest` stay as wrappers of the new calls, and the old `server-request` frames are no longer sent. The shared code of the two sides (`OutgoingCalls`, `IncomingCalls`) serves the calls of the client too.
- a8c47f1: The cache (roadmap R13). Two calls with the same key at the same time make one request: the second one waits for the first and gets a copy. With the new option `effects` (for example `effectsIn(registry)`), a write that succeeds deletes the cached entries of the methods that read one of its resources. `invalidateCache(middleware, matches?)` deletes entries by method. A response whose key changed during the call is not stored, so an auth layer inside the cache cannot give the response of one user to another. The idempotency key and the remaining time of a call are not part of the key.
- 381ce3a: Cancellation scopes and a graceful stop (roadmap R14). `ProcedureServer.stop({ grace })` refuses new calls with a retryable `UNAVAILABLE` and lets the calls in flight end until the grace time ends, then aborts them (`peer.stop({ grace })` passes it; `mark --server` and the `server` bin give 5 seconds). The signal of each call joins its request and the server, and `callsInFlight` counts the calls, streams included. `exec()` and `execStream()` take a `signal`. `LocalTransport` takes `interceptors`, `capability` and `clearanceOrder`, and gives a call the deadline that its client sends, so a client timeout ends a local handler too. `mark` aborts a command in its own process on the first Ctrl+C. A remote leaf of `route()` and `server.call` send the deadline of their caller, and `server.call` relays the signal.
- ae7f05f: The clock of the timers, and the state machines as data (roadmap R35). The retry, the circuit breaker and the WebSocket client take a `clock` option: a `Clock` gives the monotonic time and starts the timers, and `realClock` is the default. The shape is the `Clock` of `@mark1russell7/service`, so its `fakeClock` fits, and a test gets exact times. `WEBSOCKET_CONNECTION_MACHINE` and `CIRCUIT_BREAKER_MACHINE` are `mark1russell7.machine/1` documents with their knobs, events and timers. The WebSocket client and the circuit breaker report each change of their state to `onTransition`, and `replayTransitions()` replays the reports against a document. The heartbeat of the WebSocket client uses one timer for each interval in place of `setInterval`.
- 7873940: The collection mode switch (roadmap R28). `HybridStorage` has four modes: `local-only` (no remote call, each write waits in the queue), `write-through`, `write-back` and `remote-only` (no local copy). The option `mode` gives the first mode, and `writeStrategy` stays as a deprecated name of it. `setMode()` changes the mode while the storage operates. The switch waits for the operations that run, sends the queue to the remote first, and syncs the local copy when it leaves `local-only` or `remote-only`. A switch to `remote-only` drops the local copy only after the flush. When the remote fails, the mode stays and `setMode()` throws `ModeSwitchError`. A switch to `local-only` makes no remote call.
  
  The queue is durable: the option `queueStore` takes a `QueueStore` (`load`, `append`, `replace`, `clear`). `MemoryQueueStore` is the default, and `FileQueueStore` of the new entry `@procedures/store/file-queue` keeps the queue in a JSON Lines file. A write ends only after the store kept it (`QueueStoreError` when it cannot). A new storage with the same store loads the queue, shows its writes and sends them. The modes `write-back` and `local-only` always use the queue: before, `write-back` with `offlineQueue: false` never sent a write.
  
  A sync asks for the changes since the version of the last sync. Storages get the optional `getChangesSince(version)` (`InMemoryStorage` keeps a change log with tombstones, `ApiStorage` calls the new collection procedure `collections.<name>.changes`), and a remote without it gives all its entries. The option `versionOf` gives the version of an item: with versions, a conflict is a queued local write of an id whose remote version changed, and `conflictResolution` decides (`error` throws `ConflictError`). The option `pullInterval` starts a periodic pull. Storages get the optional `flush()`, and `ProcedureServer.useStorage(name, storage, { drain, close })` flushes the old storage before the change. `createSyncedRegistry({ type: "hybrid", mode })` takes the mode, and the synced registry has `setMode()` and `getMode()`.
- a70d445: `procedure.define` keeps the effects of its body (roadmap R22). `programCheckInterceptor()` checks the body of each definition, refuses a body with an error, and gives its effects to `procedure.define` in the internal metadata key `__inferredEffects`. Each transport removes `__` keys from a request, so a remote caller cannot claim effects. The defined procedure keeps them as `metadata.inferredEffects`, and `toolHints()` uses them: before, a defined procedure had no hints. The admission still examines each nested call. New exports: `INFERRED_EFFECTS_METADATA_KEY`, `inferredEffectsOf()`, `effectsValue()`.
- bc70357: The file procedures can have a root (roadmap R33). `createFsModule({ root })` gives the procedures of `fsModule`, and each path of each input must be in the root folder. A relative path starts at the root. Without a root, the procedures operate as before.
  
  The procedures refuse a path that goes up with `..`, an absolute path outside the root and another drive. They also refuse a symlink or a junction that goes out of the root. The error has the code `FORBIDDEN` and the new reason `outside-root` (the type `ForbiddenReason` of `@procedures/client`). For a path that does not exist, the check uses the real path of the nearest existing folder. `registerFsProcedures(registry, { root })` takes the root too.
- 07cc998: The procedures of a host (roadmap R19). `hostProcedures(source)` gives `host.health` (the state, the uptime, the procedures and the calls in flight), `host.info` (the id, the start time, the endpoints and the runtime) and `host.metrics` (the counts of `metricsInterceptor` for each procedure). A peer pins them on its server, so the registry of its caller does not change, and counts its calls (option `metrics`, default true). `ProcedureServer.stopping` tells when a graceful stop runs.
- a6b01a9: The new package `@procedures/http` (roadmap R38) has four procedures: `http.request` (each method, a body of text, JSON or base64, and a response as text, JSON or base64), `http.json` (a GET or a POST of JSON), `http.ndjson` (a stream of the JSON values of the lines) and `http.sse` (a stream of server-sent events). `http.request` and `http.json` declare `reads: ["network"]` and `writes: ["network"]`. The two streams send only a GET, so they declare `writes: []`, and they declare `stream: { unbounded: true }`.
  
  The default module reaches each public host and refuses loopback, private, link-local, shared, multicast and reserved addresses. `createHttpModule({ allow, publicHosts, maxRequestBytes, maxResponseBytes, resolve })` gives the procedures with more hosts: host names, wildcards, IP addresses and CIDR ranges, each with an optional port. The check resolves the host name, and the connection uses only the addresses that passed the check. Each redirect gets the same check. A refusal has the code `FORBIDDEN` and the new reason `host-not-allowed` (the type `ForbiddenReason` of `@procedures/client`).
  
  A call stops at the earliest of its deadline, the abort of the caller and `timeoutMs`. A stream also stops after `idleTimeoutMs` without data. The body of a response has a limit of 10 MiB by default, and the limit counts the decoded bytes of a compressed body.
- c799cdd: `HybridStorage` cannot lose data (roadmap R2). A sync gets the ids of the remote items from the new `getEntries()` of a storage (the collection procedure `collections.<name>.entries`), or else from `keyOf`. A remote item without a key stops the sync with `MissingKeysError` before any change: before, such a list emptied the local cache. A write-through that the remote cannot take waits in the queue and throws `PendingWriteError`, and a timer sends the queue. A write that the remote refuses is undone in the local cache. A full queue refuses a write with `QueueFullError`: before, it dropped the oldest operation. A second try of a write replaces its queued operation. A write-through sends the older queued operations first. The reads wait for the first sync.
- 5b9264e: One deadline model (roadmap R10, REV-6). The overall timeout and the remaining time that a caller gives (`procedure-timeout`) set the deadline of a call, and each try sends its remaining time as `procedure-timeout`. So the server stops the handler when the client stops waiting: before, the timeouts of the client middleware did not reach the server. The timeout of one try is at most the remaining time. The client no longer sends `X-Timeout`, which the server ignored. The new preset `resilience({ overall, perAttempt, retry, breaker, cache, rateLimit })` puts the layers in the correct order, and `createCombinedTimeoutMiddleware` is now that preset (deprecated).
- 956e88b: One manifest type (roadmap R17). `describeRegistry(registry, { expose })` and `describeProcedure` (exported as `describeProcedureEntry`) describe each procedure: the path, the description, the tags, the effects, the JSON Schemas of the input and the output, the calls, an unbounded stream, the command-line metadata, and a hash of the manifest (`procedures.manifest/1`). The new procedure `procedure.manifest` gives it, and it is an MCP tool of the dev tools (63 tools). `procedure.get` gives the JSON Schemas and the effects. The context of a handler has the expose rule of its host (`ctx.expose`), and `procedure.get`, `procedure.list`, `procedure.manifest`, `procedure.export`, `client.lookup`, `mcp.list-tools`, `manifest.generate` and `_discovery.announce` show only the exposed procedures: before, an MCP tool could list the procedures that the host hides. `_discovery.announce` gives the JSON Schemas, and `manifest.generate`, `getProcedureInfos` and the manifest of `mark` use the one description.
- ff62281: One trace from the client to the handler (roadmap R16). The tracing middleware makes W3C ids by default and sends a W3C `traceparent` in the metadata (and as the HTTP header `traceparent`). The tracing interceptor of a server continues that trace: the span of a call of the host has the trace of the client and the span of the client as its parent (`remoteParent: true`). The nested calls of a handler carry its span, also to a remote server. The spans of the interceptor have W3C ids. Before, the client and the server made two traces that nothing joined.
- d81d0ed: The transport over a message port (roadmap R27). `PortTransport` sends calls over a Web Worker, a `MessageChannel` or a `worker_threads` port, in the two directions, with the frames of the WebSocket transport: streams with credit, cancel and errors. Its `serve` option takes a `RequestHandler`, for example a `ProcedureServer`. The site uses it for its two workers in place of two protocols of its own.
- 061fa22: The timers of the client come from `@mark1russell7/service` 0.4.0 and `@mark1russell7/algebra` 0.5.0 (roadmap R37). The two packages are dependencies of the client now.
  
  - The clock is `platformClock()` of `@mark1russell7/service/clock`. The types `Clock` and `Cancel` come from there too, and `Cancel.unref` is read-only.
  - The heartbeat of the WebSocket client is `heartbeat` of `@mark1russell7/service/heartbeat`. A ping whose send throws is a miss. Before, the error left the timer.
  - `reconnectDelay` and the retry middleware use `backoffDelay` of `@mark1russell7/service/backoff`. The delays are the same.
  - `replayTransitions` uses `replay` of `@mark1russell7/algebra/replay`. A jump message says "the runtime left", not "the code left".
  
  The four entries import nothing else, and together they have 1.3 kB of gzip.
- cfb9d69: Retry obeys the effects (roadmap R1). After a try with an indeterminate outcome (a reset, a closed WebSocket, the timeout of one try), the retry middleware sends the call again only when it is idempotent: the `idempotent` option (`true`, or a function such as `idempotentIn(registry)`), or `retry: { idempotent: true }` in the context of the call. A refused connection and a retryable error of the server still go again. Each try of one call sends the same `idempotency-key`, and `ProcedureServer` runs a keyed call to a procedure that is not idempotent one time (option `idempotency`). The error items of the transports tell the delivery of a failed try (`deliveryOf`).
- 43f7de5: Retry and the circuit breaker (roadmap R12). The retry middleware has a retry budget (`budget`, default: 0.2 of the calls and at least 10 retries a second), so a failing service gets a fraction more requests and not `maxRetries` times more. The delay has full jitter by default (`jitter: 1`: a random time from 0 to the backoff, before ±10 percent). A server that asks for a wait gets it: `retryAfterMs` of a thrown error becomes the `Retry-After` header and the `retry-after` metadata, and the retry waits at least that long. `maxAttempts` in a context counts the tries, as its name says (before, it counted the retries). The circuit breaker counts only the failures of availability (`isAvailabilityFailure`: UNAVAILABLE, TIMEOUT, a stopped server, a gateway error, network errors): an abort or a validation error no longer opens it. Its windows use a monotonic clock. `ApiStorage` asks a retry middleware of its client for one try, so the two loops cannot multiply.
- b07bb50: The server-transport contract (roadmap R18). `RequestHandler` (`handle(request)`) is the contract of a server transport, and the HTTP and WebSocket transports take one. A `ServerRequest` has `credentials` (the bearer token of `Authorization`, or of the `token` query of a WebSocket) and `principal`. `ProcedureServer` takes `token` (a host policy gives its token) and examines it for each network request, and `authenticate` gives the principal. Before, only the Express middleware of the peer examined the token. The secret headers (`Authorization`, `Cookie`, `Proxy-Authorization`, `X-Api-Key`) no longer go into the metadata of a request, so a handler and a nested call do not see them. `LocalTransport` answers `ABORTED` at once when its caller aborts, as HTTP and WebSocket do. A conformance suite runs the same calls through Local, `handle()`, HTTP, WebSocket and MCP.
- 4a3bfa1: The timer law of systems for the client (roadmap R34). The new package `@procedures/systems` binds the times of the middleware, the transports and the server to the symbols of the law of `@mark1russell7/service`, and examines six rules of the client: `lintTimers()`, `bindingOf()`, `CLIENT_RULES` and the procedure `systems.timers`. The core exports its default times as data: `TIMER_DEFAULTS`. The middleware, the transports and the server read them. The law found two defaults that broke it, and they change: the WebSocket client pings each 20 s, not 30 s, so it finds a dead connection before a call on it times out. The WebSocket server pings each 15 s, not 30 s, so it finds a dead client before its call to the client times out.
- fb30718: Typed durations (roadmap R11). This change breaks the API. Each public option that is a time takes a `Duration` of `@mark1russell7/quantity`, made with `ms()`, `seconds()`, `minutes()` or `hours()` of `@procedures/client`. A plain number is a type error, and at run time the option throws a `TypeError` that names it. This covers the timeouts and `resilience()`, the retry delays, the cache, the circuit breaker, the rate limit, the HTTP, WebSocket and mock transports, the WebSocket server heartbeat, `timeoutInterceptor({ limit })` (was `ms`), `hostPolicy({ timeout })` (was `timeoutMs`), the idempotency cache (`ttl`, was `ttlMs`), `ApiStorage`, `HybridStorage`, the synced registry and `connect()` of the peer. The per-call overrides in a context (`timeout`, `retry.delay`, `cache.ttl`) and the `route()` overrides (`timeout.overall`, was `timeout.ms`) take durations too. The wire and the inputs of procedures keep milliseconds.
  
  Migration: `createOverallTimeoutMiddleware({ overall: 5000 })` becomes `createOverallTimeoutMiddleware({ overall: seconds(5) })`.
- c5528e4: Streams that can run without an end (roadmap R15). A procedure declares `stream: { unbounded: true }` in its metadata (`docker.logs`, for `follow`, and `shell.stream` do). `ProcedureServer` marks its stream response, and the faces that collect a stream obey the mark: HTTP without NDJSON answers 406 `NOT_ACCEPTABLE` at once (before, the request waited until a timeout), and the MCP transport stops the stream at its `streamLimits` (default 100 items or 30 seconds) and says so in the result (before, `docker.logs` with `follow` ended only at the time limit of 10 minutes).
- fee5d9c: WebSocket time limits (roadmap R3). The handshake of the client has a time limit (`connectionTimeout`): an address that never answers no longer keeps the socket in `CONNECTING`. The reconnect delay has full jitter by default (`reconnect.jitter`), so the clients of a server that restarted do not come back at the same moments. The client drops a connection after `heartbeat.misses` pings without a pong (default 1, as before). The server pings each connection and closes one that misses 2 pongs (`WebSocketServerTransport` option `heartbeat`), so it finds a client that went silent.
- 21f7743: Wire protocol v1 (roadmap R25). `WIRE-PROTOCOL.md` specifies the HTTP and WebSocket formats. A WebSocket connection starts with a `hello` frame of each side (`getServerProtocol()` on the client), and HTTP sends the header `Procedures-Protocol: 1` on each request and response. A side refuses a newer version with `PROTOCOL_VERSION`. `ERROR_CODES` is the one list of error codes and HTTP statuses of all faces. The reason of a `FORBIDDEN` error travels on each face: in the HTTP error body, in the item metadata of the HTTP and local transports, and in the `_meta` of an MCP error result. `Method.version` is deprecated: the server ignores it. Golden tests in `packages/client/test/wire/` pin the frames.
- 31a0b46: The WebSocket client has the option `webSocket`: the class of its sockets. In Node, give the `WebSocket` of the `ws` package. A drop by the heartbeat or by the time limit of the handshake then ends the socket at once with `terminate()`.
  
  The global `WebSocket` has only `close()`, which waits for the answer of the peer. The harness cells of roadmap R36 showed that a socket to a dead peer then stays open until the kernel stops it: 924.6 seconds with the default settings of Linux.

### Patch Changes

- ddea529: The array procedures read only the own fields of an item (roadmap R29, as R6 for the object procedures). Before, a key such as `toString` read the function of the prototype: `client.count` counted each item, and `client.pluck` gave functions. This applies to `sort`, `unique`, `groupBy`, `filter`, `where`, `pluck`, `partition` and `count`.
- 0c627f8: The catalog test of the core procedures found four defects (roadmap R29). `client.replace` gives the replacement as text: before, the replacement of the first match changed `$$` to `$` and `$&` to the match. `client.groupBy` accepts a group with the name of a field of `Object.prototype`: before, a group `constructor` or `toString` failed. `client.arrPick` picks only own fields, as `client.pick` does: before, `toString` picked a function of the prototype. The input schema of `client.template` describes its `{{name}}` placeholders: before, it described `{name}`.
- 540f8d9: A `$never` operand of a control-flow procedure is data (roadmap R4). Before, only a step of `client.chain` obeyed `$never`: a `$never` branch of `client.conditional`, a try of `client.tryCatch`, a task of `client.parallel` and the `fn` of `client.map` started. A `fn` of `client.map` or `client.reduce` that is not one call is an error: before, it was ignored.
- b6daaec: The object procedures do not reach a prototype (roadmap R6). `client.set`, `client.get` and `client.has` refuse a path segment `__proto__`, `constructor` or `prototype`: before, `client.set` with the path `__proto__.x` changed the prototype of its result. `client.get`, `client.has` and `client.pick` read only own fields: before, `toString` gave a function of the prototype. `client.merge` and `client.omit` set own data properties.
- aa67cc7: The client uses `@mark1russell7/quantity` 0.2.0. Its root entry does not import zod. The entries of the client that use zod for their schemas still have it, but a bundle that takes only the Durations no longer gets zod.
- bd0b626: Four fixes that the tests of roadmap R30 found.
  
  - An abort of the caller ends the wait of the timeout middlewares at once, also when the transport ignores the signal. The caller gets `ABORTED`. Before, the caller waited for the timeout and got `TIMEOUT`, and the circuit breaker counted a failure.
  - `WebSocketTransport` starts its reconnects at once when a handshake fails on Node 22. The WebSocket of Node 22 gives an error event and no close event, so before, each try waited for `connectionTimeout`.
  - `createErrorFromException` gives `TIMEOUT` for the reason of `AbortSignal.timeout()`, and `SERIALIZE_ERROR` for a circular structure. Before, it gave `ABORTED` and `PARSE_ERROR`.
  - `isAvailabilityFailure` is true for `CONNECTION_CLOSED`, so the circuit breaker counts a closed connection.
- a6be873: The timeout middleware keeps the reason of an abort when the platform has no `AbortSignal.any`. Its own composition of the signals now gives the transport the reason of the signal that aborted, as `AbortSignal.any` does. Before, the transport got a new `AbortError` in place of the reason of the caller.

## 0.2.3

### Patch Changes

- 15e48cf: Three fixes of the architecture review (2026-10-16). A `timeoutMs` that is not a finite number of zero or more asks for nothing: before, `NaN` removed the deadline. A procedure of `procedure.define` declares no effects of its own, so a read-only capability runs it and examines each nested call. `mcp.list-tools`, `mcp.serve`, `_discovery.announce`, `manifest.generate`, `server.create`, `procedure.export` and `lib.audit` read the registry of the call, not the global registry. `getProcedureInfos` and `watchProcedures` take a registry.

## 0.2.2

### Patch Changes

- 370b51a: A validation message gives the messages inside an issue: the message of a record key schema, of a map or set element, and of each branch of a union. Before, `Invalid key in record` hid the message of the key schema. Now: `portions.cups: Invalid key in record (write cup, not cups)`.

## 0.2.1

### Patch Changes

- a9dc8c8: `admitItem`, the output filter of a capability, can give a promise: a filter that looks up the clearance of a record waits for it. The type is `AdmitItem`.

## 0.2.0

### Minor Changes

- 0cf4bea: **Invocation capabilities** (packages/documentation/CAPABILITIES-2026-10.md, the guide is client/docs/CAPABILITIES.md). Each call operates with a capability: a clearance, permitted effects and a deadline. A nested call gets the same capability or a narrower one.
  
  - Procedures declare `metadata.effects` (`reads`, `writes`, `destructive`, `idempotent`). Each procedure of these packages declares them.
  - `hostPolicy({ capability, readOnly, clearanceOrder, resources, admitItem })`, and `new Client({ capability })`. A refused call gives `FORBIDDEN` (HTTP 403) with a reason.
  - `ctx.capability` and `ctx.resources` are new required fields of `ProcedureContext`. A test that makes a context by hand adds `capability: {}` and `resources: {}`.
  - An application gives its clearance and resource types by augmenting `Register`.
  - The timeout interceptor sets the deadline of the capability, and a remote call sends the remaining time.
  - The MCP tools have hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) from the effects. `mark mcp --read-only` (or `MCP_READ_ONLY=1`) serves only the tools that change nothing.
  - **Breaking:** `git.remote` only reads the URL. `git.remote.set` sets it (before: `git.remote` with `url`).
- 76d0d64: **Breaking:** an import of a package registers nothing. The `./register` entry of a package registers its procedures, and the procedures of the modules that they need, in the global registry (ARCHITECTURE-PROPOSALS-2026-10, P9).
  
  - `import "@procedures/git"` gives the exports and registers nothing. Use `import "@procedures/git/register"`, or give `gitModule` (`@procedures/git/module`) to `createRegistry()`.
  - `import "@procedures/client/register"` registers the control flow (`client.chain` and the others) and `procedure.define`/`get`/`list`/`delete`. `createRegistry()` adds them to each new registry, as before. The new `registerClientProcedures(registry?)` does the same for any registry.
  - Each `register<Name>Procedures(registry?)` function is in the module of its package, takes a registry (the global one by default) and registers the modules that the package requires. `registerBridge` (splay) and `register` (store) are now `registerSplayProcedures` and `registerStoreProcedures`. The old names stay for one version.
  - `sideEffects` names only `./dist/register.js`, so a bundler can drop the rest of a package.
  - The bundles require `clientModule`, so `@procedures/bundle-mcp/register` gives the whole tool surface.
  - `lib new` makes `src/module.ts` and a root without side effects, and `procedure new` adds procedures to the module.

### Patch Changes

- 44d3e30: `mark --version` and `client-registry version` show the version of the package. Before, they showed `1.0.0`. The help of `client-registry` links to the site, not to a placeholder repository.

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.

### Breaking changes (from the versions on GitHub)

- `procedure.get` gives `{ found: false }` for a path that has no procedure. Before, it gave `null`. For a procedure, it gives `found: true` with the description.
- `procedure.list` lists the registry of the caller. It takes `namespace` and `includeMetadata`, and it marks the procedures of `procedure.define` with `runtime: true`.
- The core depends on no other package of the repository (roadmap 3.3, 3.2, 3.4):
  - The storage layer moved to `@procedures/store`: `ApiStorage`, `HybridStorage`, the synced registry (`createSyncedRegistry`, `SyncedProcedureRegistry`), the serialization, `createDynamicHandlerLoader` and the procedures `procedure.store`, `load`, `sync`, `remote` and `register`. The core no longer registers them.
  - The entry point `@procedures/client/collections` is gone. Import the data structures from `@procedures/collections`, and `ApiStorage`/`HybridStorage` from `@procedures/store`.
  - The procedure components moved to `@procedures/splay`. The entry point `@procedures/client/components` and the component exports of the root are gone.
  - The core declares `CollectionStorage` and `StorageMetadata` itself, with the shape of the interface of `client-collections`.
- New: `runtimeProgramOf(procedure)` gives the program of a procedure that `procedure.define` made. `isAsyncIterable` is exported.
