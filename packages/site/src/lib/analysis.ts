/**
 * A static analysis of a program, for the hints of the Composer. It follows the rules of the
 * core (`hydrateInput` and the control-flow procedures of `@mark1russell7/client`):
 *
 * - A list of only calls runs as an implicit chain where the core hydrates a value with a
 *   fresh context: in the input of a call that runs directly (the root call, an operand of a
 *   control-flow procedure), in an operand that is not a call (a branch of `conditional`, a
 *   step of `chain`, a task of `parallel`), and in the items of `map` and `reduce`. In the input
 *   of a nested call, the same list stays a list of results.
 * - The input of a control-flow procedure stays raw. The procedure runs its operands itself:
 *   an operand that is a call runs, and another operand is hydrated as a program.
 * - A `$ref` reads a name that a scope gives: the `$name` of an earlier step of a chain and
 *   `$last`, the item and the index of `map`, and `acc`, `item` and `index` of `reduce`. The
 *   names of an outer scope are visible in a nested scope.
 * - Only the `$name` of a step of `client.chain` is readable by a `$ref`.
 *
 * `analysis.test.ts` runs each rule with the real runtime, so a change of the core shows.
 */

import { isOutputRef, isPlainObject, isProcRef, keyOf, locationKey, type Json, type Location, type ProcRef } from "./program";

const CONTROL_FLOW = new Set(["chain", "parallel", "conditional", "tryCatch", "and", "or", "map", "reduce"]);

/** The name of a core control-flow procedure ("chain"), or undefined. */
export function controlFlowName(ref: ProcRef): string | undefined {
  const [namespace, name, ...rest] = ref.$proc;
  return namespace === "client" && name !== undefined && rest.length === 0 && CONTROL_FLOW.has(name) ? name : undefined;
}

export interface RefUse {
  location: Location;
  name: string;
  /** The names that are in scope at the location. */
  scope: string[];
}

export interface Analysis {
  /** The keys (`locationKey`) of the lists that run as an implicit chain. */
  chains: Set<string>;
  /** The keys of the calls whose `$name` a later `$ref` can read: the steps of a chain. */
  namable: Set<string>;
  /** Each `$ref` and the names in scope at its location. */
  refs: RefUse[];
  /** The `$ref` uses whose name is not in scope. */
  unknownRefs: RefUse[];
  /** The keys of the calls whose procedure is not in the catalog. */
  unknownCalls: Array<{ location: Location; key: string }>;
  /** The names in scope at each `$ref`, by the key of its location. */
  scopeAt: Map<string, string[]>;
  /** A problem of the root: `client.exec()` runs only a call. */
  rootProblem: string | null;
}

interface Walker {
  analysis: Analysis;
  known: (key: string) => boolean;
}

function withNames(scope: string[], names: string[]): string[] {
  return names.length === 0 ? scope : [...new Set([...scope, ...names])];
}

/**
 * A value that the core hydrates. `fresh` is true where an array of only calls becomes an
 * implicit chain.
 */
function walkValue(w: Walker, value: Json | undefined, location: Location, fresh: boolean, scope: string[]): void {
  if (value === undefined || value === null || typeof value !== "object") return;
  if (isOutputRef(value)) {
    const use: RefUse = { location, name: value.$ref, scope };
    w.analysis.refs.push(use);
    w.analysis.scopeAt.set(locationKey(location), scope);
    if (!scope.includes(value.$ref)) w.analysis.unknownRefs.push(use);
    return;
  }
  if (isProcRef(value)) {
    // A nested call: hydration runs it, and its input does not make implicit chains
    walkCall(w, value, location, false, scope);
    return;
  }
  if (Array.isArray(value)) {
    if (fresh && value.length > 0 && value.every((item) => isProcRef(item))) {
      // The core runs the calls of an implicit chain as nested calls, before the chain starts
      w.analysis.chains.add(locationKey(location));
      value.forEach((item, index) => walkCall(w, item as ProcRef, [...location, index], false, scope));
      return;
    }
    value.forEach((item, index) => walkValue(w, item, [...location, index], fresh, scope));
    return;
  }
  for (const [key, item] of Object.entries(value)) walkValue(w, item, [...location, key], fresh, scope);
}

/**
 * An operand of a control-flow procedure: a call runs directly, and the core hydrates another
 * value as a program, so a list of calls in it is a chain.
 */
function walkOperand(w: Walker, value: Json | undefined, location: Location, scope: string[]): void {
  if (isProcRef(value)) walkCall(w, value, location, true, scope);
  else walkValue(w, value, location, true, scope);
}

