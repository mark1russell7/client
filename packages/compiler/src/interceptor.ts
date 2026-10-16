/**
 * The check before the run, as an interceptor of a host (roadmap R22).
 *
 * A host calls a data-driven procedure (`client.chain`, `client.map`, a procedure that
 * `procedure.define` made) with a program in its input. Without the check, the interpreter finds
 * a problem only when it arrives there: step 1 can write a file before step 3 meets a refusal.
 * The interceptor checks the whole program before the first step. When the check finds an error,
 * the host refuses the call, and no step starts.
 *
 * The check is conservative. It refuses a call that a branch can make, also a branch that does
 * not run. A `client.tryCatch` around a refused call does not help: the program does not start.
 *
 * @example
 * ```typescript
 * const server = new ProcedureServer({
 *   registry,
 *   expose,
 *   interceptors: [programCheckInterceptor({ registry, expose })],
 * });
 * ```
 */

import {
  InvocationError,
  isDataDriven,
  type AnyProcedure,
  type CapabilityRefusalReason,
  type Interceptor,
  type Invocation,
  type InvocationErrorCode,
  type ProcedurePath,
} from "@procedures/client/browser";
import { registryFacts, type ProcedureFacts, type RegistryLike } from "./facts.js";
import { checkProgram, type CheckResult } from "./program.js";
import type { Diagnostic } from "./diagnostics.js";

/** A registry that tells when its procedures change, so the interceptor can make its facts again. */
export interface ObservableRegistry extends RegistryLike {
  on?(event: "register" | "unregister", listener: (procedure: AnyProcedure) => void): void;
}

/** The options of `programCheckInterceptor()`. */
export interface ProgramCheckOptions {
  /** The registry of the host. */
  readonly registry: ObservableRegistry;
  /** The expose rule of the host. The default exposes each procedure. */
  readonly expose?: ((path: ProcedurePath) => boolean) | undefined;
  /** The diagnostics that refuse a program. The default refuses each error. */
  readonly refuses?: ((diagnostic: Diagnostic) => boolean) | undefined;
  /** This function gets each result of the check (for logs and tests). */
  readonly onCheck?: ((invocation: Invocation, result: CheckResult) => void) | undefined;
}

/** The error code of the interpreter for the same problem, so a client sees one code. */
function codeOf(diagnostic: Diagnostic): InvocationErrorCode {
  switch (diagnostic.code) {
    case "not-exposed":
      return "NOT_EXPOSED";
    case "unknown-procedure":
      return "NOT_FOUND";
    case "capability-refused":
    case "effects-unknown":
      return "FORBIDDEN";
    default:
      return "VALIDATION_ERROR";
  }
}

const REASONS: readonly CapabilityRefusalReason[] = ["effects-undeclared", "effects-exceeded", "clearance", "deadline"];

/** The reason of a `FORBIDDEN` refusal: the diagnostic names it in its message. */
function reasonOf(diagnostic: Diagnostic): CapabilityRefusalReason | undefined {
  if (diagnostic.code === "effects-unknown") return "effects-undeclared";
  if (diagnostic.code !== "capability-refused") return undefined;
  return REASONS.find((reason) => diagnostic.message.includes(`(${reason})`));
}

/**
 * The place of a problem for the caller. The check examines `{ $proc, input }`, and the caller
 * sent only the input, so a pointer into the input loses its `/input` part.
 */
function placeOf(pointer: string): string {
  if (pointer === "" || pointer === "/$proc") return "the call";
  if (pointer === "/input") return "the input";
  if (pointer.startsWith("/input/")) return `${pointer.slice("/input".length)} of the input`;
  return pointer;
}

/** The text of a refusal: the first problem with its place, and the number of the others. */
function messageOf(refused: readonly Diagnostic[]): string {
  const first = refused[0]!;
  const where = placeOf(first.pointer);
  const more = refused.length > 1 ? ` The check found ${refused.length - 1} more problem${refused.length > 2 ? "s" : ""}.` : "";
  return `The check before the run refused the program, and no step started. ${first.code} at ${where}: ${first.message}${more}`;
}

/**
 * This function gives an interceptor that checks the program of each call of the host to a
 * data-driven procedure, before the procedure starts. A nested call is a part of a program that
 * the check examined already, so the interceptor does not check it again.
 */
export function programCheckInterceptor(options: ProgramCheckOptions): Interceptor {
  const refuses = options.refuses ?? ((diagnostic: Diagnostic) => diagnostic.severity === "error");
  // The facts of the registry cost a description of each procedure: keep them until it changes
  let facts: ProcedureFacts | undefined;
  const reset = (): void => {
    facts = undefined;
  };
  options.registry.on?.("register", reset);
  options.registry.on?.("unregister", reset);

  return async (invocation, next) => {
    if (invocation.depth !== 0 || !isDataDriven(invocation.procedure)) return next();
    facts ??= registryFacts(options.registry, { expose: options.expose });
    const result = checkProgram(
      { $proc: invocation.path, input: invocation.input },
      { facts, expose: options.expose, capability: invocation.capability },
    );
    options.onCheck?.(invocation, result);
    const refused = result.diagnostics.filter(refuses);
    if (refused.length > 0) {
      const first = refused[0]!;
      throw new InvocationError(codeOf(first), messageOf(refused), invocation.path, reasonOf(first));
    }
    return next();
  };
}
