/**
 * The file helpers of the package (roadmap O51): the `./files` entry. They are functions, not
 * procedures, and an import of this entry registers nothing.
 *
 * - `writeFileAtomic()` writes a file in one step for each reader.
 * - `healNdjsonTail()` repairs the end of an append-only NDJSON file after a crash.
 * - `KeyedLock` and `withLock()` let one caller at a time hold a key.
 * - `editFile()` changes a file, one edit at a time for each path.
 */

export { writeFileAtomic, type WriteFileAtomicOptions } from "./atomic.js";
export { healNdjsonTail, type HealNdjsonTailOptions, type NdjsonTailAction, type NdjsonTailResult } from "./ndjson-tail.js";
export {
  KeyedLock,
  withLock,
  type LockOutcome,
  type LockRelease,
  type LockSkipOptions,
  type LockWaitOptions,
} from "./lock.js";
export { editFile, type EditFileOptions, type EditFileResult, type EditTransform } from "./edit.js";
