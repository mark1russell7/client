# Autonomous Decisions Log — July 2026 roadmap execution

This file records decisions made while working through the roadmap autonomously (no human in
the loop). Each entry: the decision, the reasoning, and how to reverse it if it was wrong.
Referenced from commit messages. See [ROADMAP-2026-07.md](./ROADMAP-2026-07.md) and
[BUGS-2026-07.md](./BUGS-2026-07.md).

## Ground rules adopted for this session
- **Separate commits** per logical change, each with a clear message + `Co-Authored-By` trailer,
  pushed to `origin/main` only after `tsc`/tests pass. Never push broken build/dist.
- **Verify before push:** `client` changes run its vitest suite; every touched package `tsc -b`
  clean; downstream builds refresh the local `client` dist into their pnpm store (build input
  only — not committed) exactly as in the Phase 0 landing.
- **When blocked on a judgment call**, pick the lowest-risk reversible option, record it here,
  and move on rather than stall.

## Decisions

<!-- newest first; append as work proceeds -->

### Node engine policy set to `node >=20` (documented only; 48 package.jsons left to cue)
Phase 4 reconciliation of the engines drift flagged in the audit (README #18, ONBOARDING #21,
ecosystem/README #30, audit/08 roadmap #6). The fleet is inconsistent: core `client` + `docker/*`
+ `minimongo` + `client-mongo` + `client-server` + `server-mongo` declare `node >=20`; `cue`,
`splay`, and `client-splay` declare `node >=25` / `npm >=11`; the remaining ~38 packages declare
no `engines` at all. I picked **`node >=20`** as the single policy because it is what the core
`client` runtime — a transitive dependency of every package — already targets, and lowering the
three `>=25` outliers is non-breaking (any runtime satisfying `>=25` also satisfies `>=20`),
whereas raising 45 packages to `>=25` would be a churny, higher-risk change with no stated need.
I documented the policy in README.md and PACKAGES.md and deliberately did **not** edit the 48
`engines` fields: those values are generated from cue config, so hand edits would be clobbered on
the next `cue-config generate` and are out of scope for the docs repo. Reverse by choosing `>=25`
instead and re-running cue generate fleet-wide. Refs BUGS-2026-07 (engines drift) / audit 08 #6.

### Middleware internal fixes verified by typecheck + regression suite, not new unit tests
Fixes to middleware internals (H10 timeout signal restore, H11 circuit breaker, M4 timers) are
state-restoration / control-flow corrections that would need heavy scaffolding (a controllable
slow/failing transport + retry composition) to unit-test in isolation. I verified them by
inspection + `tsc` + the full 351-test regression suite, and deferred dedicated middleware
integration tests to Phase 3 ("test the seam layers"), where that scaffolding is built once and
reused. Each such commit says so.

### H15 (`sideEffects: false`) — deferred to a careful fleet-wide pass, not fixed piecemeal
Setting `sideEffects` wrong silently breaks tree-shaking in confusing ways, and the correct value
differs per package (register-by-side-effect wrappers want `["./dist/register.js"]`; `client`
wants its registration entry points). Rather than guess per-package under time pressure, I left
`sideEffects` alone for now. It's latent (only bites bundler consumers; the live path is Node ESM
which ignores the flag). Revisit as one deliberate batch. Tracked as H15.

### H16 exports — added only `./middleware` + `./server`, not `./collections`
Both have real dist index files and are referenced by docs/comments. Skipped `./collections`
because Phase 2 consolidation removes the embedded `client/src/collections` copy; adding an export
now would be immediate churn. Reversible: add the subpath if collections stays in core.
