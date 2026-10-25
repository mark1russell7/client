---
"@procedures/mail": patch
---

`mail.parse` gives U+FFFD for a numeric HTML entity above U+10FFFF. Before, such an entity threw a `RangeError` (second code audit, roadmap O57).
