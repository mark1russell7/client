/**
 * Invocation capabilities (packages/documentation/CAPABILITIES-2026-10.md).
 *
 * Each invocation operates with a capability: a clearance (the data that it can see), the
 * effects that it can have, and a deadline. A nested call gets the same capability or a
 * narrower one: `narrowCapability()` calculates it, so a request for more has no effect. Only
 * the host makes a capability, from its authentication.
 *
 * A procedure declares its effects in `metadata.effects`. The admission (`capabilityRefusal()`)
 * compares them with the permitted effects. It examines each call of a host, each nested call
 * of a data-driven procedure (its caller chose the refs), and each nested call with a narrowed
 * capability. A procedure of code that declares its effects answers for its own nested calls:
 * `checkEffects()` examines those declarations against the call graph, as `metadata.calls`
 * makes the reach of a procedure visible.
 */

import type {
  AnyProcedure,
  Capability,
  CapabilityRequest,
  ClearanceOrder,
  Effects,
  PermittedEffects,
  ProcedurePath,
} from "./types.js";
import { pathToKey } from "./types.js";
import { isDataDriven } from "./ref.js";
import { callMatches } from "./policy.js";

/** The standard resource names. An application adds its own names. */
export const STANDARD_RESOURCES = ["fs", "network", "process", "registry"] as const;

// The metadata key of the remaining time of a remote call, in milliseconds (client/deadline.ts)
export { TIMEOUT_METADATA_KEY } from "../client/deadline.js";

/** The capability without limits: the capability of a host that sets none. */
export const UNLIMITED_CAPABILITY: Capability = Object.freeze({});

// =============================================================================
// Clearance orders
// =============================================================================

/**
 * This function gives the order of a ladder: each value is higher than the values before it.
 * `ladder(["public", "shared", "private"])`.
 */
export function ladder<C>(levels: readonly C[]): ClearanceOrder<C> {
  const rank = (value: C): number => {
    const index = levels.indexOf(value);
    if (index === -1) throw new Error(`Not a clearance value of the ladder: ${String(value)}`);
    return index;
  };
  return {
    leq: (a, b) => rank(a) <= rank(b),
    meet: (a, b) => (rank(a) <= rank(b) ? a : b),
  };
}

// =============================================================================
// Effects
// =============================================================================

/** The declared effects of a procedure, or undefined when it declares none. */
export function effectsOf(procedure: { readonly metadata?: unknown }): Effects | undefined {
  const effects = (procedure.metadata as { effects?: unknown } | undefined)?.effects;
  return effects !== null && typeof effects === "object" ? (effects as Effects) : undefined;
}

/** True when the effects say that the procedure changes nothing (`writes: []`). */
export function isReadOnly(effects: Effects | undefined): boolean {
  return effects?.writes !== undefined && effects.writes.length === 0;
}

/** True when the procedure can delete or overwrite data. Not known: true (as in MCP). */
export function isDestructive(effects: Effects | undefined): boolean {
  if (isReadOnly(effects)) return false;
  return effects?.destructive ?? true;
}

/** True when the procedure can reach systems outside the host. Not known: true (as in MCP). */
export function isOpenWorld(effects: Effects | undefined): boolean {
  if (effects?.reads === undefined || effects.writes === undefined) return true;
  return effects.reads.includes("network") || effects.writes.includes("network") || effects.writes.includes("process");
}

/** The MCP hints of a tool. */
export interface ToolHints {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
}

/**
 * The MCP hints of a procedure, from its declared effects. A procedure without a declaration,
 * or a data-driven one (its operands decide what it does), gets no hints: then the MCP defaults
 * apply (not read-only, destructive, open world).
 */
export function toolHints(procedure: AnyProcedure): ToolHints {
  const effects = effectsOf(procedure);
  if (!effects || isDataDriven(procedure)) return {};
  if (isReadOnly(effects)) {
    return { readOnlyHint: true, openWorldHint: isOpenWorld(effects) };
  }
  return {
    readOnlyHint: false,
    destructiveHint: isDestructive(effects),
    idempotentHint: effects.idempotent ?? false,
    openWorldHint: isOpenWorld(effects),
  };
}

// =============================================================================
// Narrowing
// =============================================================================

type Permit = readonly string[] | "any" | undefined;

