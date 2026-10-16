/**
 * The functions of the compiler: `checkProgram()` and `compileProgram()`.
 *
 * Both read the facts of the procedures from a manifest (a browser) or from a registry (a host).
 * They run the passes in order: normalize, scopes, effects and checks. `compileProgram()` then
 * folds the pure calls (optional) and writes the code: the closure code and the source text.
 */

import { pathToKey, type Capability, type Effects, type ProcedureManifest, type ProcedurePath } from "@procedures/client/browser";
import type { ProgramIR } from "./ir.js";
import { manifestFacts, registryFacts, withDefinitions, type ProcedureFacts, type RegistryLike } from "./facts.js";
import { findDefinitions, normalize } from "./normalize.js";
import { resolveScopes } from "./scopes.js";
import { inferEffects, toEffects, type EffectSummary } from "./effects.js";
import { checkCalls } from "./checks.js";
import { hasErrors, sortDiagnostics, type Diagnostic } from "./diagnostics.js";
import { foldProgram } from "./fold.js";
import { compileClosure } from "./codegen-closure.js";
import { emitText, type SourceMapLine } from "./codegen-text.js";
import type { CompiledProgram } from "./runtime.js";

/** The options of `checkProgram()`. Give a manifest, a registry or facts. */
export interface CheckOptions {
  /** The manifest of the host (`procedure.manifest`). A browser has only this. */
  readonly manifest?: ProcedureManifest | undefined;
  /** The registry of the host. It also gives the bodies of the defined procedures. */
  readonly registry?: RegistryLike | undefined;
  /** The facts of the procedures, when the caller made them already. */
  readonly facts?: ProcedureFacts | undefined;
  /** The expose rule of the host. The default exposes each procedure. */
  readonly expose?: ((path: ProcedurePath) => boolean) | undefined;
  /** The capability of the run. The check refuses each call that the capability refuses. */
  readonly capability?: Capability<unknown> | undefined;
  /** `exec` (the default): the program runs as `client.exec()` runs it. `body`: as the body of a defined procedure. */
  readonly mode?: "exec" | "body" | undefined;
}

/** The effects of each run in which no call fails. */
export interface MustEffects {
  readonly reads: string[];
  readonly writes: string[];
}

/** The result of `checkProgram()`. */
export interface CheckResult {
  /** True when no diagnostic is an error. A host starts the program only then. */
  readonly ok: boolean;
  /** The effects that a run can have (the upper bound). An absent `reads` or `writes`: not known. */
  readonly effects: Effects;
  /** The effects of each run in which no call fails (the lower bound). */
  readonly mustEffects: MustEffects;
  /** The problems, in the order of the program. */
  readonly diagnostics: Diagnostic[];
  /** The hash of the manifest that the check used. */
  readonly registryHash: string;
  /** The IR of the program. */
  readonly ir: ProgramIR;
}

/** The options of `compileProgram()`. */
export interface CompileOptions extends CheckOptions {
  /** True: compute the pure core calls with literal inputs at compile time (the fold pass). The default is false. */
  readonly fold?: boolean | undefined;
  /** The language of the source text: `js` (the default) or `ts`. */
  readonly language?: "js" | "ts" | undefined;
  /** The import specifier of the runtime in the source text. The default is `@procedures/compiler/runtime`. */
  readonly runtime?: string | undefined;
}

/** The result of `compileProgram()`. */
export interface CompileResult extends CheckResult {
  /** The closure code: a host runs it as `run(ctx, input)`. It uses no `eval`. */
  readonly run: CompiledProgram;
  /** The source text: an ES module whose default export is `async (ctx, input) => output`. */
  readonly code: string;
  /** The body of an async function with the parameters `rt`, `ctx` and `input` (JavaScript). */
  readonly body: string;
  /** The lines of `code` and the pointers of their parts of the program. */
  readonly sourceMap: SourceMapLine[];
  /** The pointers of the calls that the fold pass computed. */
  readonly folded: readonly string[];
}

