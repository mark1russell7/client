---
"@procedures/collections": patch
---

The entry `@procedures/collections/testing` marks `ContractViolation` and `deepEqual` as deprecated. A later MINOR removes them, and the checks of the contract suite then throw the `AssertionError` of `node:assert`. The suite then uses `node:assert` and `rejects` of `@mark1russell7/rigor-testkit`, and it does not import `@mark1russell7/collections/testing`.

Migration: replace `deepEqual(a, b)` with `isDeepStrictEqual(a, b)` of `node:util`. That function also compares the prototypes. A test that expects a `ContractViolation` from the suite expects an `AssertionError` or an `Error`.

PATCH: the exports and the behavior do not change in this version.
