/**
 * The scopes pass: each `$ref` gets the binding that the interpreter reads.
 *
 * The pass follows `lookupOutputRef()` of the client. The innermost frame with the name gives the
 * value. `$last` is the last result of the innermost frame that has one. A chain frame gets a
 * name after its step: a step reads only the names of the steps before it. A name that no frame
 * has is an error (`Unknown $ref name`). In the input of a deferred call, the runner can give the
 * name later, so there the name stays.
 */

import { isPlainObject } from "@procedures/client/browser";
import { isOutputRef } from "./refs.js";
import { childPointer, type Binding, type IRNode, type ItemsSpec, type Pointer, type ProgramIR, type ReferenceNode, type ScopeFrame, type ScopeSnapshot } from "./ir.js";
import type { Diagnostic } from "./diagnostics.js";

/** A frame while the pass walks: the names grow as the steps of a chain pass. */
interface Frame {
  readonly names: Map<string, Binding>;
  last: Binding | undefined;
  /** The names of this step and the later steps of a chain, to find a use before the definition. */
  later: ReadonlySet<string>;
}

type Env = readonly Frame[] | undefined;

/** This function resolves the references of the IR and gives the diagnostics of the names. */
export function resolveScopes(ir: ProgramIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const root: Env = ir.input ? [frameOf([["input", ir.input]])] : undefined;
  visit(ir.root, root, diagnostics);
  return diagnostics;
}

function frameOf(names: ReadonlyArray<readonly [string, Binding]>): Frame {
  return { names: new Map(names), last: undefined, later: new Set() };
}

/** The static scope at a point: a copy of the frames, as `withScope()` gives them to a raw input. */
export function snapshot(env: Env): ScopeSnapshot {
  if (!env) return undefined;
  return env.map((frame): ScopeFrame => ({ names: [...frame.names.entries()], last: frame.last }));
}

/** `lookupOutputRef()`: the binding of a name, or undefined. */
function lookup(env: Env, name: string): Binding | undefined {
  if (!env) return undefined;
  for (let index = env.length - 1; index >= 0; index--) {
    const frame = env[index]!;
    if (name === "$last") {
      if (frame.last) return frame.last;
    } else {
      const binding = frame.names.get(name);
      if (binding) return binding;
    }
  }
  return undefined;
}

function resolve(node: ReferenceNode, env: Env, diagnostics: Diagnostic[]): void {
  if (node.synthetic) return;
  node.binding = lookup(env, node.name);
  if (node.binding) return;
  if (node.deferred) {
    diagnostics.push({
      severity: "info",
      code: "unknown-name",
      message: `No scope has the name "${node.name}" here. In the input of a deferred call, the $ref stays data for the runner.`,
      pointer: node.pointer,
    });
    return;
  }
  const later = env?.some((frame) => frame.later.has(node.name)) ?? false;
  const names = [...new Set((env ?? []).flatMap((frame) => [...frame.names.keys(), ...(frame.last ? ["$last"] : [])]))];
  const known = names.length > 0 ? ` The names here: ${names.join(", ")}.` : " No name is in the scope here.";
  diagnostics.push(
    later
      ? {
          severity: "error",
          code: "use-before-definition",
          message: `The $ref "${node.text}" reads "${node.name}" before the step that makes it: a step reads only the names of the steps before it.`,
          pointer: node.pointer,
        }
      : {
          severity: "error",
          code: "unknown-name",
          message: `Unknown $ref name "${node.name}" in "${node.text}".${known}${node.name === "$last" ? " The first step of a chain has no $last." : ""}`,
          pointer: node.pointer,
        },
  );
}

function visitItems(items: ItemsSpec, env: Env, diagnostics: Diagnostic[]): void {
  if (items.kind === "list") for (const item of items.items) visit(item, env, diagnostics);
  else visit(items.value, env, diagnostics);
}

function visit(node: IRNode, env: Env, diagnostics: Diagnostic[]): void {
  switch (node.kind) {
    case "literal":
    case "fail":
      return;
    case "reference":
      resolve(node, env, diagnostics);
      return;
    case "object":
      for (const entry of node.entries) visit(entry.value, env, diagnostics);
      return;
    case "array":
      for (const item of node.items) visit(item, env, diagnostics);
      return;
    case "call":
    case "deferred":
      visit(node.input, env, diagnostics);
      return;
    case "dynamic":
      node.scope = snapshot(env);
      visit(node.input, env, diagnostics);
      if (node.model) visit(node.model, env, diagnostics);
      // The body of procedure.define has its own scope (`input`): the program checks it as a body
      else if (node.reason === "runs-refs" && node.key !== "procedure.define") scanRaw(node.input, env, diagnostics);
      return;
    case "chain": {
      const names = node.steps.map((step) => step.result.name);
      const frame: Frame = { names: new Map(), last: undefined, later: new Set() };
      const inner: Env = [...(env ?? []), frame];
      if (node.initialInput) visit(node.initialInput, inner, diagnostics);
      node.steps.forEach((step, index) => {
        frame.later = new Set(names.slice(index).filter((name): name is string => name !== undefined));
        visit(step.node, inner, diagnostics);
        if (step.result.name !== undefined) frame.names.set(step.result.name, step.result);
        frame.last = step.result;
      });
      frame.later = new Set();
      return;
    }
    case "parallel":
      for (const task of node.tasks) visit(task, env, diagnostics);
      return;
    case "conditional":
      visit(node.condition, env, diagnostics);
      if (node.then) visit(node.then, env, diagnostics);
      if (node.else) visit(node.else, env, diagnostics);
      return;
    case "try":
      visit(node.try, env, diagnostics);
      visit(node.catch, [...(env ?? []), frameOf([["error", node.error]])], diagnostics);
      return;
    case "and":
    case "or":
      for (const value of node.values) visit(value, env, diagnostics);
      return;
    case "map": {
      visitItems(node.items, env, diagnostics);
      // scopeWith({ [as]: item, index }): with `as: "index"`, the index replaces the item
      if (node.fn) visit(node.fn, [...(env ?? []), frameOf([[node.item.name!, node.item], ["index", node.index]])], diagnostics);
      return;
    }
    case "reduce": {
      if (node.items) visitItems(node.items, env, diagnostics);
      visit(node.initial, env, diagnostics);
      if (node.fn) {
        visit(node.fn, [...(env ?? []), frameOf([["acc", node.acc], ["item", node.item], ["index", node.index]])], diagnostics);
      }
      return;
    }
  }
}

/**
 * This function examines the raw input of a procedure that runs refs (`dag.traverse`, `core.catch`).
 * Its `$ref` values read the scope of the caller, or a name that the runner gives. An unknown
 * name is a warning.
 */
function scanRaw(node: IRNode, env: Env, diagnostics: Diagnostic[]): void {
  if (node.kind !== "literal") return;
  const seen = new Set<object>();
  const walk = (value: unknown, pointer: Pointer): void => {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (isOutputRef(value)) {
      const name = value.$ref.split(".")[0] ?? "";
      if (env && !lookup(env, name)) {
        diagnostics.push({
          severity: "warning",
          code: "unknown-name",
          message: `No scope has the name "${name}" here. The procedure that runs this input can give the name, or the $ref fails.`,
          pointer,
        });
      }
      return;
    }
    if (Array.isArray(value)) value.forEach((item, index) => walk(item, childPointer(pointer, index)));
    else if (isPlainObject(value)) for (const [key, item] of Object.entries(value)) walk(item, childPointer(pointer, key));
  };
  walk(node.value, node.pointer);
}
