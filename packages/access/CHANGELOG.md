# @procedures/access

## 0.27.0

### Patch Changes

- Updated dependencies [7eac8b5]
  - @procedures/client@0.27.0

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [2735505]
  - @procedures/client@0.24.1

## 0.24.0

### Patch Changes

- @procedures/client@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1

## 0.22.0

### Patch Changes

- @procedures/client@0.22.0

## 0.21.0

### Patch Changes

- @procedures/client@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0

## 0.17.4

### Patch Changes

- @procedures/client@0.17.4

## 0.17.3

### Patch Changes

- @procedures/client@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1

## 0.17.0

### Patch Changes

- @procedures/client@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0

## 0.14.1

### Patch Changes

- dc7a462: New: the rules of the rows of a served collection (roadmap CLI-41). Before, the collection procedures checked only the partition of a call. A right that depends on the document, for example a `when` condition of an access list, had no place in a read or a write. The new option `admission` of `createCollectionProcedures()` gives two rules. `admit` examines each row `{ id, value }` of each read, and it has the shape of `AdmitItem`. `guard` examines each write `{ op, id, doc, prev }` before the storage changes, and a refused write gets `FORBIDDEN` with the reason `write-not-allowed`. The procedures apply the two rules in one place, the view of the storage of each call (`admittedStorage()`). A refused row is absent from `get`, `has`, `getAll`, `entries`, `ids`, `size`, `getBatch`, `find` and `changes`, and a delta of `changes` puts its id in `deleted`. The change events with values apply `admit` for each subscriber. The context of a call has its invocation (`ctx.invocation`). `@procedures/access` gets `accessWriteGuard()`, and `accessAdmitItem()` gets the option `docOf`. Without the option `admission`, nothing changes.
- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
  - @procedures/client@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0

## 0.12.2

### Patch Changes

- @procedures/client@0.12.2

## 0.12.1

### Patch Changes

- 0529a1b: New package `@procedures/access`: the rights of a principal on a scope. An access list has an owner and entries for `user:`, `email:`, `group:`, `signed-in` and `anyone`. The rights imply other rights, and a `when` condition over the document of a check needs an evaluator of the app.
  
  The rules of the app are a policy: the implicit rights, the parent of a scope, the fallback, more principal names and the superuser. `subjectOf` reads `ctx.principal`, and `accessAdmitItem` gives the output filter of a host. The code comes from the server of Graph (its split plan, part P1).
- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1
