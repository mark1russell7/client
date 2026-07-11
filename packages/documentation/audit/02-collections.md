# Collections Fork Audit — `client/src/collections` vs `@mark1russell7/client-collections`

## Package summary

### Structure map (identical in both copies)

Both trees contain the same 40 source files (~15.2k LOC core / ~14.8k LOC standalone; the delta is core-only `examples.ts` + `README.md` vs package-only `register.ts`):

| Layer | Files | Contents |
|---|---|---|
| `interfaces/` | collection, list, map, set, queue | Java-mirror interfaces: `Collection`, `List`, `Set/SortedSet/NavigableSet`, `MapLike/SortedMap/NavigableMap/MultiMap/BiMap`, `Queue/Deque/BlockingQueue/PriorityQueue/AsyncQueue/TransferQueue/DelayQueue` (last three interface-only, no impls) |
| `impl/` | 9 files | `ArrayList`, `LinkedList`, `ArrayDeque` (ring buffer), `HashMap` (chaining, power-of-2 buckets), `LinkedHashMap` (insertion/access order), `HashSet`, `TreeMap` (red-black), `TreeSet`, `PriorityQueue` (binary heap) |
| `behaviors/` | 7 files | Proxy-based middleware: `bounded*`, `evented*`, `readonly`, `safe*` (Option/Result), `synchronized`/`reentrantSynchronized`/`readWriteLock`, `lruMap`+`LRUCache`, `ttlMap`+`TTLCache` |
| `core/` | 5 files | `Middleware`/`compose`/`bundle`, typed `Emitter`/`AsyncEmitter`, `Option`/`Result` effects, policy type vocabulary (overflow/eviction/retry — mostly unimplemented vocabulary), `Eq`/`Hash`/`Compare` traits |
| `async/` | 2 files | `AsyncQueue` (backpressure), Go-style `Channel`/`select`/`timeout`/`ticker`/`pipeline`/`fanOut`/`fanIn`/`merge`/`workerPool` |
| `fx/` | 2 files | Lazy generator ops (`map`/`filter`/`take`/`zip`/…), Java-Stream `Collector`s (`groupingBy`, `counting`, `teeing`, …) |
| `storage/` | 5 files | `CollectionStorage<T>` async interface, `InMemoryStorage`, `ApiStorage` (RPC via `Client`), `HybridStorage` (cache+remote, offline queue) |
| `utils/` | 3 files | `defaultEq/deepEq/defaultHash/defaultCompare` + combinators, Java-style factories (`emptyList`, `singletonList`, `range`, `groupBy`), helpers (unused duplicates of impl-private code) |

### Fork analysis

- **Byte-identical fork.** Every file diffed `SAME` except two: `client-collections/src/index.ts` adds `export * from "./storage/index.js"`, and `storage/api.ts` swaps relative imports of `Client`/`Method` for `@mark1russell7/client`.
- **Timeline (git):** core copy: `9b32dc1 2025-12-05 "initial transfer"` → `0967b82 2025-12-15 "save"` (untouched since). Standalone: `3ea5c52 2025-12-26 "Extract collections framework from client package"` → `2801c22 2025-12-27` README. **The standalone package is the canonical, intended successor; the core copy is a leftover that was never deleted.** Neither has been touched since 2025-12-27 (~6.5 months as of 2026-07-10).
- Because the copies are byte-identical, every bug below exists in both (same line numbers).

### Usage analysis

Who actually imports what (whole-monorepo grep, node_modules/dist excluded):

- **Embedded copy (`client/src/collections`)** — used only by `client` itself:
  - `client/src/client/middleware/cache.ts:10` — `compose, lruMap, ttlMap, hashMap` (the only consumer of the data-structure layer anywhere)
  - `client/src/procedures/storage/{adapter,factory,synced-registry}.ts`, `client/src/procedures/types.ts`, `client/src/server/procedure-server.ts` — `CollectionStorage` + `InMemoryStorage`/`ApiStorage`/`HybridStorage`
  - `client/src/index.ts:11` — re-exports the entire collections API from the package root
