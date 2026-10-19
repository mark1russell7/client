/**
 * The precondition of a collection write (roadmap CLI-16, decision D11).
 *
 * - `set` and `delete` take `expectedVersion`. `setBatch` takes `expectedVersions`, with one
 *   expected version for each id. The value is the version of the current item that the write
 *   expects. `null` expects no item.
 * - The version of an item is the value that the function `versionOf` of the storage gives for
 *   the item, for example a revision field. `HybridStorage` reads the same versions with its own
 *   `versionOf`, so its queue can send the base version of a write as the expected version.
 * - The storage tests the precondition and writes in one step. When the version of the current
 *   item is not the expected version, the write changes nothing, and it rejects with
 *   `VersionConflictError`.
 * - The error has the code `VERSION_CONFLICT` (HTTP 409). It has the current item and its version
 *   for each conflict. On the wire, the conflicts go in the metadata key `conflicts`.
 * - A storage without `versionOf` cannot test a precondition. It rejects such a write with a
 *   `TypeError`, and changes nothing. It never ignores a precondition.
 * - A write without a precondition is the same as before: the last write wins.
 *
 * This module has no imports: `@procedures/client/query` exports it for the storage packages.
 */

/** One conflict of a write with a precondition (roadmap CLI-16). The data is JSON. */
export interface VersionConflict {
  /** The id of the item. */
  readonly id: string;
  /** The version that the write expected. `null`: the write expected no item. */
  readonly expected: string | null;
  /** True when the id has an item now. */
  readonly found: boolean;
  /** The current item, when `found` is true. */
  readonly value?: unknown;
  /**
   * The version of the current item: `null` when the id has no item. When the current item has no
   * version, the field is absent.
   */
  readonly version?: string | null;
}

/** The function that gives the version of an item, or undefined for an item without a version. */
export type VersionOf<T> = (item: T) => string | undefined;

/** The current state of an id: no item, or an item. */
export type CurrentItem<T> = { readonly found: false } | { readonly found: true; readonly value: T };

/** The metadata key of the conflicts of a `VERSION_CONFLICT` error on the wire. */
export const VERSION_CONFLICTS_METADATA_KEY = "conflicts";

/** The longest expected version, in characters. */
export const MAX_EXPECTED_VERSION_LENGTH = 1024;

/** The message of an error with some conflicts. */
function conflictMessage(conflicts: readonly VersionConflict[]): string {
  const ids = conflicts.slice(0, 10).map((conflict) => JSON.stringify(conflict.id)).join(", ");
  const more = conflicts.length > 10 ? ` and ${conflicts.length - 10} more` : "";
  return `The version of the current item is not the expected version: ${ids}${more}`;
}

/**
 * A write with a precondition found an item with another version (roadmap CLI-16). The write
 * changed nothing. `conflicts` has the current item and its version for each id of a conflict.
 */
export class VersionConflictError extends Error {
  override readonly name = "VersionConflictError";
  /** The error code of the protocol: HTTP 409, not retryable. */
  readonly code = "VERSION_CONFLICT";
  /** A retry of the same write fails again: the caller reads the current item first. */
  readonly retryable = false;
  /** The conflicts, one for each id whose current item does not have the expected version. */
  readonly conflicts: readonly VersionConflict[];

  constructor(conflicts: readonly VersionConflict[], message?: string) {
    super(message ?? conflictMessage(conflicts));
    this.conflicts = conflicts;
  }
}

/**
 * This function gives the conflict of one id, or undefined when the current item has the expected
 * version. `null` expects no item. An item without a version never has an expected string version.
 *
 * @param id - The id of the item
 * @param expected - The expected version, or `null` for no item
 * @param current - The current state of the id
 * @param versionOf - The version of an item
 */
export function versionConflict<T>(id: string, expected: string | null, current: CurrentItem<T>, versionOf: VersionOf<T>): VersionConflict | undefined {
  if (!current.found) return expected === null ? undefined : { id, expected, found: false, version: null };
  const version = versionOf(current.value);
  if (expected !== null && version === expected) return undefined;
  return version === undefined ? { id, expected, found: true, value: current.value } : { id, expected, found: true, value: current.value, version };
}