function baseFacts(options: CheckOptions): ProcedureFacts {
  if (options.facts) return options.facts;
  if (options.registry) return registryFacts(options.registry, { expose: options.expose });
  if (options.manifest) return manifestFacts(options.manifest, { expose: options.expose });
  throw new Error("checkProgram: give a manifest, a registry or facts");
}

interface Analysis {
  readonly facts: ProcedureFacts;
  readonly ir: ProgramIR;
  readonly diagnostics: Diagnostic[];
  readonly program: EffectSummary;
}

function analyze(program: unknown, options: CheckOptions): Analysis {
  const definitions = findDefinitions(program);
  const facts = withDefinitions(baseFacts(options), definitions);
  const diagnostics: Diagnostic[] = [];

  // The effects of a defined body: a recursive definition gives unknown effects
  const bodies = new Map<string, EffectSummary | "pending">();
  const bodyEffects = (path: ProcedurePath): EffectSummary | undefined => {
    const key = pathToKey(path);
    const cached = bodies.get(key);
    if (cached === "pending") return undefined;
    if (cached) return cached;
    const body = facts.body(path);
    if (body === undefined) return undefined;
    bodies.set(key, "pending");
    const { ir } = normalize(body, facts, { mode: "body" });
    resolveScopes(ir);
    const summary = inferEffects(ir.root, facts, bodyEffects).program;
    bodies.set(key, summary);
    return summary;
  };

  // The bodies that the program defines are a part of the program: their problems have pointers in it
  for (const definition of definitions.values()) {
    const body = normalize(definition.body, facts, { mode: "body", base: definition.pointer });
    diagnostics.push(...body.diagnostics, ...resolveScopes(body.ir));
    diagnostics.push(...checkCalls(body.ir.root, facts, inferEffects(body.ir.root, facts, bodyEffects)));
  }

  const result = normalize(program, facts, { mode: options.mode ?? "exec" });
  diagnostics.push(...result.diagnostics, ...resolveScopes(result.ir));
  const effects = inferEffects(result.ir.root, facts, bodyEffects);
  diagnostics.push(...checkCalls(result.ir.root, facts, effects, { capability: options.capability }));
  return { facts, ir: result.ir, diagnostics, program: effects.program };
}

function summarize(analysis: Analysis, diagnostics: Diagnostic[]): Omit<CheckResult, "ir"> {
  const sorted = sortDiagnostics(diagnostics);
  return {
    ok: !hasErrors(sorted),
    effects: toEffects(analysis.program.may),
    mustEffects: { reads: [...analysis.program.must.reads].sort(), writes: [...analysis.program.must.writes].sort() },
    diagnostics: sorted,
    registryHash: analysis.facts.hash,
  };
}

/**
 * This function checks a program before it starts. It finds each unknown name and procedure, and
 * each input that does not agree with its schema. It also finds each call that the capability
 * refuses, and the effects of the whole program. No call starts.
 */
export function checkProgram(program: unknown, options: CheckOptions): CheckResult {
  const analysis = analyze(program, options);
  return { ...summarize(analysis, analysis.diagnostics), ir: analysis.ir };
}

/**
 * This function checks a program and writes it as a function: the closure code for a host and
 * the source text for an export. The code makes the calls of the interpreter in the same order.
 */
export async function compileProgram(program: unknown, options: CompileOptions): Promise<CompileResult> {
  const analysis = analyze(program, options);
  let ir = analysis.ir;
  let folded: readonly string[] = [];
  if (options.fold) {
    const result = await foldProgram(ir.root, analysis.facts);
    ir = { ...ir, root: result.root };
    folded = result.folded;
  }
  const rawKeys = analysis.facts.rawKeys;
  const run = compileClosure(ir, { rawKeys });
  const text = emitText(ir, { language: options.language, runtime: options.runtime, registryHash: analysis.facts.hash, rawKeys });
  return {
    ...summarize(analysis, [...analysis.diagnostics, ...text.diagnostics]),
    ir,
    run,
    code: text.module,
    body: text.body,
    sourceMap: text.sourceMap,
    folded,
  };
}
