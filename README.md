# client

This repository is the monorepo of the `@mark1russell7` client ecosystem. The ecosystem is a set of procedures with path addresses, for example `git.commit` or `fs.read`. Most packages wrap one tool or one service as procedures.

## Packages

All packages are in `packages/`. Each package has the name and the history of its old repository. The old repositories are archived.

| Group | Packages |
| --- | --- |
| Core | `client`, `client-collections`, `client-dag` |
| Command wrappers | `client-shell`, `client-cli`, `client-git`, `client-pnpm`, `client-docker`, `client-node`, `client-vite`, `client-vitest`, `client-cue` |
| Data and services | `client-fs`, `client-s3`, `client-mongo`, `client-sqlite`, `client-snapshot`, `client-splay`, `client-server` |
| Tools | `mark` (the `mark` CLI, package `@mark1russell7/cli`), `client-lib`, `client-procedure`, `client-playground`, `cli` (the repository tool) |
| Bundles and servers | `bundle-dev`, `bundle-mcp`, `mcp`, `client-mcp`, `impl-mcp-dev`, `server` |
| Website | `site` |
| Other | `documentation` |

## Website

The folder `packages/site` holds the website: <https://mark1russell7.github.io/client/>. The Composer runs programs in the browser with the real client. The site also shows each procedure and the package graph. The Pages workflow publishes the site after CI passes on `main`.

Some packages of the old repositories are deleted because nothing used them. Their history is in this repository. The list and the reasons are in `packages/documentation/DECISIONS-2026-10.md`.

## Build and test

1. Install the dependencies: `pnpm install`
2. Build all packages: `pnpm build`
3. Start the tests: `pnpm test`
4. Examine the types: `pnpm typecheck`

`pnpm build` builds the packages in the sequence of their dependencies. Each package writes its output to its `dist/` folder. Git ignores `dist/`.

## Other repositories

Some packages use general packages from other repositories: `cue`, `logger`, `splay` and `docker-sqlite`. The references to these packages use `github:` specifiers. A general package does not use a package of this repository.
