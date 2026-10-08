# @mark1russell7/client-collections

The map, cache and collection-storage building blocks of the client ecosystem.

## Contents

| Module | What it gives |
| --- | --- |
| `impl/hash-map` | `HashMap` and `hashMap()`, a map with pluggable equality and hashing |
| `behaviors/lru` | `lruMap()` (a map behavior that evicts the least recently used entry), `LRUCache`, `lruCache()` |
| `behaviors/ttl` | `ttlMap()` (a map behavior that expires entries), `TTLCache`, `ttlCache()`, `ttlCollection()` |
| `core/middleware` | `compose()` and `bundle()` to stack behaviors |
| `interfaces/collection`, `interfaces/map` | `Collection`, `MapLike` and the other map interfaces |
| `storage/` | `CollectionStorage` (the storage interface) and `InMemoryStorage` |
| `core/traits`, `utils/defaults` | Equality, hashing and comparison defaults |

The storage backends that need an RPC client (`ApiStorage`, `HybridStorage`) are in `@mark1russell7/client`. Import them from `@mark1russell7/client/collections`, which also re-exports this package.

## Example

The client cache middleware builds its cache like this:

```typescript
import { compose, hashMap, lruMap, ttlMap } from "@mark1russell7/client-collections";

const cache = compose(
  lruMap<string, Response>({ capacity: 100 }),
  ttlMap<string, Response>({ ttl: 60_000 }),
)(hashMap<string, Response>());
```

## History

Until October 2026 this package was a large collections framework (lists, sets, queues, trees, channels, stream collectors). Nothing in the ecosystem used those parts, and several of them had known defects (BUGS-2026-07 C8–C12). They were deleted. The full code is in the history of this repository.
