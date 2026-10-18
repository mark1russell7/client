import { applyPatch, isPatchOperations, patchProblems, type StoragePatch, type StoragePatchOperations } from "@procedures/client/query";

const INDEX = /^(?:0|[1-9][0-9]*)$/;

/** True for an object that is not an array and not null. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The keys of an object whose values are not `undefined`. */
function definedKeys(value: Readonly<Record<string, unknown>> | undefined): string[] {
  return value === undefined ? [] : Object.keys(value).filter((key) => value[key] !== undefined);
}

/** The child of a container at a key, and whether the container has it. */
function childOf(container: unknown, key: string): { found: boolean; value?: unknown } {
  if (Array.isArray(container)) {
    return INDEX.test(key) && Number(key) < container.length ? { found: true, value: container[Number(key)] } : { found: false };
  }
  return isObject(container) && Object.hasOwn(container, key) ? { found: true, value: container[key] } : { found: false };
}

/** The value at a path, and whether it is there. */
function valueAt(value: unknown, path: readonly string[]): { found: boolean; value?: unknown } {
  let current: { found: boolean; value?: unknown } = { found: true, value };
  for (const key of path) {
    current = childOf(current.value, key);
    if (!current.found) return current;
  }
  return current;
}

/** This function sets a key as an own property, also the key `__proto__`. */
function define(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/** True when two JSON values are equal. The order of the keys of an object does not count. */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((item, i) => equal(item, b[i]));
  if (!isObject(a) || !isObject(b)) return false;
  const keys = definedKeys(a);
  return keys.length === definedKeys(b).length && keys.every((key) => b[key] !== undefined && equal(a[key], b[key]));
}

/** The moves of one array: the indices, in the item before the patch, of its removals or of its insertions. */
interface Moves {
  readonly kind: "remove" | "insert";
  readonly indices: number[];
}

/**
 * This function gives the patch that undoes a patch: applied to the item after the patch, the
 * inverse gives the item before the patch again. It gives `undefined` when no patch can undo it
 * exactly. Then keep the whole item before the change.
 *
 * - The inverse of `$remove` of an element is an `$insert` of the element, and the inverse of an
 *   `$insert` is a `$remove`. The inverse does not keep the whole array.
 * - The inverse of `$set` and `$unset` sets each old value again, or removes the new path.
 * - The indices of the inverse refer to the item after the patch.
 * - The function applies the inverse to check it. It gives `undefined` when the check fails, for
 *   example after the removal of two adjacent elements, or when `before` is not an object.
 *
 * @example
 * ```ts
 * inversePatch({ tags: ["a", "b"] }, { $remove: ["tags.0"] }); // { $insert: { "tags.0": "a" } }
 * ```
 *
 * @throws TypeError when `applyPatch` refuses the patch
 */
export function inversePatch(before: unknown, patch: StoragePatch): StoragePatchOperations | undefined {
  const after = applyPatch(before, patch);
  if (!isObject(before)) return undefined;
  const inverse = isPatchOperations(patch) ? inverseOfOperations(before, patch) : inverseOfMerge(before, patch);
  if (inverse === undefined || patchProblems(inverse).length > 0) return undefined;
  try {
    return equal(applyPatch(after, inverse), before) ? inverse : undefined;
  } catch {
    return undefined;
  }
}

/** The inverse of a JSON Merge Patch: the old value of each top field, or its removal. */
function inverseOfMerge(before: Record<string, unknown>, patch: StoragePatch): StoragePatchOperations | undefined {
  const set: Record<string, unknown> = {};
  const remove: string[] = [];
  for (const key of definedKeys(patch)) {
    // A field name with a dot is a path for the operations, so the operations cannot name it
    if (key.includes(".") || key.startsWith("$")) return undefined;
    if (Object.hasOwn(before, key)) define(set, key, before[key]);
    else remove.push(key);
  }
  return operations(set, remove, {});
}

