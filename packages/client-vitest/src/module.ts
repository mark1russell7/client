/**
 * Module (no side effects): the vitest procedures as data, for `createRegistry()`.
 */

import { definePackage, createProcedure, type ProcedureModule, type PackageDefinition } from "@procedures/client";
import {
  VitestCoverageInputSchema,
  VitestListInputSchema,
  VitestRunInputSchema,
  VitestStopInputSchema,
  VitestWatchInputSchema,
  VitestRunOutputSchema,
  VitestWatchOutputSchema,
  VitestStopOutputSchema,
  VitestListOutputSchema,
} from "./types.js";
import { vitestCoverage, vitestRun } from "./procedures/vitest/run.js";
import { vitestWatch } from "./procedures/vitest/watch.js";
import { vitestStop } from "./procedures/vitest/stop.js";
import { vitestList } from "./procedures/vitest/list.js";

const vitestRunProcedure = createProcedure()
  .path(["vitest", "run"])
  .input(VitestRunInputSchema)
  .output(VitestRunOutputSchema)
  .meta({
    description: "Run vitest tests once (no shell; uses the project's own vitest)",
    // The test files are code of the project. The reports go to a temporary folder.
    effects: { reads: ["fs"], writes: ["fs", "process"] },
    // Positional field names, and field -> short flag (the convention mark's CLI parser reads)
    args: ["cwd"],
    shorts: { coverage: "c" },
    output: "json",
  })
  .handler(vitestRun)
  .build();

const vitestCoverageProcedure = createProcedure()
  .path(["vitest", "coverage"])
  .input(VitestCoverageInputSchema)
  .output(VitestRunOutputSchema)
  .meta({
    description: "Run vitest once with coverage, and check a minimum line coverage (no shell)",
    effects: { reads: ["fs"], writes: ["fs", "process"] },
    args: ["cwd"],
    shorts: { threshold: "t" },
    output: "json",
  })
  .handler(vitestCoverage)
  .build();

const vitestWatchProcedure = createProcedure()
  .path(["vitest", "watch"])
  .input(VitestWatchInputSchema)
  .output(VitestWatchOutputSchema)
  .meta({
    description: "Start vitest in watch mode (no shell; uses the project's own vitest)",
    effects: { reads: ["fs"], writes: ["process", "jobs"] },
    args: ["cwd"],
    shorts: {},
    output: "json",
  })
  .handler(vitestWatch)
  .build();

const vitestStopProcedure = createProcedure()
  .path(["vitest", "stop"])
  .input(VitestStopInputSchema)
  .output(VitestStopOutputSchema)
  .meta({
    description: "Stop a vitest watch process (all of them without an id)",
    // It stops processes of the process registry of client-shell, and starts none
    // It stops a job of the host: a watch process that vitest.watch started
    effects: { reads: ["jobs"], writes: ["jobs"], idempotent: true },
    args: ["id"],
    shorts: {},
    output: "json",
  })
  .handler(vitestStop)
  .build();

const vitestListProcedure = createProcedure()
  .path(["vitest", "list"])
  .input(VitestListInputSchema)
  .output(VitestListOutputSchema)
  .meta({
    description: "List the vitest watch processes of this host",
    effects: { reads: ["jobs"], writes: [] },
    args: [],
    shorts: {},
    output: "json",
  })
  .handler(vitestList)
  .build();

const vitestPackage: PackageDefinition = definePackage("@procedures/vitest", [
  vitestRunProcedure,
  vitestCoverageProcedure,
  vitestWatchProcedure,
  vitestStopProcedure,
  vitestListProcedure,
]);

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const vitestModule: ProcedureModule = vitestPackage.module;

export default vitestModule;

/**
 * This function registers the procedures of @procedures/vitest, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export const registerVitestProcedures: PackageDefinition["register"] = vitestPackage.register;
