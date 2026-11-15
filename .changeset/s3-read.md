---
"@procedures/s3": patch
---

The new procedure `s3.read` reads an object into memory and writes no file. Its input is the input of `s3.download` without `destPath`, and its output is the output of `s3.download` without `path`. `maxBytes` is the limit of the size (64 MiB by default).

`s3.download` can write a file, so its declared effects include the writes of `fs`. A procedure that only reads an object can call `s3.read` and declare no writes.

PATCH: a new procedure and new exports (`s3Read`, `S3ReadInputSchema`, `S3ReadInput`, `S3ReadOutput`), before 1.0.0.
