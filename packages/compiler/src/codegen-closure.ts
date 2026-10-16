/**
 * The closure code: the IR to a JavaScript function made of closures. A host runs it without
 * `eval` and without `new Function`.
 *
 * The function does the steps of the interpreter in the same order. Each call goes through
 * `ctx.client.call`, so it keeps its admission, validation, deadline and interceptors. The
 * control-flow procedures do not start: the function does their work in line. A dynamic node
 * calls its procedure with the raw input, and the interpreter of the client runs it.
 */

import type { IRNode, ItemsSpec, ProgramIR, ScopeSnapshot } from "./ir.js";
import {
  call,
  callRaw,
  deferred,
  execWithInput,
  fail,
  get,
  items as itemsOf,
  merge,
  message,
  object,
  parallel,
  truthy,
  unknownName,
  type CompiledProgram,
  type ProgramContext,
  type RuntimeFrame,
} from "./runtime.js";

/** The state of one run: the context and the value of each binding. */
interface State {
  readonly ctx: ProgramContext;
  readonly vars: unknown[];
}

type Run = (state: State) => Promise<unknown>;

/** The options of the closure code. */
export interface ClosureOptions {
  /** The keys of the procedures that take raw input, for `client.exec(program, input)`. */
  readonly rawKeys: readonly string[];
}

/** This function makes the closure code of a program. */
export function compileClosure(ir: ProgramIR, options: ClosureOptions): CompiledProgram {
  const root = compile(ir.root);
  const { mode, program, input: inputBinding, bindingCount } = ir;
  const rawKeys = [...options.rawKeys];
  return async (ctx: ProgramContext, input?: unknown): Promise<unknown> => {
    if (mode === "exec" && input !== undefined) return execWithInput(ctx, program, input, rawKeys);
    const state: State = { ctx, vars: new Array<unknown>(bindingCount) };
    if (inputBinding) state.vars[inputBinding.id] = input;
    return root(state);
  };
}

/** The frames of a scope with the values of a run, for `withScope()`. */
function framesOf(snapshot: ScopeSnapshot, vars: readonly unknown[]): RuntimeFrame[] | undefined {
  if (!snapshot) return undefined;
  return snapshot.map((frame) => ({
    names: frame.names.map(([name, binding]): readonly [string, unknown] => [name, vars[binding.id]]),
    ...(frame.last ? { last: [vars[frame.last.id]] as const } : {}),
  }));
}

function compileItems(spec: ItemsSpec): (state: State) => Promise<unknown[]> {
  if (spec.kind === "list") {
    const runs = spec.items.map(compile);
    return async (state) => {
      const values: unknown[] = [];
      for (const run of runs) values.push(await run(state));
      return values;
    };
  }
  const run = compile(spec.value);
  return async (state) => itemsOf(await run(state));
}

function compile(node: IRNode): Run {
  switch (node.kind) {
    case "literal": {
      const value = node.value;
      return async () => value;
    }
    case "object": {
      const parts = node.entries.map((entry) => [entry.key, compile(entry.value)] as const);
      return async (state) => {
        const entries: Array<readonly [string, unknown]> = [];
        for (const [key, run] of parts) entries.push([key, await run(state)]);
        return object(entries);
      };
    }
    case "array": {
      const runs = node.items.map(compile);
      return async (state) => {
        const values: unknown[] = [];
        for (const run of runs) values.push(await run(state));
        return values;
      };
    }
    case "reference": {
      const { binding, fields, text, deferred: isDeferred, source } = node;
      if (binding) {
        const id = binding.id;
        return fields.length === 0 ? async (state) => state.vars[id] : async (state) => get(state.vars[id], fields);
      }
      if (isDeferred) return async () => source;
      return async () => unknownName(text);
    }
    case "call": {
      const input = compile(node.input);
      const { path, extra } = node;
      return async (state) => call(state.ctx, path, merge(await input(state), extra));
    }
    case "deferred": {
      const input = compile(node.input);
      const source = node.source;
      return async (state) => deferred(source, await input(state));
    }
    case "dynamic": {
      const input = compile(node.input);
      const { path, extra, scope } = node;
      return async (state) => callRaw(state.ctx, path, merge(await input(state), extra), framesOf(scope, state.vars));
    }
    case "fail": {
      const text = node.message;
      return async () => fail(text);
    }
    case "chain": {
      const initial = node.initialInput ? compile(node.initialInput) : undefined;
      const initialId = node.initial?.id;
      const steps = node.steps.map((step) => [step.result.id, compile(step.node)] as const);
      return async (state) => {
        if (initial && initialId !== undefined) state.vars[initialId] = await initial(state);
        const results: unknown[] = [];
        for (const [id, run] of steps) {
          const result = await run(state);
          state.vars[id] = result;
          results.push(result);
        }
        return { results, final: results[results.length - 1] };
      };
    }
    case "parallel": {
      const tasks = node.tasks.map(compile);
      const { concurrency, failFast } = node;
      return async (state) => parallel(tasks.map((task) => () => task(state)), concurrency, failFast);
    }
    case "conditional": {
      const condition = compile(node.condition);
      const thenRun = node.then ? compile(node.then) : undefined;
      const elseRun = node.else ? compile(node.else) : undefined;
      return async (state) => {
        const branch = truthy(await condition(state)) ? thenRun : elseRun;
        return branch ? branch(state) : undefined;
      };
    }
    case "try": {
      const tried = compile(node.try);
      const caught = compile(node.catch);
      const errorId = node.error.id;
      return async (state) => {
        try {
          const value = await tried(state);
          return { success: true, value };
        } catch (error) {
          const text = message(error);
          state.vars[errorId] = text;
          const value = await caught(state);
          return { success: false, value, error: text };
        }
      };
    }
    case "and":
    case "or": {
      const values = node.values.map(compile);
      const stop = node.kind === "and" ? (value: unknown) => !value : (value: unknown) => Boolean(value);
      return async (state) => {
        let last: unknown = undefined;
        for (const run of values) {
          last = await run(state);
          if (stop(last)) return last;
        }
        return last;
      };
    }
    case "map": {
      const list = compileItems(node.items);
      const fn = node.fn ? compile(node.fn) : undefined;
      const itemId = node.item.id;
      const indexId = node.index.id;
      return async (state) => {
        const values = await list(state);
        if (!fn) return { results: values };
        const results: unknown[] = [];
        for (const [index, item] of values.entries()) {
          state.vars[itemId] = item;
          state.vars[indexId] = index;
          results.push(await fn(state));
        }
        return { results };
      };
    }
    case "reduce": {
      const initial = compile(node.initial);
      if (!node.fn || !node.items) return initial;
      const list = compileItems(node.items);
      const fn = compile(node.fn);
      const { acc: accBinding, item: itemBinding, index: indexBinding } = node;
      return async (state) => {
        const values = await list(state);
        let acc = await initial(state);
        for (const [index, item] of values.entries()) {
          state.vars[accBinding.id] = acc;
          state.vars[itemBinding.id] = item;
          state.vars[indexBinding.id] = index;
          acc = await fn(state);
        }
        return acc;
      };
    }
  }
}
