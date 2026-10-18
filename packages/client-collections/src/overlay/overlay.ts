/**
 * The overlay: one logical document read through a stack of layers (for example the scopes of a
 * space, a board, a group and a user). Each layer can hold its own copy of the document. A read
 * merges the copies, top layer first:
 *
 * - The mode `field` (the default): each top-level field comes from the highest copy that has it. A
 *   copy that sets a field to `UNSET` hides the lower values of that field.
 * - The mode `doc`: the highest copy wins whole.
 * - A copy with `_deleted: true` hides the whole logical document, and in the mode `field` also the
 *   copies under it.
 *
 * A copy of the mode `field` is the same as the patch operations of `applyPatch` over the copies
 * under it: its fields are `$set`, and its `UNSET` fields are `$unset` (refer to `copyAsPatch`).
 * It is not a JSON Merge Patch: in a copy, `null` is a value, and an object field replaces the
 * lower object whole.
 */
import type { StoragePatchOperations } from "@procedures/client/query";

/**
 * The value that hides a field of the lower layers (`{ field: UNSET }` in an upper copy). Its key has
 * no `$`, because MongoDB refuses or warns about field names that start with `$`.
 */
export const UNSET: Readonly<{ __unset: true }> = Object.freeze({ __unset: true as const });

/** The field of a copy that hides the whole logical document. */
export const DELETED_FIELD = "_deleted";

/** The field of a copy that names its layer. A merge removes it. */
export const LAYER_FIELD = "_scope";

/** How the copies of a document merge: field by field, or the top copy whole. */
export type MergeMode = "field" | "doc";

/** The options of `mergeCopies` and `copyAsPatch`: the names of the fields of the overlay. */
export interface OverlayFields {
  /** The field that hides the whole document (default `_deleted`). */
  readonly deleted?: string | undefined;
  /** The field that names the layer of a copy (default `_scope`). A merge removes it. */
  readonly layer?: string | undefined;
}

/** A copy of a logical document in one layer. */
export type LayerCopy = Readonly<Record<string, unknown>>;

/** True when a value is the `UNSET` marker (an object with only `__unset: true`). */
export function isUnset(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { __unset?: unknown }).__unset === true &&
    Object.keys(value).length === 1
  );
}

/** The fields of a copy without the fields of the overlay. */
function withoutOverlayFields(copy: LayerCopy, fields: OverlayFields): Record<string, unknown> {
  const { [fields.deleted ?? DELETED_FIELD]: _deleted, [fields.layer ?? LAYER_FIELD]: _layer, ...rest } = copy;
  return rest;
}

/**
 * This function merges the copies of one logical document. `copies` is in the order of the stack,
 * top layer first, with `undefined` for a layer without a copy. It gives the merged document
 * without the fields of the overlay, or `undefined` when no copy exists or the top copy is deleted.
 */
export function mergeCopies(
  copies: ReadonlyArray<LayerCopy | undefined>,
  mode: MergeMode = "field",
  fields: OverlayFields = {}
): Record<string, unknown> | undefined {
  const deleted = fields.deleted ?? DELETED_FIELD;
  const present = copies.filter((copy): copy is LayerCopy => copy !== undefined && copy !== null);
  const top = present[0];
  if (top === undefined || top[deleted] === true) return undefined;
  if (mode === "doc") {
    const whole = withoutOverlayFields(top, fields);
    for (const key of Object.keys(whole)) if (isUnset(whole[key])) delete whole[key];
    return whole;
  }
  // From the bottom copy up: a deleted copy lower down hides only the copies under it
  let merged: Record<string, unknown> = {};
  for (let index = present.length - 1; index >= 0; index--) {
    const copy = present[index]!;
    if (copy[deleted] === true) {
      merged = {};
      continue;
    }
    for (const [key, value] of Object.entries(withoutOverlayFields(copy, fields))) {
      if (isUnset(value)) delete merged[key];
      else merged[key] = value;
    }
  }
  return merged;
}

/**
 * This function gives a copy of the mode `field` as the patch operations of `applyPatch`: its
 * fields as `$set` and its `UNSET` fields as `$unset`. `applyPatch(lower, copyAsPatch(copy))` then
 * gives the merge of the copy over `lower`. A field name with a dot is a path for `applyPatch`, so
 * the two agree only for field names without a dot.
 */
export function copyAsPatch(copy: LayerCopy, fields: OverlayFields = {}): StoragePatchOperations {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const [key, value] of Object.entries(withoutOverlayFields(copy, fields))) {
    if (isUnset(value)) unset.push(key);
    else set[key] = value;
  }
  return { $set: set, $unset: unset };
}
