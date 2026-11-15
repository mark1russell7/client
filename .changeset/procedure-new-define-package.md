---
"@procedures/procedure": patch
---

`procedure.new` adds the procedure to the list of `definePackage()`. Before, it refused each module of `definePackage()`, with the error "the file has no defineModule, registerProcedures or registerAll call".

`procedure.new` also adds the procedure to an array literal with a method call, for example `[...].map(underARoot)` of the git and pnpm packages. The method gets the new procedure as each other item.

PATCH: a fix of `procedure.new`.
