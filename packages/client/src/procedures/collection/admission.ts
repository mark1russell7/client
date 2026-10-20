/**
 * The rules of the rows of a served collection (roadmap CLI-41). A right can depend on the
 * document: a `when` condition of Graph, or `accessAdmitItem()` of `@procedures/access`. The option
 * `admission` of `createCollectionProcedures()` gives the rules as data:
 *
 * - `admit` examines each row `{ id, value }` that a read gives. It has the shape of `AdmitItem`,
 *   the output filter of a host. The change events with values give it the same rows for each
 *   subscriber, so the reads and the events obey one rule.
 * - `guard` examines each write `{ op, id, doc, prev }` before the storage changes. A refused write
 *   gets `FORBIDDEN` with the reason `write-not-allowed`.
 * - `versionOf` gives the version of a stored item (roadmap CLI-55). With it, a guarded write
 *   expects the version of the item that the guard examined.
 * - `maxScanned` sets the largest number of rows that one `find` examines (roadmap CLI-55).
 *
 * The procedures apply the rules in one place: the view of the storage of a call
 * (`admittedStorage()`). Each read and each write of each procedure goes through this view.
 *
 * - A refused row is absent: `get` gives undefined, `has` gives false, and the lists, `size`,
 *   `find` and `changes` do not have it. A delta of `changes` puts the id of a refused row in
 *   `deleted`, so a copy of the caller drops it.
 * - An error of `admit` fails the read. It does not hide the rows, so a sync does not delete them.
 * - The guard reads the stored item before the write. With `versionOf`, the write expects the
 *   version of that item (roadmap CLI-16). A change of another writer between the read and the
 *   write then gives `VERSION_CONFLICT`, and the storage does not change.
 * - A `VERSION_CONFLICT` of a write has the current item. When the rule refuses that item, the
 *   conflict has no value.
 * - The rules get the invocation of the call (`ctx.invocation`). A call without an invocation gets
 *   no row and makes no write.
 */
import { InvocationError, type AdmitItem, type Invocation } from "../invoke.js";
import type { ProcedureContext } from "../types.js";
import { applyPatch, queryEntries, type StoragePatch, type StorageQueryOptions, type StorageQueryPolicy, type StorageSelector } from "./query.js";
import type { CollectionStorage, StorageBatchWriteOptions, StorageChanges, StorageItemWriteOptions, StorageWriteOptions } from "./storage.js";
import { patchInParts } from "./patch-in-parts.js";
import { VersionConflictError, versionConflictsOf, type VersionConflict, type VersionOf } from "./precondition.js";

/** A row of a collection: the id and the stored item. The rule `admit` examines one row at a time. */
export interface CollectionRow {
  readonly id: string;
  readonly value: unknown;
}

/** A write of a collection, as the guard examines it. */
export interface CollectionWrite {
  /**
   * The operation. `setBatch` gives one `set` for each item. `deleteBatch` and `clear` give one
   * `delete` for each id.
   */
  readonly op: "set" | "patch" | "delete";
  /** The id of the item. */
  readonly id: string;
  /** The item after the write: the value of a `set`, or the merged item of a `patch`. Undefined for a `delete`. */
  readonly doc: unknown;
  /** The stored item before the write. Undefined when the id has no item. */
  readonly prev: unknown;
}

/**
 * The guard of the writes of a collection. It gets each write and the invocation of the call. It
 * gives true to permit the write. An error that it throws passes through, and the storage does
 * not change.
 */
export type CollectionWriteGuard = (write: CollectionWrite, invocation: Invocation) => boolean | Promise<boolean>;

