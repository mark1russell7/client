---
"@procedures/collections": patch
---

The root of `@procedures/collections` marks 121 names as deprecated. Versions 0.7.0 to 0.10.0 of `@mark1russell7/collections` remove these names, and a later MINOR of `@procedures/collections` removes them too. The tag of each name gives its replacement:

- `Option`, `Result` and their functions: the names of `@mark1russell7/optional`. For example, `getOrElse` becomes `getOr`, and `mapOption` becomes `map`.
- The 13 channel names, from `Channel` to `workerPool`: the same names of `@mark1russell7/service/channel`.
- The second names: `readonlyList`, `readonlyMap`, `readonlyCollection`, `listOf` and `mapOf`. Use `synchronized` in place of `reentrantSynchronized`.
- The other names have no replacement.
