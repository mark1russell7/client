---
"@procedures/procedure": patch
---

`procedure.new` puts the procedure into the list that `defineModule` gets: an array literal, a variable of `module.ts`, or a spread of such a variable. Before, a variable list sent the procedure into `registerModules(registry, [...])`. When the list comes from another file or a function, `procedure.new` fails with the reason and writes nothing.
