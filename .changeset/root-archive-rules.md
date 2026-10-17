---
"@procedures/archive": patch
---

The root of `createArchiveModule({ root })` uses the rules of `@procedures/fs/root`, so the package has no copy of them. The procedures declare their path inputs in `metadata.fsRoot`, so the root of a host (`confineToRoot()`) confines them too (roadmap R33).
