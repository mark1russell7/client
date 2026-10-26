/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for lib operations
 *
 * This is the canonical home for lib.* procedures.
 * client-cli no longer registers these to avoid duplicates.
 */

import { definePackage, createProcedure, type ProcedureModule, type PackageDefinition } from "@procedures/client";
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
import {
  LibScanInputSchema,
  LibRenameInputSchema,
  LibNewInputSchema,
  LibAuditInputSchema,
  type LibScanInput,
  type LibScanOutput,
  type LibRenameInput,
  type LibRenameOutput,
  type LibNewInput,
  type LibNewOutput,
  type LibAuditInput,
  type LibAuditOutput,
  LibScanOutputSchema,
  LibRenameOutputSchema,
  LibNewOutputSchema,
  LibAuditOutputSchema,
} from "./types.js";
import { LibGraphInputSchema, LibGraphOutputSchema, type LibGraphInput, type LibGraphOutput } from "./types.js";
import { LibImportCyclesInputSchema, LibImportCyclesOutputSchema, type LibImportCyclesInput, type LibImportCyclesOutput } from "./types.js";
import { libImportCycles } from "./procedures/lib/import-cycles.js";
import type { FsRootRules, ProcedureContext } from "@procedures/client";

// =============================================================================
// The rules under a root of the files (roadmap R33)
// =============================================================================

/**
 * A procedure of a workspace: `rootPath` must be in the root, and without it the workspace is the
 * root. The procedure reads and writes the files of the workspace through `fs.*`, so the root
 * confines them too. The nested git calls of `lib.scan` and `lib.audit` are confined too: git
 * finds no repository above the root.
 */
const WORKSPACE_IN_A_ROOT: FsRootRules = { cwd: "rootPath" };

/** `lib.importCycles`: the folder of the sources stays in the root. */
const SOURCES_IN_A_ROOT: FsRootRules = { paths: ["path"] };

/** `lib.new`: a root refuses it. */
const NEW_UNDER_A_ROOT: FsRootRules = { refuse: "it starts the cue program of the workspace, and that program is code of the project" };

// =============================================================================
// lib.* Procedures
// =============================================================================

const libScanProcedure = createProcedure()
  .path(["lib", "scan"])
  .input(LibScanInputSchema)
  .output(LibScanOutputSchema)
  .meta({
    description: "Scan for packages in the git directory",
    calls: ["fs.readdir", "fs.read.json", "git.status", "git.remote"],
    effects: { reads: ["fs"], writes: [] },
    fsRoot: WORKSPACE_IN_A_ROOT,
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
  .input(LibRenameInputSchema)
  .output(LibRenameOutputSchema)
  .meta({
    description: "Rename a package across the ecosystem",
    calls: ["fs.glob", "fs.read.json", "fs.write", "fs.exists"],
    // It rewrites package.json files and TypeScript imports of the whole workspace
    effects: { reads: ["fs"], writes: ["fs"] },
    fsRoot: WORKSPACE_IN_A_ROOT,
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
  .input(LibNewInputSchema)
  .output(LibNewOutputSchema)
  .meta({
    description: "Create a new package in the ecosystem",
    calls: ["shell.run", "fs.exists", "fs.mkdir", "fs.write", "fs.read.json"],
    // It starts the cue-config CLI from the node_modules of the workspace: code of the project,
    // so it writes process. That CLI writes only files of the new package folder. An existing
    // folder is an error, so the procedure overwrites nothing.
    effects: { reads: ["fs"], writes: ["fs", "process"], destructive: false },
    fsRoot: NEW_UNDER_A_ROOT,
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
  .input(LibAuditInputSchema)
  .output(LibAuditOutputSchema)
  .meta({
    description: "Audit ecosystem packages for issues",
    calls: ["fs.readdir", "fs.read.json", "git.status", "git.remote", "fs.exists", "fs.mkdir", "fs.write"],
    // It reads the registry for the flag notices and the procedures without effects. It imports no
    // package code, so it does not write `process`. With `fix`, it makes only the missing folders
    // and files, so a second call changes nothing more.
    effects: { reads: ["fs", "registry"], writes: ["fs"], destructive: false, idempotent: true },
    fsRoot: WORKSPACE_IN_A_ROOT,
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
  .input(LibGraphInputSchema)
  .output(LibGraphOutputSchema)
  .meta({
    description: "The dependency graph of the workspace packages: nodes, workspace: edges, cycles and build levels",
    calls: ["fs.readdir", "fs.read.json"],
    effects: { reads: ["fs"], writes: [] },
    fsRoot: WORKSPACE_IN_A_ROOT,
    args: [],
    shorts: {},
    output: "json",
  })
  .handler(async (input: LibGraphInput, ctx: ProcedureContext): Promise<LibGraphOutput> => libGraph(input, ctx))
  .build();

// lib.importCycles (Graph's split, wave 2, W7)
const libImportCyclesProcedure = createProcedure()
  .path(["lib", "importCycles"])
  .input(LibImportCyclesInputSchema)
  .output(LibImportCyclesOutputSchema)
  .meta({
    description: "The import cycles of a tree of TypeScript sources: the cycles at runtime (after the import elision), of the declared imports, or of each import",
    calls: ["fs.glob", "fs.stat", "fs.read"],
    effects: { reads: ["fs"], writes: [] },
    fsRoot: SOURCES_IN_A_ROOT,
    args: ["path"],
    shorts: {},
    output: "json",
  })
  .handler(async (input: LibImportCyclesInput, ctx: ProcedureContext): Promise<LibImportCyclesOutput> => libImportCycles(input, ctx))
  .build();

// =============================================================================
// ecosystem.* Procedures
// =============================================================================

const ecosystemProceduresProcedure = createProcedure()
  .path(["ecosystem", "procedures"])
  .input(EcosystemProceduresInputSchema)
  .output(EcosystemProceduresOutputSchema)
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
// core.catch is removed: client.tryCatch of @procedures/client does the same.

// =============================================================================
// Registration
// =============================================================================

const libPackage: PackageDefinition = definePackage("@procedures/lib", [
    // lib.* procedures (canonical home)
    libScanProcedure,
    libRenameProcedure,
    libNewProcedure,
    libAuditProcedure,
    libGraphProcedure,
    libImportCyclesProcedure,
    // ecosystem.* procedures
    ecosystemProceduresProcedure,
  ], [fsModule, gitModule]);

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const libModule: ProcedureModule = libPackage.module;

export default libModule;

/**
 * This function registers the procedures of @procedures/lib, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export const registerLibProcedures: PackageDefinition["register"] = libPackage.register;
