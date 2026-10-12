/**
 * The types of the program store.
 *
 * A program is procedure-as-data: the aggregation that `procedure.define` turns into a
 * procedure. A program store keeps programs after the process ends. `procedure.load` defines
 * them again, so a stored program is a runtime-defined procedure again: a data-driven one, which
 * a server with an expose rule lets call only the exposed procedures.
 */

import type { AggregationDefinition, ProcedurePath } from "@mark1russell7/client";

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
}

/**
 * A store of programs. Each method gives a Promise: a caller cannot tell a local store from a
 * remote one.
 */
export interface ProgramStore {
  /** The kind of the backend: "memory", "file", "collection" or another name. */
  readonly kind: string;
  /** The program of a key, or undefined. */
  get(key: string): Promise<StoredProgram | undefined>;
  /** The programs, sorted by key. With a prefix, only the key and the keys under it (`prefix.x`). */
  list(prefix?: string): Promise<StoredProgram[]>;
  /** Write a program. A program of the same key is replaced. */
  put(program: StoredProgram): Promise<void>;
  /** Delete the program of a key. True when it existed. */
  delete(key: string): Promise<boolean>;
  /** Release the resources of the store. */
  close?(): Promise<void>;
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
  return record as StoredProgram;
}