/** The rules of the rows of a served collection (roadmap CLI-41). Each rule is optional. */
export interface CollectionAdmission {
  /**
   * The rule of the rows. It gets each row `{ id, value }` of a read and the invocation of the
   * call, and it gives true to admit the row. The change events with values apply it for each
   * subscriber, with the invocation of the subscription.
   */
  admit?: AdmitItem | undefined;
  /** The guard of each `set`, `patch` and `delete`, also of the batches and of `clear`. */
  guard?: CollectionWriteGuard | undefined;
  /**
   * The version of a stored item: the function `versionOf` of the storage (roadmap CLI-55). Give
   * the same function, because the storage tests the version.
   *
   * - With it, each `set`, `delete`, `setBatch` and `patch` that the guard permits expects the
   *   version of the item that the guard examined. An id without an item expects `null`.
   * - A change of another writer between the read of the guard and the write gives
   *   `VERSION_CONFLICT`. The storage does not change.
   * - An expected version of the caller stays. The view adds a version only for an id without one.
   * - A guarded `patch` writes the merged item that the guard examined with `set`. A `patch()` of
   *   the storage does not merge the fields again.
   * - An item without a version gets no precondition. `deleteBatch` and `clear` get no
   *   precondition, because the storage cannot test one for them.
   * - A storage without `versionOf` refuses each guarded write with `PRECONDITION_NOT_SUPPORTED`.
   *
   * Without it, a guarded write has no precondition. A change of another writer between the read
   * of the guard and the write is then lost.
   */
  versionOf?: VersionOf<unknown> | undefined;
  /**
   * The largest number of rows that one `find` examines with the rule `admit` (roadmap CLI-55). It
   * is a whole number, 1 or more.
   *
   * - A `find` counts its skip and its limit in the admitted rows. Thus a caller with few admitted
   *   rows makes the view read many rows of the storage. This option stops that scan.
   * - The view counts the rows that match the selector, in the order of the query, from the first
   *   row. The rows of the skip also count.
   * - When the scan gets to the bound, `find` gives the admitted rows that it found. That page can
   *   be shorter than the limit, also when more rows match. The result has no other mark.
   * - A storage with `query()` gives the rows page by page. The view does not ask for a row after
   *   the bound.
   * - A storage without `query()` gives all its entries in one read. The view then runs the
   *   selector and the order, and the rule examines at most this number of rows.
   *
   * Without it, `find` reads the rows until its page is full, or until the rows end. Without `admit`,
   * the option has no effect.
   */
  maxScanned?: number | undefined;
}

/** The size of a page of a query of the storage, when the policy gives no `maxLimit`. */
const QUERY_PAGE = 1000;

/** The refusal of a write. */
function writeRefused(ctx: ProcedureContext, write: CollectionWrite): InvocationError {
  return new InvocationError("FORBIDDEN", `The rule of the collection does not permit the ${write.op} of "${write.id}"`, ctx.path, "write-not-allowed");
}

/**
 * This function throws a `TypeError` when an option of the rules of the rows is not correct. The
 * collection procedures call it when they are made.
 */
export function checkAdmission(admission: CollectionAdmission | undefined): void {
  const maxScanned = admission?.maxScanned;
  if (maxScanned !== undefined && (!Number.isSafeInteger(maxScanned) || maxScanned < 1)) {
    throw new TypeError(`admission.maxScanned must be a whole number, 1 or more: ${String(maxScanned)}`);
  }
}

/**
 * This function tells if the rule of the rows admits a row for a call. Without a rule, it gives
 * true. A call without an invocation gets no row.
 */
export async function admitsRow(admission: CollectionAdmission | undefined, ctx: ProcedureContext, id: string, value: unknown): Promise<boolean> {
  const admit = admission?.admit;
  if (!admit) return true;
  const invocation = ctx.invocation;
  return invocation !== undefined && (await admit({ id, value }, invocation)) === true;
}

/** A conflict without the current item. It keeps the id, the expected version and the version. */
function withoutValue(conflict: VersionConflict): VersionConflict {
  return { id: conflict.id, expected: conflict.expected, found: conflict.found, ...(conflict.version !== undefined && { version: conflict.version }) };
}

