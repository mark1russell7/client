---
"@procedures/s3": minor
---

Three object procedures (roadmap R44). `s3.head` gives the metadata of an object without its content, and `exists: false` for a 404. `s3.copy` copies an object inside S3. It replaces the destination, unless `overwrite` is false. `s3.presign` gives a presigned URL for a `GET` or a `PUT`, with an expiry in seconds. It sends no request to S3. A call whose capability does not permit the writes of `s3.upload` gets no `PUT` URL. The new dependency is `@aws-sdk/s3-request-presigner`.
