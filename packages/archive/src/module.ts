/**
 * The procedures of @procedures/archive as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/archive
 *
 * `archiveModule` has the default limits: 1 GiB of files and 100000 entries in one archive.
 * `createArchiveModule()` gives the same procedures with other limits (roadmap R46).
 */

import { z } from "zod";
import {
  defineModule,
  registerModules,
  PROCEDURE_REGISTRY,
  createProcedure,
  zodAdapter,
  type AnyProcedure,
  type Effects,
  type ProcedureModule,
  type ProcedureRegistry,
} from "@procedures/client";
import { archiveCreate } from "./procedures/archive/create.js";
import { archiveExtract } from "./procedures/archive/extract.js";
import { archiveList } from "./procedures/archive/list.js";
import { DEFAULT_ARCHIVE_SETTINGS, type ArchiveSettings } from "./format.js";
import type {
  ArchiveCreateInput,
  ArchiveCreateOutput,
  ArchiveExtractInput,
  ArchiveExtractOutput,
  ArchiveListInput,
  ArchiveListOutput,
} from "./types.js";

// =============================================================================
// Schemas
// =============================================================================

const path = (description: string) => z.string().min(1).max(4096).describe(description);
const format = z.enum(["tar.gz", "tar", "zip"]);

const ArchiveCreateInputSchema = z.object({
  output: path("The archive to make"),
  source: path("A folder: the archive gets its content").optional(),
  files: z.array(z.string().min(1).max(4096)).min(1).max(10_000).optional().describe("Files and folders, relative to cwd. A folder goes in with its content"),
  cwd: path("The base folder of files (default: the working folder)").optional(),
  format: format.optional().describe("The format (default: from the name of output: .tar.gz, .tgz, .tar or .zip)"),
  overwrite: z.boolean().optional().describe("True: replace an existing archive (default false)"),
});

const ArchiveCreateOutputSchema = z.object({
  path: z.string().describe("The absolute path of the archive"),
  format,
  entries: z.number().int().describe("The number of entries: files, folders and links"),
  bytes: z.number().int().describe("The size of the archive, in bytes"),
});

const ArchiveExtractInputSchema = z.object({
  archive: path("The archive"),
  target: path("The folder that gets the content. The procedure makes it"),
  format: format.optional().describe("The format (default: from the first bytes of the archive)"),
  overwrite: z.boolean().optional().describe("True: replace an existing file (default false: an existing file is an error, and nothing changes)"),
});

const ArchiveExtractOutputSchema = z.object({
  target: z.string().describe("The absolute path of the target folder"),
  format,
  files: z.number().int(),
  directories: z.number().int(),
  links: z.number().int().describe("The symbolic links and the hard links"),
  bytes: z.number().int().describe("The bytes of the files"),
});

const ArchiveListInputSchema = z.object({
  archive: path("The archive"),
  format: format.optional().describe("The format (default: from the first bytes of the archive)"),
});

const ArchiveListOutputSchema = z.object({
  format,
  entries: z.array(
    z.object({
      path: z.string().describe("The path in the archive"),
      kind: z.enum(["file", "directory", "symlink", "hardlink", "other"]),
      size: z.number().int(),
      mode: z.number().int().optional(),
      mtime: z.string().optional().describe("The time of the last change, as an ISO text"),
      linkTarget: z.string().optional().describe("The target of a link"),
    }),
  ),
  bytes: z.number().int().describe("The sum of the sizes of the files"),
});

// =============================================================================
// Procedures
// =============================================================================

/** The effects of `create` and `extract`: they read and write files, and `overwrite` replaces a file. */
const READS_WRITES_FS: Effects = Object.freeze({ reads: Object.freeze(["fs"]), writes: Object.freeze(["fs"]) });
/** The effects of `list`: it reads a file and changes nothing. */
const READS_FS: Effects = Object.freeze({ reads: Object.freeze(["fs"]), writes: Object.freeze([]) });

