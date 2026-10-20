# Instructions for Claude

## Writing style

Write all prose of this repository in the style of ASD-STE100 Simplified Technical English (STE). This prose is the README files, this file, the TSDoc comments and the text that the site shows. The linter [`ste-lint`](https://github.com/mark1russell7/ste-lint) examines it.

- After a change to prose, start `pnpm lint:ste` and correct each finding. CI fails when there is an error.
- Keep each instruction to 20 words or fewer, and each description to 25 words or fewer.
- Do not use the modal verbs (`should`, `may`, `might`, `would`), semicolons or Latin abbreviations (`e.g.`, `i.e.`, `etc.`).
- Use the active voice. Start each sentence of a doc comment with its subject: "This function returns the value", not "Returns the value".
- Put code, file names and commands in code font. The linter counts each code span as one word.
- Add a word to the glossary in `ste.config.json` only if it is a real technical term of the project.
- The linter examines the files that `ste.config.json` names: the root files, the documentation, and the README of each package whose prose is rewritten.

## The roadmap and its tracker

- The roadmap is `packages/documentation/ROADMAP-2026-10.md`. The open work after 0.7.0 is in its section "Open work after 0.7.0".
- The live tracker is https://claude.ai/artifact/49vNStauE2K7pScAuxDGWr. Each item is a row of the `items` collection of the database of that page.
- When an item starts, ships, gets blocked or changes, change the roadmap file and the tracker together.

## The server stack

- The contract of the servers is `packages/documentation/SERVER-LAYERS.md`. It gives the layers, their owners and the decisions D1 to D18.
- Read the contract before you add a server, a listener, a signal handler, a health route or a token check.
- `systems` (`@mark1russell7/service`) owns the runner. This repository owns the one procedures server. Do not copy a job of another layer.
- The cross-repo tracker is https://claude.ai/artifact/WtkE3dtHp57qpcs4UvcaVZ. Its `items` collection has the items of all the repositories.
- The client items are also in the roadmap, in the section "The server stack (R37)", with the same IDs.
- When a client item of the server stack changes, change the roadmap file and the cross-repo tracker together.

## Breaking changes of the server stack

Decision D13 sets these rules. The section "Releases of the server stack" of the contract gives the details.

- An additive change ships as a PATCH of the client group.
- Each breaking change is its own MINOR of the client group. Merge it alone.
- Release the group after each break. The next break waits for that release.
- One release before a break, mark each export or behavior that it moves or removes as `@deprecated`.
- Give the break a `minor` changeset. In its text, write the migration steps for the site, MiniMongo, Graph and jarvis.
- Do not change `RELEASE.md`, `scripts/publish-ci.mjs` or `.github/workflows/release.yml` for these rules.

## Repository structure

- Each folder in `packages/` is one package. The folders keep the names of their old repositories.
- The npm scope of the packages is `@procedures`. The npm name can differ from the folder: `packages/client-shell` holds `@procedures/shell`. The root README has the table of names.
- The folder `packages/mark` holds `@procedures/mark`, the `mark` CLI.
- `scripts/check-scope.mjs` fails when a file names a package of this repository with the old scope `@mark1russell7`.
- The old repositories are archived. Do not change them. Make all changes in this repository.
- Git ignores `dist/`. Do not commit build output.

## Dependencies

- A package uses another package of this repository with `workspace:*`.
- The general packages are in other repositories, with the npm scope `@mark1russell7`: `cue`, `logger`, `splay`, `splay-react`, `docker-sqlite` and `docker-mongo`.
- A package of this repository uses a general package with its npm version (for example `"@mark1russell7/cue": "^1.0.0"`). A `github:` specifier blocks the npm release.
- A general package must not use a package of this repository.
- Declare each package that the published code imports in `dependencies`, `peerDependencies` or `optionalDependencies`.
- `scripts/check-declared-imports.mjs` fails when an entry of a published package reaches an import of an undeclared package.

## Commands

- Start `pnpm build` after a change. Dependent packages read the types from `dist/`.
- Use `pnpm --filter <package-name> <script>` for one package.
- Before a commit, start `pnpm build`, `pnpm test` and `pnpm typecheck`.
- To change the configuration of a package, use `cue-config` in its folder. Do not edit `tsconfig.json` manually.

## New procedures and packages

- To make a package, start `node packages/mark/dist/cli.js lib new <name>`. Then start `pnpm install` and `pnpm build`.
- The command makes `packages/<name>` with the `cue-config` files, `src/module.ts`, `src/register.ts` and the `client.procedures` field.
- `src/module.ts` holds the procedures as data. Only `src/register.ts`, the `./register` entry, registers them in the global registry.
- An import of a package root or of `./module` must register nothing. `scripts/check-side-effects.mjs` fails when one does.
- A package that runs in a browser lists its browser entries in `client.browser` of its `package.json`.
- `scripts/check-browser-entries.mjs` fails when one of these entries reaches a Node built-in, with or without the prefix `node:`.
- To make a procedure, start `node packages/mark/dist/cli.js procedure new <name> --path packages/<package>`.
- This repository has no `pnpm package add` command. Use `lib new` for each new package.
- To examine all packages, start `node packages/mark/dist/cli.js lib audit`.
