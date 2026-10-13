# Instructions for Claude

## Writing style

Write all prose of this repository in the style of ASD-STE100 Simplified Technical English (STE). This prose is the README files, this file, the TSDoc comments and the text that the site shows. The linter [`ste-lint`](https://github.com/mark1russell7/ste-lint) examines it.

- After a change to prose, start `pnpm lint:ste` and correct each finding. CI fails when there is an error.
- Keep each instruction to 20 words or fewer, and each description to 25 words or fewer.
- Do not use the modal verbs (`should`, `may`, `might`, `would`), semicolons or Latin abbreviations (`e.g.`, `i.e.`, `etc.`).
- Use the active voice. Start each sentence of a doc comment with its subject: "This function returns the value", not "Returns the value".
- Put code, file names and commands in code font. The linter counts each code span as one word.
- Add a word to the glossary in `ste.config.json` only if it is a real technical term of the project.
- At this time, the linter examines only the root files and `packages/cli`. The imported packages get the rules when their prose is rewritten.

## Repository structure

- Each folder in `packages/` is one package. The folders keep the names of their old repositories.
- The npm scope of the packages is `@procedures`. The npm name can differ from the folder: `packages/client-shell` holds `@procedures/shell`. The root README has the table of names.
- The folder `packages/mark` holds `@procedures/mark`, the `mark` CLI. The folder `packages/cli` holds the repository tool.
- `scripts/check-scope.mjs` fails when a file names a package of this repository with the old scope `@mark1russell7`.
- The old repositories are archived. Do not change them. Make all changes in this repository.
- Git ignores `dist/`. Do not commit build output.

## Dependencies

- A package uses another package of this repository with `workspace:*`.
- The general packages are in other repositories, with the npm scope `@mark1russell7`: `cue`, `logger`, `splay`, `splay-react`, `docker-sqlite` and `docker-mongo`.
- A package of this repository uses a general package with its npm version (for example `"@mark1russell7/cue": "^1.0.0"`). A `github:` specifier blocks the npm release.
- A general package must not use a package of this repository.

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
- To make a procedure, start `node packages/mark/dist/cli.js procedure new <name> --path packages/<package>`.
- Do not use `pnpm package add`. It makes packages without a `dist/` build, and the other packages cannot use them.
- To examine all packages, start `node packages/mark/dist/cli.js lib audit`.
