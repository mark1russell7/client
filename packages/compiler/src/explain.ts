/**
 * The explanation of a program (roadmap R23): the check and `explainInvocation()` of the client
 * in one result.
 *
 * The result has the effects of the program, each call with its declared effects, the answer of
 * the capability for the call, and the diagnostics. A short text in plain words tells the same.
 * An application can show the text to a user before the user starts the program.
 */

import {
  explainInvocation,
  type AnyProcedure,
  type Capability,
  type CapabilityRefusalReason,
  type Effects,
  type ProcedurePath,
} from "@procedures/client/browser";
import { isCallLike, walk, type IRNode, type Pointer } from "./ir.js";
import { isStringPath, withDefinitions, type ProcedureFacts } from "./facts.js";
import { findDefinitions } from "./normalize.js";
import { baseFacts, checkProgram, type CheckOptions, type MustEffects } from "./program.js";
import type { Diagnostic } from "./diagnostics.js";

/** The kind of a call: a call of a procedure, a control-flow call or a dynamic call. */
export type CallKind = "call" | "control" | "dynamic";

/** The explanation of one call of a program. */
export interface CallExplanation {
  /** The key of the procedure: its path with dots. */
  readonly key: string;
  readonly path: ProcedurePath;
  /** The JSON pointer of the call in the program. */
  readonly pointer: Pointer;
  readonly kind: CallKind;
  /** The effects that the procedure declares. Absent: the procedure does not declare its effects. */
  readonly effects?: Effects | undefined;
  /** True when the host has a procedure at the path. */
  readonly known: boolean;
  /** True when the host has the procedure and its expose rule lets a program call it. */
  readonly exposed: boolean;
  /** True when the capability permits the call (`explainInvocation()` of the client). */
  readonly permitted: boolean;
  /** The reason of a refusal, or `not-found` for a path without a procedure. */
  readonly reason?: CapabilityRefusalReason | "not-found" | undefined;
  /** The answer of `explainInvocation()` in words. */
  readonly message: string;
}

/** The result of `explainProgram()`. */
export interface ProgramExplanation {
  /** True when no diagnostic is an error. A host starts the program only then. */
  readonly ok: boolean;
  /** The effects that a run can have (the upper bound). An absent `reads` or `writes`: not known. */
  readonly effects: Effects;
  /** The effects of each run in which no call fails (the lower bound). */
  readonly mustEffects: MustEffects;
  /** The calls of the program, in the order of the tree: a call comes before the calls of its input. */
  readonly calls: CallExplanation[];
  /** The problems that the check found, in the order of the program. */
  readonly diagnostics: Diagnostic[];
  /** The hash of the manifest that the check used. */
  readonly registryHash: string;
  /** The explanation in short sentences of plain words. */
  readonly summary: string;
}

/** A capability without its deadline: the static check does not know the time of the run. */
function withoutDeadline(capability: Capability<unknown> | undefined): Capability<unknown> | undefined {
  if (!capability || capability.deadline === undefined) return capability;
  const { deadline: _deadline, ...rest } = capability;
  return rest;
}

/** A registry for `explainInvocation()` that has a procedure with the declared effects for each known path. */
function registryOf(facts: ProcedureFacts): { get(path: ProcedurePath): AnyProcedure | undefined } {
  return {
    get: (path) => {
      const entry = facts.entry(path);
      return entry ? ({ path, metadata: entry.effects ? { effects: entry.effects } : {} } as unknown as AnyProcedure) : undefined;
    },
  };
}

function kindOf(node: IRNode): CallKind {
  return node.kind === "call" ? "call" : node.kind === "dynamic" ? "dynamic" : "control";
}

/** A list in words: "a", "a and b", "a, b and c". */
function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

/** Each call of a list with its place, at most three, and the number of the others. */
function callsText(calls: readonly CallExplanation[]): string {
  const shown = calls.slice(0, 3).map((call) => `${call.key} at ${call.pointer === "" ? "the root" : call.pointer}`);
  return calls.length > 3 ? `${shown.join(", ")} and ${calls.length - 3} more` : listText(shown);
}

