/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * The package has one procedure, `dag.traverse`. It came from `@procedures/lib`, and its name
 * stays the same. The graph algorithms of the package root do not need this module.
 */

import {
  definePackage,
  createProcedure,
  RUNS_REFS_TAG,
  type ProcedureContext,
  type ProcedureModule,
  type PackageDefinition,
} from "@procedures/client";
import { dagTraverse } from "./procedures/traverse.js";
import {
  DagTraverseInputSchema,
  DagTraverseOutputSchema,
  type DagTraverseInput,
  type DagTraverseOutput,
} from "./procedures/types.js";

// =============================================================================
// dag.* Procedures
// =============================================================================

const dagTraverseProcedure = createProcedure()
  .path(["dag", "traverse"])
  .input(DagTraverseInputSchema)
  .output(DagTraverseOutputSchema)
  .meta({
    description: "Traverse ecosystem packages in dependency order, executing visit procedure for each",
    // It runs the procedure refs of its input: a server with an expose rule limits what they call
    tags: [RUNS_REFS_TAG],
    // It gets the packages from lib.scan (@procedures/lib). This package cannot import that one,
    // because @procedures/lib depends on this package.
    calls: ["lib.scan"],
    // Its own effect is the scan of the workspace. The admission examines each visit call.
    effects: { reads: ["fs"], writes: [] },
    args: [],
    shorts: { root: "r", concurrency: "j", continueOnError: "c", dryRun: "d" },
    output: "streaming",
  })
  .handler(async (input: DagTraverseInput, ctx: ProcedureContext): Promise<DagTraverseOutput> => {
    return dagTraverse(input, ctx);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

const dagPackage: PackageDefinition = definePackage("@procedures/dag", [dagTraverseProcedure]);

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 *
 * `dag.traverse` uses `lib.scan`. This module cannot list the module of `@procedures/lib` as a
 * dependency, because that package depends on this one. A host registers both modules
 * (`bundle-dev`, `bundle-mcp` and `mark` do).
 */
export const dagModule: ProcedureModule = dagPackage.module;

export default dagModule;

/**
 * This function registers the procedures of @procedures/dag in a registry. The default is the
 * global registry. Importing this file registers nothing: the `./register` entry starts this
 * function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export const registerDagProcedures: PackageDefinition["register"] = dagPackage.register;
