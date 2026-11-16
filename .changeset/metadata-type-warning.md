---
"@procedures/client": patch
---

The registry gives a warning for a typed metadata field with a wrong type. Version 0.60.0 refuses such a field.

- The typed fields are the fields of `ProcedureMetadata` that the framework reads: `description`, `tags`, `title`, `deprecated`, `deprecationMessage`, `effects`, `stream`, `untrusted` and `fsRoot`. A custom field keeps any value.
- The warning comes one time for each procedure and field. It names the procedure, the field and the type that the field needs. The procedure stays in the registry, and its calls work as before.
- The new option `logger` of `ProcedureRegistry` gets the warnings. The default writes to the console.

To prepare for 0.60.0, give each typed field the type that the warning names. For example, change `tags: "math"` to `tags: ["math"]`.
