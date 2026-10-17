---
"@procedures/client": patch
---

A procedure can declare its rules under a root of the files in `metadata.fsRoot` (the new type `FsRootRules`): the inputs that name a path, or the reason that a root cannot confine it. A handler gets `ctx.caller`, the procedure whose handler made the nested call. The framework sets it from the invocation, so an input cannot change it (roadmap R33).
