---
"@procedures/lib": minor
---

`lib.graph` (roadmap R44) gives the dependency graph of the workspace packages. The nodes are the packages, and the edges are the dependencies with a `workspace:` specifier. The procedure finds the cycles, and gives the build levels of a graph without a cycle. It reads through `fs.readdir` and `fs.read.json`, and changes nothing.
