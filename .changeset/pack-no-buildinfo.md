---
"@procedures/access": patch
"@procedures/archive": patch
"@procedures/better-auth": patch
"@procedures/bundle-assistant": patch
"@procedures/bundle-dev": patch
"@procedures/bundle-mcp": patch
"@procedures/claude-cli": patch
"@procedures/cli-kit": patch
"@procedures/cli-run": patch
"@procedures/collections": patch
"@procedures/cue": patch
"@procedures/dag": patch
"@procedures/docker": patch
"@procedures/fs": patch
"@procedures/git": patch
"@procedures/lib": patch
"@procedures/mcp-server": patch
"@procedures/mongo": patch
"@procedures/node": patch
"@procedures/playground": patch
"@procedures/pnpm": patch
"@procedures/procedure": patch
"@procedures/s3": patch
"@procedures/peer": patch
"@procedures/shell": patch
"@procedures/snapshot": patch
"@procedures/splay": patch
"@procedures/sqlite": patch
"@procedures/store": patch
"@procedures/vite": patch
"@procedures/vitest": patch
"@procedures/client": patch
"@procedures/compiler": patch
"@procedures/env": patch
"@procedures/exif": patch
"@procedures/geo": patch
"@procedures/gh": patch
"@procedures/http": patch
"@procedures/ics": patch
"@procedures/mcp-dev-tools": patch
"@procedures/ios-backup": patch
"@procedures/json": patch
"@procedures/llm": patch
"@procedures/mail": patch
"@procedures/mark": patch
"@procedures/mcp": patch
"@procedures/notify": patch
"@procedures/npm": patch
"@procedures/pdf": patch
"@procedures/privacy-scan": patch
"@procedures/restic": patch
"@procedures/schedule": patch
"@procedures/server": patch
"@procedures/signaldb": patch
"@procedures/systems": patch
"@procedures/tailscale": patch
"@procedures/weather": patch
---

The tarball of each package leaves out `dist/.tsbuildinfo`. The `files` list of each package has the entry `!dist/.tsbuildinfo` after `dist`.

The build writes this file for incremental builds. An app does not use it, and it added its size to each tarball (61 KB in `@procedures/json` 0.52.3). The conventions rule `pack-no-buildinfo` finds it.

PATCH: the exports and the behavior do not change.
