---
"@procedures/pnpm": minor
---

More pnpm procedures and options (roadmap R41). `pnpm.install`, `pnpm.add`, `pnpm.remove` and `pnpm.run` take `filter` (pnpm selectors, each one as `--filter=<selector>`) and `recursive` (`--recursive`). The new procedures take them too: `pnpm.exec`, `pnpm.list`, `pnpm.why`, `pnpm.outdated` and `pnpm.update`. `pnpm.pack` makes a tarball, or with `dryRun` only gives its files.

`pnpm.list`, `pnpm.why`, `pnpm.outdated` and `pnpm.pack` ask pnpm for JSON and give it parsed as `data`. `pnpm.outdated` gives `success: true` for exit code 1 with a list, because pnpm exits with 1 when a package is outdated. `pnpm.exec` puts `--` before the program, so pnpm reads no option of the program. Each procedure declares its effects, and each procedure that runs pnpm now declares `calls: ["shell.run"]`.
