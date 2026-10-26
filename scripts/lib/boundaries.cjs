// The rules of the import boundaries of the procedures stack (roadmap CLI-83), for the repository in
// a folder. .dependency-cruiser.cjs gives them for the repository root, and
// scripts/check-boundaries.test.mjs gives them for its fixture repositories. The rules use paths
// relative to that folder (the working folder of dependency-cruiser). Nothing here is special to
// this repository except the names in TRANSPORTS and SERVER, so the file can move to a shared
// preset later.

const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

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

/**
 * The apps: each private package of packages/ (`"private": true` in its package.json). An app is
 * a leaf of the graph: it imports libraries, and no other package imports it.
 */
function apps(root) {
  const found = [];
  let folders = [];
  try {
    folders = readdirSync(join(root, "packages"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return found;
  }
  for (const folder of folders) {
    try {
      const manifest = JSON.parse(readFileSync(join(root, "packages", folder.name, "package.json"), "utf8"));
      if (manifest.private === true) found.push({ folder: folder.name, name: manifest.name });
    } catch {
      // A folder without a package.json is not a package.
    }
  }
  return found;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The configuration for the repository in the folder `root`. */
function boundaries(root) {
  const appList = apps(root);
  const appPaths = appList.flatMap(({ folder, name }) => [`^packages/${escape(folder)}/`, ...(name ? [`^${escape(name)}(/|$)`] : [])]);
  return {
    forbidden: [
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
        name: "relative-import-into-another-package",
        severity: "error",
        comment: `${I9} A relative import leaves its package. Import the other package by its name, through an entry of its exports map.`,
        from: { path: "^packages/([^/]+)/" },
        to: { path: "^packages/", pathNot: "^packages/$1/", dependencyTypes: ["local"] },
      },
      {
        name: "import-of-another-package-src",
        severity: "error",
        comment: `${I9} An import reaches the src/ folder of another package. Import the other package through an entry of its exports map.`,
        from: { path: "^packages/([^/]+)/" },
        to: { path: ["^packages/[^/]+/src/", "^@procedures/[^/]+/src(/|$)"], pathNot: "^packages/$1/" },
      },
      {
        name: "not-a-declared-export",
        severity: "error",
        comment: `${I9} An import of a package of this repository does not resolve. The path is not an entry of its exports map, or the package is not built. Start pnpm build first.`,
        from: { path: "^packages/" },
        to: { path: "^@procedures/", couldNotResolve: true },
      },
      ...(appPaths.length > 0
        ? [
            {
              name: "import-of-an-app",
              severity: "error",
              comment: `${I9} A package imports an app (${appList.map(({ name, folder }) => name ?? folder).join(", ")}). An app is a leaf: no other package imports it. Move the shared code to a library package.`,
              from: { path: "^packages/([^/]+)/" },
              to: { path: appPaths, pathNot: "^packages/$1/" },
            },
          ]
        : []),
    ],
    options: {
      // Only the source of the packages. The tests and the declaration files are not part of a boundary.
      exclude: { path: ["(^|/)node_modules/", "\\.(test|spec|e2e)\\.[cm]?[jt]sx?$", "\\.d\\.[cm]?ts$", "/(test|tests|e2e|__tests__|fixtures)/"] },
      doNotFollow: { path: ["(^|/)node_modules/", "^packages/[^/]+/dist/"] },
      // A type-only import is a boundary too.
      tsPreCompilationDeps: true,
      // An import of another package resolves through its exports map, as Node resolves it.
      // dependency-cruiser maps an import of "./x.js" to the file x.ts itself.
      enhancedResolveOptions: {
        exportsFields: ["exports"],
        conditionNames: ["import", "node", "default"],
        mainFields: ["module", "main"],
      },
      skipAnalysisNotInRules: true,
      reporterOptions: { text: { highlightFocused: true } },
    },
  };
}

module.exports = { boundaries };
