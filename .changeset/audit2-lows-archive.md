---
"@procedures/archive": patch
---

The zip reader reads a zip of 65535 entries without zip64. A count of 0xffff without a zip64 locator is the true count. Before, `archive.list` refused the output of `archive.create` (second code audit, roadmap O57).