/** The three procedures, with handlers that use the limits. */
function archiveProcedures(settings: ArchiveSettings): AnyProcedure[] {
  const archiveCreateProcedure = createProcedure()
    .path(["archive", "create"])
    .input(zodAdapter<ArchiveCreateInput>(ArchiveCreateInputSchema))
    .output(zodAdapter<ArchiveCreateOutput>(ArchiveCreateOutputSchema))
    .meta({
      description: "Make a tar.gz or zip archive of a folder or of files",
      tags: ["archive", "fs"],
      args: ["output"],
      shorts: { source: "s", format: "f" },
      output: "json",
      effects: READS_WRITES_FS,
    })
    .handler(async (input: ArchiveCreateInput): Promise<ArchiveCreateOutput> => archiveCreate(input, settings))
    .build();

  const archiveExtractProcedure = createProcedure()
    .path(["archive", "extract"])
    .input(zodAdapter<ArchiveExtractInput>(ArchiveExtractInputSchema))
    .output(zodAdapter<ArchiveExtractOutput>(ArchiveExtractOutputSchema))
    .meta({
      description: "Extract a tar.gz or zip archive into a folder, with a check of each path",
      tags: ["archive", "fs"],
      args: ["archive", "target"],
      shorts: { format: "f" },
      output: "json",
      effects: READS_WRITES_FS,
    })
    .handler(async (input: ArchiveExtractInput): Promise<ArchiveExtractOutput> => archiveExtract(input, settings))
    .build();

  const archiveListProcedure = createProcedure()
    .path(["archive", "list"])
    .input(zodAdapter<ArchiveListInput>(ArchiveListInputSchema))
    .output(zodAdapter<ArchiveListOutput>(ArchiveListOutputSchema))
    .meta({
      description: "The entries of a tar.gz or zip archive",
      tags: ["archive", "fs"],
      args: ["archive"],
      shorts: { format: "f" },
      output: "json",
      effects: READS_FS,
    })
    .handler(async (input: ArchiveListInput): Promise<ArchiveListOutput> => archiveList(input, settings))
    .build();

  return [archiveCreateProcedure, archiveExtractProcedure, archiveListProcedure];
}

/**
 * The module of this package, for `createRegistry()`: its procedures as data, with the default
 * limits. Importing this file registers nothing.
 */
export const archiveModule: ProcedureModule = defineModule("@procedures/archive", archiveProcedures(DEFAULT_ARCHIVE_SETTINGS));

export default archiveModule;

/** The options of `createArchiveModule()`. */
export interface ArchiveModuleOptions {
  /** The most bytes of the files of one archive. The default is 1 GiB. */
  readonly maxBytes?: number | undefined;
  /** The most entries of one archive. The default is 100000. */
  readonly maxEntries?: number | undefined;
}

/**
 * This function gives the module of this package with other limits. Without options, it gives
 * `archiveModule`. A host gives it to `createRegistry()` before its bundles, so it replaces the
 * `archiveModule` that a bundle requires (the first module of a name counts).
 */
export function createArchiveModule(options: ArchiveModuleOptions = {}): ProcedureModule {
  if (Object.values(options).every((value) => value === undefined)) return archiveModule;
  const settings: ArchiveSettings = {
    maxBytes: options.maxBytes ?? DEFAULT_ARCHIVE_SETTINGS.maxBytes,
    maxEntries: options.maxEntries ?? DEFAULT_ARCHIVE_SETTINGS.maxEntries,
  };
  for (const [name, value] of Object.entries(settings)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`createArchiveModule: ${name} must be a whole number of 0 or more`);
  }
  return defineModule("@procedures/archive", archiveProcedures(settings));
}

/**
 * This function registers the procedures of @procedures/archive in a registry. The default is the
 * global registry. The options are the options of `createArchiveModule()`.
 */
export function registerArchiveProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY, options: ArchiveModuleOptions = {}): void {
  registerModules(registry, [createArchiveModule(options)]);
}
