---
"@procedures/splay": patch
---

Fixed: `splay.bridge.info` reads its version without a Node built-in (CLI-52). Before, the procedure read its `package.json` with a lazy `import("node:fs/promises")`. Thus a browser bundler could not bundle `@procedures/splay`, and its entries were not in the browser check of CLI-39.

- `src/module.ts` imports its `package.json` with `with { type: "json" }`. TypeScript, Node, esbuild and Vite support this import.
- The procedure gives the same name and the same version as before.
- The entries `.`, `./module` and `./register` are in `client.browser` of the `package.json`. Thus `scripts/check-browser-entries.mjs` examines them.

PATCH: a fix with no change to the public API.
