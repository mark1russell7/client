/**
 * The stacks of the overlay from rules. Each rule gives, for collections (and, when it names them,
 * for some documents), a read stack (top layer first), the write targets (the first one is the
 * default) and a merge mode. A rule names layers with variables, and the app resolves them, for
 * example `$me` to the layer of the signed-in user. The first rule for a document wins, so a rule
 * for some documents goes before the rule of their collection.
 */
import type { MergeMode } from "./overlay.js";

/** A rule of the overlay, with the layers as variables or names. */
export interface StackRule {
  /** A collection, a list of collections, or a pattern that the app gives a meaning (for example `*`). */
  readonly collection: string | readonly string[];
  /** Only these documents (logical ids) of the collection. */
  readonly doc?: string | readonly string[] | undefined;
  /** The read stack, top layer first. */
  readonly read: readonly string[];
  /** The write targets. The default is the top layer of the read stack. */
  readonly write?: string | readonly string[] | undefined;
  /** The merge mode (default `field`). */
  readonly mode?: MergeMode | undefined;
}

/** A resolved stack: for some documents (`docs`) or for all the documents of a collection. */
export interface ResolvedStack {
  readonly docs?: readonly string[];
  /** The read stack, top layer first. */
  readonly layers: readonly string[];
  /** The write targets. The first one is the default. */
  readonly write: readonly string[];
  readonly mode: MergeMode;
}

/** The function that gives the layer of a variable or a name, or `undefined` for none. */
export type LayerResolver = (variable: string) => string | undefined;

const listOf = (value: string | readonly string[] | undefined): string[] => (value === undefined ? [] : typeof value === "string" ? [value] : [...value]);

/**
 * This function resolves the rules to the stacks of each collection. A rule whose read stack
 * resolves to no layer does not apply. After a rule for all the documents of a collection, a later
 * rule of that collection does not apply.
 */
export function resolveStacks(rules: readonly StackRule[] | undefined, resolve: LayerResolver): Map<string, ResolvedStack[]> {
  const stacks = new Map<string, ResolvedStack[]>();
  for (const rule of rules ?? []) {
    if (typeof rule !== "object" || rule === null) continue;
    const resolved = (values: string[]): string[] => values.map((value) => resolve(value)).filter((layer): layer is string => typeof layer === "string" && layer !== "");
    const layers = [...new Set(resolved(listOf(rule.read)))];
    if (layers.length === 0) continue;
    const write = resolved(listOf(rule.write));
    const docs = rule.doc === undefined ? undefined : listOf(rule.doc);
    const stack: ResolvedStack = {
      ...(docs ? { docs } : {}),
      layers,
      write: write.length > 0 ? write : [layers[0]!],
      mode: rule.mode === "doc" ? "doc" : "field",
    };
    for (const collection of listOf(rule.collection)) {
      if (typeof collection !== "string" || collection === "") continue;
      const list = stacks.get(collection) ?? [];
      if (list.some((entry) => !entry.docs)) continue;
      list.push(stack);
      stacks.set(collection, list);
    }
  }
  return stacks;
}

/**
 * This function gives the stack of a document: the first stack of its collection that names the
 * document or names no documents, or `undefined` when the collection has no stack.
 */
export function stackOf(stacks: ReadonlyMap<string, readonly ResolvedStack[]>, collection: string, id?: string): ResolvedStack | undefined {
  return stacks.get(collection)?.find((stack) => !stack.docs || (id !== undefined && stack.docs.includes(id)));
}
