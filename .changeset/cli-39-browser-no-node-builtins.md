---
"@procedures/geo": patch
"@procedures/ics": patch
"@procedures/splay": patch
"@procedures/client": patch
"@procedures/compiler": patch
"@procedures/store": patch
"@procedures/collections": patch
"@procedures/better-auth": patch
---

Fixed: `@procedures/geo`, `@procedures/ics` and `@procedures/splay` import `@procedures/client/browser`, not the root of `@procedures/client` (CLI-39). The root also exports `HttpServerTransport`, which imports `http`. Thus a browser build with Vite found `http` and gave a warning. The exports of the packages do not change.

New: each package that operates in a browser names its browser entries in the field `client.browser` of its `package.json`. A CI check bundles each of these entries for a browser with esbuild. The check fails when an import reaches a Node built-in, with or without the prefix `node:`. The root of `@procedures/client` joins the check after CLI-6. `@procedures/splay` joins it when `splay.bridge.info` reads its version without `node:fs/promises`.
