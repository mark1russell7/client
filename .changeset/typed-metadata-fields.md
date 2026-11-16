---
"@procedures/client": minor
---

The registry examines the types of the metadata fields that the framework reads. A procedure whose field has a wrong type gets a `RegistryError` that names the field.

This is a breaking change. Before, `register()` and `procedure.define` accepted a typed field with a wrong type, and 0.59.1 gave a warning. After this change, they refuse it.

- The refusal names the field and the type that the field needs, for example `The field metadata.tags needs a list of strings`.
- The option `logger` of `ProcedureRegistry` gets the errors of the registry: a listener that throws. The default writes to the console as before.
- `register()` refuses the procedure, from code, from `procedure.define` or from a program store. A stored program with a wrong type fails its load, and the other programs load.
- The input schema of `procedure.define` uses the same schema, so a wrong type fails the call.
- `procedure.define` sets `generatedFrom` and `aggregation` after the metadata of the caller. Before, metadata from the caller removed these two fields.
- A custom field keeps any value. The framework does not read it.

Migration: give each typed field of the metadata the type of `ProcedureMetadata`. The error names the field, for example `The field metadata.tags has a wrong type`.

| Field | Type |
| --- | --- |
| `description`, `title`, `deprecationMessage` | a string |
| `tags`, `untrusted` | a list of strings |
| `deprecated` | a boolean |
| `effects` | an object: `reads` and `writes` are lists of strings, `idempotent` and `destructive` are booleans |
| `stream` | an object: `unbounded` is a boolean |
| `fsRoot` | an object: `cwd` and `refuse` are strings, `paths`, `names`, `required` and `values` are lists of strings, `program` is a boolean |

For example, change `tags: "math"` to `tags: ["math"]`. A program in a store with a wrong type does not load: define it again with the correct type.
