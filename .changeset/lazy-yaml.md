---
"@procedures/json": patch
---

A faster start (roadmap O50): an import of `@procedures/json/module` or `@procedures/json/register` does not load the `yaml` package. The procedures `yaml.parse` and `yaml.stringify` load it when they first start. This change does not change an export, a type or a result.

New: the entry `@procedures/json/csv`. It exports `parseCsv`, `stringifyCsv`, `csvParse`, `csvStringify`, their types and `JsonError`, with the same signatures as the root. Its imports reach no other package: no `yaml`, no `zod` and no `@procedures/client`. The root continues to export these functions.

The root of the package still loads `yaml` at import, because `parseYaml` and `stringifyYaml` are synchronous functions. The root of `@procedures/client` does not load `ws` since 0.20.0 (CLI-6 step 2). A new test of each package keeps these imports out.
