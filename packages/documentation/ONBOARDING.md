# Onboarding

This guide tells you how to build the monorepo, start procedures, and add a package or a procedure. The [July 2026 version](./history/ONBOARDING-2026-07.md) is history. For the design, read [ARCHITECTURE.md](./ARCHITECTURE.md).

## What you need

- Node 22 or later. CI tests Node 22, 24 and 26.
- pnpm 12. The root `package.json` sets the version in `packageManager`.
- Git.
- The CUE binary (`cue`), for `lib new` and `cue-config`. CI uses CUE v0.15.1. Get it from <https://cuelang.org/docs/install/>.

## Build and test

Do these steps in the root folder of the repository:

1. Install the dependencies: `pnpm install`
2. Build all packages in the sequence of their dependencies: `pnpm build`
3. Start the tests: `pnpm test`
4. Examine the types: `pnpm typecheck`
5. Examine the prose: `pnpm lint:ste`

A package reads the types of its dependencies from their `dist/` folders. Thus, build again after a change, before you test a dependent package. Git ignores `dist/`.

These checks run in CI too:

- The types of the test files: `node .github/scripts/typecheck-tests.mjs`. The presets of `cue` exclude the test files from `pnpm typecheck`.
- The package audit: `node packages/mark/dist/cli.js lib audit`.
- The browser smoke test of the site: `pnpm --filter @procedures/site test:e2e`. It needs Playwright and Chromium.

The end-to-end tests of `mark` are not in CI: `pnpm --filter @procedures/mark test:e2e`.

For one package, use a filter: `pnpm --filter @procedures/git test`.

## Start procedures with `mark`

The `mark` CLI is `packages/mark`. After the build, start it with Node:

```sh
node packages/mark/dist/cli.js --help
node packages/mark/dist/cli.js git status
node packages/mark/dist/cli.js git commit -m "A message"
node packages/mark/dist/cli.js fs read README.md
```

The words after `cli.js` are the path of a procedure, then its arguments. The flags are the fields of its input. `--help` after a path shows the arguments and the flags. The exit code is 1 for an error, for `success: false` and for a non-zero `exitCode` (the `mark` README gives the rules).

To start a program as JSON, use `--json`. [PROGRAM-FORMAT.md](./PROGRAM-FORMAT.md) gives the format.

```sh
node packages/mark/dist/cli.js --json '{"$proc":["client","chain"],"input":{"steps":[{"$proc":["client","identity"],"input":{"value":2},"$name":"x"},{"$ref":"x"}]}}'
```

`mark` registers the control-flow procedures of the core, but not the other core procedures (`client.add`, the string and array procedures). The Composer of the site (<https://mark1russell7.github.io/client/>) has all of them.

### Warm mode

Each `mark` command starts Node and loads all packages. A warm server keeps them loaded:

```sh
node packages/mark/dist/cli.js --server          # start a server for this folder
node packages/mark/dist/cli.js git status        # this command goes to the server
node packages/mark/dist/cli.js server status
node packages/mark/dist/cli.js server stop
```

`mark` uses the server only for commands in the same folder, from the same build of `mark`. The server listens on `127.0.0.1`. Each request must send the token of its lockfile in `~/.mark/servers/`. Use `--local` to start a command in the CLI process.

## Claude Code and the MCP server

`packages/impl-mcp-dev` is the MCP server that gives procedures to Claude as tools. Claude Code starts it over stdio. Use this configuration, with your path:

```json
{
  "mcpServers": {
    "dev-tools": {
      "command": "node",
      "args": ["/path/to/client/packages/impl-mcp-dev/dist/server.js"]
    }
  }
}
```

The tools come from `bundle-mcp` (`mcpNamespaces` and `mcpExclude`). `packages/impl-mcp-dev/tools.snapshot.txt` lists them, and a test compares the server with the list. Claude Code starts the server once for each session. Thus, after a rebuild, restart the MCP server to get the changes.

## Add a package

Use the scaffold of `mark`. Do not write `package.json` or `tsconfig.json` yourself.

```sh
node packages/mark/dist/cli.js lib new my-package
pnpm install
pnpm build
```

The command makes `packages/my-package` with the `cue-config` files, `src/register.ts`, `src/types.ts`, the `client.procedures` field and a `workspace:*` dependency on `client`.

The site depends on each package that registers procedures. Thus, add the new package to the `devDependencies` of `packages/site`. The site build fails with a message that gives the package to add.

To change the configuration of a package, use `cue-config` in its folder. For example, `npx cue-config add node`, then `npx cue-config generate`.

## Add a procedure

```sh
node packages/mark/dist/cli.js procedure new myThing --path packages/my-package
```

The command writes the procedure file, adds the types to `src/types.ts`, and adds the registration to `src/register.ts`. Then write the handler and its tests, and build.

A procedure that starts programs gives an argument list to `runCommand()` (`@procedures/shell/command`) or to `shell.run`. Do not make a shell string.

## Rules of the repository

- Write prose in ASD-STE100 Simplified Technical English. `pnpm lint:ste` examines the files of `ste.config.json`.
- Do not commit `dist/`.
- Do not change the old repositories in `~/git/_legacy`. They are archived.
- A package of this repository uses another one with `workspace:*`. A general package (`cue`, `logger`, `splay`, `splay-react`, `docker-sqlite`, `docker-mongo`) is in its own repository, with a `github:` specifier.
- To change the tools of Claude, change `bundle-mcp` and `tools.snapshot.txt` in one commit.

## Where to read next

- [ARCHITECTURE.md](./ARCHITECTURE.md): the layers, the hosts, streaming and security.
- [PROGRAM-FORMAT.md](./PROGRAM-FORMAT.md): the program format.
- [PACKAGES.md](./PACKAGES.md) and [PROCEDURES.md](./PROCEDURES.md): the packages and the procedures, made from the built packages.
- [deep-dive-2026-10/STATUS.md](./deep-dive-2026-10/STATUS.md): the status of each known defect.
