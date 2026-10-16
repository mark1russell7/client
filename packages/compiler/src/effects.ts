/**
 * The effects pass: the effects of the whole program, from the bottom up.
 *
 * - `may` is the upper bound: the effects of each call that can start. A sequence and the
 *   branches give the union. A call that does not declare its effects, or whose program the
 *   compiler cannot see, makes the effects unknown: the check fails closed.
 * - `must` is the lower bound: the effects of each run in which no call fails. A sequence gives
 *   the union. Two branches give the condition and the intersection of the branches. A part
 *   that can start zero times (a later operand of `and`, the `fn` of `map`) gives nothing.
 */

import { isDestructive, isReadOnly, type Effects, type ProcedureEntry, type ProcedurePath } from "@procedures/client/browser";
import type { CallNode, DynamicNode, IRNode, ItemsSpec, Pointer } from "./ir.js";
import type { ProcedureFacts } from "./facts.js";

/** The upper bound of the effects. An undefined list: the compiler does not know it. */
export interface MayEffects {
  readonly reads: ReadonlySet<string> | undefined;
  readonly writes: ReadonlySet<string> | undefined;
  /** True: a call can delete or overwrite data. */
  readonly destructive: boolean;
  /** True: each call that writes is idempotent. */
  readonly idempotent: boolean;
}

/** The lower bound of the effects. */
export interface MustEffects {
  readonly reads: ReadonlySet<string>;
  readonly writes: ReadonlySet<string>;
}

