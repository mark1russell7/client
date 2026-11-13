---
"@procedures/json": patch
---

The root entry of `@procedures/json` exports `parseJsonOrUndefined(text)`. It reads a JSON text and gives `undefined` when the text is not valid JSON. It does not throw.

- A key `__proto__` of the text stays data, as in the other functions of the package.
- `@procedures/npm/measures` uses it to read the response bodies of the use measures.
