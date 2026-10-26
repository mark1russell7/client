/**
 * Module (no side effects): the modules of the dev workflow bundle, for `createRegistry()`.
 *
 * `register.ts` registers the same modules in the global registry.
 * (`dag.traverse` is in the module of `client-dag`. It calls `lib.scan` of `client-lib`.)
 */

import { definePackage, clientModule, type ProcedureModule, type PackageDefinition } from "@procedures/client";
import shellModule from "@procedures/shell/module";
import fsModule from "@procedures/fs/module";
import cliModule from "@procedures/cli-run/module";
import pnpmModule from "@procedures/pnpm/module";
import libModule from "@procedures/lib/module";
import dagModule from "@procedures/dag/module";
import procedureModule from "@procedures/procedure/module";
import compilerModule from "@procedures/compiler/module";

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
  // dag.traverse (it calls lib.scan of libModule)
  dagModule,
  procedureModule,
  // The check and the compiler of programs (roadmap R22)
  compilerModule,
];

const bundleDevPackage: PackageDefinition = definePackage("@procedures/bundle-dev", [], bundleDevModules);

/** The bundle as one module: no procedures of its own, and the modules above as requirements. */
export const bundleDevModule: ProcedureModule = bundleDevPackage.module;

export default bundleDevModule;

/**
 * This function registers the procedures of @procedures/bundle-dev, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export const registerBundleDevProcedures: PackageDefinition["register"] = bundleDevPackage.register;
