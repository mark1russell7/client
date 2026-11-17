---
"@procedures/compiler": patch
"@procedures/generators": patch
---

A parameter that is not JSON can now get a constructed input: a pure function of the package makes its value from JSON before each call.

- The generator of `@procedures/compiler` finds the factory of the type of a parameter. A factory is a pure export with one signature that gives an object. The schema of the parameter is the input of the factory, with the new keyword `x-procedures-construct`.
- When more than one factory gives a type, the new field `constructors` of the overlay names one. Without it, the function stays exempt, and the detail names the factories.
- The loader `exportsModule()` makes a new value with the factory before each call. It throws when the package does not export the factory.
- The new exports `CONSTRUCT_KEYWORD` and `ExportsConstruct` give the keyword and its value.
- Fix: a function parameter whose result is a function now gets the exemption `function-parameter`. Before, its sub-program gave JSON where the package expected a function.
- `@procedures/generators` now has 23 procedures, for 23 of the 31 functions of `@mark1russell7/rigor-generators`. Six designs take a `Random` as the input of `random`, for example `{ "seed": 7 }`.
- The new program `latin-hypercube-from-a-label` of `wraps.programs.json` uses a constructed input.

PATCH: before 1.0.0, a backward-compatible feature and a fix raise PATCH. The new overlay field is optional, and the old manifests load without a change.
