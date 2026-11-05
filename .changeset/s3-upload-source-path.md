---
"@procedures/s3": patch
---

`s3.upload` takes a new input `sourcePath`, the path of a file. The upload reads one part at a time, so the memory stays bounded, and the object is whole or absent. This is a PATCH by the rule for a new feature before 1.0.0: `S3UploadInput` and `S3UploadInputSchema` do not change. The new exports are `S3UploadFileInput` with its schema, `S3UploadCall` and `S3UploadCallSchema`. A call with `body` and `sourcePath`, or with neither, fails at the type and at run time. `s3Upload` takes `S3UploadCall`, so a value of `S3UploadInput` is still a call. Under the root of a host, `sourcePath` is in the root. The effects of `s3.upload` now name `fs` in `reads`.
