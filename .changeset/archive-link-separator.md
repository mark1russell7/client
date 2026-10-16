---
"@procedures/archive": patch
---

A zip archive made on Windows keeps the target of a link with `/`. Before, it kept `..\a.txt`, which is not a link target on Linux or macOS.
