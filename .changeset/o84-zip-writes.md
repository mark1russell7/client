---
"@procedures/archive": patch
---

`archive.create` writes a zip in chunks of about 1 MiB. Before, each entry had its own write, and an archive of 65535 small entries took more than 30 s on Windows. The public API does not change.
