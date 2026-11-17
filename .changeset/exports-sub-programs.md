---
"@procedures/compiler": patch
"@procedures/statistics": patch
---

A function parameter of a wrapped package is a sub-program (d40-language-ops). A sub-program is one call of a pure procedure, as data. It reads the parameters of the function as `{ "$ref": "<name>" }`. In a program, `"$when": "$never"` keeps it as data.

- The generator gives the position a schema with the keyword `x-procedures-program` (`PROGRAM_KEYWORD`). The keyword gives the names and the schemas of the parameters, and the schema of the result (`ExportsProgram`).
- The loader compiles the call into a function that gives its value at once. The function uses only operators: the pure procedures of exports manifests that give no promise.
- The loader finds each operator in the registry of the caller and obeys its `expose` rule. It examines the input of each operator and the result with their schemas.
- A function that a sub-program cannot give stays exempt with the reason `function-parameter`. A function in an output gives the reason `output-not-json`.
- A trailing absent argument before a rest parameter stays in its position. Before, the rest moved into the absent parameters.
- `@procedures/statistics` has 81 procedures, not 74. The statistic of `bootstrap`, `bootstrapClusters`, `bootstrapStrata`, `bootstrapTwo`, `pairedPermutation` and `twoSamplePermutation` is a sub-program. So are the cluster of `bootstrapClusters` and the option `information` of `choosePair`.