function intersect(current: Permit, requested: Permit): Permit {
  if (current === undefined || current === "any") return requested ?? current;
  if (requested === undefined || requested === "any") return current;
  return Object.freeze(current.filter((name) => requested.includes(name)));
}

function narrowEffects(current: PermittedEffects | undefined, requested: PermittedEffects | undefined): PermittedEffects | undefined {
  if (!requested) return current;
  const reads = intersect(current?.reads, requested.reads);
  const writes = intersect(current?.writes, requested.writes);
  const destructive = current?.destructive === false || requested.destructive === false ? false : undefined;
  const result: { reads?: Permit; writes?: Permit; destructive?: boolean } = {};
  if (reads !== undefined) result.reads = reads;
  if (writes !== undefined) result.writes = writes;
  if (destructive !== undefined) result.destructive = destructive;
  return Object.freeze(result) as PermittedEffects;
}

/**
 * This function gives the capability for a request: the same as `current`, or narrower. The
 * clearance is the meet of the two values (a ladder: the lower one). The permitted effects are
 * the intersection. The deadline is the earlier one. Two different clearances need an order.
 */
export function narrowCapability<C>(
  current: Capability<C> | undefined,
  request: CapabilityRequest<C> | undefined,
  order?: ClearanceOrder<C>,
  now: number = Date.now()
): Capability<C> {
  const base = current ?? (UNLIMITED_CAPABILITY as Capability<C>);
  if (!request) return base;
  const result: { clearance?: C; effects?: PermittedEffects; deadline?: number } = {};

  if (request.clearance === undefined) {
    if (base.clearance !== undefined) result.clearance = base.clearance;
  } else if (base.clearance === undefined) {
    result.clearance = request.clearance;
  } else if (Object.is(base.clearance, request.clearance)) {
    result.clearance = base.clearance;
  } else {
    if (!order) {
      throw new Error("Two different clearances need a clearance order: give clearanceOrder to the host (hostPolicy)");
    }
    result.clearance = order.meet(base.clearance, request.clearance);
  }

  const effects = narrowEffects(base.effects, request.effects);
  if (effects !== undefined) result.effects = effects;

  // A time that is not a finite number of milliseconds (NaN, Infinity, below zero) asks for nothing:
  // Math.min with NaN gives NaN, and a NaN deadline is no deadline, so it would widen
  const timeoutMs = request.timeoutMs;
  const requestedDeadline = typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs >= 0 ? now + timeoutMs : undefined;
  const deadline =
    base.deadline === undefined ? requestedDeadline : requestedDeadline === undefined ? base.deadline : Math.min(base.deadline, requestedDeadline);
  if (deadline !== undefined) result.deadline = deadline;

  return Object.freeze(result) as Capability<C>;
}

// =============================================================================
// Admission
// =============================================================================

/** The reason of a refusal. */
export type CapabilityRefusalReason = "effects-undeclared" | "effects-exceeded" | "clearance" | "deadline";

/** A refused invocation: the reason and a message for the caller. */
export interface CapabilityRefusal {
  readonly reason: CapabilityRefusalReason;
  readonly message: string;
}

const VERB = { reads: "reads", writes: "changes" } as const;

/**
 * This function gives the refusal of an invocation under a capability, or undefined when the
 * capability permits it. It compares the declared effects with the permitted effects, and the
 * time with the deadline. The clearance does not refuse an invocation: it limits the data.
 */
export function capabilityRefusal(
  procedure: AnyProcedure,
  capability: Capability<unknown> | undefined,
  now: number = Date.now()
): CapabilityRefusal | undefined {
  if (!capability) return undefined;
  const key = pathToKey(procedure.path);
  if (capability.deadline !== undefined && now >= capability.deadline) {
    return { reason: "deadline", message: `The deadline of the call passed before ${key} started` };
  }
  const permitted = capability.effects;
  if (!permitted) return undefined;
  const effects = effectsOf(procedure);
  for (const kind of ["reads", "writes"] as const) {
    const allowed = permitted[kind];
    if (allowed === undefined || allowed === "any") continue;
    const declared = effects?.[kind];
    const limit = allowed.length > 0 ? `only ${allowed.join(", ")}` : "nothing";
    if (declared === undefined) {
      return {
        reason: "effects-undeclared",
        message: `${key} does not declare what it ${VERB[kind]}, and this call ${VERB[kind]} ${limit}`,
      };
    }
    const extra = declared.filter((name) => !allowed.includes(name));
    if (extra.length > 0) {
      return {
        reason: "effects-exceeded",
        message: `${key} ${VERB[kind]} ${extra.join(", ")}, and this call ${VERB[kind]} ${limit}`,
      };
    }
  }
  if (permitted.destructive === false && isDestructive(effects)) {
    return {
      reason: "effects-exceeded",
      message: `${key} can delete or overwrite data, and this call cannot start such a procedure`,
    };
  }
  return undefined;
}

