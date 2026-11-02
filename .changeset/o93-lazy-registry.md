---
"@procedures/client": patch
"@procedures/mark": patch
"@procedures/llm": patch
---

A call of `mark` loads only the packages of its path (roadmap O93). `ProcedureRegistry` gets an optional resolver, `resolve(path)` and `loadAll()`. `createLazyRegistry()` makes a registry that loads a package at the first lookup of one of its paths. A procedure that reads or writes the registry gets each package first. The manifest of `mark` (version 3) has the packages of each command. The packages `ws` and `cli-table3` load at their first use. The sync methods of the registry and the eager registries do not change.
