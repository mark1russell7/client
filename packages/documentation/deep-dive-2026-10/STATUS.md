# Deep dive 2026-10: status of each finding

This file records the status of each finding of the deep dive. The reports are in this folder. The status values are:

- **fixed**: the commit corrects the defect, and a test or a repro examines it.
- **partly**: the commit removes the risk or a part of the defect. The note gives the remaining part.
- **open**: no change yet.
- **decision**: the fix needs a decision of the owner. The note gives the recommendation.

## Security and the MCP surface

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| WRP-1 / MCP-2 | critical | fixed | `ee52893` | `docker.*` runs `shell.run` with argv. Values that start with `-` are rejected. |
| MCP-1 / CLI-5 / TRN-2 | critical | fixed | `ee52893` | `cli` is not in `mcpNamespaces`. The tool snapshot test pins the surface. |
| TRN-1 / CLI-1 / CLI-2 / DATA-20 | critical | fixed | `8db86ec` | Loopback by default, no CORS, `Host` and `Origin` checks, a lockfile token on each call. |
| CLI-3 | high | fixed | `8db86ec` | Warm mode is used only for the same `cwd`. |
| CLI-4 / CLI-14 | high | fixed | `8db86ec` | The lockfile records the peer id, the workspace and the build. `/health` confirms the server before a call or a signal. |
| CLI-6 | high | fixed | `8db86ec` | The `server` CLI registers its procedures once. |
| CLI-12 | medium | fixed | `8db86ec` | `cli.run` always starts `mark` with argv. The second lockfile copy is deleted. |
| WRP-5 | high | fixed | `e1b5b57` | `pnpm.*` runs `shell.run` with argv. |
| WRP-6 | medium | fixed | `e1b5b57` | `shell.which` uses `execFile`. |
| WRP-8 | medium | fixed | `e1b5b57` | `vite.*` starts the project's vite bin with no shell. |
| DATA-1 / DATA-2 / DATA-3 | critical / high | fixed | `e1b5b57` | Snapshot names are checked. Restore uses `mkdtemp`. The guard checks the archive entry. Exclusions match segments. |
| CORE-7 / DATA-11 | medium | fixed | `e1b5b57` | The dynamic loader takes an allowlist. The storage factory has no default loader. |
| DATA-18 | medium | fixed | `ee52893` | `rootPath` must hold `pnpm-workspace.yaml`. |
| MCP-3 | high | open | | The guard examines only the immediate caller. The target design is `effects`/`uses` metadata, checked for each nested call. |
| MCP-4 / CORE-3 | high | open | | |

## Core

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| CORE-1 | high | open | | |
| CORE-2 | high | open | | |
| CORE-4 | high | open | | |
| CORE-5 | high | open | | |
| CORE-6 | medium | open | | |
| CORE-8 / DATA-8 | medium | open | | |
| CORE-9 / DATA-9 | medium | open | | |
| CORE-10 | medium | open | | |
| CORE-11 | medium | open | | |
| CORE-12 | medium | open | | |
| CORE-13 | medium | open | | |
| CORE-14 | medium | open | | |
| CORE-15 | low–medium | open | | |
| CORE-16 / DATA-10 | low–medium | partly | `ee52893` | The stubs are not MCP tools now. They still report success. |
| CORE-17 | low | open | | |

## Transports, server and middleware

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| TRN-3 | high | open | | |
| TRN-4 | high | open | | |
| TRN-5 | high | open | | |
| TRN-6 | medium-high | open | | |
| TRN-7 | medium | open | | |
| TRN-8 | medium | open | | |
| TRN-9 | medium | open | | |
| TRN-10 | medium | open | | |
| TRN-11 | medium | open | | |
| TRN-12 | medium | open | | |
| TRN-13 | medium | open | | |
| TRN-14 | medium | open | | |
| TRN-15 | low-medium | open | | |
| TRN-16 | low | open | | |

## Tool wrappers

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| WRP-2 | high | fixed | `e1b5b57` | A `StringDecoder` for each stream. |
| WRP-3 | high | fixed | `ee52893` | `client-cue` registers `client-fs`. |
| WRP-4 | high | partly | `ee52893` | `vitest.watch` is not an MCP tool now. Nothing can stop the process yet. |
| WRP-7 | medium | open | | |
| WRP-9 | low/medium | open | | |
| WRP-10 | low | open | | |

## Data and library packages

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| DATA-4 | high | open | | |
| DATA-5 | high | open | | |
| DATA-6 | high | open | | |
| DATA-7 | high | open | | |
| DATA-12 | medium | open | | |
| DATA-13 | medium | open | | In the general repository `docker-sqlite`. |
| DATA-14 | medium | open | | |
| DATA-15 | medium | open | | |
| DATA-16 | medium | open | | |
| DATA-17 | medium | open | | |
| DATA-19 | medium | open | | |
| DATA-21 | low | open | | |
| DATA-22 | low | open | | |

## The `mark` CLI and the servers

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| CLI-7 | high | open | | |
| CLI-8 | medium | open | | |
| CLI-9 | medium | open | | |
| CLI-10 | medium | open | | |
| CLI-11 | medium | open | | |
| CLI-13 | medium | open | | |
| CLI-15 | low | open | | |
| CLI-16 | low | open | | |
| CLI-17 | low | open | | |
| CLI-18 | low | open | | |
| CLI-19 | low | open | | |
| CLI-20 | low | open | | |

## The site, CI and the toolchain

| ID | Severity | Status | Commit | Note |
|---|---|---|---|---|
| SITE-1 | high | open | | |
| SITE-2 | high | open | | |
| SITE-3 | high | open | | |
| SITE-4 | medium | open | | |
| SITE-5 | medium | open | | |
| SITE-6 | medium | open | | |
| SITE-7 | medium | open | | |
| SITE-8 | medium | open | | |
| SITE-9 | medium | open | | |
| SITE-10 | medium | open | | |
| SITE-11 | low-medium | open | | |
| SITE-12 | low-medium | open | | |
| SITE-13 | low | open | | |
| SITE-14 | low | open | | This is the P5 toolchain alignment. |

## Architecture roadmap

| Item | Status | Commit | Note |
|---|---|---|---|
| 0.1 Lock down the warm server | done | `8db86ec` | |
| 0.2 The MCP surface | done | `ee52893`, `e1b5b57` | |
| 0.3 One `pathToMethod` and a conformance test | partly | `8db86ec` | `mark` warm mode uses the core split. `mark/src/cli.ts` and `server.call` do not. |
| 0.4 Live registry lookup, `procedure.delete` unregisters, MCP `list_changed` | open | | |
| 1.1 Program Format v1 and one evaluator | open | | |
| 1.2 Interceptors in `invokeProcedure` | open | | |
| 1.3 A build-time manifest and a thin `mark` path | open | | |
| 2.1 Standard Schema, real schemas for exposed procedures | open | | |
| 2.2 `commandProcedure()` and the wrapper migration | open | | |
| 2.3 One `host` package | open | | |
| 3.1 Modules without side effects | open | | |
| 3.2 A program store | open | | |
| 3.3 The collections rebuild (P8) | partly | `52a5f68` | The contract tests and the eleven defects are done. Core still depends on `client-collections`. |
| 3.4 A slimmer core | open | | |
