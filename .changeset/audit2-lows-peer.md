---
"@procedures/peer": patch
---

`server.create` counts the procedures when `autoRegister` has its default (true). Before, `procedureCount` was 0 (second code audit, roadmap O57).