/** The sentences of the effects. */
function effectsText(effects: Effects, must: MustEffects): string[] {
  const sentences: string[] = [];
  const names = (list: readonly string[]): string => (list.length === 0 ? "nothing" : listText(list));
  if (effects.reads && effects.writes) {
    const reads = effects.reads.length === 0 ? "reads nothing" : `can read ${names(effects.reads)}`;
    const writes = effects.writes.length === 0 ? "changes nothing" : `can change ${names(effects.writes)}`;
    sentences.push(`The program ${reads} and ${writes}.`);
  } else if (effects.reads) {
    sentences.push(`The program ${effects.reads.length === 0 ? "reads nothing" : `can read ${names(effects.reads)}`}. The compiler does not know what it changes.`);
  } else if (effects.writes) {
    sentences.push(`The compiler does not know what the program reads. It ${effects.writes.length === 0 ? "changes nothing" : `can change ${names(effects.writes)}`}.`);
  } else {
    sentences.push("The compiler does not know the effects of the program: a call does not declare them, or it runs a program that the compiler cannot see.");
  }
  if (effects.writes && effects.writes.length > 0 && effects.destructive) sentences.push("A call can delete or overwrite data.");
  if (must.reads.length > 0 || must.writes.length > 0) {
    const parts = [...(must.reads.length > 0 ? [`reads ${names(must.reads)}`] : []), ...(must.writes.length > 0 ? [`changes ${names(must.writes)}`] : [])];
    sentences.push(`Each run in which no call fails ${parts.join(" and ")}.`);
  }
  return sentences;
}

/** The text of the explanation, in short sentences. */
function summaryOf(explanation: Omit<ProgramExplanation, "summary">): string {
  const { calls, diagnostics } = explanation;
  const sentences: string[] = [];
  const keys = new Set(calls.map((call) => call.key));
  sentences.push(`The program has ${count(calls.length, "call")} of ${count(keys.size, "procedure")}.`);
  sentences.push(...effectsText(explanation.effects, explanation.mustEffects));
  const unknown = calls.filter((call) => !call.known);
  if (unknown.length > 0) sentences.push(`The host has no procedure for ${count(unknown.length, "call")}: ${callsText(unknown)}.`);
  const hidden = calls.filter((call) => call.known && !call.exposed);
  if (hidden.length > 0) sentences.push(`The host does not expose ${count(hidden.length, "call")}: ${callsText(hidden)}.`);
  const refused = calls.filter((call) => call.known && !call.permitted);
  if (refused.length > 0) sentences.push(`The capability refuses ${count(refused.length, "call")}: ${callsText(refused)}.`);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  sentences.push(
    errors === 0
      ? "The check found no error, so the host can start the program."
      : `The check found ${count(errors, "error")}, so the host does not start the program.`,
  );
  if (warnings > 0) sentences.push(`The check also found ${count(warnings, "warning")}.`);
  return sentences.join(" ");
}

/**
 * This function explains a program before it starts. It checks the program, and it asks
 * `explainInvocation()` of the client about each call. No call of the program starts.
 */
export function explainProgram(program: unknown, options: CheckOptions): ProgramExplanation {
  const base = baseFacts(options);
  const facts = withDefinitions(base, findDefinitions(program));
  const result = checkProgram(program, { ...options, facts: base });
  const capability = withoutDeadline(options.capability);
  const registry = registryOf(facts);
  const calls: CallExplanation[] = [];
  const visit = (node: IRNode): void => {
    if (!isCallLike(node)) return;
    const path = node.path;
    if (isStringPath(path) && path.length > 0 && path.every((segment) => segment.length > 0)) {
      const entry = facts.entry(path);
      const answer = explainInvocation(path, capability, registry);
      calls.push({
        key: node.key,
        path: [...path],
        pointer: node.pointer,
        kind: kindOf(node),
        ...(entry?.effects ? { effects: entry.effects } : {}),
        known: entry !== undefined,
        exposed: entry !== undefined && facts.exposed(path),
        permitted: answer.permitted,
        ...(answer.reason !== undefined ? { reason: answer.reason } : {}),
        message: answer.message,
      });
    }
    // The program that a dynamic call runs, when the compiler can see it (client.eval of a literal path)
    if (node.kind === "dynamic" && node.model) walk(node.model, visit);
  };
  walk(result.ir.root, visit);
  const explanation: Omit<ProgramExplanation, "summary"> = {
    ok: result.ok,
    effects: result.effects,
    mustEffects: result.mustEffects,
    calls,
    diagnostics: result.diagnostics,
    registryHash: result.registryHash,
  };
  return { ...explanation, summary: summaryOf(explanation) };
}
