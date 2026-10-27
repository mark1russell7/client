---
"@procedures/server": patch
---

`@procedures/server` declares `@procedures/fs` as an optional peer dependency (roadmap O70). The option `--fs-root` imports it. Before, only the devDependencies had it, so a strict install did not show the need. An install without `--fs-root` does not need it.
