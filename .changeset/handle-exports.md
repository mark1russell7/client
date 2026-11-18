---
"@procedures/client": patch
"@procedures/compiler": patch
---

Handles in the exports generator (d40-handles). A parameter or an output of a class type gets a handle. Its schema has the keyword `x-procedures-handle` with the kind of the class, for example `node:sqlite#DatabaseSync`. The loader keeps the object of an output in the handle scope of the caller. It gets the object of a handle input from the same scope. A procedure that takes a handle reads `handles`, and a procedure that gives a handle writes `handles`. Thus a function that was exempt because of a class instance gets a procedure. `closeValue` of `@procedures/client` closes an object as a scope closes it.
