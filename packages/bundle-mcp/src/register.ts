/**
 * bundle-mcp - the tools that Claude gets from the dev-tools MCP server
 *
 * Importing a client package registers its procedures. The MCP server exposes only the
 * namespaces in `mcpNamespaces`. Claude has fs.*, git.* and pnpm.* through its own shell, so
 * they are not here.
 *
 * shell.* is registered, because docker.* runs its commands through shell.exec. But it is not a
 * tool, and a data-driven procedure (client.chain, eval, a procedure that procedure.define made)
 * cannot call it: the server lets such a procedure call only the exposed procedures.
 * snapshot.*, s3.* and test.* are not in the bundle: snapshot.restore and s3.delete change data,
 * and vitest.* runs the tests. See documentation/BUGS-2026-07.md (H18) and
 * ARCHITECTURE-PROPOSALS-2026-10.md (P2).
 *
 * tools.snapshot.txt in impl-mcp-dev pins the result: a test compares the server's tools with it.
 */

// Core orchestration
import "@mark1russell7/client-lib";
import "@mark1russell7/client-procedure";
import "@mark1russell7/client-cue";

// Infrastructure
import "@mark1russell7/client-docker";

// Databases
import "@mark1russell7/client-mongo";
import "@mark1russell7/client-sqlite";

// Testing
import "@mark1russell7/client-vitest";

/**
 * The namespaces (first path segments) of the procedures that the MCP server gives to Claude as tools.
 * `cli` is not one: `cli.run` runs any `mark` command, also `shell exec`, so it would give back what
 * the list keeps out (deep dive CLI-5, TRN-2).
 */
export const mcpNamespaces: readonly string[] = [
  "client",
  "cue",
  "db",
  "docker",
  "lib",
  "logs",
  "mongo",
  "procedure",
  "vitest",
];

/**
 * Procedures of the exposed namespaces that are not tools all the same:
 * - `vitest.watch` starts a long-running process. `vitest.stop` and `vitest.list` manage these
 *   processes. A tool call does not leave a process running, so the three stay out (deep dive WRP-4);
 * - `procedure.store`, `load`, `sync`, `remote` and `register` work only on a registry that has a
 *   procedure store, and the MCP server has none: they fail with NOT_CONFIGURED (deep dive
 *   CORE-16, DATA-10). `procedure.register` with no store declares a procedure with no handler.
 */
export const mcpExclude: readonly string[] = [
  "vitest.watch",
  "vitest.stop",
  "vitest.list",
  "procedure.store",
  "procedure.load",
  "procedure.sync",
  "procedure.remote",
  "procedure.register",
];
