/**
 * Module (no side effects): the modules of the dev workflow bundle, for `createRegistry()`.
 *
 * `register.ts` registers the same modules in the global registry.
 * (`client-dag` has no procedures of its own: `dag.traverse` is in `client-lib`.)
 */

import { clientModule, defineModule, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import shellModule from "@procedures/shell/module";
import fsModule from "@procedures/fs/module";
import cliModule from "@procedures/cli-run/module";
import pnpmModule from "@procedures/pnpm/module";
import libModule from "@procedures/lib/module";
import procedureModule from "@procedures/procedure/module";

/** The modules of the bundle. `libModule` brings the file and repository procedures with it. */
export const bundleDevModules: readonly ProcedureModule[] = [
  // The control flow
  clientModule,
  // Core infrastructure
  shellModule,
  fsModule,
  // CLI wrappers
  cliModule,
  pnpmModule,
  // Dev workflow
  libModule,
  procedureModule,
];

/** The bundle as one module: no procedures of its own, and the modules above as requirements. */
export const bundleDevModule: ProcedureModule = defineModule("@procedures/bundle-dev", [], bundleDevModules);

export default bundleDevModule;

/**
 * This function registers the procedures of @procedures/bundle-dev, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerBundleDevProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [bundleDevModule]);
}
