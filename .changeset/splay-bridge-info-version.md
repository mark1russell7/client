---
"@procedures/splay": minor
---

`splay.bridge.info` gives the real name and version of the package, from its `package.json`. Before, it gave the version `1.0.0` for each version. The procedure reads the file at its first call, so an import of the module reads no file.
