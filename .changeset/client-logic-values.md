---
"@procedures/client": patch
---

The input schemas of `client.not`, `client.all`, `client.any` and `client.none` say "values", not "values or calls". These procedures do not run a call in their operands: a call is an object, thus truthy. In a program, the calls of their input run first, as for each procedure that is not control flow. `client.and` and `client.or` run calls. The behavior does not change.
