/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * The module has two parts. The hand-written procedure `dag.traverse` came from `@procedures/lib`,
 * and its name stays the same. The generated procedures come from the types of
 * `@mark1russell7/collections/dag`: `node scripts/wraps.ts generate` writes `src/manifest.ts`, so no
 * generated procedure can drift from its function. The graph algorithms of the package root do not
 * need this module.
 */

import * as dag from "@mark1russell7/collections/dag";
import {
  definePackage,
  createProcedure,
  RUNS_REFS_TAG,
  type AnyProcedure,
  type ProcedureContext,
  type ProcedureModule,
  type PackageDefinition,
} from "@procedures/client";
import { exportsModule } from "@procedures/compiler";
import { manifest } from "./manifest.js";
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

/** The manifest of the generated procedures: the names, the schemas, the effects and each exemption with its reason. */
export { manifest as dagManifest };

/** The generated procedures `dag.*`: one for each function of the home with JSON inputs and a JSON output. */
export const dagHomeProcedures: readonly AnyProcedure[] = exportsModule(manifest, dag, { name: "@procedures/dag" }).procedures;

const dagPackage: PackageDefinition = definePackage("@procedures/dag", [dagTraverseProcedure, ...dagHomeProcedures]);

/**
 * The module of this package, for `createRegistry()`: its procedures as data. An import of this
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
 * global registry. An import of this file registers nothing: the `./register` entry starts this
 * function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export const registerDagProcedures: PackageDefinition["register"] = dagPackage.register;
