/**
 * The checks pass: the problems of each call before the first call starts.
 *
 * - An unknown path, or a path that the host does not expose.
 * - A call that the capability refuses (`capabilityRefusal()` of the client, with the declared
 *   effects of the manifest), and a call whose program the compiler cannot see under a capability
 *   that limits the effects (fail closed).
 * - An input that does not agree with the JSON Schema of the procedure.
 *
 * In the interpreter each call of a program goes through the admission: a call of the host, or a
 * nested call of a data-driven procedure. So the pass examines each call of the IR.
 */

import { capabilityRefusal, type AnyProcedure, type Capability, type Effects, type ProcedurePath } from "@procedures/client/browser";
import { isCallLike, type IRNode, walk } from "./ir.js";
import { isStringPath, type ProcedureFacts } from "./facts.js";
import { isUnknown, toEffects, type EffectsAnalysis } from "./effects.js";
import { checkShape, shapeOf, withExtra } from "./schema.js";
import type { Diagnostic } from "./diagnostics.js";

/** The options of the pass. */
export interface CheckPassOptions {
  readonly capability?: Capability<unknown> | undefined;
}

/** A capability without its deadline: the static check does not know the time of the run. */
function withoutDeadline(capability: Capability<unknown> | undefined): Capability<unknown> | undefined {
  if (!capability || capability.deadline === undefined) return capability;
  const { deadline: _deadline, ...rest } = capability;
  return rest;
}

/** True when the capability limits the reads or the writes, or refuses destructive procedures. */
function limitsEffects(capability: Capability<unknown> | undefined): boolean {
  const permitted = capability?.effects;
  if (!permitted) return false;
  const limited = (permit: readonly string[] | "any" | undefined): boolean => permit !== undefined && permit !== "any";
  return limited(permitted.reads) || limited(permitted.writes) || permitted.destructive === false;
}

/** A procedure that has only a path and effects, for `capabilityRefusal()`. */
function asProcedure(path: ProcedurePath, effects: Effects | undefined): AnyProcedure {
  return { path, metadata: effects ? { effects } : {} } as unknown as AnyProcedure;
}

/** This function examines each call of the IR. */
export function checkCalls(root: IRNode, facts: ProcedureFacts, effects: EffectsAnalysis, options: CheckPassOptions = {}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const capability = withoutDeadline(options.capability);
  const limited = limitsEffects(capability);

  const visit = (node: IRNode): void => {
    if (node.kind === "deferred") {
      if (isStringPath(node.path) && node.path.length > 0 && !facts.entry(node.path)) {
        diagnostics.push({
          severity: "warning",
          code: "unknown-procedure",
          message: `No procedure has the path ${node.key}. This call waits for its runner, and the runner cannot start it.`,
          pointer: node.pointer,
        });
      }
      return;
    }
    if (!isCallLike(node)) return;
    if (node.kind === "dynamic" && node.model) walk(node.model, visit);
    const path = node.path;
    if (!isStringPath(path) || path.length === 0 || path.some((segment) => segment.length === 0)) return;
    const entry = facts.entry(path);
    if (!entry) {
      diagnostics.push({
        severity: "error",
        code: "unknown-procedure",
        message: `No procedure has the path ${node.key}: the host does not have it, or it does not expose it.`,
        pointer: node.pointer,
      });
      return;
    }
    if (!facts.exposed(path)) {
      diagnostics.push({
        severity: "error",
        code: "not-exposed",
        message: `The host does not expose ${node.key}. A program runs its calls through data-driven procedures, and they can call only exposed procedures.`,
        pointer: node.pointer,
      });
    }
    if (capability) {
      const refusal = capabilityRefusal(asProcedure(path, entry.effects), capability);
      if (refusal) {
        diagnostics.push({ severity: "error", code: "capability-refused", message: `The capability refuses this call (${refusal.reason}): ${refusal.message}.`, pointer: node.pointer });
      }
    }
    if (node.kind === "call" || node.kind === "dynamic") {
      const runs = effects.nested.get(node);
      if (runs && isUnknown(runs)) {
        diagnostics.push({
          severity: limited ? "error" : "info",
          code: "effects-unknown",
          message: limited
            ? `${node.key} runs a program that the compiler cannot see, and the capability limits the effects. The check fails closed: run program.check on a host that can see the program.`
            : `${node.key} runs a program that the compiler cannot see, so the effects of the program are not known.`,
          pointer: node.pointer,
        });
      } else if (runs && capability) {
        const refusal = capabilityRefusal(asProcedure(path, toEffects(runs.may)), capability);
        if (refusal) {
          diagnostics.push({
            severity: "error",
            code: "capability-refused",
            message: `The capability refuses a call that ${node.key} runs (${refusal.reason}): ${refusal.message.replace(node.key, `the program of ${node.key}`)}.`,
            pointer: node.pointer,
          });
        }
      }
      if (!(node.kind === "dynamic" && (node.reason === "invalid-control-flow" || node.reason === "cyclic"))) {
        for (const issue of checkShape(withExtra(shapeOf(node.input), node.extra), entry.input)) {
          diagnostics.push({
            severity: "error",
            code: "input-schema",
            message: `The input of ${node.key} does not agree with its schema: ${issue.path ? `${issue.path}: ` : ""}${issue.message}.`,
            pointer: issue.pointer,
          });
        }
      }
    }
  };
  walk(root, visit);
  return diagnostics;
}
