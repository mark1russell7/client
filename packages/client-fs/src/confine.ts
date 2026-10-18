/**
 * The root of the files for all the procedures of a registry (roadmap R33).
 *
 * `confineFsProcedures()` gives the `fs.*` procedures the handlers of the root. The other
 * procedures reach files too: they read with `node:fs`, or they start a program. This file
 * applies the rules that each procedure declares in `metadata.fsRoot` (`FsRootRules` of the core):
 *
 * - **confined**: the procedure names its path inputs. The host examines each of them before the
 *   handler starts. A working folder that the call does not give is the root. A path of `paths`
 *   starts at the root, and the handler gets it absolute. A path of `names` starts at the working
 *   folder, and the handler gets it as the caller gave it (a program resolves it the same way).
 *   The handler gets the root in `ctx.fsRoot`, so a program that it starts can stay in the root.
 * - **program**: the procedure starts the program of its input (`shell.run`). The host refuses a
 *   call of a client. It accepts the nested call of a confined procedure that names the program
 *   procedure in `metadata.calls`: that caller chose the program and its arguments.
 * - **refused**: the rules give the reason that the root cannot confine the procedure.
 *
 * A procedure without rules gets a decision from its effects. The decision fails closed: the host
 * refuses the procedure when its effects are not known, when it reads or writes `fs`, or when it
 * writes `process`. A data-driven procedure stays as it is: it reaches files only through its
 * nested calls, and each nested call gets the rules of its own procedure.
 *
 * Each refusal is the error of a path outside the root: `FORBIDDEN` with the reason `outside-root`.
 */

import {
  callMatches,
  declaredCalls,
  effectsOf,
  isDataDriven,
  pathToKey,
  scopeOf,
  withScope,
  type AnyProcedure,
  type FsRootRules,
  type ProcedureContext,
  type ProcedurePath,
  type ProcedureRegistry,
} from "@procedures/client";
import { inRoot, outsideRoot, resolveRoot, type ResolvedRoot } from "./root.js";

/** What a root does to a procedure. */
export type RootKind = "fs" | "confined" | "program" | "refused" | "unchanged";

/** The decision of a root for one procedure. */
export interface RootDecision {
  readonly kind: RootKind;
  /** For the kind `refused`: the reason. */
  readonly reason?: string;
}

/** The resource name of the files of the host (CAPABILITIES-2026-10). */
const FILES = "fs";
/** The resource name of a procedure that starts any program. */
const PROGRAMS = "process";

/** The keys of the rules that `FsRootRules` has. */
const RULE_KEYS: ReadonlySet<string> = new Set(["cwd", "paths", "names", "required", "values", "refuse", "program"]);

/** The procedure key of a path, for the messages. */
const keyOf = (procedure: { readonly path: ProcedurePath }): string => pathToKey(procedure.path);

/** True for a list of names that are not empty. */
function isNameList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((name) => typeof name === "string" && name.length > 0);
}

/**
 * This function gives the rules of a procedure, or undefined when it has none. It throws for
 * rules that are not correct, because the root cannot apply them.
 */
export function rootRulesOf(procedure: Pick<AnyProcedure, "path" | "metadata">): FsRootRules | undefined {
  const rules = (procedure.metadata as { fsRoot?: unknown } | undefined)?.fsRoot;
  if (rules === undefined) return undefined;
  const invalid = (problem: string): Error => new Error(`The metadata.fsRoot of ${keyOf(procedure)} is not correct: ${problem}`);
  if (rules === null || typeof rules !== "object" || Array.isArray(rules)) throw invalid("it must be an object");
  const record = rules as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!RULE_KEYS.has(key)) throw invalid(`it has the unknown key ${key}`);
  }
  if (record["cwd"] !== undefined && (typeof record["cwd"] !== "string" || record["cwd"] === "")) throw invalid("cwd must be the name of an input");
  for (const key of ["paths", "names", "required", "values"] as const) {
    if (record[key] !== undefined && !isNameList(record[key])) throw invalid(`${key} must be a list of texts`);
  }
  if (record["refuse"] !== undefined && (typeof record["refuse"] !== "string" || record["refuse"] === "")) throw invalid("refuse must be the reason, as text");
  if (record["program"] !== undefined && typeof record["program"] !== "boolean") throw invalid("program must be true or false");
  const typed = rules as FsRootRules;
  if (typed.refuse !== undefined && Object.keys(record).length > 1) throw invalid("refuse cannot go with other rules");
  const paths = new Set(typed.paths ?? []);
  for (const name of typed.required ?? []) {
    if (!paths.has(name)) throw invalid(`the required input ${name} is not in paths`);
  }
  const inputs = [...(typed.cwd !== undefined ? [typed.cwd] : []), ...(typed.paths ?? []), ...(typed.names ?? [])];
  if (new Set(inputs).size !== inputs.length) throw invalid("an input is in more than one of cwd, paths and names");
  return typed;
}

