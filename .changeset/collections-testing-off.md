---
"@procedures/collections": minor
---

The entry `@procedures/collections/testing` removes `ContractViolation` and `deepEqual`. A check of the contract suite that fails throws the `AssertionError` of `node:assert`. The suite does not import `@mark1russell7/collections/testing`.

The suite uses `rejects` of `@mark1russell7/rigor-testkit`. That package is an optional peer dependency of `@procedures/collections`. The runtime entries do not use it.

Migration for each package that starts the suite in its tests:

1. Add `@mark1russell7/rigor-testkit` `^0.1.4` to `devDependencies`.
2. Replace `deepEqual(a, b)` with `isDeepStrictEqual(a, b)` of `node:util`. That function also compares the prototypes.
3. A test that expects a `ContractViolation` from the suite expects the `AssertionError` of `node:assert`. A check that a promise rejects throws an `Error`.

MINOR: a breaking change before 1.0.0. It removes two exports of the entry `./testing`.