- **Standalone (`@mark1russell7/client-collections`)** — exactly one consumer: `client-mongo/src/storage/mongo-storage.ts:9` (type-only: `CollectionStorage`, `StorageMetadata`), plus transitive lockfile entries (server-mongo, bundle-mcp, impl-mcp-dev, MiniMongo). `register.ts` registers no procedures — it's a plain library in a procedure ecosystem.
- **Downstream reach:** MiniMongo enables `createCacheMiddleware` by default (`MiniMongo/src/lib/api/provider.tsx:104-109`), so the lru/ttl/hashMap stack is live in a real app.
- **Everything else is dead:** trees, PriorityQueue, ArrayDeque, LinkedList, HashSet, LinkedHashMap, async queue/channels, fx (iter + collectors), evented/bounded/readonly/safe/synchronized, factories, helpers — zero imports outside the two copies. Telling detail: `client-lib/src/procedures/ecosystem/procedures.ts:85-97` hand-rolls its own 10-line `Collector`/`collect` instead of importing the framework's.
- **Zero test files** across both copies (30k LOC total).

### Health grade: **D**

Clean interface design and organization, but: byte-duplicated 15k LOC, ~85% dead code, zero tests, six certain critical correctness bugs (several structures broken from the constructor), a fantasy README, and the one live consumer (cache middleware) sits on a leaking composition plus a cache-poisoning key generator.

## Bugs

