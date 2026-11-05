---
"@procedures/s3": patch
---

`s3.upload` takes a new input `sourcePath`, the path of a file. The upload reads one part at a time, so the memory stays bounded, and the object is whole or absent. `body` becomes optional in the input type: give `body` or `sourcePath`, and not the two. Each call that gives `body` works as before. Under the root of a host, `sourcePath` is in the root. The effects of `s3.upload` now name `fs` in `reads`.
