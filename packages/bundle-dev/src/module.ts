/**
 * Module (no side effects): the modules of the dev workflow bundle, for `createRegistry()`.
 *
 * `register.ts` imports the same packages, which registers them in the global registry.
 * (`client-dag` has no procedures of its own: `dag.traverse` is in `client-lib`.)
 */

import { defineModule, type ProcedureModule } from "@mark1russell7/client";
import shellModule from "@mark1russell7/client-shell/module";
import fsModule from "@mark1russell7/client-fs/module";
import cliModule from "@mark1russell7/client-cli/module";
import pnpmModule from "@mark1russell7/client-pnpm/module";
import libModule from "@mark1russell7/client-lib/module";
import procedureModule from "@mark1russell7/client-procedure/module";

/** The modules of the bundle. `libModule` brings the file and repository procedures with it. */
export const bundleDevModules: readonly ProcedureModule[] = [
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
export const bundleDevModule: ProcedureModule = defineModule("@mark1russell7/bundle-dev", [], bundleDevModules);

export default bundleDevModule;
