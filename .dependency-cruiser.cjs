// The import boundaries of the procedures stack (roadmap CLI-83). They guard invariant I9 of
// packages/documentation/ARCHITECTURE.md. Start the check with `pnpm check:boundaries`, after
// `pnpm build`: an import of another package resolves through its exports map to its dist/ folder.
//
// The shared package @mark1russell7/boundaries gives the rules of each pnpm workspace: a relative
// import stays in its package, an import of another package goes through an entry of its
// package.json, an import of a workspace package resolves, and no package imports an app. This file
// adds the rules of this repository: a transport does not import the server, and an import of the
// scope @procedures names a package of this workspace. scripts/check-boundaries.test.mjs tests all
// the rules on a fixture repository.
//
// The rule "a browser entry imports no Node built-in" is not here: scripts/check-browser-entries.mjs
// (CLI-39) examines it.

const { boundaries, workspacePackages } = require("@mark1russell7/boundaries");

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
  "^packages/client/src/server/(procedure-server|server|host-policy|host-procedures|limits|index)\\.ts$",
  "^packages/client/dist/server/",
  "^packages/client-mcp/src/(host|face)\\.ts$",
  "^packages/(server|client-server)/",
  "^@procedures/(server|peer)(/|$)",
];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The rules of this repository, for the workspace in the folder `root`. */
function clientRules(root) {
  const names = workspacePackages(root).map(({ name }) => escape(name));
  return [
    {
      name: "transport-imports-server",
      severity: "error",
      comment: `${I9} A transport does not import the server. A server uses the transports, so this import makes a cycle of layers. Move the shared code to a module that the transport and the server both import.`,
      from: { path: TRANSPORTS },
      to: { path: SERVER },
    },
    {
      name: "transport-reaches-server",
      severity: "error",
      comment: `${I9} A transport reaches the server through other modules, for example through a barrel file (an index.ts). Import the module that has the code, not the barrel.`,
      from: { path: TRANSPORTS },
      to: { path: SERVER, reachable: true },
    },
    {
      // The shared rule not-a-declared-export examines only the names of the workspace packages.
      name: "unknown-procedures-package",
      severity: "error",
      comment: `${I9} An import names a package of the scope @procedures that is not in this workspace. Correct the name, or add the package to packages/.`,
      from: { path: "^packages/" },
      to: { path: "^@procedures/", ...(names.length > 0 ? { pathNot: `^(${names.join("|")})(/|$)` } : {}), couldNotResolve: true },
    },
  ];
}

/** The configuration for the repository in the folder `root`. The test gives it a fixture repository. */
function config(root) {
  return boundaries(root, {
    apps: "private",
    reference: I9,
    forbidden: clientRules(root),
    options: {
      // The check reads only the src/ folders. An import of another package stops at its dist/ entry,
      // so the server code in the dist/ folder of the client does not make each transport fail.
      doNotFollow: { path: ["(^|/)node_modules/", "^packages/[^/]+/dist/"] },
      // An import of another package resolves through its exports map, as Node resolves an ESM
      // import. dependency-cruiser maps an import of "./x.js" to the file x.ts itself.
      enhancedResolveOptions: {
        exportsFields: ["exports"],
        conditionNames: ["import", "node", "default"],
        mainFields: ["module", "main"],
      },
      reporterOptions: { text: { highlightFocused: true } },
    },
  });
}

module.exports = config(__dirname);
// The test reads the function. It is not enumerable, so dependency-cruiser does not see it.
Object.defineProperty(module.exports, "config", { value: config, enumerable: false });