/**
 * This function gives the view of the storage of a call: the storage, with the rules of the
 * collection for each read and each write. Without rules, it gives the storage itself.
 *
 * @param storage - The storage of the call: of the collection, or of its partition
 * @param admission - The rules of the collection
 * @param ctx - The context of the call. The rules get its invocation.
 */
export function admittedStorage<T>(storage: CollectionStorage<T>, admission: CollectionAdmission | undefined, ctx: ProcedureContext): CollectionStorage<T> {
  const admit = admission?.admit;
  const guard = admission?.guard;
  if (!admit && !guard) return storage;
  checkAdmission(admission);
  const invocation = ctx.invocation;
  // The version of a stored item: only a guarded write expects one (roadmap CLI-55)
  const versionOf = guard ? admission?.versionOf : undefined;
  const maxScanned = admission?.maxScanned;

  const admits = (id: string, value: unknown): Promise<boolean> => admitsRow(admission, ctx, id, value);
  /** The entries that the rule admits, in their order. */
  const admitted = async (entries: Array<[string, T]>): Promise<Array<[string, T]>> => {
    if (!admit) return entries;
    const keep = await Promise.all(entries.map(([id, value]) => admits(id, value)));
    return entries.filter((_, index) => keep[index]);
  };
  /** The entries of the storage that the rule admits. The rule needs the ids, so the storage must give them. */
  const entries = async (): Promise<Array<[string, T]>> => {
    if (!storage.getEntries) throw new Error("The storage cannot give the ids of its items, so the rule of the rows cannot examine them");
    return admitted(await storage.getEntries());
  };
  /** This function throws `FORBIDDEN` unless the guard permits each write. */
  const permit = async (writes: readonly CollectionWrite[]): Promise<void> => {
    if (!guard) return;
    for (const write of writes) {
      if (invocation === undefined || (await guard(write, invocation)) !== true) throw writeRefused(ctx, write);
    }
  };
  /**
   * The expected version of the stored item that the guard examined: its version, or `null` for
   * no item. It is undefined without `versionOf`, and for an item without a version.
   */
  const expectedOf = (found: boolean, prev: unknown): string | null | undefined => {
    if (versionOf === undefined) return undefined;
    return found ? versionOf(prev) : null;
  };
  /** The options of a guarded write of one item. An expected version of the caller stays. */
  const itemOptions = (options: StorageItemWriteOptions | undefined, prev: unknown): StorageItemWriteOptions | undefined => {
    if (options?.expectedVersion !== undefined) return options;
    const expectedVersion = expectedOf(prev !== undefined, prev);
    return expectedVersion === undefined ? options : { ...options, expectedVersion };
  };
  /** The options of a guarded `setBatch`. The view adds an expected version for each id that has none. */
  const batchOptions = (options: StorageBatchWriteOptions | undefined, ids: readonly string[], before: Map<string, T>): StorageBatchWriteOptions | undefined => {
    if (versionOf === undefined) return options;
    const given = options?.expectedVersions ?? [];
    const covered = new Set(given.map(([id]) => id));
    const added: Array<[string, string | null]> = [];
    for (const id of new Set(ids)) {
      if (covered.has(id)) continue;
      const expected = expectedOf(before.has(id), before.get(id));
      if (expected !== undefined) added.push([id, expected]);
    }
    return added.length === 0 ? options : { ...options, expectedVersions: [...given, ...added] };
  };
  /**
   * This function runs a write. A `VERSION_CONFLICT` has the current item of each conflict. When
   * the rule refuses that item, the error does not give its value.
   */
  const writing = async <R>(write: () => Promise<R>): Promise<R> => {
    if (!admit) return write();
    try {
      return await write();
    } catch (error) {
      throw await withoutRefusedValues(error);
    }
  };
  /** The error of a write, without the current items that the rule refuses. */
  const withoutRefusedValues = async (error: unknown): Promise<unknown> => {
    const conflicts = versionConflictsOf(error);
    if (conflicts === undefined) return error;
    const kept = await Promise.all(
      conflicts.map(async (conflict) => (conflict.found && "value" in conflict && !(await admits(conflict.id, conflict.value)) ? withoutValue(conflict) : conflict)),
    );
    if (kept.every((conflict, index) => conflict === conflicts[index])) return error;
    return new VersionConflictError(kept, error instanceof Error ? error.message : undefined);
  };

  const view: CollectionStorage<T> = {
    async get(id) {
      const value = await storage.get(id);
      return value === undefined || (await admits(id, value)) ? value : undefined;
    },
    async getAll() {
      return admit ? (await entries()).map(([, value]) => value) : storage.getAll();
    },
    async find(predicate) {
      return admit ? (await entries()).map(([, value]) => value).filter(predicate) : storage.find(predicate);
    },
    async has(id) {
      return admit ? (await view.get(id)) !== undefined : storage.has(id);
    },
    async size() {
      return admit ? (await entries()).length : storage.size();
    },
    async getBatch(ids) {
      const found = await storage.getBatch(ids);
      if (!admit) return found;
      const kept = await admitted([...found.entries()]);
      return new Map(kept);
    },

    async set(id, value, options) {
      if (!guard) return writing(() => storage.set(id, value, options));
      const prev = await storage.get(id);
      await permit([{ op: "set", id, doc: value, prev }]);
      return writing(() => storage.set(id, value, itemOptions(options, prev)));
    },
    async delete(id, options) {
      if (!guard) return writing(() => storage.delete(id, options));
      const prev = await storage.get(id);
      await permit([{ op: "delete", id, doc: undefined, prev }]);
      return writing(() => storage.delete(id, itemOptions(options, prev)));
    },
    async clear(options) {
      if (!guard) return storage.clear(options);
      // Each item is a delete that the guard examines. The storage deletes only the items that it examined.
      if (!storage.getEntries) throw new Error("The storage cannot give the ids of its items, so the guard cannot examine a clear");
      const all = await storage.getEntries();
      await permit(all.map(([id, prev]) => ({ op: "delete" as const, id, doc: undefined, prev })));
      if (all.length > 0) await storage.deleteBatch(all.map(([id]) => id), options);
    },
    async setBatch(items, options) {
      if (!guard) return writing(() => storage.setBatch(items, options));
      const ids = items.map(([id]) => id);
      const before = await storage.getBatch(ids);
      await permit(items.map(([id, value]) => ({ op: "set" as const, id, doc: value, prev: before.get(id) })));
      return writing(() => storage.setBatch(items, batchOptions(options, ids, before)));
    },
    async deleteBatch(ids, options) {
      if (guard) {
        const before = await storage.getBatch(ids);
        await permit(ids.map((id) => ({ op: "delete" as const, id, doc: undefined, prev: before.get(id) })));
      }
      return storage.deleteBatch(ids, options);
    },
    async patch(id: string, fields: StoragePatch, options?: StorageWriteOptions): Promise<T | undefined> {
      const check = async (prev: unknown, doc: unknown): Promise<void> => permit([{ op: "patch", id, doc, prev }]);
      if (!storage.patch) {
        return writing(() => patchInParts(storage as CollectionStorage<unknown>, id, fields, options, guard ? check : undefined, versionOf) as Promise<T | undefined>);
      }
      if (!guard) return storage.patch(id, fields, options);
      const prev = await storage.get(id);
      // A patch of a missing id changes nothing
      if (prev === undefined) return undefined;
      const doc = applyPatch(prev, fields) as T;
      await check(prev, doc);
      const expectedVersion = expectedOf(true, prev);
      if (expectedVersion === undefined) return storage.patch(id, fields, options);
      // The storage writes the item that the guard examined, only while the stored item has the version that the guard read
      await writing(() => storage.set(id, doc, { ...options, expectedVersion }));
      return doc;
    },
    close: () => storage.close(),
  };

  if (storage.getEntries) view.getEntries = async () => (admit ? entries() : storage.getEntries!());
  if (admit ? storage.getEntries : storage.getIds) {
    view.getIds = async () => (admit ? (await entries()).map(([id]) => id) : storage.getIds!());
  }
  if (storage.getChangesSince) {
    view.getChangesSince = async (since?: string): Promise<StorageChanges<T>> => {
      const changes = await storage.getChangesSince!(since);
      if (!admit) return changes;
      const changed = await admitted(changes.changed);
      if (changes.full) return { ...changes, changed };
      // A delta: the copy of the caller drops each refused row
      const kept = new Set(changed.map(([id]) => id));
      const refused = changes.changed.filter(([id]) => !kept.has(id)).map(([id]) => id);
      return { ...changes, changed, deleted: [...changes.deleted, ...refused] };
    };
  }
  if (storage.query) {
    view.query = async (selector: StorageSelector, options?: StorageQueryOptions, policy?: StorageQueryPolicy) => {
      if (!admit) return storage.query!(selector, options, policy);
      const sort = options?.sort;
      const pageOf = (skip: number, limit: number): Promise<Array<[string, T]>> => storage.query!(selector, { ...(sort !== undefined && { sort }), skip, limit }, policy);
      return admittedQuery(pageOf, admitted, options ?? {}, pageSizeOf(policy), maxScanned);
    };
  } else if (admit && maxScanned !== undefined && storage.getEntries) {
    // A storage without query() gives all its entries. The rule examines at most maxScanned of the matching rows.
    view.query = async (selector: StorageSelector, options?: StorageQueryOptions, policy?: StorageQueryPolicy) => {
      const sort = options?.sort;
      const matches = queryEntries(await storage.getEntries!(), selector, sort !== undefined ? { sort } : {}, { ...policy, maxLimit: undefined });
      const pageOf = async (skip: number, limit: number): Promise<Array<[string, T]>> => matches.slice(skip, skip + limit);
      return admittedQuery(pageOf, admitted, options ?? {}, pageSizeOf(policy), maxScanned);
    };
  }
  return view;
}

