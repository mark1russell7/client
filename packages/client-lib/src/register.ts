/**
 * Procedure Registration for lib operations
 *
 * This is the canonical home for lib.* procedures.
 * client-cli no longer registers these to avoid duplicates.
 */

// The lib procedures call fs.* and git.* (their `calls` below). Importing those packages registers
// them, so client-lib works alone. (Docs review DOC-5: before, lib.scan alone found no packages,
// and over MCP its git calls failed with NOT_FOUND.)
import "@mark1russell7/client-fs";
import "@mark1russell7/client-git";
import { createProcedure, registerProcedures, zodAdapter, RUNS_REFS_TAG } from "@mark1russell7/client";
import {
  libScan,
  libRename,
  libNew,
  libAudit,
} from "./procedures/lib/index.js";
import {
  ecosystemProcedures,
  EcosystemProceduresInputSchema,
  EcosystemProceduresOutputSchema,
  type EcosystemProceduresInput,
  type EcosystemProceduresOutput,
} from "./procedures/ecosystem/index.js";
import { dagTraverse } from "./procedures/dag/index.js";
import { coreCatch } from "./procedures/core/index.js";
import {
  LibScanInputSchema,
  LibRenameInputSchema,
  LibNewInputSchema,
  LibAuditInputSchema,
  DagTraverseInputSchema,
  CoreCatchInputSchema,
  type LibScanInput,
  type LibScanOutput,
  type LibRenameInput,
  type LibRenameOutput,
  type LibNewInput,
  type LibNewOutput,
  type LibAuditInput,
  type LibAuditOutput,
  type DagTraverseInput,
  type DagTraverseOutput,
  type CoreCatchInput,
  type CoreCatchOutput,
  LibScanOutputSchema,
  LibRenameOutputSchema,
  LibNewOutputSchema,
  LibAuditOutputSchema,
  DagTraverseOutputSchema,
  CoreCatchOutputSchema,
} from "./types.js";
import type { ProcedureContext } from "@mark1russell7/client";

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
    args: [],
    shorts: { fix: "f" },
    output: "json",
  })
  .handler(async (input: LibAuditInput, ctx: ProcedureContext): Promise<LibAuditOutput> => {
    return libAudit(input, ctx);
  })
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
    args: [],
    shorts: { namespace: "n" },
    output: "json",
  })
  .handler(async (input: EcosystemProceduresInput, ctx: ProcedureContext): Promise<EcosystemProceduresOutput> => {
    return ecosystemProcedures(input, ctx);
  })
  .build();

// =============================================================================
// dag.* Procedures
// =============================================================================

const dagTraverseProcedure = createProcedure()
  .path(["dag", "traverse"])
  .input(zodAdapter<DagTraverseInput>(DagTraverseInputSchema))
  .output(zodAdapter<DagTraverseOutput>(DagTraverseOutputSchema))
  .meta({
    description: "Traverse ecosystem packages in dependency order, executing visit procedure for each",
    // It runs the procedure refs of its input: a server with an expose rule limits what they call
    tags: [RUNS_REFS_TAG],
    args: [],
    shorts: { root: "r", concurrency: "j", continueOnError: "c", dryRun: "d" },
    output: "streaming",
  })
  .handler(async (input: DagTraverseInput, ctx: ProcedureContext): Promise<DagTraverseOutput> => {
    return dagTraverse(input, ctx);
  })
  .build();

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

export function registerLibProcedures(): void {
  registerProcedures([
    // lib.* procedures (canonical home)
    libScanProcedure,
    libRenameProcedure,
    libNewProcedure,
    libAuditProcedure,
    // ecosystem.* procedures
    ecosystemProceduresProcedure,
    // dag.* procedures (canonical home)
    dagTraverseProcedure,
    // core.* procedures
    coreCatchProcedure,
  ]);
}

// Auto-register
registerLibProcedures();
