/**
 * The runtime of a compiled program: the small functions that the generated code calls.
 *
 * Each function does one step of the interpreter of `@procedures/client` with the same result and
 * the same error message. The closure code and the source text use the same functions, so the
 * two forms of a program operate the same. The entry `@procedures/compiler/runtime` exports them
 * for the source text. Importing this module registers nothing.
 */

import {
  createRefScope,
  isAnyProcedureRef,
  isControlFlowPath,
  isPlainObject,
  normalizeRef,
  pathToKey,
  prepareRootCall,
  rawInputRule,
  withScope,
  type AnyProcedureRef,
  type HydrationEvent,
  type ProcedureContext,
  type ProcedurePath,
  type RefScope,
} from "@procedures/client/browser";

/**
 * The context that a compiled program needs: the context of a procedure handler gives it. Each
 * call goes through `client.call`, so it keeps its admission, validation, deadline and interceptors.
 */
export interface ProgramContext {
  readonly client: Pick<ProcedureContext["client"], "call">;
  /** The registry of the caller: the raw-input rule of a fallback to the interpreter reads it. */
  readonly registry?: ProcedureContext["registry"] | undefined;
  /** The hydration observer of the program: a fallback to the interpreter gives it its events. */
  readonly onRef?: ((event: HydrationEvent) => void) | undefined;
}

/** A compiled program: `(ctx, input) => output`. */
export type CompiledProgram = (ctx: ProgramContext, input?: unknown) => Promise<unknown>;

/** One frame of a scope for a raw input: the names with their values, and `$last` when the frame has it. */
export interface RuntimeFrame {
  readonly names: ReadonlyArray<readonly [string, unknown]>;
  readonly last?: readonly [unknown] | undefined;
}

/** `getPath()` of the client: the own fields of a value, or undefined. */
export function get(value: unknown, fields: readonly string[]): unknown {
  let current = value;
  for (const field of fields) {
    if (current && typeof current === "object" && Object.hasOwn(current, field)) {
      current = (current as Record<string, unknown>)[field];
    } else {
      return undefined;
    }
  }
  return current;
}

/** The error of the interpreter for a `$ref` name that no scope has. */
export function unknownName(text: string): never {
  const name = text.split(".")[0];
  throw new Error(
    `Unknown $ref name "${name}" in "${text}": no step, item or input has this name here. ` +
      `For a literal $ref object, write { "$literal": { "$ref": ... } }.`,
  );
}

/** This function throws an error with the message of the interpreter. */
export function fail(message: string): never {
  throw new Error(message);
}

/** The input of an operand call with the parent context (`cwd`, `node`): `callOperand()` of the client. */
export function merge(input: unknown, extra: Readonly<Record<string, unknown>>): unknown {
  if (Object.keys(extra).length === 0) return input;
  return { ...(typeof input === "object" && input !== null && !Array.isArray(input) ? input : {}), ...extra };
}

/** The truth of a condition of `client.conditional`: the `value` field of an object decides. */
export function truthy(condition: unknown): boolean {
  if (condition && typeof condition === "object" && "value" in condition) return Boolean((condition as { value: unknown }).value);
  return Boolean(condition);
}

/** The items of `client.map` and `client.reduce`: an array, or the error of the interpreter. */
export function items(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error(`items must be an array, got ${value === null ? "null" : typeof value}`);
  return value;
}

/** The message of an error, as the control-flow procedures read it. */
export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** An object from its entries: each key is an own property, also `__proto__`. */
export function object(entries: ReadonlyArray<readonly [string, unknown]>): Record<string, unknown> {
  return Object.fromEntries(entries);
}

/** A call that waits for its runner: the call object with its hydrated input (`hydrateRef()`). */
export function deferred(source: Record<string, unknown>, input: unknown): unknown {
  return input === source["input"] ? source : { ...source, input };
}

/** The scope of the interpreter for a raw input: the frames from the outermost to the innermost. */
export function scope(frames: readonly RuntimeFrame[]): RefScope | undefined {
  let current: RefScope | undefined;
  for (const frame of frames) {
    const next = createRefScope(current);
    for (const [name, value] of frame.names) next.outputs.set(name, value);
    if (frame.last) next.last = frame.last[0];
    current = next;
  }
  return current;
}

/** A call through the client. */
export function call(ctx: ProgramContext, path: ProcedurePath, input: unknown): Promise<unknown> {
  return ctx.client.call(path, input);
}

/** A call of a procedure that takes its input raw: it gets the scope of the caller (`withScope()`). */
export function callRaw(ctx: ProgramContext, path: ProcedurePath, input: unknown, frames: readonly RuntimeFrame[] | undefined): Promise<unknown> {
  return ctx.client.call(path, withScope(input, frames ? scope(frames) : undefined));
}

/** The result of `client.parallel`. */
export interface ParallelResult {
  results: unknown[];
  allSucceeded: boolean;
  errors: Array<{ index: number; error: string }>;
}

/** `client.parallel`: workers take the tasks in order, with `concurrency` and `failFast`. */
export async function parallel(tasks: ReadonlyArray<() => Promise<unknown>>, concurrency: number | undefined, failFast: boolean): Promise<ParallelResult> {
  const results: unknown[] = new Array(tasks.length);
  const errors: Array<{ index: number; error: string }> = [];
  const limit = typeof concurrency === "number" && concurrency > 0 ? Math.min(concurrency, tasks.length) : tasks.length;
  let nextIndex = 0;
  let aborted = false;
  const worker = async (): Promise<void> => {
    while (!aborted) {
      const index = nextIndex++;
      if (index >= tasks.length) return;
      try {
        results[index] = await tasks[index]!();
      } catch (error) {
        if (failFast) {
          aborted = true;
          throw error;
        }
        errors.push({ index, error: message(error) });
        results[index] = undefined;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, limit) }, () => worker()));
  errors.sort((a, b) => a.index - b.index);
  return { results, allSucceeded: errors.length === 0, errors };
}

/** The raw-input rule of a fallback: the registry of the caller, or the rule of the compile time. */
function rawRule(ctx: ProgramContext, rawKeys: readonly string[]): (path: ProcedurePath) => boolean {
  if (ctx.registry) return rawInputRule(ctx.registry);
  const keys = new Set(rawKeys);
  return (path) => keys.has(pathToKey(path)) || isControlFlowPath(path);
}

/**
 * `client.exec(program, input)`: the fields of the input go over the fields of the input of the
 * root call. The program changes, so the interpreter runs it.
 */
export async function execWithInput(ctx: ProgramContext, program: unknown, input: unknown, rawKeys: readonly string[]): Promise<unknown> {
  let ref: AnyProcedureRef;
  if (isAnyProcedureRef(program)) {
    const normalized = normalizeRef(program);
    ref = { ...normalized, input: isPlainObject(normalized.input) && isPlainObject(input) ? { ...normalized.input, ...input } : input };
  } else {
    // client.exec(path, input)
    ref = { $proc: program as ProcedurePath, input: input ?? {} };
  }
  const executor = <TIn, TOut>(path: ProcedurePath, value: TIn): Promise<TOut> => ctx.client.call<TIn, TOut>(path, value);
  const root = await prepareRootCall(ref, executor, { rawInput: rawRule(ctx, rawKeys), onRef: ctx.onRef });
  return ctx.client.call(root.path, root.input);
}
