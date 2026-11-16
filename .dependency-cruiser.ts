// The import boundaries of the procedures stack (roadmap CLI-83). They guard invariant I9 of
// packages/documentation/ARCHITECTURE.md. Start the check with `pnpm check:boundaries`, after
// `pnpm build`: an import of another package resolves through its exports map to its dist/ folder.
//
// The shared package @mark1russell7/boundaries gives the rules and the options of each pnpm
// workspace: a relative import stays in its package, an import of another package goes through an
// entry of its package.json, an import of a workspace package resolves, an import of a workspace
// scope names a known package, and no package imports an app. The analysis does not follow
// node_modules and the dist/ folders, and it resolves an import as Node resolves an ESM import. This
// file adds the rules of this repository: a transport does not import the server, and only the shell
// package starts a program.
// scripts/check-boundaries.test.ts tests all the rules on a fixture repository.
//
// The rule "a browser entry imports no Node built-in" is not here: scripts/check-browser-entries.ts
// (CLI-39) examines it.

import { boundaries, type Config, type Rule } from "@mark1russell7/boundaries";

const I9 = "Invariant I9 (Import boundaries) of packages/documentation/ARCHITECTURE.md.";

/** The modules of a transport: the client and server transports of the core, and the MCP transport. */
const TRANSPORTS = ["^packages/client/src/adapters/", "^packages/client-mcp/src/transport/"];

/**
 * The server: `ProcedureServer`, the `Server` under it, the host parts that build on them, and the
 * packages of the hosts. The shared helpers of the server folder (method.ts, types.ts,
 * browser-guard.ts, request-auth.ts, last-resort.ts, error-policy.ts, error-response.ts) are the
 * wire of each face, so a transport can import them.
 */
const SERVER = [
  "^packages/client/src/server/(procedure-server|server|host-policy|host-procedures|limits|index)\.ts$",
  "^packages/client/dist/server/",
  "^packages/client-mcp/src/(host|face)\.ts$",
  "^packages/(server|client-server)/",
  "^@procedures/(server|peer)(/|$)",
];

/** The shell package (`@procedures/shell`): the one package that starts a program. */
const SHELL = "^packages/client-shell/";

/**
 * The module that starts a program: the built-in `child_process`, by each of its two names. The
 * shared options exclude node_modules from the analysis, so an import of an npm package that wraps
 * it (execa, cross-spawn) does not show here. scripts/check-packages.ts reads the dependencies of
 * each package for these packages.
 */
const PROGRAM_STARTS = "^(node:)?child_process$";

/** The tests. They start programs of their own fixtures, and they do not ship. */
const TESTS = ["\\.test\\.ts$", "/test/", "/__tests__/"];

/** The rules of this repository. `boundaries()` puts the reference I9 before each comment. */
const CLIENT_RULES: Rule[] = [
  {
    name: "transport-imports-server",
    severity: "error",
    comment: "A transport does not import the server. A server uses the transports, so this import makes a cycle of layers. Move the shared code to a module that the transport and the server both import.",
    from: { path: TRANSPORTS },
    to: { path: SERVER },
  },
  {
    name: "transport-reaches-server",
    severity: "error",
    comment: "A transport reaches the server through other modules, for example through a barrel file (an index.ts). Import the module that has the code, not the barrel.",
    from: { path: TRANSPORTS },
    to: { path: SERVER, reachable: true },
  },
  {
    name: "program-start-outside-shell",
    severity: "error",
    comment: "Only the shell package starts a program. On Windows its lookup finds a name with no folder only in the folders of PATH, never in the working folder, so a git.exe in a cloned repository does not start. Use spawnProgram, spawnProgramSync, runCommand, streamCommand or processes of @procedures/shell/command. An import of the types of node:child_process is allowed.",
    from: { path: "^packages/[^/]+/src/", pathNot: [SHELL, ...TESTS] },
    to: { path: PROGRAM_STARTS, dependencyTypesNot: ["type-only"] },
  },
];

/** The configuration for the repository in the folder `root`. The test gives it a fixture repository. */
export function config(root: string): Config {
  return boundaries(root, {
    apps: "private",
    reference: I9,
    forbidden: CLIENT_RULES,
    options: { reporterOptions: { text: { highlightFocused: true } } },
  });
}

export default config(import.meta.dirname);