/**
 * This function tells what a root does to a procedure, without a root. It throws for rules that
 * are not correct. `confineToRoot()` uses the same decision.
 */
export function rootDecisionOf(procedure: Pick<AnyProcedure, "path" | "metadata" | "handler">): RootDecision {
  if (procedure.path[0] === FILES) return { kind: "fs" };
  const rules = rootRulesOf(procedure);
  if (rules !== undefined) {
    if (rules.refuse !== undefined) return { kind: "refused", reason: rules.refuse };
    return { kind: rules.program === true ? "program" : "confined" };
  }
  // A data-driven procedure runs the refs of its caller: each nested call gets its own decision
  if (isDataDriven(procedure)) return { kind: "unchanged" };
  const effects = effectsOf(procedure);
  if (effects?.reads === undefined || effects.writes === undefined) {
    return { kind: "refused", reason: "it declares no effects and no metadata.fsRoot, so its files are not known" };
  }
  if (effects.reads.includes(FILES) || effects.writes.includes(FILES)) {
    return { kind: "refused", reason: "it reads or writes files, and it declares no metadata.fsRoot" };
  }
  if (effects.writes.includes(PROGRAMS)) {
    return { kind: "refused", reason: "it starts a program, and it declares no metadata.fsRoot" };
  }
  return { kind: "unchanged" };
}

/** What `confineToRoot()` did. Each list holds the keys of the procedures. */
export interface ConfinedRegistry {
  /** The absolute path of the root. */
  root: string;
  /** The `fs.*` procedures: they have the handlers of `createFsModule({ root })`. */
  fs: string[];
  /** The procedures whose path inputs the root examines. */
  confined: string[];
  /** The procedures that start the program of their input: only as a nested call of a confined procedure. */
  programs: string[];
  /** The procedures that the root refuses. */
  refused: string[];
  /** The procedures that reach no file: the root does not change them. */
  unchanged: string[];
}

/** The values of a path input: a text, or a list of texts. Another value cannot be examined. */
function pathValues(value: unknown, name: string, at: ProcedurePath): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value as string[];
  throw outsideRoot(at, `the input ${name} is not a path or a list of paths, so the root cannot examine it`);
}

/**
 * This function gives the input with each path in the root. The working folder that the call does
 * not give is the root. Each path of `paths` starts at the root and becomes absolute. A path of
 * `names` starts at the working folder, and it stays as it is.
 */
async function confinedInput(input: unknown, rules: FsRootRules, root: ResolvedRoot, at: ProcedurePath): Promise<unknown> {
  const examines = rules.cwd !== undefined || (rules.paths?.length ?? 0) > 0 || (rules.names?.length ?? 0) > 0;
  if (!examines) return input;
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw outsideRoot(at, "the input is not an object, so the root cannot examine its paths");
  }
  const given = input as Record<string, unknown>;
  const next: Record<string, unknown> = { ...given };
  const kept = new Set(rules.values ?? []);
  let base = root.folder;
  if (rules.cwd !== undefined) {
    const value = given[rules.cwd];
    if (value !== undefined && value !== null && typeof value !== "string") {
      throw outsideRoot(at, `the input ${rules.cwd} is not a folder, so the root cannot examine it`);
    }
    base = await inRoot(root, typeof value === "string" ? value : ".", at);
    next[rules.cwd] = base;
  }
  for (const name of rules.paths ?? []) {
    const value = given[name];
    if (value === undefined || value === null) {
      if (rules.required?.includes(name)) {
        throw outsideRoot(at, `the input ${name} has no value, and its default is outside the root ${root.folder}: give a path in the root`);
      }
      continue;
    }
    const absolute: string[] = [];
    for (const path of pathValues(value, name, at)) absolute.push(kept.has(path) ? path : await inRoot(root, path, at));
    next[name] = typeof value === "string" ? absolute[0] : absolute;
  }
  for (const name of rules.names ?? []) {
    const value = given[name];
    if (value === undefined || value === null) continue;
    for (const path of pathValues(value, name, at)) if (!kept.has(path)) await inRoot(root, path, at, base);
  }
  // A runner reads the scope of its raw input: the copy keeps it (DOC-10)
  return withScope(next, scopeOf(input));
}

