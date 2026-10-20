/**
 * The patch of an item of a storage (roadmap CLI-14): `patch()` of the storage, or a read, a merge
 * and a write for a storage without it.
 */
import { applyPatch, type StoragePatch } from "./query.js";
import type { CollectionStorage, StorageWriteOptions } from "./storage.js";
import type { VersionOf } from "./precondition.js";

/**
 * The patches of a storage without `patch()` that run, for each id. A patch of an id waits for the
 * patch before it, so two patches of one process keep each field. A write of another writer
 * between the read and the write of a patch is lost: give the storage a `patch()` for one step.
 */
const PATCHES = new WeakMap<object, Map<string, Promise<unknown>>>();

/**
 * This function patches an item of a storage without `patch()`: a read, a merge and a write. The
 * check gets the stored item and the merged item before the write. An error of the check stops
 * the patch, and the storage does not change.
 *
 * With `versionOf`, the write expects the version of the item that the patch read (roadmap
 * CLI-55). A change of another writer between the read and the write then gives
 * `VERSION_CONFLICT`. An item without a version gets no precondition.
 */
export function patchInParts(
  storage: CollectionStorage<unknown>,
  id: string,
  fields: StoragePatch,
  options?: StorageWriteOptions,
  check?: (prev: unknown, next: unknown) => Promise<void>,
  versionOf?: VersionOf<unknown>,
): Promise<unknown> {
  let running = PATCHES.get(storage);
  if (!running) {
    running = new Map();
    PATCHES.set(storage, running);
  }
  const queue = running;
  const before = queue.get(id) ?? Promise.resolve();
  const patch = before.then(async () => {
    const current = await storage.get(id);
    if (current === undefined) return undefined;
    const next = applyPatch(current, fields);
    if (check) await check(current, next);
    const expectedVersion = versionOf?.(current);
    await storage.set(id, next, expectedVersion === undefined ? options : { ...options, expectedVersion });
    return next;
  });
  const settled = patch.then(
    () => undefined,
    () => undefined,
  );
  queue.set(id, settled);
  void settled.then(() => {
    if (queue.get(id) === settled) queue.delete(id);
  });
  return patch;
}

/** This function patches an item: with `patch()` of the storage, or in parts. It gives the new item, or undefined for a missing id. */
export function patchItem(storage: CollectionStorage<unknown>, id: string, fields: StoragePatch, options?: StorageWriteOptions): Promise<unknown> {
  return storage.patch ? storage.patch(id, fields, options) : patchInParts(storage, id, fields, options);
}
