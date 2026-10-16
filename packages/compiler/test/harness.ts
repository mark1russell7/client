/**
 * The test harness: a registry with the core procedures and deterministic test procedures, a
 * client, and functions that run a program three ways (the interpreter, the closure code and the
 * source text) and give the result and the ordered trace of the calls.
 */

import {
  Client,
  ProcedureRegistry,
  PURE_EFFECTS,
  allCoreProcedures,
  anySchema,
  defineProcedure,
  metaProcedures,
  describeRegistry,
  effectsOf,
  type AnyProcedure,
  type Effects,
  type Interceptor,
  type ProcedureContext,
  type ProcedureManifest,
  type Transport,
} from "@procedures/client/browser";
import { compileProgram, type CompileOptions, type CompileResult } from "../src/program.js";
import { registryFacts, type ProcedureFacts } from "../src/facts.js";
import * as runtime from "../src/runtime.js";
import type { CompiledProgram, ProgramContext } from "../src/runtime.js";

/** The outcome of a run: a value or an error message. */
export type Outcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

/** The outcome and the calls of one run. */
export interface RunRecord {
  readonly outcome: Outcome;
  readonly trace: readonly string[];
}

/** One invocation that the interceptor of the harness saw. */
export interface Invoked {
  readonly key: string;
  readonly effects: Effects | undefined;
  readonly failed: boolean;
}

export const stubTransport = { name: "stub", send: async function* () {}, close: async () => {} } as unknown as Transport;

export const WRITE_EFFECTS: Effects = { reads: [], writes: ["store"], destructive: true, idempotent: false };
export const READ_EFFECTS: Effects = { reads: ["store"], writes: [] };

/** A stable text of a value for the trace: the keys in order, and undefined as a word. */
export function stable(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? String(value);
  if (Array.isArray(value)) return `[${Array.from(value, stable).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

/** The registry, the client and the records of the test procedures. */
export interface Harness {
  readonly registry: ProcedureRegistry;
  readonly client: Client;
  readonly trace: string[];
  readonly store: Map<string, unknown>;
  /** Each invocation of the last run, also the control flow and the nested calls. */
  readonly invoked: Invoked[];
  manifest(): ProcedureManifest;
  /** The facts of the registry: the harness makes them one time. */
  facts(): ProcedureFacts;
  /** The program runs with the interpreter: `client.exec(program)`. */
  interpret(program: unknown, input?: unknown): Promise<RunRecord>;
  /** The program runs as a compiled function, as the handler of a procedure. */
  runCompiled(run: CompiledProgram, input?: unknown): Promise<RunRecord>;
  /** The source text runs: its body with the runtime of this package. */
  runText(body: string, input?: unknown): Promise<RunRecord>;
  /** The program, compiled against this registry. */
  compile(program: unknown, options?: Omit<CompileOptions, "registry" | "facts">): Promise<CompileResult>;
}

function testProcedure(path: string[], effects: Effects, handler: (input: Record<string, unknown>) => unknown): AnyProcedure {
  return defineProcedure({
    path,
    input: anySchema,
    output: anySchema,
    metadata: { description: `The test procedure ${path.join(".")}`, effects },
    handler: async (input: Record<string, unknown> | undefined) => handler(input ?? {}),
  }) as AnyProcedure;
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (
  rt: unknown,
  ctx: ProgramContext,
  input: unknown,
) => Promise<unknown>;

/** This function makes a new harness. */
export function makeHarness(extra: readonly AnyProcedure[] = []): Harness {
  const trace: string[] = [];
  const store = new Map<string, unknown>();
  const invoked: Invoked[] = [];
  const registry = new ProcedureRegistry();
  for (const procedure of allCoreProcedures) registry.register(procedure);
  for (const procedure of metaProcedures) registry.register(procedure);
  const record = (name: string, input: unknown): void => {
    trace.push(`${name} ${stable(input)}`);
  };
  const procedures: AnyProcedure[] = [
    testProcedure(["t", "num"], PURE_EFFECTS, (input) => {
      record("t.num", input);
      return input["value"];
    }),
    testProcedure(["t", "add"], PURE_EFFECTS, (input) => {
      record("t.add", input);
      const a = input["a"];
      const b = input["b"];
      return typeof a === "number" && typeof b === "number" ? a + b : 0;
    }),
    testProcedure(["t", "echo"], PURE_EFFECTS, (input) => {
      record("t.echo", input);
      return input;
    }),
    testProcedure(["t", "truth"], PURE_EFFECTS, (input) => {
      record("t.truth", input);
      return { value: input["value"] };
    }),
    testProcedure(["t", "fail"], PURE_EFFECTS, (input) => {
      record("t.fail", input);
      throw new Error(`failed: ${String(input["message"])}`);
    }),
    testProcedure(["t", "write"], WRITE_EFFECTS, (input) => {
      record("t.write", input);
      store.set(String(input["key"]), input["value"]);
      return { written: String(input["key"]) };
    }),
    testProcedure(["t", "read"], READ_EFFECTS, (input) => {
      record("t.read", input);
      return store.get(String(input["key"])) ?? null;
    }),
    ...extra,
  ];
  for (const procedure of procedures) registry.register(procedure);

  let current: CompiledProgram | undefined;
  let currentInput: unknown;
  registry.register(
    defineProcedure({
      path: ["test", "compiled"],
      input: anySchema,
      output: anySchema,
      metadata: { description: "Runs the compiled program of the test", effects: PURE_EFFECTS, tags: ["harness"] },
      handler: async (_input: unknown, ctx: ProcedureContext) => current!(ctx, currentInput),
    }) as AnyProcedure,
  );

  const observe: Interceptor = async (invocation, next) => {
    const key = invocation.path.join(".");
    try {
      const output = await next();
      if (key !== "test.compiled") invoked.push({ key, effects: effectsOf(invocation.procedure), failed: false });
      return output;
    } catch (error) {
      if (key !== "test.compiled") invoked.push({ key, effects: effectsOf(invocation.procedure), failed: true });
      throw error;
    }
  };
  const client = new Client({ transport: stubTransport, interceptors: [observe] }).useRegistry(registry);

  const capture = async (start: () => Promise<unknown>): Promise<RunRecord> => {
    trace.length = 0;
    invoked.length = 0;
    store.clear();
    let outcome: Outcome;
    try {
      outcome = { ok: true, value: await start() };
    } catch (error) {
      outcome = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    return { outcome, trace: [...trace] };
  };

  let facts: ProcedureFacts | undefined;
  const harness: Harness = {
    registry,
    client,
    trace,
    store,
    invoked,
    manifest: () => describeRegistry(registry),
    facts: () => (facts ??= registryFacts(registry)),
    interpret: (program, input) => capture(() => (input === undefined ? client.exec(program as never) : client.exec(program as never, input))),
    runCompiled: (run, input) =>
      capture(() => {
        current = run;
        currentInput = input;
        return client.exec(["test", "compiled"], {});
      }),
    runText: (body, input) => {
      const fn = new AsyncFunction("rt", "ctx", "input", body);
      return harness.runCompiled((ctx, value) => fn(runtime, ctx, value), input);
    },
    compile: (program, options = {}) => compileProgram(program, { facts: harness.facts(), ...options }),
  };
  return harness;
}