/** The size of a page of a query of the storage: the `maxLimit` of the policy, or `QUERY_PAGE`. */
function pageSizeOf(policy: StorageQueryPolicy | undefined): number {
  return policy?.maxLimit !== undefined && Number.isFinite(policy.maxLimit) ? policy.maxLimit : QUERY_PAGE;
}

/**
 * The query of a storage with the rule of the rows. The storage runs the selector and the order,
 * page by page. The skip and the limit count the admitted rows only, so a page of the caller is full.
 * With `maxScanned`, the scan reads no row after the bound, and the page of the caller can be short.
 *
 * @param pageOf - The rows of the query from a position, at most `limit` rows
 */
async function admittedQuery<T>(
  pageOf: (skip: number, limit: number) => Promise<Array<[string, T]>>,
  admitted: (entries: Array<[string, T]>) => Promise<Array<[string, T]>>,
  options: StorageQueryOptions,
  page: number,
  maxScanned: number | undefined,
): Promise<Array<[string, T]>> {
  const skip = options.skip ?? 0;
  const limit = options.limit;
  const out: Array<[string, T]> = [];
  let skipped = 0;
  let scanned = 0;
  for (;;) {
    const size = maxScanned === undefined ? page : Math.min(page, maxScanned - scanned);
    // The scan got to the bound: the page of the caller has the rows that it found
    if (size <= 0) return out;
    const rows = await pageOf(scanned, size);
    scanned += rows.length;
    for (const entry of await admitted(rows)) {
      if (skipped < skip) {
        skipped++;
        continue;
      }
      out.push(entry);
      if (limit !== undefined && out.length >= limit) return out;
    }
    if (rows.length < size) return out;
  }
}
