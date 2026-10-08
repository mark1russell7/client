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

- Each folder in `packages/` is one package. The packages keep the names of their old repositories.
- The folder `packages/mark` holds `@mark1russell7/cli`, the `mark` CLI. The folder `packages/cli` holds the repository tool.
- The old repositories are archived. Do not change them. Make all changes in this repository.
- Git ignores `dist/`. Do not commit build output.

## Dependencies

- A package uses another package of this repository with `workspace:*`.
- The general packages are in other repositories: `cue`, `logger`, `splay`, `splay-react`, `docker-sqlite` and `docker-mongo`.
- A package of this repository can use a general package with a `github:` specifier.
- A general package must not use a package of this repository.

## Commands

- Start `pnpm build` after a change. Dependent packages read the types from `dist/`.
- Use `pnpm --filter <package-name> <script>` for one package.
- Before a commit, start `pnpm build`, `pnpm test` and `pnpm typecheck`.
- To change the configuration of a package, use `cue-config` in its folder. Do not edit `tsconfig.json` manually.

## New procedures and packages

- To make a procedure, start `node packages/mark/dist/cli.js procedure new <name> --path packages/<package>`.
- At this time, do not use `pnpm package add`. It makes packages without a `dist/` build, and the other packages cannot use them.
- Ask the user before you make a new package.
