---
"@procedures/collections": minor
"@procedures/dag": minor
"@procedures/client": minor
---

The packages use `@mark1russell7/collections` 0.7.0 in place of 0.5.0 (roadmap CLI-113). MINOR: before 1.0.0 a breaking change raises MINOR.

`@procedures/collections` removes 31 re-exports, because `@mark1russell7/collections` 0.7.0 removes them. Import their replacements from `@mark1russell7/optional` 1.2.0:

| Removed | Replacement |
| --- | --- |
| `Option`, `Some(v)`, `None` | `Optional`, `some(v)`, `none` |
| `Ok(v)`, `Err(e)`, `Result` | `ok(v)`, `err(e)`, `Result` |
| `isSome`, `isNone`, `isOk`, `isErr` | the same names |
| `getOrElse`, `getOrElseResult` | `getOr`, `getOkOr` |
| `mapOption`, `flatMapOption`, `mapError` | `map`, `flatMap`, `mapErr` |
| `mapResult`, `flatMapResult`, `tryCatch`, `tryCatchAsync` | the same names |
| `optionToResult`, `resultToOption` | `fromOptional`, `toOptional` |
| `toNullable`, `fromNullable` | `unwrap`, `fromNullable` |
| `unwrap`, `unwrapResult` | no replacement. The `unwrap` of `@mark1russell7/optional` gives `undefined` for `none`, and it does not throw. |
| `sequence`, `sequenceResults`, `AsyncOption`, `AsyncResult`, `mapAsyncOption`, `mapAsyncResult` | no replacement |

The values of the safe middleware change shape. A present value is `{ tag: "some", value }`, and an absent value is `{ tag: "none" }`. The field `_tag` is gone.

`dag.traverse` with `continueOnError` changes its behavior. The visit of a package whose dependency failed does not start. Its result has `skipped: true` and a `reason` that names the dependency. Before, the traversal visited such a package.

`hashMap.get` gives the value of a key whose value is `undefined`. Before, it threw "Key not found".

Steps for the site and each app:

1. Search the code for the removed names in imports of `@procedures/collections`.
2. Import each replacement from `@mark1russell7/optional`, and add `"@mark1russell7/optional": "^1.2.0"` to `dependencies`.
3. Replace each read of `_tag` with a read of `tag`.
4. If a `dag.traverse` caller with `continueOnError` reads `visited` or `skipped`, expect the dependents of a failed package in `skipped`.