/**
 * This function tests the preconditions of a write against the current items, and gives the
 * conflicts. The list is empty when each precondition holds.
 *
 * @param expected - The expected version of each id
 * @param currentOf - The current state of an id, before the write
 * @param versionOf - The version of an item
 */
export function versionConflicts<T>(
  expected: Iterable<readonly [string, string | null]>,
  currentOf: (id: string) => CurrentItem<T>,
  versionOf: VersionOf<T>,
): VersionConflict[] {
  const conflicts: VersionConflict[] = [];
  for (const [id, version] of expected) {
    const conflict = versionConflict(id, version, currentOf(id), versionOf);
    if (conflict) conflicts.push(conflict);
  }
  return conflicts;
}

/** The code of the error of a write with a precondition on a storage that cannot test it. */
export const PRECONDITION_NOT_SUPPORTED = "PRECONDITION_NOT_SUPPORTED";

/**
 * The error of a write with a precondition on a storage that cannot test it: a storage without
 * `versionOf`. The storage changes nothing. The error is a `TypeError` with the code
 * `PRECONDITION_NOT_SUPPORTED`, so a sync does not take it for a network failure.
 *
 * @param storage - The name of the storage, for the message
 * @param remedy - What makes the test possible
 */
export function preconditionNotSupported(storage: string, remedy = "give it the option versionOf"): TypeError & { readonly code: string; readonly retryable: false } {
  return Object.assign(new TypeError(`${storage} cannot test expectedVersion: ${remedy}`), { code: PRECONDITION_NOT_SUPPORTED, retryable: false as const });
}

/** True for a value that a precondition can expect: a string of at most 1024 characters, or `null`. */
export function isExpectedVersion(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= MAX_EXPECTED_VERSION_LENGTH);
}

/** The conflicts of untrusted data from the wire, or undefined when the data is not a list of conflicts. */
function conflictsOfData(data: unknown): VersionConflict[] | undefined {
  if (!Array.isArray(data)) return undefined;
  const conflicts: VersionConflict[] = [];
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null) return undefined;
    const record = entry as Record<string, unknown>;
    const { id, expected, found, version } = record;
    if (typeof id !== "string" || typeof found !== "boolean" || !(expected === null || typeof expected === "string")) return undefined;
    if (!(version === undefined || version === null || typeof version === "string")) return undefined;
    conflicts.push({
      id,
      expected,
      found,
      ...(found && Object.prototype.hasOwnProperty.call(record, "value") && { value: record["value"] }),
      ...(version !== undefined && { version }),
    });
  }
  return conflicts;
}

/**
 * This function gives the conflicts of an error with the code `VERSION_CONFLICT`: the `conflicts`
 * of a `VersionConflictError`, or the metadata key `conflicts` of an error from the wire (a
 * `ClientError`). It gives undefined for another error. A `VERSION_CONFLICT` error without
 * readable conflicts gives an empty list.
 */
export function versionConflictsOf(error: unknown): readonly VersionConflict[] | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (error instanceof VersionConflictError) return error.conflicts;
  const { code, conflicts, metadata } = error as { code?: unknown; conflicts?: unknown; metadata?: unknown };
  if (code !== "VERSION_CONFLICT") return undefined;
  const fromMetadata = typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>)[VERSION_CONFLICTS_METADATA_KEY] : undefined;
  return conflictsOfData(conflicts) ?? conflictsOfData(fromMetadata) ?? [];
}

/**
 * This function gives a `VersionConflictError` for an error with the code `VERSION_CONFLICT`, with
 * its conflicts and its message. It gives undefined for another error.
 */
export function asVersionConflictError(error: unknown): VersionConflictError | undefined {
  if (error instanceof VersionConflictError) return error;
  const conflicts = versionConflictsOf(error);
  if (conflicts === undefined) return undefined;
  const message = error instanceof Error ? error.message : undefined;
  return new VersionConflictError(conflicts, message);
}
