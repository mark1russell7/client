---
"@procedures/claude-cli": minor
---

New package: `claude.start` starts one turn of the Claude Code CLI as a detached process that writes stream-json to a file. `claude.read` and `claude.follow` give normalised events from that file, and `claude.cancel` stops the process tree of a turn.
