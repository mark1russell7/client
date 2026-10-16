---
"@procedures/fs": minor
---

Four file procedures (roadmap R44). `fs.write.json` writes a value as JSON through a file that it renames at the end. `fs.hash` gives the hash of a file. `fs.temp` makes a temporary folder. `fs.watch` gives the changes of a file or folder as a stream without an end. With `createFsModule({ root })`, each path stays in the root, and `fs.temp` makes its folders in the folder `.tmp` of the root.
