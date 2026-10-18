---
"@procedures/lib": patch
---

New: the procedure `lib.importCycles` and the functions `importCycles` and `importGraph` (Graph's split, wave 2, W7). They give the import cycles of a tree of TypeScript sources: the cycles at runtime (after the import elision of TypeScript, with the injection tokens of Angular as an option), the cycles of the declared imports, or the cycles of each import. `findCycles` keeps its own stack, so a long chain does not overflow the call stack.