/** The effects of a node. */
export interface EffectSummary {
  readonly may: MayEffects;
  readonly must: MustEffects;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/** The effects of a part that does nothing. */
export const NO_EFFECTS: EffectSummary = {
  may: { reads: EMPTY_SET, writes: EMPTY_SET, destructive: false, idempotent: true },
  must: { reads: EMPTY_SET, writes: EMPTY_SET },
};

/** The effects of a part that the compiler does not know. */
export const UNKNOWN_EFFECTS: EffectSummary = {
  may: { reads: undefined, writes: undefined, destructive: true, idempotent: false },
  must: { reads: EMPTY_SET, writes: EMPTY_SET },
};

function union(a: ReadonlySet<string> | undefined, b: ReadonlySet<string> | undefined): ReadonlySet<string> | undefined {
  if (!a || !b) return undefined;
  if (a.size === 0) return b;
  if (b.size === 0) return a;
  return new Set([...a, ...b]);
}

function unionMust(a: ReadonlySet<string>, b: ReadonlySet<string>): ReadonlySet<string> {
  return union(a, b) ?? EMPTY_SET;
}

/** The effects of two parts that both start, one after the other. */
export function sequence(...parts: EffectSummary[]): EffectSummary {
  return parts.reduce(
    (a, b) => ({
      may: {
        reads: union(a.may.reads, b.may.reads),
        writes: union(a.may.writes, b.may.writes),
        destructive: a.may.destructive || b.may.destructive,
        idempotent: a.may.idempotent && b.may.idempotent,
      },
      must: { reads: unionMust(a.must.reads, b.must.reads), writes: unionMust(a.must.writes, b.must.writes) },
    }),
    NO_EFFECTS,
  );
}

/** The effects of a part that can start zero times. */
export function optional(part: EffectSummary): EffectSummary {
  return { may: part.may, must: NO_EFFECTS.must };
}

/** The effects of one of two parts. */
export function either(a: EffectSummary, b: EffectSummary): EffectSummary {
  const intersect = (x: ReadonlySet<string>, y: ReadonlySet<string>): ReadonlySet<string> => new Set([...x].filter((name) => y.has(name)));
  return {
    may: sequence(a, b).may,
    must: { reads: intersect(a.must.reads, b.must.reads), writes: intersect(a.must.writes, b.must.writes) },
  };
}

/** The effects that an entry declares. Absent effects, or an absent list, are unknown. */
export function declaredEffects(entry: ProcedureEntry | undefined): EffectSummary {
  const effects = entry?.effects;
  if (!effects) return UNKNOWN_EFFECTS;
  return {
    may: {
      reads: effects.reads ? new Set(effects.reads) : undefined,
      writes: effects.writes ? new Set(effects.writes) : undefined,
      destructive: isDestructive(effects),
      idempotent: isReadOnly(effects) || effects.idempotent === true,
    },
    must: { reads: new Set(effects.reads ?? []), writes: new Set(effects.writes ?? []) },
  };
}

/** True when the effects are not fully known. */
export function isUnknown(summary: EffectSummary): boolean {
  return summary.may.reads === undefined || summary.may.writes === undefined;
}

/** The effects as the `Effects` of a manifest: an unknown list is absent. */
export function toEffects(may: MayEffects): Effects {
  return {
    ...(may.reads ? { reads: [...may.reads].sort() } : {}),
    ...(may.writes ? { writes: [...may.writes].sort() } : {}),
    destructive: may.destructive,
    idempotent: may.idempotent,
  };
}

/** The result of the pass. */
export interface EffectsAnalysis {
  readonly program: EffectSummary;
  /** The effects of each node. */
  readonly byNode: ReadonlyMap<IRNode, EffectSummary>;
  /** The effects of the program that each data-driven call runs (its body), when the compiler knows them. */
  readonly nested: ReadonlyMap<IRNode, EffectSummary>;
  /** The pointers of the calls whose effects the compiler does not know. */
  readonly unknownAt: readonly Pointer[];
}

/** The effects of the body of a defined procedure, or undefined when the compiler cannot see it. */
export type BodyEffects = (path: ProcedurePath) => EffectSummary | undefined;

/** This function infers the effects of each node and of the program. */
export function inferEffects(root: IRNode, facts: ProcedureFacts, bodyEffects: BodyEffects): EffectsAnalysis {
  const byNode = new Map<IRNode, EffectSummary>();
  const nested = new Map<IRNode, EffectSummary>();
  const unknownAt: Pointer[] = [];

  const items = (spec: ItemsSpec): { summary: EffectSummary; nonEmpty: boolean } =>
    spec.kind === "list"
      ? { summary: sequence(...spec.items.map(infer)), nonEmpty: spec.items.length > 0 }
      : { summary: infer(spec.value), nonEmpty: false };

  /** The effects of what a data-driven procedure runs. */
  const inner = (node: CallNode | DynamicNode, entry: ProcedureEntry | undefined): EffectSummary => {
    if (node.kind === "dynamic") {
      if (node.model) return infer(node.model);
      if (node.reason === "invalid-control-flow") return NO_EFFECTS;
      if (node.reason === "raw-input" && entry && !entry.dataDriven) return NO_EFFECTS;
      // procedure.define runs nothing now: the body runs when the new procedure starts
      if (node.key === "procedure.define" && entry?.dataDriven) return NO_EFFECTS;
    }
    if (entry && !entry.dataDriven) return NO_EFFECTS;
    if (entry) {
      const body = bodyEffects(node.path);
      if (body) return body;
    }
    return UNKNOWN_EFFECTS;
  };

  const infer = (node: IRNode): EffectSummary => {
    let summary: EffectSummary;
    switch (node.kind) {
      case "literal":
      case "reference":
      case "fail":
        summary = NO_EFFECTS;
        break;
      case "object":
        summary = sequence(...node.entries.map((entry) => infer(entry.value)));
        break;
      case "array":
        summary = sequence(...node.items.map(infer));
        break;
      case "deferred":
        summary = infer(node.input);
        break;
      case "call":
      case "dynamic": {
        const entry = facts.entry(node.path);
        const runs = inner(node, entry);
        if (runs !== NO_EFFECTS) nested.set(node, runs);
        summary = sequence(infer(node.input), declaredEffects(entry), runs);
        if (isUnknown(declaredEffects(entry)) || isUnknown(runs)) unknownAt.push(node.pointer);
        break;
      }
      case "chain":
        summary = sequence(declaredEffects(facts.entry(node.path)), ...(node.initialInput ? [infer(node.initialInput)] : []), ...node.steps.map((step) => infer(step.node)));
        break;
      case "parallel":
        summary = sequence(declaredEffects(facts.entry(node.path)), ...node.tasks.map(infer));
        break;
      case "conditional": {
        const thenEffects = node.then ? infer(node.then) : NO_EFFECTS;
        const elseEffects = node.else ? infer(node.else) : NO_EFFECTS;
        summary = sequence(declaredEffects(facts.entry(node.path)), infer(node.condition), either(thenEffects, elseEffects));
        break;
      }
      case "try":
        summary = sequence(declaredEffects(facts.entry(node.path)), infer(node.try), optional(infer(node.catch)));
        break;
      case "and":
      case "or": {
        const [first, ...rest] = node.values.map(infer);
        summary = sequence(declaredEffects(facts.entry(node.path)), ...(first ? [first] : []), ...rest.map(optional));
        break;
      }
      case "map": {
        const { summary: itemEffects, nonEmpty } = items(node.items);
        const fn = node.fn ? infer(node.fn) : NO_EFFECTS;
        summary = sequence(declaredEffects(facts.entry(node.path)), itemEffects, nonEmpty ? fn : optional(fn));
        break;
      }
      case "reduce": {
        const itemPart = node.items ? items(node.items) : { summary: NO_EFFECTS, nonEmpty: false };
        const fn = node.fn ? infer(node.fn) : NO_EFFECTS;
        summary = sequence(declaredEffects(facts.entry(node.path)), itemPart.summary, infer(node.initial), itemPart.nonEmpty ? fn : optional(fn));
        break;
      }
    }
    byNode.set(node, summary);
    return summary;
  };

  const program = infer(root);
  return { program, byNode, nested, unknownAt };
}