/**
 * True when the admission examines a nested call: the caller is data-driven (its caller chose
 * the refs), the caller declares no effects, or the capability of the nested call is narrower
 * than the capability of its caller. A procedure of code with declared effects answers for its
 * own nested calls (`checkEffects()` examines them).
 */
export function examinesNestedCall(caller: AnyProcedure, callerCapability: Capability<unknown>, capability: Capability<unknown>): boolean {
  return isDataDriven(caller) || effectsOf(caller) === undefined || capability !== callerCapability;
}

/** The result of `explainInvocation()`. */
export interface InvocationExplanation {
  readonly permitted: boolean;
  readonly reason?: CapabilityRefusalReason | "not-found";
  readonly message: string;
}

/**
 * This function tells, without a call, if a host call of a path is permitted under a
 * capability, and why. An application can show it to a user.
 */
export function explainInvocation(
  path: ProcedurePath,
  capability: Capability<unknown> | undefined,
  registry: { get(path: ProcedurePath): AnyProcedure | undefined },
  now: number = Date.now()
): InvocationExplanation {
  const procedure = registry.get(path);
  if (!procedure) return { permitted: false, reason: "not-found", message: `No procedure at ${pathToKey(path)}` };
  const refusal = capabilityRefusal(procedure, capability, now);
  if (refusal) return { permitted: false, reason: refusal.reason, message: refusal.message };
  return { permitted: true, message: `${pathToKey(path)} is permitted` };
}

// =============================================================================
// The static check
// =============================================================================

/** A declaration of effects that does not include the effects of a procedure that it calls. */
export interface EffectsViolation {
  readonly path: ProcedurePath;
  readonly callee: string;
  readonly message: string;
}

/**
 * This function examines each procedure of code that declares its effects and its calls
 * (`metadata.calls`). Its declaration must include the reads and the writes of each procedure
 * that it calls: the resources are structural, so a caller cannot touch less than its callees.
 *
 * Two things are the caller's own claim, and the check does not compare them. A callee that
 * writes `process` starts any program, and its caller declares what that program does. The
 * flags `destructive` and `idempotent` depend on the input that the caller gives: `lib.new`
 * creates new files with `fs.write`, which can overwrite. The effects snapshot of the MCP tools
 * shows these claims in a review.
 */
export function checkEffects(procedures: readonly AnyProcedure[]): EffectsViolation[] {
  const byKey = new Map(procedures.map((procedure) => [pathToKey(procedure.path), procedure]));
  const violations: EffectsViolation[] = [];
  for (const procedure of procedures) {
    const own = effectsOf(procedure);
    const calls = (procedure.metadata as { calls?: unknown } | undefined)?.calls;
    if (!own || !Array.isArray(calls) || isDataDriven(procedure)) continue;
    const key = pathToKey(procedure.path);
    const callees = new Set<string>();
    for (const entry of calls as string[]) {
      for (const candidate of byKey.keys()) if (callMatches(entry, candidate)) callees.add(candidate);
    }
    for (const calleeKey of [...callees].sort()) {
      const callee = byKey.get(calleeKey)!;
      const theirs = effectsOf(callee);
      const report = (message: string): void => {
        violations.push({ path: procedure.path, callee: calleeKey, message: `${key} calls ${calleeKey}: ${message}` });
      };
      if (!theirs) {
        report("the callee declares no effects");
        continue;
      }
      for (const kind of ["reads", "writes"] as const) {
        const mine = own[kind];
        const needed = (theirs[kind] ?? []).filter((name) => name !== "process");
        if (theirs[kind] === undefined) {
          report(`the callee does not declare what it ${VERB[kind]}`);
        } else if (mine === undefined) {
          continue;
        } else {
          const missing = needed.filter((name) => !mine.includes(name));
          if (missing.length > 0) report(`the declaration does not include ${missing.join(", ")} in ${kind}`);
        }
      }
    }
  }
  return violations;
}
