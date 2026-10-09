# Deep dive: the site, the docs, CI and the toolchain (2026-10-08)

> The report of the deep-dive agent for `packages/site`, `.github/workflows`, the root configuration, `packages/documentation` and package consistency (condensed). Most findings were reproduced on the live site with Playwright, against CI logs, or through the site's own runtime. The status of each finding is in [STATUS.md](./STATUS.md).

| ID | Severity | Where | Defect | Fix |
|---|---|---|---|---|
| SITE-1 | high | `site/src/styles/app.css` | The Composer is unusable on a phone: the sticky palette covers the editor at 375 px, the header wraps to 214 px, pages scroll sideways; the sticky catalog filters cover the list. | Static palette/filters below 720 px; a compact header; wrapping tables and badges. |
| SITE-2 | high | `site/src/lib/program.ts`, `client/src/procedures/index.ts` | The TypeScript tab emits `new Client(new LocalTransport())`, but 85 core procedures are not registered by default: 7 of 8 examples throw "No handler registered". | Emit the registration of `allCoreProcedures` (or `useRegistry`); a test that runs the emitted code. |
| SITE-3 | high | `Composer.tsx`, `program.ts` `setAt` | A palette click with a stale selection corrupts the program (`setAt` builds any missing path; a list or primitive root is replaced by an object); clicking the root header then a procedure replaces the whole program; no undo, and `replaceState` makes Back useless. | Clear the selection on change; check the location exists; confirm before replacing a call with children; undo. |
| SITE-4 | medium | `site/package.json`, `scripts/gen-data.mjs` | `gen-data` races with `pnpm -r build` (the site depends only on `client` and `mcp`): CI's first build had 222 procedures, the Pages rebuild 240; load failures are hidden and exit 0. | Run `gen` after the whole build, or depend on every procedure package; fail on missing `dist` or failed loads. |
| SITE-5 | medium | `Composer.tsx` | Hash changes are ignored after the first render: a pasted share link does nothing, "Copy link" can copy another program; a corrupt `p=` silently loads an example and the URL is overwritten. | Derive the program from the route on hashchange; encode at copy time; show "not a valid program". |
| SITE-6 | medium | `main.tsx`, `App.tsx`, `router.ts`, `client/.../core/array.ts` | Hostile links: 3000 nested arrays blank the site (stack overflow, no error boundary); `#/catalog/%E0%A4` throws `URIError` (white page); a shared `range{start:1e17,end:2e17}` loops forever (Live is on by default). | An error boundary; a guarded `decodeURIComponent`; depth/size limits; programs in a Web Worker with a timeout; no auto-run for `?p=`; a `range` guard. |
| SITE-7 | medium | `app.css`, `Blocks.tsx`, `Trace.tsx` | Keyboard use: a null slot has no focusable control; list/object controls show only on hover or click; trace rows are not focusable; focus falls to `<body>` after `×`; inputs are named "Number"/"Text" and labels are not linked; tabs and tree roles are incomplete. | Show controls on `:focus-within`; focusable slots and heads; buttons for trace rows; linked labels; focus return. |
| SITE-8 | medium | `Blocks.tsx` | (a) A number cannot be made negative; (b) a rejected key rename leaves wrong text (and inherited names such as `constructor` are rejected silently); (c) `gte`/`lte` cannot be typed (the picker commits `gt` on each match); (d) the implicit-chain hint is wrong (missing for one-call lists, shown for nested inputs). | Local text state; `Object.hasOwn` and a message; commit on Enter/blur; the core rule for the hint. |
| SITE-9 | medium | `program.ts`, `Blocks.tsx` | The result hides errors: `NaN` shows as `null` under "✓ ok" (a misspelled `$ref`); `$name` is offered on every call but only chain steps are readable by name. | Show `NaN`/`Infinity`/`undefined`; warn about out-of-scope `$ref` names; core throws on an unresolved `$ref`. |
| SITE-10 | medium | `.github/workflows` | Pages does not wait for CI and runs no test; `pages: write`/`id-token: write` granted to the build job (which runs install scripts); `cancel-in-progress` on `main` leaves commits without a result; `mark`'s e2e tests never run (and test retired commands); 19 packages have no `test` script; no lint, `lib audit`, doc freshness or test-file typecheck in CI; only Node 26 is tested. | Permissions on `deploy` only; Pages after CI; no cancel on `main`; tests per package; the missing checks. |
| SITE-11 | low-medium | `client-mcp/package.json`, `mark/src/ecosystem.ts` | The catalog shows `mark mcp serve`, but `client-mcp` has no `client.procedures`, so `mark` does not know it. | Add the field, or mark CLI availability by that field. |
| SITE-12 | low-medium | `app.css` | Dark-mode primary buttons: white on `#93abff` is 2.21:1. | Dark ink on the accent in dark mode. |
| SITE-13 | low | docs | Stale statements: the home page says MCP serves `git.status`; "68 tools" (69 since `vitest.coverage`); "33 packages / 162 procedures"; the root README omits `site`; Node baselines differ (`>=20`, `>=22`, `>=25`, CI 26); `client-git` README says 23 procedures (26); `~/git/CLAUDE.md` still has the old H18 caveat. | Update. |
| SITE-14 | low | package manifests | Version skew: TypeScript 5.9.3 in packages, 7.0.2 at the root and in `cli`; vitest 3, 4 and 5; `@types/node` ^22 and ^26. The site's manifest has library fields (`main`, `exports`, `peerDependencies.react`). `client-mcp` lists `./src/register.ts` in `sideEffects` and has a hand-edited tsconfig. | P5 toolchain alignment; clean the site manifest. |

## Architecture observations

- The trace's parent attribution is right, but hydrated inputs run as siblings of the call that uses them, so the trace tree does not match the blocks. A "consumer" edge during hydration would fix that.
- Three copies of the registry-introspection logic (`gen-data.mjs`, `generate-procedures.mjs`, `generate-packages.mjs`) with different skip lists: one shared, tested module that fails loudly.
- The site's program model differs from the core's (`isOutputRef`, `isProcRef`, the implicit-chain rule): share one model.
- No XSS sink: all text goes through React text nodes or attributes.

## Improvement ideas

1. Programs in a Web Worker with a budget and a Stop button; no auto-run for shared links.
2. Undo/redo and a working Back button.
3. Validate `$ref` names against the `$name`s in scope; highlight unknown procedures.
4. A keyboard-navigable, virtualized trace (grouping is O(n²); `Math.max(...calls)` overflows past about 100k calls).
5. "Insert inside" and "wrap in chain"; confirm before replacing a call with children.
6. Show `catalog.failed` and the build commit and date in the footer.
7. A Playwright smoke test in CI (examples run, share links round-trip, no overflow at 375 px, axe-core, the TypeScript output runs).
8. Catalog filters in the URL; keyboard-focusable architecture nodes.
