/**
 * The names pass: the static kit of coeval checks the names of a program.
 *
 * The client changes the program into a run document of coeval (`desugarProgram()`, with the
 * operands of the control-flow procedures as documents). The kinds of the document tell which
 * names they bind for which parts: the steps of a chain, `last`, `item`, `index`, `acc` and
 * `error`. Then `check()` of `@mark1russell7/coeval` finds each reference whose name no kind
 * around it binds. This pass changes each issue into a diagnostic with the JSON pointer of the
 * `$ref` in the program.
 */

import { check, walk, type DocVisit, type Key } from "@mark1russell7/coeval";
import {
  PROGRAM_WORLD,
  desugarInput,
  desugarProgram,
  isAnyProcedureRef,
  nameOfKey,
  originOf,
  programMachine,
  type ProcedurePath,
} from "@procedures/client/browser";
import type { Diagnostic } from "./diagnostics.js";

/** The options of the names pass. */
export interface NameOptions {
  /** `exec`: the program operates as `client.exec()` operates it. `body`: as the body of a defined procedure, with the name `input`. */
  readonly mode: "exec" | "body";
  /** The pointer of the program in a bigger document (the body of a definition). */
  readonly base?: string | undefined;
  /** The raw-input rule of the procedures. The default knows the control-flow procedures. */
  readonly rawInput?: ((path: ProcedurePath) => boolean) | undefined;
}

/** The name of the result of the step before, in the kernel. The `$proc` form writes it as `$last`. */
const LAST = "last";

/** The `$proc` text of a name of the kernel. */
function procName(key: string): string {
  return key === LAST ? "$last" : nameOfKey(key);
}

function placeKey(place: readonly Key[]): string {
  return place.map(String).join("\u0000");
}

/**
 * This function gives the diagnostics of the names of a program. It uses `check()` of coeval on
 * the run document of the program.
 */
export function nameDiagnostics(program: unknown, options: NameOptions): Diagnostic[] {
  const body = options.mode === "body";
  const settings = { rawInput: options.rawInput, scoped: body, expand: true };
  const doc = isAnyProcedureRef(program) ? desugarProgram(program, settings) : body ? desugarInput(program, settings) : undefined;
  if (!doc) return [];
  const names = body ? ["input"] : [];
  // The visit of each document, by its place. A part that is the whole value of its document has the
  // place of its document: the deeper visit comes later, and it stays.
  const visits = new Map<string, DocVisit>();
  walk(PROGRAM_WORLD, doc, (visit) => void visits.set(placeKey(visit.place), visit), { names });
  const issues = check(programMachine({ rawInput: options.rawInput ?? (() => false) }), doc, { names });
  const diagnostics: Diagnostic[] = [];
  for (const issue of issues) {
    if (issue.code !== "#NAME?") continue;
    const visit = visits.get(placeKey(issue.place));
    const origin = visit ? originOf(visit.doc) : undefined;
    const source = origin?.source as { readonly $ref?: unknown } | undefined;
    if (!visit || !origin || typeof source?.$ref !== "string") continue;
    const text = source.$ref;
    const name = text.split(".")[0] ?? "";
    const key = (visit.doc.value as readonly unknown[])[1];
    const pointer = `${options.base ?? ""}${origin.pointer}`;
    diagnostics.push(diagnosticOf(origin.deferred === true, visit, String(key), name, text, pointer));
  }
  return diagnostics;
}

/** This function makes the diagnostic of one name that no kind binds. */
function diagnosticOf(deferred: boolean, visit: DocVisit, key: string, name: string, text: string, pointer: string): Diagnostic {
  if (deferred) {
    return {
      severity: "info",
      code: "unknown-name",
      message: `No scope has the name "${name}" here. In the input of a deferred call, the $ref stays data for the runner.`,
      pointer,
    };
  }
  // The result of the step before is not the name of a step: the first step of a chain has no $last
  if (key !== LAST && visit.later.has(key)) {
    return {
      severity: "error",
      code: "use-before-definition",
      message: `The $ref "${text}" reads "${name}" before the step that makes it: a step reads only the names of the steps before it.`,
      pointer,
    };
  }
  const known = [...new Set([...visit.names].map(procName))];
  const here = known.length > 0 ? ` The names here: ${known.join(", ")}.` : " No name is in the scope here.";
  return {
    severity: "error",
    code: "unknown-name",
    message: `Unknown $ref name "${name}" in "${text}".${here}${name === "$last" ? " The first step of a chain has no $last." : ""}`,
    pointer,
  };
}
