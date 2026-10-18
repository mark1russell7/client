---
"@procedures/privacy-scan": patch
---

The scan does not report an email address of the top-level domain `.example` (RFC 2606). Before, only `example.com`, `example.org`, `example.net`, `.test`, `.invalid` and `.localhost` were example domains. A real domain that only starts with "example", such as `examples.zz`, is still reported.
