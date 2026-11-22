// The npm names of the packages of this repository before the scope change of 2026-10-12, and
// their new names. The owner moved the packages from the scope @mark1russell7 to @procedures.
// The general packages (cue, splay, docker-sqlite and the others) keep the scope @mark1russell7:
// they are not in this map.
//
// scripts/check-scope.ts uses the map to find old names, and scripts/npm-bootstrap.ts
// --deprecate-old uses it to point the old npm packages to the new ones.

/** The old npm scope of the packages of this repository. */
export const OLD_SCOPE: string = "@mark1russell7/";
/** The npm scope of the packages of this repository since 2026-10-12. */
export const NEW_SCOPE: string = "@procedures/";

/** The old name (without its scope) of each package, and its new name (without its scope). */
export const OLD_TO_NEW: Readonly<Record<string, string>> = Object.freeze({
  client: "client",
  cli: "mark",
  server: "server",
  "client-server": "peer",
  mcp: "mcp",
  "client-mcp": "mcp-server",
  "mcp-dev-tools": "mcp-dev-tools",
  "client-cli": "cli-run",
  "bundle-dev": "bundle-dev",
  "bundle-mcp": "bundle-mcp",
  site: "site",
  documentation: "documentation",
  "repo-cli": "repo-cli",
  ...Object.fromEntries(
    [
      "shell", "fs", "git", "docker", "pnpm", "node", "vite", "vitest", "cue", "mongo", "sqlite", "s3",
      "snapshot", "splay", "dag", "lib", "procedure", "store", "collections", "playground",
    ].map((name) => [`client-${name}`, name]),
  ),
});