/** The inverse of the operations of a patch. */
function inverseOfOperations(before: Record<string, unknown>, patch: StoragePatchOperations): StoragePatchOperations | undefined {
  // The moves of each array, by the path of the array in the item before the patch
  const moves = new Map<string, Moves>();
  const addMove = (path: readonly string[], kind: Moves["kind"]): void => {
    const array = path.slice(0, -1).join(".");
    const entry = moves.get(array) ?? { kind, indices: [] };
    entry.indices.push(Number(path.at(-1)));
    moves.set(array, entry);
  };
  const removals = (patch.$remove ?? []).map((key) => key.split("."));
  for (const path of removals) {
    const parent = valueAt(before, path.slice(0, -1));
    if (parent.found && Array.isArray(parent.value) && childOf(parent.value, path.at(-1)!).found) addMove(path, "remove");
  }
  const insertions = definedKeys(patch.$insert).map((key) => key.split("."));
  for (const path of insertions) addMove(path, "insert");

  // A path of the item before the patch, as a path of the item after it
  const translate = (path: readonly string[]): string => {
    const out = [...path];
    for (let i = 0; i < path.length; i++) {
      const move = moves.get(path.slice(0, i).join("."));
      if (!move || !INDEX.test(path[i]!)) continue;
      const index = Number(path[i]);
      const shift = move.kind === "remove" ? -move.indices.filter((r) => r < index).length : move.indices.filter((n) => n <= index).length;
      out[i] = String(index + shift);
    }
    return out.join(".");
  };

  const set: Record<string, unknown> = {};
  const remove = new Set<string>();
  const insert: Record<string, unknown> = {};
  const put = (target: Record<string, unknown>, key: string, value: unknown): boolean => {
    if (Object.hasOwn(target, key)) return false;
    define(target, key, value);
    return true;
  };

  // `$set` and `$unset`: the old value, or the removal of the part that the patch made
  const restore = (path: readonly string[], made: boolean): boolean => {
    let current: unknown = before;
    for (let n = 0; n < path.length; n++) {
      const child = childOf(current, path[n]!);
      if (!child.found) {
        if (made) remove.add(translate(path.slice(0, n + 1)));
        return true;
      }
      current = child.value;
      // `$set` makes an object of a null on its path
      if (made && current === null && n < path.length - 1) return put(set, translate(path.slice(0, n + 1)), null);
    }
    return put(set, translate(path), current);
  };
  for (const key of definedKeys(patch.$set)) if (!restore(key.split("."), true)) return undefined;
  for (const key of patch.$unset ?? []) if (!restore(key.split("."), false)) return undefined;

  // `$remove`: an `$insert` of the element, or the old value of a field of an object
  for (const path of removals) {
    const parent = valueAt(before, path.slice(0, -1));
    if (!parent.found || !Array.isArray(parent.value)) {
      if (!restore(path, false)) return undefined;
      continue;
    }
    const element = childOf(parent.value, path.at(-1)!);
    if (!element.found) continue;
    const index = Number(path.at(-1));
    const target = `${translate(path.slice(0, -1))}.${index - moves.get(path.slice(0, -1).join("."))!.indices.filter((r) => r < index).length}`;
    if (!put(insert, target, element.value)) return undefined;
  }

  // `$insert`: a `$remove` of the new element
  for (const path of insertions) {
    const index = Number(path.at(-1));
    remove.add(`${translate(path.slice(0, -1))}.${index + moves.get(path.slice(0, -1).join("."))!.indices.filter((n) => n < index).length}`);
  }
  return operations(set, [...remove], insert);
}

/** The operations, without the empty ones. */
function operations(set: Record<string, unknown>, remove: string[], insert: Record<string, unknown>): StoragePatchOperations {
  return {
    ...(Object.keys(set).length > 0 ? { $set: set } : {}),
    ...(remove.length > 0 ? { $remove: remove } : {}),
    ...(Object.keys(insert).length > 0 ? { $insert: insert } : {}),
  };
}
