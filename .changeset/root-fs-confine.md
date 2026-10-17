---
"@procedures/fs": patch
---

`confineToRoot(registry, root)` confines each procedure of a registry to a root (roadmap R33). The `fs.*` procedures get the handlers of `createFsModule({ root })`. Each other procedure gets the decision of `rootDecisionOf()`: the root examines the path inputs of its `metadata.fsRoot`, or it refuses the procedure with `FORBIDDEN` and the reason `outside-root`. A procedure without rules is refused when its effects are not known, name `fs`, or write `process`.

The new entry `@procedures/fs/root` has the rules of the root without the procedures. `inRoot()` takes an optional base folder, and `resolveRoot()` an optional name for its error. `confineFsProcedures()` does not change.
