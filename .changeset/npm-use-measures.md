---
"@procedures/npm": patch
---

`@procedures/npm` has the new entry `./measures`. It reads how much a package is used, from free public sources. The sources are the npm downloads, the dependents of deps.dev, the hits of jsDelivr and the npm registry.

- Each measure is a pure pair. A request builder gives the URL and the `Accept` header. An extractor reads the body text into typed rows.
- `downloadsRequests` puts up to 128 packages without a scope into one bulk request.
- The request builders accept the names of old packages with capital letters, for example `JSONStream`.
- The extractors read the bodies with `parseJsonOrUndefined` and `isPlainObject` of `@procedures/json`.
- An extractor puts each package that the source does not know into `missing`. A body of another shape throws an error that names the URL.
- The caller gives the fetch. `measure(fetch, request, extract)` accepts `globalThis.fetch`, and a crawler can use the pairs in its own recipes.
- The entry has no Node built-in, so a browser can also use it.
- The tests read responses that were recorded from each source.