/** A raw value: nothing runs, but the `$ref` values in it can be resolved. */
function walkRaw(w: Walker, value: Json | undefined, location: Location, scope: string[]): void {
  if (value === undefined || value === null || typeof value !== "object") return;
  if (isOutputRef(value)) {
    walkValue(w, value, location, false, scope);
    return;
  }
  if (isProcRef(value)) {
    if (!w.known(keyOf(value))) w.analysis.unknownCalls.push({ location, key: keyOf(value) });
    walkRaw(w, value.input, [...location, "input"], scope);
    return;
  }
  if (Array.isArray(value)) value.forEach((item, index) => walkRaw(w, item, [...location, index], scope));
  else for (const [key, item] of Object.entries(value)) walkRaw(w, item, [...location, key], scope);
}

/** A call that runs. `direct` is true for the root and the operands of control flow. */
function walkCall(w: Walker, ref: ProcRef, location: Location, direct: boolean, scope: string[]): void {
  if (!w.known(keyOf(ref))) w.analysis.unknownCalls.push({ location, key: keyOf(ref) });
  const inputLocation = [...location, "input"];
  const input = isPlainObject(ref.input) ? ref.input : undefined;
  const flow = controlFlowName(ref);
  if (!flow || !input) {
    walkValue(w, ref.input, inputLocation, direct, scope);
    return;
  }
  const at = (key: string): Location => [...inputLocation, key];
  const handled = new Set<string>();
  /** One operand: `condition`, `then`, `try`. A list of calls there is a chain. */
  const operand = (key: string): void => {
    handled.add(key);
    walkOperand(w, input[key], at(key), scope);
  };
  /** A list of operands: `tasks`, `values`. */
  const operands = (key: string): void => {
    handled.add(key);
    const value = input[key];
    if (Array.isArray(value)) value.forEach((item, index) => walkOperand(w, item, [...at(key), index], scope));
    else walkRaw(w, value, at(key), scope);
  };
  switch (flow) {
    case "chain": {
      handled.add("steps");
      const steps = input["steps"];
      if (Array.isArray(steps)) {
        let names: string[] = [];
        steps.forEach((step, index) => {
          const stepLocation = [...at("steps"), index];
          const stepScope = withNames(scope, index > 0 ? [...names, "$last"] : names);
          if (isProcRef(step)) {
            w.analysis.namable.add(locationKey(stepLocation));
            walkCall(w, step, stepLocation, true, stepScope);
            if (step.$name) names = [...names, step.$name];
          } else {
            walkValue(w, step, stepLocation, true, stepScope);
          }
        });
      } else {
        walkRaw(w, steps, at("steps"), scope);
      }
      break;
    }
    case "parallel":
      operands("tasks");
      break;
    case "conditional":
      operand("condition");
      operand("then");
      operand("else");
      break;
    case "tryCatch":
      operand("try");
      operand("catch");
      break;
    case "and":
    case "or":
      operands("values");
      break;
    case "map":
    case "reduce": {
      handled.add("items");
      const items = input["items"];
      // Each item runs with a fresh context, so an item that is a list of calls is a chain
      if (Array.isArray(items)) items.forEach((item, index) => walkValue(w, item, [...at("items"), index], true, scope));
      else walkValue(w, items, at("items"), true, scope);
      if (flow === "reduce") {
        handled.add("initial");
        walkValue(w, input["initial"], at("initial"), true, scope);
      }
      handled.add("fn");
      const names = flow === "map" ? [typeof input["as"] === "string" && input["as"] ? input["as"] : "item", "index"] : ["acc", "item", "index"];
      walkOperand(w, input["fn"], at("fn"), withNames(scope, names));
      break;
    }
  }
  for (const [key, value] of Object.entries(input)) {
    if (!handled.has(key)) walkRaw(w, value, at(key), scope);
  }
}

/** The analysis of a program. `known` tells if a procedure key is in the catalog. */
export function analyzeProgram(program: Json, known: (key: string) => boolean = () => true): Analysis {
  const analysis: Analysis = {
    chains: new Set(),
    namable: new Set(),
    refs: [],
    unknownRefs: [],
    unknownCalls: [],
    scopeAt: new Map(),
    rootProblem: null,
  };
  const w: Walker = { analysis, known };
  if (program === null) return analysis;
  if (isProcRef(program)) {
    walkCall(w, program, [], true, []);
  } else {
    analysis.rootProblem = "The program must be a call: client.exec() runs a call. Put a procedure at the root, or wrap the value in a call.";
    walkRaw(w, program, [], []);
  }
  return analysis;
}
