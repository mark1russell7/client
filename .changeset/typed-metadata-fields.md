---
"@procedures/client": patch
---

The registry examines the types of the metadata fields that the framework reads. A procedure whose field has a wrong type gets a `RegistryError` that names the field.

- The typed fields are `description`, `tags`, `title`, `deprecated`, `deprecationMessage`, `effects`, `stream`, `untrusted` and `fsRoot`, with the types of `ProcedureMetadata`. A custom field keeps any value.
- Before, `procedure.define` stored `metadata: { tags: "math" }`. Then each `procedure.list` with that entry failed its output check.
- The input schema of `procedure.define` uses the same schema, so a wrong type fails the call.
- `procedure.define` sets `generatedFrom` and `aggregation` after the metadata of the caller. Before, metadata from the caller removed these two fields.
