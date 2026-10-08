# site

The website of the client ecosystem. GitHub Pages serves it at <https://mark1russell7.github.io/client/>.

## Pages

- **Composer**: build a program from procedure blocks, and run it in the browser with the real client. The blocks, the JSON and the TypeScript show the same program. The trace shows each call with its input, its output and its time.
- **Procedures**: every procedure of the workspace, with its input and output schemas, its CLI command and its MCP tool name.
- **Architecture**: the packages and their dependencies, in levels.
- **What Claude sees**: the tools of the `dev-tools` MCP server.

## How it works

- `scripts/gen-data.mjs` reads the workspace: each `package.json`, and the procedures of each built package. It writes `src/data/generated/`. Git ignores that folder.
- `scripts/core-fields.mjs` reads the input fields of the core procedures from their TypeScript source. Their runtime schemas do not list fields.
- The Composer imports `@mark1russell7/client/browser`. That entry point has no Node server code.

## Commands

From the root of the repository:

```bash
pnpm build                                    # build every package: the data reads their dist/
pnpm --filter @mark1russell7/site dev         # the site with hot reload
pnpm --filter @mark1russell7/site test        # the examples, the runtime and the program model
SITE_BASE=/ pnpm --filter @mark1russell7/site build
```
