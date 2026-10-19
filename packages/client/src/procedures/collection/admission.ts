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
 *
 * The procedures apply the rules in one place: the view of the storage of a call
 * (`admittedStorage()`). Each read and each write of each procedure goes through this view.
 *
 * - A refused row is absent: `get` gives undefined, `has` gives false, and the lists, `size`,
 *   `find` and `changes` do not have it. A delta of `changes` puts the id of a refused row in
 *   `deleted`, so a copy of the caller drops it.
 * - An error of `admit` fails the read. It does not hide the rows, so a sync does not delete them.
 * - The guard reads the stored item before the write. CLI-16 (`expectedVersion`) closes the gap of
 *   a write of another writer between that read and the write.
 * - The rules get the invocation of the call (`ctx.invocation`). A call without an invocation gets
 *   no row and makes no write.
 */
import { InvocationError, type AdmitItem, type Invocation } from "../invoke.js";
import type { ProcedureContext } from "../types.js";
import { applyPatch, type StoragePatch, type StorageQueryOptions, type StorageQueryPolicy, type StorageSelector } from "./query.js";
import type { CollectionStorage, StorageChanges, StorageWriteOptions } from "./storage.js";
import { patchInParts } from "./patch-in-parts.js";

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
}

/** The size of a page of a query of the storage, when the policy gives no `maxLimit`. */
const QUERY_PAGE = 1000;

/** The refusal of a write. */
function writeRefused(ctx: ProcedureContext, write: CollectionWrite): InvocationError {
  return new InvocationError("FORBIDDEN", `The rule of the collection does not permit the ${write.op} of "${write.id}"`, ctx.path, "write-not-allowed");
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
  const invocation = ctx.invocation;

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
      if (guard) await permit([{ op: "set", id, doc: value, prev: await storage.get(id) }]);
      return storage.set(id, value, options);
    },
    async delete(id, options) {
      if (guard) await permit([{ op: "delete", id, doc: undefined, prev: await storage.get(id) }]);
      return storage.delete(id, options);
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
      if (guard) {
        const before = await storage.getBatch(items.map(([id]) => id));
        await permit(items.map(([id, value]) => ({ op: "set" as const, id, doc: value, prev: before.get(id) })));
      }
      return storage.setBatch(items, options);
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
      if (!storage.patch) return patchInParts(storage as CollectionStorage<unknown>, id, fields, options, guard ? check : undefined) as Promise<T | undefined>;
      if (guard) {
        const prev = await storage.get(id);
        // A patch of a missing id changes nothing
        if (prev === undefined) return undefined;
        await check(prev, applyPatch(prev, fields));
      }
      return storage.patch(id, fields, options);
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
    view.query = async (selector: StorageSelector, options?: StorageQueryOptions, policy?: StorageQueryPolicy) =>
      admit ? admittedQuery(storage, admitted, selector, options ?? {}, policy) : storage.query!(selector, options, policy);
  }
  return view;
}

/**
 * The query of a storage with the rule of the rows. The storage runs the selector and the order,
 * page by page. The skip and the limit count the admitted rows only, so a page of the caller is full.
 */
async function admittedQuery<T>(
  storage: CollectionStorage<T>,
  admitted: (entries: Array<[string, T]>) => Promise<Array<[string, T]>>,
  selector: StorageSelector,
  options: StorageQueryOptions,
  policy: StorageQueryPolicy | undefined,
): Promise<Array<[string, T]>> {
  const page = policy?.maxLimit !== undefined && Number.isFinite(policy.maxLimit) ? policy.maxLimit : QUERY_PAGE;
  const skip = options.skip ?? 0;
  const limit = options.limit;
  const out: Array<[string, T]> = [];
  let skipped = 0;
  for (let offset = 0; ; offset += page) {
    const rows = await storage.query!(selector, { ...(options.sort !== undefined && { sort: options.sort }), skip: offset, limit: page }, policy);
    for (const entry of await admitted(rows)) {
      if (skipped < skip) {
        skipped++;
        continue;
      }
      out.push(entry);
      if (limit !== undefined && out.length >= limit) return out;
    }
    if (rows.length < page) return out;
  }
}

