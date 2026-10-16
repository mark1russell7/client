---
"@procedures/json": minor
---

The new package `@procedures/json` (roadmap R39) has seven pure procedures (`PURE_EFFECTS`): `json.query` (a JSON Pointer or a path query), `json.patch` (RFC 6902), `json.diff` (it gives an RFC 6902 patch), `json.merge` (RFC 7386), `json.validate` (a subset of JSON Schema, with the keywords that the check does not examine in `unchecked`), `yaml.parse` and `yaml.stringify`.

A pointer, a path, a patch and a merge patch cannot name `__proto__`, `constructor` or `prototype`. A key `__proto__` in the data stays data. The YAML text of `yaml.stringify` is YAML 1.2 that a YAML 1.1 reader reads as the same value. Property tests examine that a patch from `json.diff` gives the second value, and that `yaml.parse` of the text of `yaml.stringify` gives the value again.
