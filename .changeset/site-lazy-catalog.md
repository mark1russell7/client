---
---

The site loads the procedure catalog only on the pages that show procedures or packages. Each page loads the small module `src/data/site.ts`: the facts of the build, the counts and the examples of the home page. The catalog grows with each library that becomes procedures (direction 40), and the geo wrap put the largest page over its budget. The build stops when a chunk that each page loads holds the catalog (`start-chunks-plugin.ts`).

Only the private site changes, so this changeset names no package.
