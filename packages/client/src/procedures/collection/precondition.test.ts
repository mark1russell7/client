/**
 * The precondition of the collection writes (roadmap CLI-16): the input `expectedVersion` of `set`
 * and `delete` and of each item of `setBatch`, the options that the storage gets, and the helpers
 * of `precondition.ts`.
 */

import { describe, it, expect } from "vitest";
import { createCollectionProcedures } from "./procedures.js";
import type { CollectionStorage, StorageBatchWriteOptions, StorageItemWriteOptions } from "./storage.js";
import { invokeProcedure, outputValue } from "../invoke.js";
import type { RepositoryProvider } from "../types.js";
import { ClientError } from "../../client/types.js";
import {
  VersionConflictError,
  asVersionConflictError,
  isExpectedVersion,
  preconditionNotSupported,
  versionConflict,
  versionConflicts,
  versionConflictsOf,
} from "./precondition.js";

/** A storage that records the options of its writes. */
function recordingStorage(seen: unknown[]): CollectionStorage<unknown> {
  return {
    set: async (_id: string, _value: unknown, options?: StorageItemWriteOptions) => {
      seen.push(options);
    },
    delete: async (_id: string, options?: StorageItemWriteOptions) => {
      seen.push(options);
      return true;
    },
    setBatch: async (_items: Array<[string, unknown]>, options?: StorageBatchWriteOptions) => {
      seen.push(options);
    },
  } as unknown as CollectionStorage<unknown>;
}

async function run(operation: string, input: unknown, storage: CollectionStorage<unknown>): Promise<unknown> {
  const procedure = createCollectionProcedures("things", { changeEvents: false }).find((p) => p.path[2] === operation)!;
  const repository = { getStorage: () => storage, hasCollection: () => true } as unknown as RepositoryProvider;
  return outputValue(await invokeProcedure(procedure, input, { repository }), procedure.path);
}

describe("the input expectedVersion of the collection writes", () => {
  it("goes to the storage: expectedVersion of set and delete, expectedVersions of setBatch", async () => {
    const seen: unknown[] = [];
    const storage = recordingStorage(seen);
    await run("set", { id: "a", value: 1, expectedVersion: "3" }, storage);
    await run("set", { id: "a", value: 1, expectedVersion: null, origin: "me" }, storage);
    await run("delete", { id: "a", expectedVersion: "4" }, storage);
    await run("setBatch", { items: [{ id: "a", value: 1, expectedVersion: "4" }, { id: "b", value: 2 }, { id: "c", value: 3, expectedVersion: null }] }, storage);
    expect(seen).toEqual([
      { expectedVersion: "3" },
      { origin: "me", expectedVersion: null },
      { expectedVersion: "4" },
      { expectedVersions: [["a", "4"], ["c", null]] },
    ]);
  });

  it("gives no precondition without the field, as before", async () => {
    const seen: unknown[] = [];
    const storage = recordingStorage(seen);
    await run("set", { id: "a", value: 1 }, storage);
    await run("delete", { id: "a" }, storage);
    await run("setBatch", { items: [{ id: "a", value: 1 }] }, storage);
    expect(seen).toEqual([undefined, undefined, undefined]);
  });

  it("refuses an expected version that is not a string of at most 1024 characters or null", async () => {
    const storage = recordingStorage([]);
    await expect(run("set", { id: "a", value: 1, expectedVersion: 3 }, storage)).rejects.toThrow(/expectedVersion must be a string/);
    await expect(run("delete", { id: "a", expectedVersion: "x".repeat(1025) }, storage)).rejects.toThrow(/expectedVersion must be a string/);
    await expect(run("setBatch", { items: [{ id: "a", value: 1, expectedVersion: {} }] }, storage)).rejects.toThrow(/items\.0\.expectedVersion must be a string/);
  });
});

describe("the helpers of the precondition", () => {
  const versionOf = (item: { rev?: string }): string | undefined => item.rev;

  it("versionConflict gives undefined for the expected version, and the current item for a conflict", () => {
    expect(versionConflict("a", "1", { found: true, value: { rev: "1" } }, versionOf)).toBeUndefined();
    expect(versionConflict("a", null, { found: false }, versionOf)).toBeUndefined();
    expect(versionConflict("a", "1", { found: true, value: { rev: "2" } }, versionOf)).toEqual({ id: "a", expected: "1", found: true, value: { rev: "2" }, version: "2" });
    expect(versionConflict("a", null, { found: true, value: {} }, versionOf)).toEqual({ id: "a", expected: null, found: true, value: {} });
    expect(versionConflict("a", "1", { found: false }, versionOf)).toEqual({ id: "a", expected: "1", found: false, version: null });
    expect(versionConflicts([["a", "1"], ["b", null]], (id) => (id === "a" ? { found: true, value: { rev: "1" } } : { found: true, value: { rev: "9" } }), versionOf)).toEqual([
      { id: "b", expected: null, found: true, value: { rev: "9" }, version: "9" },
    ]);
  });

  it("versionConflictsOf reads a VersionConflictError and the metadata of an error from the wire", () => {
    const conflicts = [{ id: "a", expected: "1", found: true, value: { n: 1 }, version: "2" }];
    expect(versionConflictsOf(new VersionConflictError(conflicts))).toEqual(conflicts);
    const fromWire = new ClientError({ type: "error", code: "VERSION_CONFLICT", message: "conflict", retryable: false }, "r1", { conflicts });
    expect(versionConflictsOf(fromWire)).toEqual(conflicts);
    const converted = asVersionConflictError(fromWire);
    expect(converted).toBeInstanceOf(VersionConflictError);
    expect(converted?.conflicts).toEqual(conflicts);
    expect(converted?.message).toBe("conflict");
    // Data that is not a list of conflicts gives an empty list, and another code gives undefined
    expect(versionConflictsOf({ code: "VERSION_CONFLICT", metadata: { conflicts: [{ id: 1 }] } })).toEqual([]);
    expect(versionConflictsOf({ code: "FORBIDDEN", metadata: { conflicts } })).toBeUndefined();
    expect(asVersionConflictError(new Error("other"))).toBeUndefined();
  });

  it("isExpectedVersion and preconditionNotSupported", () => {
    expect(isExpectedVersion(null)).toBe(true);
    expect(isExpectedVersion("v")).toBe(true);
    expect(isExpectedVersion(undefined)).toBe(false);
    expect(isExpectedVersion(1)).toBe(false);
    const error = preconditionNotSupported("This storage");
    expect(error).toBeInstanceOf(TypeError);
    expect(error).toMatchObject({ code: "PRECONDITION_NOT_SUPPORTED", retryable: false });
    expect(error.message).toMatch(/This storage cannot test expectedVersion: give it the option versionOf/);
  });
});
