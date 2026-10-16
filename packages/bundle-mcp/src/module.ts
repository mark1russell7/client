/**
 * bundle-mcp - the tools that Claude gets from the dev-tools MCP server
 *
 * Importing a client package registers its procedures. The MCP server exposes only the
 * namespaces in `mcpNamespaces`. Claude has fs.*, git.* and pnpm.* through its own shell, so
 * they are not tools.
 *
 * shell.*, fs.* and git.* are registered all the same: docker.* runs its commands through
 * shell.run, and lib.* reads files and the repository (client-lib registers client-fs and
 * client-git). They are not tools. A code procedure calls them only when its `metadata.calls`
 * names them, and a data-driven procedure (client.chain, eval, a procedure that procedure.define
 * made) cannot call them: the server lets such a procedure call only the exposed procedures.
 * snapshot.*, s3.* and test.* are not in the bundle: snapshot.restore and s3.delete change data,
 * and vitest.* runs the tests. See documentation/BUGS-2026-07.md (H18) and
 * ARCHITECTURE-PROPOSALS-2026-10.md (P2).
 *
 * tools.snapshot.txt in impl-mcp-dev pins the result: a test compares the server's tools with it.
 *
 * This file has no side effects: the dev-tools server builds its own registry from
 * `bundleMcpModules`. `register.ts` registers the same modules in the global registry.
 */

import { clientModule, defineModule, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import libModule from "@procedures/lib/module";
import procedureModule from "@procedures/procedure/module";
import compilerModule from "@procedures/compiler/module";
import cueModule from "@procedures/cue/module";
import dockerModule from "@procedures/docker/module";
import mongoModule from "@procedures/mongo/module";
import sqliteModule from "@procedures/sqlite/module";
import vitestModule from "@procedures/vitest/module";

/**
 * The modules of the bundle, for `createRegistry()`. The modules that they require (the file,
 * repository and shell procedures) come with them. Importing this file registers nothing.
 */
export const bundleMcpModules: readonly ProcedureModule[] = [
  // The control flow: the tool surface has the client namespace
  clientModule,
  // Core orchestration
  libModule,
  procedureModule,
  // program.check, compile, diagram and explain: Claude examines a program before it runs it (roadmap R22, R23).
  // The module also registers sdk.openrpc and sdk.typescript, but sdk is not in mcpNamespaces.
  compilerModule,
  cueModule,
  // Infrastructure
  dockerModule,
  // Databases
  mongoModule,
  sqliteModule,
  // Testing
  vitestModule,
];

/** The bundle as one module: no procedures of its own, and the modules above as requirements. */
export const bundleMcpModule: ProcedureModule = defineModule("@procedures/bundle-mcp", [], bundleMcpModules);

export default bundleMcpModule;

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
  "program",
  "vitest",
];

/**
 * Procedures of the exposed namespaces that are not tools all the same:
 * - `vitest.watch` starts a long-running process. `vitest.stop` and `vitest.list` manage these
 *   processes. A tool call does not leave a process running, so the three stay out (deep dive WRP-4);
 * - `docker.prune` deletes in bulk, `docker.volume.remove` deletes the data of a volume, and
 *   `docker.push` can carry an image out to any registry (roadmap R41);
 * - `procedure.store`, `load`, `sync`, `remote` and `register` are in `@procedures/store`
 *   (roadmap 3.2). The bundle does not import that package, so the MCP server does not have them.
 *   The names stay here: if a host adds the package, they stay out of the tools. They work only on
 *   a registry that has a store, and `procedure.register` with no store declares a procedure
 *   with no handler (deep dive CORE-16, DATA-10).
 */
export const mcpExclude: readonly string[] = [
  "docker.prune",
  "docker.push",
  "docker.volume.remove",
  "vitest.watch",
  "vitest.stop",
  "vitest.list",
  "procedure.store",
  "procedure.load",
  "procedure.sync",
  "procedure.remote",
  "procedure.register",
];

/**
 * This function registers the procedures of @procedures/bundle-mcp, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerBundleMcpProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [bundleMcpModule]);
}
