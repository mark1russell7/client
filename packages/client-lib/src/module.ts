/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for lib operations
 *
 * This is the canonical home for lib.* procedures.
 * client-cli no longer registers these to avoid duplicates.
 */

import { createProcedure, zodAdapter, RUNS_REFS_TAG, defineModule, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import gitModule from "@procedures/git/module";
import fsModule from "@procedures/fs/module";
import {
  libScan,
  libRename,
  libNew,
  libAudit,
  libGraph,
} from "./procedures/lib/index.js";
import {
  ecosystemProcedures,
  EcosystemProceduresInputSchema,
  EcosystemProceduresOutputSchema,
  type EcosystemProceduresInput,
  type EcosystemProceduresOutput,
} from "./procedures/ecosystem/index.js";
import { coreCatch } from "./procedures/core/index.js";
import {
  LibScanInputSchema,
  LibRenameInputSchema,
  LibNewInputSchema,
  LibAuditInputSchema,
  CoreCatchInputSchema,
  type LibScanInput,
  type LibScanOutput,
  type LibRenameInput,
  type LibRenameOutput,
  type LibNewInput,
  type LibNewOutput,
  type LibAuditInput,
  type LibAuditOutput,
  type CoreCatchInput,
  type CoreCatchOutput,
  LibScanOutputSchema,
  LibRenameOutputSchema,
  LibNewOutputSchema,
  LibAuditOutputSchema,
  CoreCatchOutputSchema,
} from "./types.js";
import { LibGraphInputSchema, LibGraphOutputSchema, type LibGraphInput, type LibGraphOutput } from "./types.js";
import type { ProcedureContext } from "@procedures/client";

// =============================================================================
// lib.* Procedures
// =============================================================================

const libScanProcedure = createProcedure()
  .path(["lib", "scan"])
  .input(zodAdapter<LibScanInput>(LibScanInputSchema))
  .output(zodAdapter<LibScanOutput>(LibScanOutputSchema))
  .meta({
    description: "Scan for packages in the git directory",
    calls: ["fs.readdir", "fs.read.json", "git.status", "git.remote"],
    effects: { reads: ["fs"], writes: [] },
    args: [],
    shorts: {},
    output: "json",
  })
  .handler(async (input: LibScanInput, ctx: ProcedureContext): Promise<LibScanOutput> => {
    return libScan(input, ctx);
  })
  .build();

const libRenameProcedure = createProcedure()
  .path(["lib", "rename"])
  .input(zodAdapter<LibRenameInput>(LibRenameInputSchema))
  .output(zodAdapter<LibRenameOutput>(LibRenameOutputSchema))
  .meta({
    description: "Rename a package across the ecosystem",
    calls: ["fs.glob", "fs.read.json", "fs.write", "fs.exists"],
    // It rewrites package.json files and TypeScript imports of the whole workspace
    effects: { reads: ["fs"], writes: ["fs"] },
    args: ["oldName", "newName"],
    shorts: { dryRun: "n" },
    output: "json",
  })
  .handler(async (input: LibRenameInput, ctx: ProcedureContext): Promise<LibRenameOutput> => {
    return libRename(input, ctx);
  })
  .build();

const libNewProcedure = createProcedure()
  .path(["lib", "new"])
  .input(zodAdapter<LibNewInput>(LibNewInputSchema))
  .output(zodAdapter<LibNewOutput>(LibNewOutputSchema))
  .meta({
    description: "Create a new package in the ecosystem",
    calls: ["shell.run", "fs.exists", "fs.mkdir", "fs.write", "fs.read.json"],
    // It starts the cue-config CLI from the node_modules of the workspace: code of the project,
    // so it writes process. That CLI writes only files of the new package folder. An existing
    // folder is an error, so the procedure overwrites nothing.
    effects: { reads: ["fs"], writes: ["fs", "process"], destructive: false },
    args: ["name"],
    shorts: { dryRun: "n" },
    output: "json",
  })
  .handler(async (input: LibNewInput, ctx: ProcedureContext): Promise<LibNewOutput> => {
    return libNew(input, ctx);
  })
  .build();

const libAuditProcedure = createProcedure()
  .path(["lib", "audit"])
  .input(zodAdapter<LibAuditInput>(LibAuditInputSchema))
  .output(zodAdapter<LibAuditOutput>(LibAuditOutputSchema))
  .meta({
    description: "Audit ecosystem packages for issues",
    calls: ["fs.readdir", "fs.read.json", "git.status", "git.remote", "fs.exists", "fs.mkdir", "fs.write"],
    // It reads the registry for the flag notices. With `fix`, it makes only the missing folders
    // and files, so a second call changes nothing more.
    effects: { reads: ["fs", "registry"], writes: ["fs"], destructive: false, idempotent: true },
    args: [],
    shorts: { fix: "f" },
    output: "json",
  })
  .handler(async (input: LibAuditInput, ctx: ProcedureContext): Promise<LibAuditOutput> => {
    return libAudit(input, ctx);
  })
  .build();

// lib.graph (roadmap R44)
const libGraphProcedure = createProcedure()
  .path(["lib", "graph"])
  .input(zodAdapter<LibGraphInput>(LibGraphInputSchema))
  .output(zodAdapter<LibGraphOutput>(LibGraphOutputSchema))
  .meta({
    description: "The dependency graph of the workspace packages: nodes, workspace: edges, cycles and build levels",
    calls: ["fs.readdir", "fs.read.json"],
    effects: { reads: ["fs"], writes: [] },
    args: [],
    shorts: {},
    output: "json",
  })
  .handler(async (input: LibGraphInput, ctx: ProcedureContext): Promise<LibGraphOutput> => libGraph(input, ctx))
  .build();

// =============================================================================
// ecosystem.* Procedures
// =============================================================================

const ecosystemProceduresProcedure = createProcedure()
  .path(["ecosystem", "procedures"])
  .input(zodAdapter<EcosystemProceduresInput>(EcosystemProceduresInputSchema))
  .output(zodAdapter<EcosystemProceduresOutput>(EcosystemProceduresOutputSchema))
  .meta({
    description: "List all procedures across the ecosystem",
    // It imports the register file of each package: that code runs, and it registers procedures
    effects: { reads: ["fs", "registry"], writes: ["process", "registry"] },
    args: [],
    shorts: { namespace: "n" },
    output: "json",
  })
  .handler(async (input: EcosystemProceduresInput, ctx: ProcedureContext): Promise<EcosystemProceduresOutput> => {
    return ecosystemProcedures(input, ctx);
  })
  .build();

// dag.traverse is in the module of @procedures/dag. It calls lib.scan of this module.

// =============================================================================
// core.* Procedures
// =============================================================================

const coreCatchProcedure = createProcedure()
  .path(["core", "catch"])
  .input(zodAdapter<CoreCatchInput>(CoreCatchInputSchema))
  .output(zodAdapter<CoreCatchOutput>(CoreCatchOutputSchema))
  .meta({
    description: "Execute a procedure with error handling",
    // It runs the procedure refs of its input: a server with an expose rule limits what they call
    tags: [RUNS_REFS_TAG],
    // Control flow: no effects of its own. The admission examines each nested call.
    effects: { reads: [], writes: [] },
    args: [],
    shorts: {},
    output: "json",
  })
  .handler(async (input: CoreCatchInput, ctx: ProcedureContext): Promise<CoreCatchOutput> => {
    return coreCatch(input, ctx);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const libModule: ProcedureModule = defineModule("@procedures/lib", [
    // lib.* procedures (canonical home)
    libScanProcedure,
    libRenameProcedure,
    libNewProcedure,
    libAuditProcedure,
    libGraphProcedure,
    // ecosystem.* procedures
    ecosystemProceduresProcedure,
    // core.* procedures
    coreCatchProcedure,
  ], [fsModule, gitModule]);

export default libModule;

/**
 * This function registers the procedures of @procedures/lib, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerLibProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [libModule]);
}