Paths cite the canonical copy `C:\Users\markt\git\client-collections\src\...`; every bug (except #6, #22) exists identically in `C:\Users\markt\git\client\src\collections\...` at the same lines.

**1. ArrayDeque loses ALL elements on growth** — `impl/array-deque.ts:395,410-411` — critical, certain.
```ts
const size = this.size;   // size getter: (tail - head) & mask == 0 when full!
...
this._head = 0;
this._tail = size;        // tail = 0 -> deque now "empty"
```
`grow()` is only called when `_head === _tail` (full), at which moment the `size` getter (line 67) returns 0. Elements are copied into the new array correctly but `_tail = 0` makes them unreachable: inserting a 9th item into the default capacity-8 deque silently empties it. Every deque that ever exceeds initial capacity loses its entire contents.

**2. PriorityQueue is broken from the constructor** — `impl/priority-queue.ts:68,77-79` — critical, certain.
```ts
this._heap = new Array(initialCapacity);  // sparse array, length 11
...
get size(): number { return this._heap.length; }
```
A fresh default `priorityQueue()` reports `size === 11`, `isEmpty === false`; `peek()`/`poll()` return `undefined` (holes at index 0); `offer()` pushes to index 11 and `bubbleUp` immediately stops against `undefined` parents (`defaultCompare(x, undefined)` returns 1). Real elements are buried behind 11 holes. Only `clear()` accidentally repairs it (`_heap = []`).

**3. LinkedHashMap shares one `next` pointer between bucket chain and order list** — `impl/linked-hash-map.ts:225-237, 471-488, 547-559` — critical, certain.
`LinkedNode` has a single `prev/next` pair used both as the hash-bucket chain (`set`, `getNode`, `removeFromBucket`) and as the insertion-order list (`addToEnd`, `entries`). Consequences, all verified by tracing:
- Collision insert: `newNode.next = buckets[i]` (line 230) is immediately overwritten to `null` by `addToEnd` (line 501) → the older colliding entry becomes unreachable to `has`/`get` (lookups walk `node.next`, now the order list).
- `resize()` (547-559): `node.next = this._buckets[index]` then `node = node.next` — first node's `next` becomes `null`, loop exits after ONE entry; the buckets are fresh-empty and the order list is truncated: after growing past the load factor (13th insert at default settings), the map reports `size` 13 but iterates 1 entry.
- `delete()` unlinks the node from the "bucket" (actually the order list) and then again from the order list — cross-corrupting both.
This is the structure the README advertises for LRU caches.

**4. AsyncQueue backpressure drops elements / hangs takers** — `async/async-queue.ts:370-376, 216-221` — critical, certain.
```ts
private fulfillPutter(): void {
  if (this.putters.length > 0 && ...) {
    const putter = this.putters.shift()!;
    ...
    putter.resolve();          // resolves put() — but the element is never enqueued
  }
}
```
`Resolver<void>` stores no element; the waiting producer's element lives only in the `put()` closure and is never added to the buffer when the putter is later fulfilled (every `take`/`tryTake`/`drain`/async-iteration path). `put()` resolves successfully while the element vanishes. The direct-handoff branch in `take()` (216-221) additionally resolves the putter without ever resolving the popped taker — the `take()` promise hangs forever. Any bounded `AsyncQueue` (and therefore any `Channel` whose buffer fills — the entire CSP layer at `async/channels.ts`) silently loses data.

**5. `collect()` ignores accumulator return values → eight collectors always return their seed** — `fx/collectors.ts:57-66` with `counting` (200-206), `summingNumber` (211-219), `minBy` (240-253), `maxBy` (258-271), `reducing` (369-378), `reducingWith` (383-393), `first` (436-442), `last` (447-453) — critical, certain.
```ts
const acc = collector.supplier();
for (const element of iterable) {
  collector.accumulator(acc, element);   // return value discarded
}
```
The `Collector` contract is mutation-based (`accumulator: (acc, element) => void`), but the primitive-accumulator collectors return new values instead of mutating: `counting()` is literally `(count) => count + 1`. `collect(xs, counting())` returns 0 for any input; `groupingByWith(k, counting())` returns all-zero counts; `teeing(summingNumber, counting, ...)` returns `{sum: 0, count: 0}`. Only object/array-accumulator collectors (toList/toSet/toMap/groupingBy/averaging/joining/summarizing) work.

**6. Cache middleware key generator erases nested payload data → cross-request cache poisoning** — `client/src/client/middleware/cache.ts:87` (core only; live in MiniMongo) — critical, certain.
```ts
const payloadKey = JSON.stringify(payload, Object.keys(payload as object).sort());
```
`JSON.stringify` with an *array* replacer filters keys at **every** depth. For mongo-style payloads `{collection: "users", filter: {status: "active"}}` the top-level key list `["collection","filter"]` strips all keys inside `filter` → `{"collection":"users","filter":{}}`. Two calls with different filters share one cache key and the second caller receives the first caller's cached response. Also `Object.keys(payload)` throws `TypeError` for `undefined`/`null` payloads. MiniMongo enables this middleware by default with a 5-minute TTL.

**7. `synchronized()` executes the operation before "locking" — provides zero mutual exclusion** — `behaviors/synchronized.ts:109-120` — high, certain.
```ts
const result = (value as Function).apply(target, args);  // runs immediately, unguarded
if (result instanceof Promise) return mutex.lock(() => result);
return mutex.lockSync(() => result);
```
The mutation has already happened before the mutex is consulted; `lock`/`lockSync` merely sequence delivery of an already-computed result. The doc's "guaranteed to execute in order" claim is false; concurrent async operations interleave exactly as without the wrapper. All four `synchronizedList/Map/Set/Collection` aliases inherit this.

**8. `readWriteLock` double-counts awakened readers → permanent writer starvation; also silently asyncifies the whole API** — `behaviors/synchronized.ts:229-234, 258-262, 300-320` — high, certain.
`releaseWrite` sets `readers = allReaders.length` and resolves them; each awakened `acquireRead` then does `readers++` again → `readers` ends at 2N and never returns to 0, so every later writer waits forever. Independently, every method (including `Symbol.iterator`, `keys`, `entries`, `get`) is wrapped in an `async function` while the type still claims `C` — `for..of` breaks and all reads become promises unannounced.

**9. `select()` and `merge()` orphan losing receivers → consumed-and-dropped values** — `async/channels.ts:148-164, 286-310` — high, certain.
`select` races `receive()` on all cases; losers' takers stay registered in their channels, so the next value on a losing channel resolves an orphaned promise whose result is discarded. `merge` is worse: it calls `it.next()` on **every** iterator per loop iteration and discards all but the race winner each time, abandoning in-flight reads that later swallow values.

**10. `safeDeque.poll()` removes two elements, returns the second** — `behaviors/safe.ts:263-265` — high, certain.
```ts
poll(): Option<T> {
  return next.pollFirst() !== undefined ? Some(next.pollFirst()!) : None;
}
```
The first `pollFirst()` dequeues and discards an element; the second dequeues another and wraps it. One element lost per call (and a deque of exactly one element returns `None` after emptying it).

**11. HashSet `clone`/`intersection`/`isSubsetOf` drop the custom hash function** — `impl/hash-set.ts:200, 238, 303` — high, certain (when a custom hash is in use).
`new HashSet<T>({ eq: this._eq })` propagates `eq` but not `hash` (which HashSet doesn't even retain as a field). With `eq: (a,b) => a.id === b.id` + matching hash, the clone pairs custom eq with `defaultHash` (JSON-based) → eq-equal elements hash to different buckets → the clone can hold duplicates and return false negatives. Poisons `union`, `difference`, `symmetricDifference` (built on `clone`).

**12. lruMap⊕ttlMap composition (the production cache stack) leaks and cross-deletes** — `behaviors/ttl.ts:78-82` + `behaviors/lru.ts:93-112,130-144`, composed at `client/src/client/middleware/cache.ts:137-148` — high, certain mechanics.
ttlMap's background sweep deletes via its captured raw `next.delete(key)`, bypassing the LRU proxy above it, so the LRU node for every expired key survives. On re-`set`, `addNode` overwrites the `nodeMap` entry but leaves the old node in the linked list → orphan nodes accumulate unboundedly in long-running processes (MiniMongo browser sessions). When an orphan for a re-set key reaches the tail, `evictLRU` calls `next.delete(evicted.key)` and deletes the *live* entry while its fresh node remains — cache/list desync compounds.

**13. TreeMap red-black delete never rebalances the common case** — `impl/tree-map.ts:788-790` — medium, certain (invariant/performance, not lookup correctness).
```ts
if (deletedColor === Color.BLACK && child !== null) {
  this.fixAfterDeletion(child);
}
```
Deleting a black node with no children (the standard case — CLRS/Java fix up through the nil sentinel or pre-unlink node) skips fixup entirely, breaking the black-height invariant on every such delete; the tree drifts toward unbalanced, degrading toward O(n). Since a black spliced node with a non-null child implies a red child (loop no-ops), the buggy `fixAfterDeletion` loop body — which also mistreats nil children as non-black (`sibling?.left?.color === Color.BLACK` is false for `undefined`, lines 806-814, 843-851) — is effectively unreachable on valid trees. BST ordering is preserved, so `get`/iteration stay correct.

**14. lruMap/ttlMap don't intercept half of MapLike's surface** — `behaviors/lru.ts:156-222`, `behaviors/ttl.ts:116-167` — medium, certain.
`getOrUndefined`/`getOrDefault` neither refresh LRU recency nor check TTL (expired values are served until the next sweep tick); `setIfAbsent`/`computeIfAbsent`/`compute`/`merge`/`putAll` insert entries with no LRU node / no TTL metadata → they can never be evicted or expire, and `evictLRU` returns early on empty tail while `target.size >= capacity`, so capacity is silently unbounded on those paths.

**15. LRU/TTL trackers use native `Map` keys while the base map may use custom `keyEq`/`keyHash`** — `behaviors/lru.ts:62`, `behaviors/ttl.ts:65` — medium, likely.
Two eq-equal-but-not-identical keys create two tracker nodes for one map entry; eviction/expiry of one deletes the shared entry while a stale tracker survives.

**16. `readonly` wrapper doesn't block `setIfAbsent` — and the shared empty singletons are therefore mutable globals** — `behaviors/readonly.ts:36-83` + `utils/factories.ts:30-67` — medium, certain.
`MUTATING_METHODS` omits `setIfAbsent`, so `emptyMap().setIfAbsent(k, v)` mutates the process-wide singleton returned to every subsequent `emptyMap()` caller (same for the map behind `immutableMapOf()` with 0 entries).

**17. Unmanaged `setInterval`s** — `behaviors/ttl.ts:97,396`, `client/src/client/middleware/cache.ts:159` — medium, certain.
`ttlMap` starts an interval per wrap at wrap time, never `unref()`d; `cache.ts` never calls `dispose()` (and the stats interval is explicitly never cleared, per its own comment). In Node CLIs this pins the event loop; per-client caches leak one timer each.

**18. TreeSet set operations use reference equality, ignoring its own comparator** — `impl/tree-set.ts:162-176, 198-236, 261-273` — medium, certain.
`retainAll`/`intersection`/`difference`/`isSubsetOf` build a native `Set` and use `.has()` (SameValueZero), so object elements that the TreeSet itself considers equal (via `compare`) are treated as distinct — inconsistent with HashSet, which loops with `_eq`.

**19. HybridStorage never reads through to remote, races its own init, and replays succeeded ops** — `storage/hybrid.ts:178-188, 159-164, 367-386` — medium, certain.
`get()` on a local miss returns `undefined` without consulting `remote` — the "L1 cache" diagram in the README is a write-only mirror; any key created remotely after init is invisible. `syncOnInit` is fire-and-forget in the constructor, so early reads race the initial sync. `syncToRemote` on mid-batch failure re-queues **all** of `opsToSync`, re-executing operations that already succeeded (including `clear`).

**20. "Unbuffered" channels have capacity 1** — `async/channels.ts:35-37` — medium, certain.
`new Channel(0)` → `asyncQueue({ capacity: bufferSize || 1 })`. `unbuffered()`'s documented rendezvous semantics ("Sends block until receiver is ready") are false: the first `send` completes immediately; the second blocks and then hits bug #4.

**21. Hash map iteration during mutation yields wrong results with no fail-fast** — `impl/hash-map.ts:418-454, 478-500` — medium, likely.
Generators iterate live `_buckets` and follow `node.next`; a `set` that triggers `resize()` mid-iteration rewires every node's `next` into the new bucket array while the iterator continues over the old array → skipped/duplicated entries. No modCount/ConcurrentModificationException analog anywhere in the library.

**22. `summarizingNumber` treats 0 as "missing"** — `fx/collectors.ts:480-481` — medium, certain.
`stats.min = Math.min(stats.min || Infinity, value)`: once the true min is `0`, the next accumulate resets the floor to `Infinity` and min drifts to the last-seen value; symmetric for `max`.

**23. HashMap stores `undefined` values but then denies them** — `impl/hash-map.ts:147-153, 155-168, 225-232` — low, certain.
`set(k, undefined)` increments size and `has(k)` is true, but `get(k)` throws "Key not found", `getOrDefault` returns the default, and `setIfAbsent`/`computeIfAbsent` treat the key as absent. No documented prohibition (unlike Java's null rejection).

**24. eventedDeque emits `removeLast` for `pop()`, which removes the FIRST element** — `behaviors/evented.ts:329-338` vs `interfaces/queue.ts:171-178` ("pop… Equivalent to removeFirst()") — low, certain.

**25. `reentrantSynchronized` reentrancy can never trigger** — `behaviors/synchronized.ts:169-182` — low, certain.
`const callerId = Symbol("caller")` is freshly created per call, so `lockHolder === callerId` is always false; the advertised reentrancy is dead code (a genuinely nested proxied call would deadlock on the queue mutex).

**26. ArrayDeque.remove()'s "closer to head" optimization is a constant 0** — `impl/array-deque.ts:269-272` — low, certain.
```ts
const isCloserToHead =
  (index - this._head) &
  (this._elements.length - 1 < this._tail - index ? 1 : 0) &
  (this._elements.length - 1);
```
The ternary condition (`capacity-1 < tail-index`) is unsatisfiable, so the expression is always `X & 0 & mask = 0`; the head-shift branch is unreachable. Removal happens to work via the tail-shift branch (traced through wrapped cases), so this is dead/misleading logic rather than data corruption.

**27. `HashSet.intersection`/`symmetricDifference` re-iterate `other` per element** — `impl/hash-set.ts:199-231` — low-medium, likely.
A one-shot iterable (generator) is exhausted after the first outer element → silently wrong (usually empty) results; also O(n·m).

## Architecture flaws

1. **The duplication story.** The framework was written inside `client` (Dec 5-15), extracted verbatim into `client-collections` on Dec 26 — and the extraction was never finished: the embedded copy was left behind, `client` was never repointed at the package, and both copies have been frozen since. Any future fix must now be applied twice or the copies silently diverge (they already have, trivially, in `storage/api.ts`).
2. **Core package namespace pollution.** `client/src/index.ts:11` re-exports the entire ~200-symbol collections API from the RPC client's root, and lines 15-16 admit the fallout: "middleware has naming conflicts with collections — Import client middleware explicitly." The collections framework's presence in core actively degraded the core package's own API.
3. **Split-brain types across the seam.** `client-mongo` implements `CollectionStorage` from `@mark1russell7/client-collections` while `client`'s `procedure-server.ts`/storage factory consume the embedded copy's `CollectionStorage`. It works today only because the files are byte-identical and TS is structural; one divergent edit breaks server-side storage plugins invisibly.
4. **Circular-ish dependency in the extracted package.** `client-collections/storage/api.ts` imports `@mark1russell7/client` (peer), while `client` needs `client-collections` (currently satisfied by the embedded copy). Completing the extraction as-is creates a client ↔ client-collections peer cycle; storage's `ApiStorage`/`HybridStorage` are the only reason.
5. **~85% dead code, 0 tests.** Only `hashMap` + `lruMap`/`ttlMap`/`compose` (cache middleware) and the storage layer are consumed. Trees, PQ, deque, linked list, hash set, linked hash map, async queue/channels, fx, evented/bounded/readonly/safe/synchronized, factories, helpers have zero external consumers — and the untested majority is precisely where the born-broken structures live (PriorityQueue, LinkedHashMap, collectors, ArrayDeque growth have plainly never been executed). `examples.ts` is imported by nothing; `utils/helpers.ts` duplicates impl-private bounds checks and ships a *second, different* string hash (`stringHashCode`, Java algorithm) alongside `defaults.hashString` (djb2), both exported. `client-lib` re-implements the collector pattern locally rather than import the framework — the ecosystem itself routes around this code.
6. **Behavior layer is proxy-per-method-name string matching.** Each behavior hardcodes a method-name switch, so every MapLike extension (`setIfAbsent`, `computeIfAbsent`, `getOrUndefined`…) that isn't in the switch silently bypasses the behavior (bugs #12, #14, #16). The pattern guarantees drift between interfaces and wrappers.

## Doc drift

- **`client-collections/README.md` documents an API that does not exist** (written Dec 27, day after extraction): `withBounded/withLRU/withTTL/withEvented/withSynchronized` (actual: `boundedList`/`lruMap`/`ttlMap`/`eventedList`/`synchronized` + `compose`); `MemoryStorage` (actual `InMemoryStorage`); `HybridStorage({ local, remote, syncStrategy, conflictResolver })` (actual `(remote, {writeStrategy, conflictResolution, mergeFn})`, no injectable local, "write-back" not "write-behind"); `ApiStorage(client, { collection, endpoints })` (actual `{ service, operations }`); `new PriorityQueue(comparator)` (class takes an options object); `AsyncQueue.enqueue/dequeue` (actual `put/take`); a fluent `iter([...]).filter().map().collect()` chain (no fluent API exists); `collect(users, toMap(u => u.id))` (collectors' `toMap` requires two extractors), `groupBy`/`partition` collectors (actual `groupingBy`/`partitioningBy`); evented `(item, index) =>` two-arg listeners and an "evict" event (payload is a single object; no evict event).
- **Core `README.md` is closer but still wrong where it matters:** `hashSet(1, 2, 3, 4)` / `arrayList(1, 2, 3)` varargs (factories take one options-or-iterable arg; a number as first arg makes `Symbol.iterator in 1` throw TypeError); `linkedList.add(1, 'b')`, `getFirst()`/`getLast()` (don't exist); `list.safe.add(40)` (safe has no `add`); `workerPool(..., { concurrency: 10 })` (actual option is `workers` — `concurrency` yields **zero** workers and a never-closing results channel); `comparing(t => t.priority, reversed())` (`reversed` requires a comparator argument); `MapLike` documented as `Iterable<[K, V]>` (actually iterates `Entry {key, value}` objects); "Contributing: Comprehensive tests" — there are no tests.
- **Interface docs vs implementations:** `SortedMap.headMap/tailMap/subMap` and `descendingMap` documented as "views" (`interfaces/map.ts:219-231, 301-303`) but implementations return detached copies; `synchronized()`'s "guaranteed to execute in order" example is false (bug #7); `unbuffered()`'s rendezvous doc is false (bug #20); `fx/iter.ts:8-15` header example uses a curried `map(x => x * 2)` style the module doesn't support.

## Roadmap candidates

1. **Declare `@mark1russell7/client-collections` canonical and delete `client/src/collections/`** (P0). It's the newer copy, the extraction commit states the intent, it's in the ecosystem manifest, and client-mongo already depends on it. Migration path for `client`: replace `../../collections/...` imports in `client/middleware/cache.ts` and `procedures/storage/*`/`server/procedure-server.ts` with the package, and stop re-exporting collections from `client`'s root (fixes the admitted naming-conflict wart; keep a temporary deep re-export if MiniMongo relies on root exports).
2. **Break the dependency cycle by splitting storage from structures** (P0, prerequisite for #1). Keep `CollectionStorage` + `InMemoryStorage` (client-free) in client-collections; move `ApiStorage`/`HybridStorage` (which need `Client`) into `client` itself — they are RPC concerns, not data structures. This also fixes the client-mongo type-identity seam: everyone imports the interface from one client-free module.
3. **Fix the two live production bugs immediately, independent of consolidation** (P0): cache key generator (#6 — use a stable stringify, never the array-replacer form) and the lru/ttl orphan-node leak (#12 — either make ttlMap route expiry through the outer stack or replace the composed stack with the simpler, correct standalone `LRUCache`/`TTLCache` classes, which this audit found clean).
4. **Cut scope before fixing dead code** (P1). Retain only what is used or plausibly next: `HashMap`, `ArrayList`, `LRUCache`/`TTLCache`, `compose`, effects, storage interface. Delete or quarantine (separate `experimental/` entry point) the demonstrably never-run modules — PriorityQueue, LinkedHashMap, ArrayDeque, TreeMap/TreeSet, async queue/channels, collectors, synchronized/readWriteLock — rather than fixing 6 critical bugs in code with zero consumers. If any are kept, bugs #1-#5, #7-#11 are the fix list, and a small property-test suite (add/remove/iterate invariants, LRU/TTL eviction order) is non-negotiable given the born-broken track record.
5. **Rewrite `client-collections/README.md` from the actual exports** (P1) — it currently documents a different library; the core README's `workerPool({concurrency})` and varargs-factory examples are user-facing traps.
6. **Should collections live in core? No.** The only core needs are (a) one bounded cache for the middleware and (b) the storage abstraction. (a) is ~150 lines (`LRUCache`+TTL stamp) or an external dep; (b) is an interface. A 15k-LOC Java-collections clone inside an RPC client inflated the core API surface, caused the export conflicts, and none of its ambition (channels, RB trees, stream collectors) is used by the procedure ecosystem. The extraction instinct was right — it just needs to be finished, and the extracted package needs to shrink to its load-bearing 15%.
