# Decisions log: October 2026 (monorepo move and the cleanup after it)

This log records the decisions I made while working without the owner present. Each entry gives the decision, the reason, and how to reverse it. The July log is [DECISIONS-2026-07.md](./DECISIONS-2026-07.md). The migration plan and its checklist are in `~/git/CLIENT-MONOREPO-PLAN.md`, outside this repository.

## Ground rules

- One logical change per commit. Before each push: `pnpm build`, `pnpm typecheck`, `pnpm test` and `pnpm lint:ste` pass.
- When a choice is a judgment call, take the option that is easiest to reverse and record it here.
- Deleting a package removes it from the tree only. Its full history stays in this repository: `git log -- packages/<name>` shows it.
- Design decisions that change the behavior of the core `client` package are proposed here, not made alone.

## Decisions

<!-- newest first -->

### Delete test, mock-client, mock-fs and mock-logger (plan Phase 5.1)

The plan said: delete `mock-client` and `mock-logger`, and delete `test` and `mock-fs` "if nothing imports them". One thing used `test`: the `vitest.config.ts` of `client-dag` imported `sharedConfig`. That config is mostly vitest defaults. The values that matter (`environment: "node"`, 10-second timeouts) are now written directly in `client-dag`'s config. After that, nothing used the four packages:

- `client`, `client-dag` and `mark` listed `test` or `mock-client` as devDependencies but never imported them.
- `test` re-exported the three mocks, and nothing imported `test` except that config.
- The July audit graded them F (`mock-client`: `createMockClient()` throws), D- (`mock-logger`), C- (`mock-fs`: it mocks an interface that `client-fs` cannot accept) and "not procedures, name collides with client-test" (`test`).

The removal also cleared the only `pnpm peers check` problem (`mock-client` wanted vitest 3). The general repositories `logger` and `splay` still list `github:mark1russell7/test#main` as an unused devDependency. The archived repository stays installable, so they are not affected. Reverse with `git revert`.

### Delete scaffold, client-connection and client-server-mongo (plan Phase 5.1)

The July audit marked all three as dead, and the migration plan scheduled their deletion. Nothing in the workspace depends on any of them.

- `scaffold`: an abandoned third code generator (AUDIT §2.3). Nothing used it.
- `client-connection`: 100% dead. `addConnection()` is never called, and it reimplements the core WebSocket transport (AUDIT §3). Its `connection.*` procedures leave the `mark` listing.
- `client-server-mongo`: its `stop` and `status` procedures never worked (`register()` is never called). The roadmap (2.3) retires the Mongo server tier. MiniMongo still installs the archived repository, so MiniMongo is not affected.

Reverse with `git revert` of the deletion commit.

### Archive the 41 old repositories before GitHub finished counting contributions

The plan said to archive only after the new repository's contributions appeared on the profile. I archived `client-playground` first as a canary. Its contributions stayed counted after archiving (3 in 2025, plus 1 for the notice commit), so archiving does not remove contributions. Archiving the old repositories also cannot change how GitHub counts the new repository. So I archived the rest without waiting. Reverse with `gh repo unarchive mark1russell7/<repo>`.
