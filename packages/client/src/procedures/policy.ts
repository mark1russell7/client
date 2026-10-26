/**
 * The call policy of a host: which nested calls a procedure can make (deep dive MCP-3).
 *
 * A host that serves procedures to an outside caller (the MCP server, a network server) gives an
 * `expose` rule: the procedures that its callers can reach. A procedure can call other
 * procedures through `ctx.client`. The policy decides for each nested call, with the immediate
 * caller:
 *
 * - A data-driven caller (control flow, `runs-refs`, a procedure that `procedure.define` made)
 *   runs refs that its caller chose. It can call only exposed procedures.
 * - A code caller with `metadata.calls` can call the procedures that it declares, and the
 *   exposed procedures.
 * - A code caller without `calls` can call any procedure, unless the host sets `strictCalls`.
 *   Then it can call only exposed procedures.
 *
 * Before, only the first rule existed. An exposed procedure of code could call any procedure, so
 * a code procedure that turns its input into a call was a confused deputy. The declarations make
 * the reach of each tool visible: a test of the MCP server pins it.
 *
 * A host without `expose` and without `strictCalls` (a library, the local CLI) checks nothing.
 */

import type { AnyProcedure, ProcedurePath } from "./types.js";
import { keyToPath, pathToKey } from "./types.js";
import { isDataDriven } from "./ref.js";

/** The call policy of a host. */
export interface CallPolicy {
  /** The procedures that the callers of the host can reach. Without it, every procedure is exposed. */
  expose?: ((path: ProcedurePath) => boolean) | undefined;
  /**
   * True: a code procedure without `metadata.calls` can call only exposed procedures. The MCP
   * server of the dev tools sets it.
   */
  strictCalls?: boolean | undefined;
}

/** The reason of a refused nested call. */
export interface CallRefusal {
  readonly code: "NOT_EXPOSED" | "NOT_DECLARED";
  readonly message: string;
}

/** True when a host has a policy: a nested call is examined only then. */
export function hasCallPolicy(policy: CallPolicy): boolean {
  return policy.expose !== undefined || policy.strictCalls === true;
}

/**
 * True when one entry of `calls` allows a procedure key: the same key, or `"ns.*"` for a key
 * that starts with `"ns."` (at any depth: `"fs.*"` allows `fs.read.json`).
 */
export function callMatches(entry: string, key: string): boolean {
  if (entry.endsWith(".*")) {
    return key.startsWith(entry.slice(0, -1));
  }
  return entry === key;
}

/**
 * This function checks the `calls` of a procedure's metadata and returns it, or undefined when
 * there is none. It throws for an invalid list. `"*"` alone is refused: a procedure whose
 * callees come from its input is data-driven and must have the `runs-refs` tag.
 */
export function validateCalls(calls: unknown, path: ProcedurePath): readonly string[] | undefined {
  if (calls === undefined) return undefined;
  const where = pathToKey(path);
  if (!Array.isArray(calls)) {
    throw new TypeError(`metadata.calls of ${where} must be a list of procedure keys`);
  }
  for (const entry of calls) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new TypeError(`metadata.calls of ${where} has an entry that is not a procedure key: ${JSON.stringify(entry)}`);
    }
    if (entry === "*") {
      throw new TypeError(
        `metadata.calls of ${where} is "*". A procedure whose callees come from its input is data-driven: ` +
          `give it the "runs-refs" tag instead.`,
      );
    }
    const body = entry.endsWith(".*") ? entry.slice(0, -2) : entry;
    if (body.length === 0 || body.includes("*") || keyToPath(body).some((segment) => segment.length === 0)) {
      throw new TypeError(`metadata.calls of ${where} has an invalid entry: "${entry}". Use "ns.name" or "ns.*".`);
    }
  }
  return calls as readonly string[];
}

/** The `calls` of a procedure, or undefined when it declares none. */
export function declaredCalls(procedure: Pick<AnyProcedure, "path" | "metadata">): readonly string[] | undefined {
  return validateCalls((procedure.metadata as { calls?: unknown } | undefined)?.calls, procedure.path);
}

/** One edge of the reach of the exposed procedures: a declared call to a procedure that is not exposed. */
export interface HiddenCall {
  readonly from: string;
  readonly to: string;
}

/**
 * The procedures that are not exposed, but that the exposed procedures can reach through their
 * `metadata.calls`, also through more than one step. A data-driven procedure reaches only
 * exposed procedures, and under `strictCalls` a procedure without `calls` does too, so neither
 * adds an edge. The edges are sorted. A test of the MCP server pins them.
 */
export function hiddenReach(
  procedures: readonly AnyProcedure[],
  expose: (path: ProcedurePath) => boolean,
): HiddenCall[] {
  const byKey = new Map(procedures.filter((procedure) => procedure.handler).map((procedure) => [pathToKey(procedure.path), procedure]));
  const edges = new Map<string, HiddenCall>();
  const visited = new Set<string>();
  const visit = (procedure: AnyProcedure): void => {
    const from = pathToKey(procedure.path);
    if (visited.has(from)) return;
    visited.add(from);
    if (isDataDriven(procedure)) return;
    for (const entry of declaredCalls(procedure) ?? []) {
      for (const [key, callee] of byKey) {
        if (!callMatches(entry, key) || expose(callee.path)) continue;
        edges.set(`${from} -> ${key}`, { from, to: key });
        visit(callee);
      }
    }
  };
  for (const procedure of byKey.values()) {
    if (expose(procedure.path)) visit(procedure);
  }
  return [...edges.keys()].sort().map((key) => edges.get(key)!);
}

/**
 * The refusal of a nested call from `caller` to `path` under `policy`, or undefined when the
 * call is allowed.
 */
export function nestedCallRefusal(caller: AnyProcedure, path: ProcedurePath, policy: CallPolicy): CallRefusal | undefined {
  if (!hasCallPolicy(policy)) return undefined;
  const exposed = policy.expose ? policy.expose(path) : true;
  const key = pathToKey(path);
  const from = pathToKey(caller.path);

  if (isDataDriven(caller)) {
    return exposed
      ? undefined
      : {
          code: "NOT_EXPOSED",
          message:
            `Procedure not exposed: ${key}. ${from} runs procedure refs from its input, so it can call only ` +
            `the procedures that this server exposes.`,
        };
  }

  const calls = declaredCalls(caller);
  if (calls !== undefined) {
    if (exposed || calls.some((entry) => callMatches(entry, key))) return undefined;
    return {
      code: "NOT_DECLARED",
      message: `Procedure not declared: ${from} calls ${key}, but its metadata.calls does not name it.`,
    };
  }

  if (policy.strictCalls && !exposed) {
    return {
      code: "NOT_EXPOSED",
      message:
        `Procedure not exposed: ${key}. ${from} declares no metadata.calls, and this server lets such a ` +
        `procedure call only the procedures that it exposes.`,
    };
  }
  return undefined;
}
