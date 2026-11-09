---
"@procedures/collections": minor
"@procedures/dag": minor
"@procedures/client": patch
---

`@procedures/collections` uses `@mark1russell7/collections` 0.10, and its root removes the 121 names that version 0.10 does not export (roadmap CLI-131). The last release marked each of these names as `@deprecated`, with its replacement. MINOR: before 1.0.0 a removed export raises MINOR.

Migration steps for the site and each app:

1. Import `Optional`, `Result` and their functions from `@mark1russell7/optional`. The table gives the new names.

   | Old name | New name |
   | --- | --- |
   | `Option` | `Optional` |
   | `Some` | `some` |
   | `None` | `none` |
   | `Ok` | `ok` |
   | `Err` | `err` |
   | `getOrElse` | `getOr` |
   | `getOrElseResult` | `getOkOr` |
   | `mapOption` | `map` |
   | `flatMapOption` | `flatMap` |
   | `mapError` | `mapErr` |
   | `optionToResult` | `fromOptional` |
   | `resultToOption` | `toOptional` |
   | `toNullable` | `unwrap` |

2. Read the values of the safe middleware (`safeList`, `safeQueue`, `safeDeque` and `safeMap`) with the field `tag`, not `_tag`. A present value is `{ tag: "some", value }`. An absent value is `{ tag: "none" }`.
3. Import the 13 channel names (`Channel`, `select`, `timeout`, `ticker`, `pipeline`, `fanOut`, `fanIn`, `merge`, `buffered`, `unbuffered`, `channel`, `workerPool` and the type `SelectCase`) from `@mark1russell7/service/channel`.
4. Use the retries of `@mark1russell7/service` in place of the retry names of collections.
5. Change the second names to the names of the table. Do not nest the locked uses of `synchronized`.

   | Old name | New name |
   | --- | --- |
   | `unmodifiableList` | `readonlyList` |
   | `unmodifiableMap` | `readonlyMap` |
   | `unmodifiableCollection` | `readonlyCollection` |
   | `mutableListOf` | `listOf` |
   | `mutableMapOf` | `mapOf` |
   | `safe` | `safeList`, `safeQueue`, `safeDeque` or `safeMap` |
   | `reentrantSynchronized` | `synchronized` |

6. The other removed names have no replacement. The `@deprecated` tag of the last release names each of them.

These behaviors of the re-exported names change:

- `defaultCompare` orders values of different types by type first. A sort of values of mixed types gives a different order. `1` and `"1"` are not equal.
- `range` gives `start + i * step` at index `i`. So `range(0, 1, 0.1)` gives 10 numbers, not 11. A value that is not finite, or a `step` of 0, throws a `RangeError`.
- `nCopies` throws a `RangeError` when `n` is not a safe integer of 0 or more.
- A full `boundedList` with `drop-oldest` drops the last element at `insert(0, x)`, as `unshift(x)` does.
- A full `boundedDeque` with `drop-oldest` drops the last element at `addFirst`.
- An expired entry of `ttlMap` is not in `size`, `getOrUndefined` or the iteration.
- An evented layer gives no event for an element that a layer below refused.

`@procedures/dag` and `@procedures/client` use the range `^0.10.0` too. Their exports do not change. The `executeDAG` of `@procedures/dag` changes:

- With `failFast: false`, `executeDAG` does not start a node whose dependency failed. The node gets a skipped result, and `DAGResult.skippedNodes` has its id. To start each node, as before, give the option `skipDependents: false`.
- `dag.traverse` with `continueOnError` gives this option, so it visits each package, as before.
