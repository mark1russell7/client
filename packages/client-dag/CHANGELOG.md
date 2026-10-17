# @procedures/dag

## 0.5.0

### Minor Changes

- 01e5b1f: `dag.traverse` reports the packages that it did not visit. A failed visit stops the traversal after its level when `continueOnError` is false. Before, the output did not list the packages of the later levels.
  
  - Each package without a visit has a result with `skipped: true`, `success: false`, `duration: 0` and a `reason`. These results come after the results of the visits, in dependency order.
  - The output has the new count `skipped`. `failed` counts only the visits that failed.
  - The loop that "ensured a result for each node" is removed. It could not add a result, because each visit records its own result.

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0

## 0.4.0

### Minor Changes

- 2fd2398: `dag.traverse` moved from `@procedures/lib` to `@procedures/dag`. Its name, input, output and effects stay the same. In this version, `@procedures/dag` has a `./module` entry, a `./register` entry and the `client.procedures` field, and it depends on `@procedures/client` and `zod`. The graph algorithms of its root do not change.
  
  `dag.traverse` gets the packages from `lib.scan` through `ctx.client` (`calls: ["lib.scan"]`). `@procedures/lib` depends on `@procedures/dag`, so the module of `@procedures/dag` does not list the module of `@procedures/lib` as a dependency: a host registers the two modules. `bundle-dev`, `bundle-mcp` and `mark` do. The module of `@procedures/lib` does not register `dag.traverse` any more.
  
  `DagTraverseInputSchema`, `DagTraverseInput`, `DagTraverseOutput` and `TraverseNodeResult` are exports of `@procedures/dag`, not of `@procedures/lib`.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0

## 0.3.0

No changes in this release.

## 0.2.3

No changes in this release.

## 0.2.2

No changes in this release.

## 0.2.1

No changes in this release.

## 0.2.0

No changes in this release.

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
