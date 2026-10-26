/**
 * The procedures of @procedures/npm as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/npm
 *
 * The procedures run the npm CLI through `shell.run`, with an argument list and no shell (roadmap
 * R43). The writes to the registry (dist-tags and deprecate) need `confirm: true`.
 */

import {
  definePackage,
  type Effects,
  type ProcedureContext,
  type ProcedureModule,
  createProcedure,
  type PackageDefinition,
} from "@procedures/client";
import shellModule from "@procedures/shell/module";
import { npmView } from "./procedures/npm/view.js";
import { npmDistTagsList } from "./procedures/npm/distTags/list.js";
import { npmDistTagsAdd } from "./procedures/npm/distTags/add.js";
import { npmDistTagsRemove } from "./procedures/npm/distTags/remove.js";
import { npmWhoami } from "./procedures/npm/whoami.js";
import { npmPack } from "./procedures/npm/pack.js";
import { npmDeprecate } from "./procedures/npm/deprecate.js";
import {
  NpmViewInputSchema,
  NpmViewOutputSchema,
  type NpmViewInput,
  type NpmViewOutput,
  NpmDistTagsListInputSchema,
  NpmDistTagsListOutputSchema,
  type NpmDistTagsListInput,
  type NpmDistTagsListOutput,
  NpmDistTagsAddInputSchema,
  NpmDistTagsAddOutputSchema,
  type NpmDistTagsAddInput,
  type NpmDistTagsAddOutput,
  NpmDistTagsRemoveInputSchema,
  NpmDistTagsRemoveOutputSchema,
  type NpmDistTagsRemoveInput,
  type NpmDistTagsRemoveOutput,
  NpmWhoamiInputSchema,
  NpmWhoamiOutputSchema,
  type NpmWhoamiInput,
  type NpmWhoamiOutput,
  NpmPackInputSchema,
  NpmPackOutputSchema,
  type NpmPackInput,
  type NpmPackOutput,
  NpmDeprecateInputSchema,
  NpmDeprecateOutputSchema,
  type NpmDeprecateInput,
  type NpmDeprecateOutput,
} from "./types.js";

/** A read of the registry: npm also reads its configuration (.npmrc) on the disk. */
const READS_REGISTRY: Effects = { reads: ["fs", "network"], writes: [] };

const npmViewProcedure = createProcedure()
  .path(["npm", "view"])
  .input(NpmViewInputSchema)
  .output(NpmViewOutputSchema)
  .meta({
    description: "Read the fields of a package of the npm registry: data has the JSON of npm view",
    calls: ["shell.run"],
    effects: READS_REGISTRY,
    args: ["package", "fields"],
    shorts: { registry: "r", cwd: "C" },
    output: "json",
  })
  .handler(async (input: NpmViewInput, ctx: ProcedureContext): Promise<NpmViewOutput> => npmView(input, ctx))
  .build();

const npmDistTagsListProcedure = createProcedure()
  .path(["npm", "distTags", "list"])
  .input(NpmDistTagsListInputSchema)
  .output(NpmDistTagsListOutputSchema)
  .meta({
    description: "List the dist-tags of a package: tags has each tag and its version",
    calls: ["shell.run"],
    effects: READS_REGISTRY,
    args: ["package"],
    shorts: { registry: "r", cwd: "C" },
    output: "json",
  })
  .handler(async (input: NpmDistTagsListInput, ctx: ProcedureContext): Promise<NpmDistTagsListOutput> => npmDistTagsList(input, ctx))
  .build();

const npmDistTagsAddProcedure = createProcedure()
  .path(["npm", "distTags", "add"])
  .input(NpmDistTagsAddInputSchema)
  .output(NpmDistTagsAddOutputSchema)
  .meta({
    description: "Set a dist-tag of a package to a version, in the registry. It needs confirm: true",
    calls: ["shell.run"],
    // The tag moves from its earlier version, so it is destructive
    effects: { reads: ["fs", "network"], writes: ["network"], idempotent: true },
    args: ["package", "version", "tag"],
    shorts: { registry: "r", cwd: "C" },
    output: "json",
  })
  .handler(async (input: NpmDistTagsAddInput, ctx: ProcedureContext): Promise<NpmDistTagsAddOutput> => npmDistTagsAdd(input, ctx))
  .build();

