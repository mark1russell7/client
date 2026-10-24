---
"@procedures/client": patch
---

Added: the envelope form of a program (coeval, decisions D6, D9 and D10, roadmap item M7). A call is `{ "type": ["client", "add"], "value": input }`, and a reference is `{ "type": "ref", "value": ["names", "sum"] }`. The `$proc` form does not change.

- `fromEnvelopeProgram()` changes a program in the envelope form into the `$proc` form. `toEnvelopeProgram()` changes a `$proc` program into the envelope form. `isEnvelopeProgram()` tells which form a value has.
- `client.exec()` and `client.execStream()` accept a program in the envelope form at the root. `client.exec(program, input)` puts the fields of `input` over the input, as for a `$proc` program.
- The root decides the form. In an envelope program, a `$proc`, `$ref` or `$literal` object is data. In a `$proc` program, an envelope is data, as before.
- A call with the value `null` has no input. The header `name` gives `$name`. A ref reads only the root `names`, and `["names", "last"]` reads the step before.
- The envelope form has no `$when`. A program that needs `$when` keeps the `$proc` form.
- The section "The envelope form" of `PROGRAM-FORMAT.md` gives the mapping and the rules. The section "Open questions and known differences" is now section 12.