/** The handler of a procedure under a root. */
type Handler = NonNullable<AnyProcedure["handler"]>;

/**
 * This function gives the context of a handler under a root: the same context with `fsRoot`. A
 * procedure that starts a program (git) reads it to keep the program in the root.
 */
function withRoot(ctx: ProcedureContext | undefined, root: ResolvedRoot): ProcedureContext {
  return { ...(ctx as ProcedureContext), fsRoot: root.folder };
}

/**
 * This function applies the decision of each procedure of the registry, except `fs.*`, to a root
 * that exists. It replaces the handler of each confined, program and refused procedure, and it
 * adds no procedure. `confineToRoot()` of the module starts it after the `fs.*` procedures.
 */
export function confineOtherProcedures(registry: ProcedureRegistry, folder: string): Omit<ConfinedRegistry, "root" | "fs"> {
  const result: Omit<ConfinedRegistry, "root" | "fs"> = { confined: [], programs: [], refused: [], unchanged: [] };
  // All decisions first: a rule that is not correct throws before the registry changes
  const decisions = registry
    .getAll()
    .filter((procedure) => procedure.path[0] !== FILES)
    .map((procedure) => ({ procedure, decision: rootDecisionOf(procedure) }));
  const confinedProcedures = new WeakSet<AnyProcedure>();
  const root = (): Promise<ResolvedRoot> => resolveRoot(folder);

  for (const { procedure, decision } of decisions) {
    const key = keyOf(procedure);
    const original = procedure.handler;
    if (decision.kind === "unchanged" || original === undefined) {
      result.unchanged.push(key);
      continue;
    }
    const rules = rootRulesOf(procedure) ?? {};
    let handler: Handler;
    if (decision.kind === "refused") {
      const message = `the root ${folder} cannot confine this procedure: ${decision.reason ?? "no reason"}`;
      handler = (async () => {
        throw outsideRoot(procedure.path, message);
      }) as Handler;
      result.refused.push(key);
    } else if (decision.kind === "program") {
      handler = (async (input: unknown, ctx: ProcedureContext | undefined) => {
        const caller = ctx?.caller;
        const named = caller !== undefined && (declaredCalls(caller) ?? []).some((entry) => callMatches(entry, key));
        if (caller === undefined || !confinedProcedures.has(caller) || !named) {
          const from = caller === undefined ? "a client" : keyOf(caller);
          throw outsideRoot(
            procedure.path,
            `this procedure starts the program of its input. Under the root ${folder}, it runs only as the nested call of a confined procedure that names it in metadata.calls, not for ${from}`,
          );
        }
        const resolved = await root();
        return original(await confinedInput(input, rules, resolved, procedure.path), withRoot(ctx as ProcedureContext, resolved));
      }) as Handler;
      result.programs.push(key);
    } else {
      handler = (async (input: unknown, ctx: ProcedureContext) => {
        const resolved = await root();
        return original(await confinedInput(input, rules, resolved, procedure.path), withRoot(ctx, resolved));
      }) as Handler;
      result.confined.push(key);
    }
    registry.register({ ...procedure, handler }, { override: true });
    if (decision.kind === "confined") confinedProcedures.add(registry.get(procedure.path)!);
  }
  return result;
}
