# Documentation

This folder holds the documents of the client monorepo. The table tells what each document is for. The README of each package describes that package.

## Read first

| Document | Content |
|---|---|
| [ONBOARDING.md](./ONBOARDING.md) | How to build and test the monorepo, start procedures with `mark`, connect Claude Code, and add a package or a procedure |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | The layers, the invocation path, the hosts, streaming and the security model |
| [PROGRAM-FORMAT.md](./PROGRAM-FORMAT.md) | The procedure-as-data format: calls, names, `$when`, implicit chains, control flow and `procedure.define` |

## References

| Document | Content |
|---|---|
| [PACKAGES.md](./PACKAGES.md) | Each package, its procedures and its dependencies. A script makes it. |
| [PROCEDURES.md](./PROCEDURES.md) | Each registered procedure with its description. A script makes it. |

To make the two files again after a build, start `node packages/documentation/scripts/generate-packages.mjs` and `node packages/documentation/scripts/generate-procedures.mjs`. Do not edit them by hand.

## Status and decisions

| Document | Content |
|---|---|
| [deep-dive-2026-10/STATUS.md](./deep-dive-2026-10/STATUS.md) | The status of each finding of the October 2026 deep dive, and of the roadmap items |
| [deep-dive-2026-10/](./deep-dive-2026-10/) | The reports of the deep dive, one for each area, and the architecture review with the roadmap |
| [DECISIONS-2026-10.md](./DECISIONS-2026-10.md) | The decisions of the monorepo move and of the work after it, with how to reverse each one |
| [BUGS-STATUS-2026-10.md](./BUGS-STATUS-2026-10.md) | The status of each defect of the July 2026 register |
| [ARCHITECTURE-PROPOSALS-2026-10.md](./ARCHITECTURE-PROPOSALS-2026-10.md) | The proposals P1 to P8 and their status |

## History

These documents describe the state before the monorepo move. They are kept as records, and their links point to the files of that time.

| Document | Content |
|---|---|
| [history/ARCHITECTURE-2026-07.md](./history/ARCHITECTURE-2026-07.md) | The architecture document of July 2026 |
| [history/ONBOARDING-2026-07.md](./history/ONBOARDING-2026-07.md) | The onboarding guide of July 2026 |
| [AUDIT-2026-07.md](./AUDIT-2026-07.md) | The audit of July 2026 |
| [audit/](./audit/) | The area reports of the July 2026 audit |
| [BUGS-2026-07.md](./BUGS-2026-07.md) | The defect register of July 2026. Code comments refer to its IDs, for example C2 or H18. |
| [DECISIONS-2026-07.md](./DECISIONS-2026-07.md) | The decisions of July 2026 |
| [ROADMAP-2026-07.md](./ROADMAP-2026-07.md) | The remediation roadmap of July 2026 |
| [DOCUMENTATION_AUDIT.md](./DOCUMENTATION_AUDIT.md) | The documentation audit of January 2026 |

The July documents stay in this folder, because code comments refer to them by these paths.

## Writing rules

The documents of the "Read first" table and this index follow ASD-STE100 Simplified Technical English. `pnpm lint:ste` examines them (`ste.config.json`). The status and history documents are not in the scope of the linter.
