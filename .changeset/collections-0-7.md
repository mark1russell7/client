---
"@procedures/collections": minor
"@procedures/dag": minor
"@procedures/client": minor
---

The packages use `@mark1russell7/collections` 0.7.0 in place of 0.5.0 (roadmap CLI-113). MINOR: before 1.0.0 a breaking change raises MINOR.

`@procedures/collections` removes 31 re-exports, because `@mark1russell7/collections` 0.7.0 removes them. The table gives the import that replaces each name:

| Removed name | Its replacement |
| --- | --- |
| `AsyncOption` | no replacement |
| `AsyncResult` | no replacement |
| `Err` | `err` from `@mark1russell7/optional` |
| `None` | `none` from `@mark1russell7/optional` |
| `Ok` | `ok` from `@mark1russell7/optional` |
| `Option` | the type `Optional` from `@mark1russell7/optional` |
| `Result` | the type `Result` from `@mark1russell7/optional` |
| `Some` | `some` from `@mark1russell7/optional` |
| `flatMapOption` | `flatMap` from `@mark1russell7/optional` |
| `flatMapResult` | `flatMapResult` from `@mark1russell7/optional` |
| `fromNullable` | `fromNullable` from `@mark1russell7/optional` |
| `getOrElse` | `getOr` from `@mark1russell7/optional` |
| `getOrElseResult` | `getOkOr` from `@mark1russell7/optional` |
| `isErr` | `isErr` from `@mark1russell7/optional` |
| `isNone` | `isNone` from `@mark1russell7/optional` |
| `isOk` | `isOk` from `@mark1russell7/optional` |
| `isSome` | `isSome` from `@mark1russell7/optional` |
| `mapAsyncOption` | no replacement |
| `mapAsyncResult` | no replacement |
| `mapError` | `mapErr` from `@mark1russell7/optional` |
| `mapOption` | `map` from `@mark1russell7/optional` |
| `mapResult` | `mapResult` from `@mark1russell7/optional` |
| `optionToResult` | `fromOptional` from `@mark1russell7/optional` |
| `resultToOption` | `toOptional` from `@mark1russell7/optional` |
| `sequence` | no replacement |
| `sequenceResults` | no replacement |
| `toNullable` | `unwrap` from `@mark1russell7/optional` |
| `tryCatch` | `tryCatch` from `@mark1russell7/optional` |
| `tryCatchAsync` | `tryCatchAsync` from `@mark1russell7/optional` |
| `unwrap` | no replacement. The `unwrap` of `@mark1russell7/optional` gives `undefined` for `none`, and it does not throw. |
| `unwrapResult` | no replacement |

The values of the safe middleware change shape. A present value is `{ tag: "some", value }`, and an absent value is `{ tag: "none" }`. The field `_tag` is gone.

`dag.traverse` with `continueOnError` changes its behavior. The visit of a package whose dependency failed does not start. Its result has `skipped: true` and a `reason` that names the dependency. Before, the traversal visited such a package.

`hashMap.get` gives the value of a key whose value is `undefined`. Before, it threw "Key not found".

Steps for the site and each app:

1. Search the code for the removed names in imports of `@procedures/collections`.
2. Import each replacement from `@mark1russell7/optional`, and add `"@mark1russell7/optional": "^1.2.0"` to `dependencies`.
3. Replace each read of `_tag` with a read of `tag`.
4. If a `dag.traverse` caller with `continueOnError` reads `visited` or `skipped`, expect the dependents of a failed package in `skipped`.
5. A caller of `executeDAG` from `@procedures/dag` that needs the old behavior gives `skipDependents: false`.
