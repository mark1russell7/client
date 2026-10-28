/**
 * The types of the program store.
 *
 * A program is procedure-as-data: the aggregation that `procedure.define` turns into a
 * procedure. A program store keeps programs after the process ends. `procedure.load` defines
 * them again, so a stored program is a runtime-defined procedure again: a data-driven one, which
 * a server with an expose rule lets call only the exposed procedures.
 */

import type { AggregationDefinition, ProcedurePath } from "@procedures/client";
import { versionConflict, VersionConflictError, type CurrentItem } from "@procedures/client/query";

/** One stored program. */
export interface StoredProgram {
  /** The dotted key of the path: `reports.weekly`. */
  key: string;
  /** The path of the procedure. */
  path: ProcedurePath;
  /** The program: the aggregation of `procedure.define`. */
  program: AggregationDefinition;
  /** The metadata of the procedure (its description, its tags), without the program. */
  metadata?: Record<string, unknown> | undefined;
  /** When the store got this version, in milliseconds since 1970. */
  storedAt: number;
  /** The name of the program, for a view or a tool that lists the programs. */
  name?: string | undefined;
  /** The description of the program, in words. */
  description?: string | undefined;
  /**
   * The version of the record. The store sets it on each put, and ignores the version of the
   * input. The value is opaque: a caller compares it, and gives it back as `expectedVersion`.
   */
  version?: string | number | undefined;
}

/** The options of a write of a program store (decision D11). */
export interface ProgramWriteOptions {
  /**
   * The version that the write expects for the current record. `null` expects no record. When the
   * current record has another version, the write changes nothing and rejects with
   * `VersionConflictError`. Absent: no precondition, and the last write wins.
   */
  readonly expectedVersion?: string | number | null | undefined;
}

/**
 * A store of programs. Each method gives a Promise: a caller cannot tell a local store from a
 * remote one.
 *
 * The four backends of this package set the `version` of each record and test `expectedVersion`.
 * A store of another package that ignores the options of `put` and `delete` keeps working, but it
 * gives no conflict check: its writes always win.
 */
export interface ProgramStore {
  /** The kind of the backend: "memory", "file", "collection" or another name. */
  readonly kind: string;
  /** The program of a key, or undefined. */
  get(key: string): Promise<StoredProgram | undefined>;
  /** The programs, sorted by key. With a prefix, only the key and the keys under it (`prefix.x`). */
  list(prefix?: string): Promise<StoredProgram[]>;
  /**
   * Write a program. A program of the same key is replaced. The store sets a new `version`. With
   * `expectedVersion`, a conflict rejects with `VersionConflictError` and changes nothing.
   */
  put(program: StoredProgram, options?: ProgramWriteOptions): Promise<void>;
  /**
   * Delete the program of a key. True when it existed. With `expectedVersion`, a conflict rejects
   * with `VersionConflictError` and changes nothing.
   */
  delete(key: string, options?: ProgramWriteOptions): Promise<boolean>;
  /** Release the resources of the store. */
  close?(): Promise<void>;
}

/**
 * This function gives the version of a record as a string, or undefined for a record without a
 * version. Give it as the `versionOf` of the collection storage of a `CollectionProgramStore`.
 */
export function storedProgramVersion(program: StoredProgram): string | undefined {
  return program.version === undefined ? undefined : String(program.version);
}

/**
 * This function gives an expected version in the form of the collection storages: a string, or
 * `null` for no record. A number becomes its string, so `3` and `"3"` are the same version.
 */
export function expectedVersionOf(options: ProgramWriteOptions | undefined): string | null | undefined {
  const expected = options?.expectedVersion;
  return expected === undefined || expected === null ? expected : String(expected);
}

/**
 * This function tests the precondition of a write against the current record. It throws
 * `VersionConflictError` with a copy of the current record when the version is not the expected
 * version. Without `expectedVersion`, it does nothing.
 */
export function checkProgramVersion(key: string, current: StoredProgram | undefined, options: ProgramWriteOptions | undefined): void {
  const expected = expectedVersionOf(options);
  if (expected === undefined) return;
  const state: CurrentItem<StoredProgram> = current === undefined ? { found: false } : { found: true, value: structuredClone(current) };
  const conflict = versionConflict(key, expected, state, storedProgramVersion);
  if (conflict) throw new VersionConflictError([conflict]);
}

/**
 * This function gives the next version of a counter: one more than the counter and than each
 * numeric version of the records. A record of an older release has no version: it counts as 0.
 */
export function nextCounterVersion(counter: number, programs: Iterable<StoredProgram>): number {
  let highest = Number.isSafeInteger(counter) && counter > 0 ? counter : 0;
  for (const program of programs) {
    if (typeof program.version === "number" && Number.isSafeInteger(program.version) && program.version > highest) highest = program.version;
  }
  return highest + 1;
}

/** True when a key is the prefix or under it (`a.b` for the prefix `a`). */
export function keyMatches(key: string, prefix: string | undefined): boolean {
  return prefix === undefined || prefix === "" || key === prefix || key.startsWith(`${prefix}.`);
}

/** Programs sorted by key, so a listing is the same for each backend. */
export function byKey(programs: StoredProgram[]): StoredProgram[] {
  return programs.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * The record to store, checked: a stored program comes back from a file or a remote service, so
 * its shape is not trusted.
 */
export function checkStoredProgram(value: unknown): StoredProgram {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("A stored program must be an object");
  }
  const record = value as Partial<StoredProgram>;
  if (!Array.isArray(record.path) || record.path.length === 0 || !record.path.every((s) => typeof s === "string" && s !== "")) {
    throw new TypeError("A stored program needs a path: a list of non-empty strings");
  }
  // path-check: the entry ./indexeddb cannot load the codec (only @procedures/client/query). A segment with a dot fails here (CLI-84 follow-up).
  if (record.key !== record.path.join(".")) {
    throw new TypeError(`The key of a stored program must be its path with dots: ${record.path.join(".")}`);
  }
  const program = record.program as { $proc?: unknown } | undefined;
  if (typeof program !== "object" || program === null || !Array.isArray(program.$proc)) {
    throw new TypeError(`The program of ${record.key} must be a procedure ref: { "$proc": [...], "input": ... }`);
  }
  if (typeof record.storedAt !== "number" || !Number.isFinite(record.storedAt)) {
    throw new TypeError(`The program of ${record.key} needs storedAt, a time in milliseconds`);
  }
  for (const field of ["name", "description"] as const) {
    if (record[field] !== undefined && typeof record[field] !== "string") {
      throw new TypeError(`The ${field} of the program ${record.key} must be a string`);
    }
  }
  const version = record.version;
  if (version !== undefined && typeof version !== "string" && !(typeof version === "number" && Number.isFinite(version))) {
    throw new TypeError(`The version of the program ${record.key} must be a string or a finite number`);
  }
  return record as StoredProgram;
}
