---
"@procedures/store": patch
---

`FileProgramStore` writes a token into its lock file. A writer removes a stale lock only when it still holds the token that it read, and it removes only its own lock. Before, two writers could run at one time (second code audit, roadmap O57).
