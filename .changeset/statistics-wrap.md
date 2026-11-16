---
"@procedures/statistics": patch
---

The new package `@procedures/statistics` gives the functions of `@mark1russell7/rigor-statistics` as procedures. It is the first wrap package of direction 40. Its procedures come from the types of the library, not from code written by hand.

- The package has 74 procedures in the namespace `statistics`, for 74 of the 82 functions of `@mark1russell7/rigor-statistics` 0.1.29. Each procedure has no effects.
- The manifest gives each of the other 8 functions with its reason: 7 have a function parameter, and 1 takes an `Iterable`.
- The new check `node scripts/wraps.ts check` runs in CI. It fails when the manifest of a wrap package is not current, or when the share of the functions with a procedure falls below the ratchet in `wraps.coverage.json`.

PATCH: before 1.0.0, a new package raises PATCH. No other package changes its exports.
