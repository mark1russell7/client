/**
 * Type definitions of the procedures of this package
 *
 * mark procedure new adds the types of each new procedure here. The zod schemas are in
 * `module.ts`: an exported schema needs a written type (isolatedDeclarations).
 */

/** The formats of an archive. `tar` is a tar file without compression. */
export type ArchiveFormat = "tar.gz" | "tar" | "zip";

/** The kind of an entry of an archive. `other` is a device, a FIFO or another special file. */
export type ArchiveEntryKind = "file" | "directory" | "symlink" | "hardlink" | "other";

// =============================================================================
// archive.create
// =============================================================================

export interface ArchiveCreateInput {
  /** The archive to make. */
  output: string;
  /** A folder: the archive gets its content, with paths relative to the folder. */
  source?: string | undefined;
  /** Files and folders, relative to `cwd`. A folder goes in with its content. */
  files?: string[] | undefined;
  /** The base folder of `files`. The default is the working folder of the process. */
  cwd?: string | undefined;
  /** The format. The default comes from the name of `output`: `.tar.gz`, `.tgz`, `.tar` or `.zip`. */
  format?: ArchiveFormat | undefined;
  /** True: replace an existing archive. The default is false: an existing archive is an error. */
  overwrite?: boolean | undefined;
}

export interface ArchiveCreateOutput {
  /** The absolute path of the archive. */
  path: string;
  format: ArchiveFormat;
  /** The number of entries: files, folders and links. */
  entries: number;
  /** The size of the archive, in bytes. */
  bytes: number;
}

// =============================================================================
// archive.extract
// =============================================================================

export interface ArchiveExtractInput {
  /** The archive. */
  archive: string;
  /** The folder that gets the content. The procedure makes it when it does not exist. */
  target: string;
  /** The format. The default comes from the first bytes of the archive. */
  format?: ArchiveFormat | undefined;
  /** True: replace an existing file. The default is false: an existing file is an error, and nothing changes. */
  overwrite?: boolean | undefined;
}

export interface ArchiveExtractOutput {
  /** The absolute path of the target folder. */
  target: string;
  format: ArchiveFormat;
  files: number;
  directories: number;
  /** The symbolic links and the hard links. */
  links: number;
  /** The bytes of the files. */
  bytes: number;
}

// =============================================================================
// archive.list
// =============================================================================

export interface ArchiveListInput {
  /** The archive. */
  archive: string;
  /** The format. The default comes from the first bytes of the archive. */
  format?: ArchiveFormat | undefined;
}

/** One entry of an archive. */
export interface ArchiveEntry {
  /** The path in the archive, as the archive has it. */
  path: string;
  kind: ArchiveEntryKind;
  /** The size of the content, in bytes. */
  size: number;
  /** The mode bits (`0o644`), when the archive has them. */
  mode?: number | undefined;
  /** The time of the last change, as an ISO text, when the archive has it. */
  mtime?: string | undefined;
  /** The target of a link. */
  linkTarget?: string | undefined;
}

export interface ArchiveListOutput {
  format: ArchiveFormat;
  entries: ArchiveEntry[];
  /** The sum of the sizes of the entries, in bytes. */
  bytes: number;
}
