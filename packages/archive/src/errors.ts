/**
 * The errors of the archive procedures.
 */

/** The reason of an `ArchiveError`. */
export type ArchiveErrorCode =
  /** The format is not known, or it is not the format of the file. */
  | "BAD_FORMAT"
  /** The archive is damaged, or it uses a feature that the package does not read. */
  | "BAD_ARCHIVE"
  /** A path exists already: the archive of `create`, or a file of `extract` without `overwrite`. */
  | "EXISTS"
  /** A path of the input or an entry of the archive is not safe: `..`, an absolute path, or a way through a link. */
  | "UNSAFE_PATH"
  /** A link of the archive goes out of the target folder, or a hard link names no file of the archive. */
  | "UNSAFE_LINK"
  /** The archive has an entry that the package does not extract: a device, a FIFO or another special file. */
  | "UNSUPPORTED_ENTRY"
  /** The archive has more entries or more bytes than the limits of the module. */
  | "TOO_LARGE";

/** An error of an archive procedure. `entry` names the entry of the archive, when one is the cause. */
export class ArchiveError extends Error {
  override readonly name = "ArchiveError";
  readonly code: ArchiveErrorCode;
  readonly entry: string | undefined;

  constructor(code: ArchiveErrorCode, message: string, entry?: string) {
    super(message);
    this.code = code;
    this.entry = entry;
  }
}