const npmDistTagsRemoveProcedure = createProcedure()
  .path(["npm", "distTags", "remove"])
  .input(NpmDistTagsRemoveInputSchema)
  .output(NpmDistTagsRemoveOutputSchema)
  .meta({
    description: "Remove a dist-tag of a package, in the registry. It needs confirm: true",
    calls: ["shell.run"],
    effects: { reads: ["fs", "network"], writes: ["network"], destructive: true, idempotent: true },
    args: ["package", "tag"],
    shorts: { registry: "r", cwd: "C" },
    output: "json",
  })
  .handler(async (input: NpmDistTagsRemoveInput, ctx: ProcedureContext): Promise<NpmDistTagsRemoveOutput> => npmDistTagsRemove(input, ctx))
  .build();

const npmWhoamiProcedure = createProcedure()
  .path(["npm", "whoami"])
  .input(NpmWhoamiInputSchema)
  .output(NpmWhoamiOutputSchema)
  .meta({
    description: "Give the user name of the npm registry",
    calls: ["shell.run"],
    effects: READS_REGISTRY,
    args: [],
    shorts: { registry: "r", cwd: "C" },
    output: "json",
  })
  .handler(async (input: NpmWhoamiInput, ctx: ProcedureContext): Promise<NpmWhoamiOutput> => npmWhoami(input, ctx))
  .build();

const npmPackProcedure = createProcedure()
  .path(["npm", "pack"])
  .input(NpmPackInputSchema)
  .output(NpmPackOutputSchema)
  .meta({
    description: "List the files of the tarball of the package (a dry run), or with dryRun: false make the tarball",
    calls: ["shell.run"],
    // Without the dry run, it writes the tarball (it replaces a tarball of the same name). npm runs
    // the prepack, prepare and postpack scripts of the package.
    effects: { reads: ["fs"], writes: ["fs", "process"] },
    args: [],
    shorts: { destination: "d", cwd: "C" },
    output: "json",
  })
  .handler(async (input: NpmPackInput, ctx: ProcedureContext): Promise<NpmPackOutput> => npmPack(input, ctx))
  .build();

const npmDeprecateProcedure = createProcedure()
  .path(["npm", "deprecate"])
  .input(NpmDeprecateInputSchema)
  .output(NpmDeprecateOutputSchema)
  .meta({
    description: "Deprecate versions of a package in the registry. An empty message removes it. It needs confirm: true",
    calls: ["shell.run"],
    // A write to the registry: the versions and their files stay, only the message changes
    effects: { reads: ["fs", "network"], writes: ["network"], destructive: false, idempotent: true },
    args: ["package", "message"],
    shorts: { registry: "r", cwd: "C" },
    output: "json",
  })
  .handler(async (input: NpmDeprecateInput, ctx: ProcedureContext): Promise<NpmDeprecateOutput> => npmDeprecate(input, ctx))
  .build();

const npmPackage: PackageDefinition = definePackage(
  "@procedures/npm",
  [
    npmViewProcedure,
    npmDistTagsListProcedure,
    npmDistTagsAddProcedure,
    npmDistTagsRemoveProcedure,
    npmWhoamiProcedure,
    npmPackProcedure,
    npmDeprecateProcedure,
  ],
  [shellModule]
);

export const npmModule: ProcedureModule = npmPackage.module;

export default npmModule;

/**
 * This function registers the procedures of @procedures/npm, and of the modules that it requires, in
 * a registry. The default is the global registry.
 */
export const registerNpmProcedures: PackageDefinition["register"] = npmPackage.register;
