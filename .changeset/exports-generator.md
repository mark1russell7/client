---
"@procedures/compiler": patch
---

The generator of procedures from the types of a package (direction 40). `generateExportsManifest()` of the new entry `@procedures/compiler/generate` reads the declaration files of a package. It gives a manifest as data: a procedure for each public function whose inputs and output are JSON. The JSON Schemas come from the types, and the descriptions come from the doc comments. Each other function gets an exemption with its reason. `exportsModule(manifest, functions)` gives the procedure module of a manifest, also in a browser.

- The entry `./generate` reads the compiler API of TypeScript 5 as the optional peer `typescript-api` (`npm:typescript@^5.9.3`), because TypeScript 7 has no compiler API in JavaScript.
- A type that does not resolve fails closed: it gives an exemption, not a schema that accepts each value. A re-export that does not resolve gets the exemption `unresolved`.
- The generator reads the real path of the declaration file, as Node.js does. Thus a package that pnpm links into `node_modules` resolves its own imports.
- A call in process gives the JSON form of the output, as a call over HTTP does. An `undefined` item of an array becomes `null`, and a property with an `undefined` value is absent.
