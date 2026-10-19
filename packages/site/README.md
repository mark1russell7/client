# site

The website of the client ecosystem. GitHub Pages serves it at <https://mark1russell7.github.io/client/>.

## Pages

- **Composer**: build a program from procedure blocks, and run it in the browser with the real client. The blocks, the JSON and the TypeScript show the same program. The trace shows each call with its input, its output and its time.
- **Procedures**: every procedure of the workspace, with its input and output schemas, its CLI command and its MCP tool name. The filters are in the URL.
- **Architecture**: the packages and their dependencies, in levels.
- **What Claude sees**: the tools of the `dev-tools` MCP server.
- **Releases**: each version on a timeline, with its date and its changes. `scripts/releases-data.mjs` reads the changelogs and the git tags.
- **Status**: the open work of the roadmap, the open pull requests and the open issues. Below them, the history has the October deep dive and the July bug register.

## The Composer

- A program runs in a Web Worker with a time limit of 8 s. The Stop button ends it. Thus a long program does not stop the page.
- A program from a link of another person does not run before you press Run.
- Undo and Redo (`Ctrl+Z`, `Ctrl+Shift+Z`) go through the edits. Each edit is also an entry of the browser history, so the Back button returns to the previous program.
- The Composer marks an unknown procedure, a `$ref` whose name is not in scope, and a list of calls that runs as a chain. It shows NaN, Infinity and undefined in a result.
- The TypeScript tab gives code that runs with Node: a test runs it for each example.
- The Saved button saves the program under a name, and opens a saved program. `IndexedDbProgramStore` of `@procedures/store/indexeddb` keeps the programs in the browser. Without IndexedDB, a store in memory keeps them until the page closes. The store loads only when you open the saved programs.

## The Status page

- `scripts/status-board-data.mjs` makes the data of the board at build time. The script names no project, so the site template can use it.
- The open work comes from `packages/documentation/ROADMAP-2026-10.md`. Each row of a table with an `ID` column and a `Status` column is one item.
- The words of a status give its class: done, in progress, waiting, blocked, later or open. The page also shows the text of the status.
- The open pull requests and issues come from the GitHub GraphQL API in one request. The build gives the token in `GITHUB_TOKEN`.
- Without a token, or when GitHub does not answer, the page shows the roadmap only. It tells that the build could not read GitHub, and the build does not fail.
- The Pages workflow builds the site after each commit of `main` that passes CI, and every three hours. Thus the page follows GitHub without a push.
- The history loads only when you open it. `scripts/status-data.mjs` reads its closed documents: the October deep dive and the July register.

## How it works

- `scripts/gen-data.mjs` reads the workspace: each `package.json`, and the procedures of each built package. It writes `src/data/generated/`. Git ignores that folder.
- Each page loads the procedures without their schemas. The page of a procedure loads the schemas of its package only (`src/data/schemas.ts`).
- The site depends on each package that registers procedures, so `pnpm -r build` builds them first. The script stops with an error when a package is not built or does not load. `SITE_ALLOW_LOAD_FAILURES=1` lets a local build continue, and the footer then names the packages that did not load.
- `scripts/core-fields.mjs` reads the input fields of the core procedures from their TypeScript source. Their runtime schemas do not list fields.
- The Composer imports `@procedures/client/browser`. That entry point has no Node server code.

## Commands

From the root of the repository:

```bash
pnpm build                                    # build every package: the data reads their dist/
pnpm --filter @procedures/site dev         # the site with hot reload
pnpm --filter @procedures/site test        # the unit tests: the program model, the runtime, the TypeScript tab
pnpm --filter @procedures/site test:e2e    # the browser smoke test (Playwright) against the built site
SITE_BASE=/ pnpm --filter @procedures/site build
```

The browser test needs Chromium: start `pnpm --filter @procedures/site exec playwright install chromium` once.
