// The import boundaries of the procedures stack (roadmap CLI-83). They guard invariant I9 of
// packages/documentation/ARCHITECTURE.md. Start the check with `pnpm check:boundaries`, after
// `pnpm build`: an import of another package resolves through its exports map to its dist/ folder.
//
// The shared package @mark1russell7/boundaries gives the rules and the options of each pnpm
// workspace: a relative import stays in its package, an import of another package goes through an
// entry of its package.json, an import of a workspace package resolves, an import of a workspace
// scope names a known package, and no package imports an app. The analysis does not follow
// node_modules and the dist/ folders, and it resolves an import as Node resolves an ESM import. This
// file adds the rules of this repository: a transport does not import the server.
// scripts/check-boundaries.test.mjs tests all the rules on a fixture repository.
//
// The rule "a browser entry imports no Node built-in" is not here: scripts/check-browser-entries.mjs
// (CLI-39) examines it.

const { boundaries } = require("@mark1russell7/boundaries");

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

/** The rules of this repository. `boundaries()` puts the reference I9 before each comment. */
const CLIENT_RULES = [
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
];

/** The configuration for the repository in the folder `root`. The test gives it a fixture repository. */
function config(root) {
  return boundaries(root, {
    apps: "private",
    reference: I9,
    forbidden: CLIENT_RULES,
    options: { reporterOptions: { text: { highlightFocused: true } } },
  });
}

module.exports = config(__dirname);
// The test reads the function. It is not enumerable, so dependency-cruiser does not see it.
Object.defineProperty(module.exports, "config", { value: config, enumerable: false });
