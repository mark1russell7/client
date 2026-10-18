# @procedures/access

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
