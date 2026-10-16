/**
 * The fold pass (optional): a pure core call with a literal input becomes its value.
 *
 * The pass folds a call only when all of these conditions are true:
 *
 * - The manifest entry is the description of a core procedure of `@procedures/client`. Thus the
 *   host has the same code.
 * - Its effects are `reads: []` and `writes: []`.
 * - It does not take raw input, and it is not data-driven.
 * - Its value is a primitive.
 *
 * The pass starts the procedure here with `invokeProcedure()`, so the validation and the output
 * schema apply. A call that fails stays a call: the run gives its error.
 *
 * A folded call does not start at run time: an interceptor, a trace and the admission do not see
 * it. A host that needs each call in its trace does not fold.
 */

import { invokeProcedure, isReadOnly, outputValue, effectsOf } from "@procedures/client/browser";
import type { ChainStep, IRNode, ItemsSpec, LiteralNode } from "./ir.js";
import type { ProcedureFacts } from "./facts.js";
import { mergeExtra } from "./normalize.js";

/** The value of a node when it is fully known before the run. */
function staticValue(node: IRNode): { known: true; value: unknown } | { known: false } {
  switch (node.kind) {
    case "literal":
      return { known: true, value: node.value };
    case "object": {
      const entries: Array<[string, unknown]> = [];
      for (const entry of node.entries) {
        const value = staticValue(entry.value);
        if (!value.known) return value;
        entries.push([entry.key, value.value]);
      }
      return { known: true, value: Object.fromEntries(entries) };
    }
    case "array": {
      const values: unknown[] = [];
      for (const item of node.items) {
        const value = staticValue(item);
        if (!value.known) return value;
        values.push(value.value);
      }
      return { known: true, value: values };
    }
    default:
      return { known: false };
  }
}

function isPrimitive(value: unknown): boolean {
  return value === null || (typeof value !== "object" && typeof value !== "function" && typeof value !== "symbol");
}

/** The result of the pass: the new tree and the pointers of the folded calls. */
export interface FoldResult {
  readonly root: IRNode;
  readonly folded: readonly string[];
}

/** This function folds the pure core calls with literal inputs. */
export async function foldProgram(root: IRNode, facts: ProcedureFacts): Promise<FoldResult> {
  const folded: string[] = [];

  const items = async (spec: ItemsSpec): Promise<ItemsSpec> =>
    spec.kind === "list" ? { kind: "list", items: await Promise.all(spec.items.map(fold)) } : { kind: "value", value: await fold(spec.value) };

  const tryFold = async (node: Extract<IRNode, { kind: "call" }>): Promise<IRNode> => {
    const input = staticValue(node.input);
    if (!input.known) return node;
    const entry = facts.entry(node.path);
    const procedure = facts.core(node.path);
    if (!entry || !procedure || entry.dataDriven || facts.rawInput(node.path)) return node;
    const effects = effectsOf(procedure);
    if (!isReadOnly(effects) || (effects?.reads ?? ["unknown"]).length > 0) return node;
    try {
      const value = await outputValue(await invokeProcedure(procedure, mergeExtra(input.value, node.extra)), node.path);
      if (!isPrimitive(value)) return node;
      folded.push(node.pointer);
      const literal: LiteralNode = { kind: "literal", value, origin: "fold", pointer: node.pointer };
      return literal;
    } catch {
      return node;
    }
  };

  const fold = async (node: IRNode): Promise<IRNode> => {
    switch (node.kind) {
      case "literal":
      case "reference":
      case "fail":
        return node;
      case "object":
        return { ...node, entries: await Promise.all(node.entries.map(async (entry) => ({ key: entry.key, value: await fold(entry.value) }))) };
      case "array":
        return { ...node, items: await Promise.all(node.items.map(fold)) };
      case "call":
        return tryFold({ ...node, input: await fold(node.input) });
      case "deferred":
        return { ...node, input: await fold(node.input) };
      case "dynamic":
        return node;
      case "chain": {
        const steps: ChainStep[] = [];
        for (const step of node.steps) steps.push({ ...step, node: await fold(step.node) });
        return { ...node, steps, initialInput: node.initialInput ? await fold(node.initialInput) : undefined };
      }
      case "parallel":
        return { ...node, tasks: await Promise.all(node.tasks.map(fold)) };
      case "conditional":
        return {
          ...node,
          condition: await fold(node.condition),
          then: node.then ? await fold(node.then) : undefined,
          else: node.else ? await fold(node.else) : undefined,
        };
      case "try":
        return { ...node, try: await fold(node.try), catch: await fold(node.catch) };
      case "and":
      case "or":
        return { ...node, values: await Promise.all(node.values.map(fold)) };
      case "map":
        return { ...node, items: await items(node.items), fn: node.fn ? await fold(node.fn) : undefined };
      case "reduce":
        return {
          ...node,
          items: node.items ? await items(node.items) : undefined,
          initial: await fold(node.initial),
          fn: node.fn ? await fold(node.fn) : undefined,
        };
    }
  };

  return { root: await fold(root), folded };
}
