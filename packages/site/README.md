# site

The website of the client ecosystem. GitHub Pages serves it at <https://mark1russell7.github.io/client/>.

## Pages

- **Composer**: build a program from procedure blocks, and run it in the browser with the real client. The blocks, the JSON and the TypeScript show the same program. The trace shows each call with its input, its output and its time.
- **Procedures**: every procedure of the workspace, with its input and output schemas, its CLI command and its MCP tool name. The filters are in the URL.
- **Architecture**: the packages and their dependencies, in levels.
- **What Claude sees**: the tools of the `dev-tools` MCP server.

## The Composer

- A program runs in a Web Worker with a time limit of 8 s. The Stop button ends it. Thus a long program does not stop the page.
- A program from a link of another person does not run before you press Run.
- Undo and Redo (`Ctrl+Z`, `Ctrl+Shift+Z`) go through the edits. Each edit is also an entry of the browser history, so the Back button returns to the previous program.
- The Composer marks a `$ref` whose name is not in scope, a call of an unknown procedure, and a list of calls that runs as a chain. It shows NaN, Infinity and undefined in a result.
- The TypeScript tab gives code that runs with Node: a test runs it for each example.

## How it works

- `scripts/gen-data.mjs` reads the workspace: each `package.json`, and the procedures of each built package. It writes `src/data/generated/`. Git ignores that folder.
- The site depends on each package that registers procedures, so `pnpm -r build` builds them first. The script stops with an error when a package is not built or does not load. `SITE_ALLOW_LOAD_FAILURES=1` lets a local build continue, and the footer then names the packages that did not load.
- `scripts/core-fields.mjs` reads the input fields of the core procedures from their TypeScript source. Their runtime schemas do not list fields.
- The Composer imports `@mark1russell7/client/browser`. That entry point has no Node server code.

## Commands

From the root of the repository:

```bash
pnpm build                                    # build every package: the data reads their dist/
pnpm --filter @mark1russell7/site dev         # the site with hot reload
pnpm --filter @mark1russell7/site test        # the unit tests: the program model, the runtime, the TypeScript tab
pnpm --filter @mark1russell7/site test:e2e    # the browser smoke test (Playwright) against the built site
SITE_BASE=/ pnpm --filter @mark1russell7/site build
```

The browser test needs Chromium: start `pnpm --filter @mark1russell7/site exec playwright install chromium` once.
