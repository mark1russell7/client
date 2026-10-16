# @procedures/claude-cli

## 0.4.0

### Minor Changes

- a90c473: New package: `claude.start` starts one turn of the Claude Code CLI as a detached process that writes stream-json to a file. `claude.read` and `claude.follow` give normalised events from that file, and `claude.cancel` stops the process tree of a turn.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4c51727]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/shell@0.4.0

## 0.3.0

### Minor Changes

- New package: `claude.start`, `claude.read`, `claude.follow` and `claude.cancel` run one turn of the Claude Code CLI as a detached process that writes stream-json to a file, and give normalised events.
