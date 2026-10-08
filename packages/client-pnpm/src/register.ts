/**
 * Procedure Registration for pnpm operations
 *
 * Provides pnpm.install, pnpm.add, pnpm.remove, pnpm.link, pnpm.run procedures.
 */

// Import shell dependency to ensure shell.exec is registered
import "@mark1russell7/client-shell";

import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import { pnpmInstall, pnpmAdd, pnpmRemove, pnpmLink, pnpmRun, pnpmStorePath } from "./procedures/pnpm/index.js";
import {
  PnpmInstallInputSchema,
  PnpmAddInputSchema,
  PnpmRemoveInputSchema,
  PnpmLinkInputSchema,
  PnpmRunInputSchema,
  type PnpmInstallInput,
  type PnpmAddInput,
  type PnpmRemoveInput,
  type PnpmLinkInput,
  type PnpmRunInput,
  type PnpmCommandOutput,
  PnpmStorePathInputSchema,
  type PnpmStorePathInput,
  type PnpmStorePathOutput,
} from "./types.js";
import type { ProcedureContext } from "@mark1russell7/client";

// =============================================================================
// Procedures
// =============================================================================

const pnpmInstallProcedure = createProcedure()
  .path(["pnpm", "install"])
  .input(zodAdapter<PnpmInstallInput>(PnpmInstallInputSchema))
  .output(outputSchema<PnpmCommandOutput>())
  .meta({
    description: "Install packages using pnpm",
    shorts: { cwd: "C", dev: "D", frozen: "F" },
    output: "json",
  })
  .handler(async (input: PnpmInstallInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmInstall(input, ctx);
  })
  .build();

const pnpmAddProcedure = createProcedure()
  .path(["pnpm", "add"])
  .input(zodAdapter<PnpmAddInput>(PnpmAddInputSchema))
  .output(outputSchema<PnpmCommandOutput>())
  .meta({
    description: "Add packages using pnpm",
    args: ["packages"],
    shorts: { cwd: "C", dev: "D", global: "g" },
    output: "json",
  })
  .handler(async (input: PnpmAddInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmAdd(input, ctx);
  })
  .build();

const pnpmRemoveProcedure = createProcedure()
  .path(["pnpm", "remove"])
  .input(zodAdapter<PnpmRemoveInput>(PnpmRemoveInputSchema))
  .output(outputSchema<PnpmCommandOutput>())
  .meta({
    description: "Remove packages using pnpm",
    args: ["packages"],
    shorts: { cwd: "C", global: "g" },
    output: "json",
  })
  .handler(async (input: PnpmRemoveInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmRemove(input, ctx);
  })
  .build();

const pnpmLinkProcedure = createProcedure()
  .path(["pnpm", "link"])
  .input(zodAdapter<PnpmLinkInput>(PnpmLinkInputSchema))
  .output(outputSchema<PnpmCommandOutput>())
  .meta({
    description: "Link packages using pnpm",
    shorts: { cwd: "C", global: "g" },
    output: "json",
  })
  .handler(async (input: PnpmLinkInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmLink(input, ctx);
  })
  .build();

const pnpmRunProcedure = createProcedure()
  .path(["pnpm", "run"])
  .input(zodAdapter<PnpmRunInput>(PnpmRunInputSchema))
  .output(outputSchema<PnpmCommandOutput>())
  .meta({
    description: "Run package scripts using pnpm",
    args: ["script"],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: PnpmRunInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmRun(input, ctx);
  })
  .build();

const pnpmStorePathProcedure = createProcedure()
  .path(["pnpm", "store", "path"])
  .input(zodAdapter<PnpmStorePathInput>(PnpmStorePathInputSchema))
  .output(outputSchema<PnpmStorePathOutput>())
  .meta({
    description: "Get pnpm store path for snapshot/restore",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: PnpmStorePathInput): Promise<PnpmStorePathOutput> => {
    return pnpmStorePath(input);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerPnpmProcedures(): void {
  registerProcedures([
    pnpmInstallProcedure,
    pnpmAddProcedure,
    pnpmRemoveProcedure,
    pnpmLinkProcedure,
    pnpmRunProcedure,
    pnpmStorePathProcedure,
  ]);
}

// Auto-register
registerPnpmProcedures();
