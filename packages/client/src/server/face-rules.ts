/**
 * The rules of one face of a host (CLI-43, AG1-B): a narrowing and an expose rule for each call of
 * the face.
 *
 * A host can serve one server through more than one face, for example a full face and a read-only
 * face for a browser. `faceRules()` reads the rules of one face one time, and `apply()` adds them to
 * each request of that face:
 *
 * - The narrowing becomes one more source of the narrowing key (`procedure-narrowing`, CLI-30). Thus
 *   the server applies the meet of all the sources: the capability of the policy, the request hook
 *   and the key of the caller. A narrowing can only narrow.
 * - The expose rule goes to `ServerRequest.expose`. The server meets it with its own rule, for the
 *   call of the face and for each nested call. An expose rule can only narrow.
 *
 * The MCP face of `@procedures/mcp-server` and the HTTP and WebSocket faces of `@procedures/peer`
 * use this module. It imports no Node code.
 */

import { NARROWING_METADATA_KEY, addNarrowing, narrowWithin, narrowingOf } from "../procedures/narrowing.js";
import type { Capability, CapabilityRequest, ProcedurePath } from "../procedures/types.js";
import { exposePatterns, surfaceRule, type HostPolicy, type ToolSurface } from "./host-policy.js";
import type { ServerRequest } from "./types.js";

/** The rules of one face, as options of the face. */
export interface FaceRulesOptions {
  /**
   * A narrower capability for each call of the face, for example the read-only mode
   * `{ effects: { writes: [] } }`. A narrowing that is not valid stops `faceRules()` with an error.
   */
  readonly narrowing?: CapabilityRequest<unknown> | readonly CapabilityRequest<unknown>[] | undefined;
  /**
   * The procedures that the callers of the face reach: the patterns of `hostPolicy({ expose })`, a
   * tool surface or a function. The server meets this rule with the rule of the host.
   */
  readonly expose?: readonly string[] | ToolSurface | ((path: ProcedurePath) => boolean) | undefined;
}

/** The rules of one face, read one time. */
export interface FaceRules {
  /** The sources of the narrowing as the decoder read them, frozen. The list is empty without a narrowing. */
  readonly narrowings: readonly CapabilityRequest<unknown>[];
  /** The expose rule of the face, or undefined without one. */
  readonly expose: ((path: ProcedurePath) => boolean) | undefined;
  /**
   * The capability of the policy, narrowed by the narrowing of the face, without the time. A face
   * lists its procedures with it: the time limits each call, not the list.
   */
  readonly capability: Capability | undefined;
  /** This function gives the request with the rules of the face. It does not change the request that it gets. */
  apply<T>(request: ServerRequest<T>): ServerRequest<T>;
}

/** This function gives the meet of two expose rules: a path passes when it passes each rule. */
export function meetExpose(
  first: ((path: ProcedurePath) => boolean) | undefined,
  second: ((path: ProcedurePath) => boolean) | undefined,
): ((path: ProcedurePath) => boolean) | undefined {
  if (!first) return second;
  if (!second) return first;
  return (path) => first(path) && second(path);
}

/** This function gives the rule of the expose option of a face. */
function exposeRule(expose: NonNullable<FaceRulesOptions["expose"]>): (path: ProcedurePath) => boolean {
  if (typeof expose === "function") return expose;
  return Array.isArray(expose) ? exposePatterns(expose as readonly string[]) : surfaceRule(expose as ToolSurface);
}

/**
 * This function reads the rules of one face with the decoder and the meet of the wire (CLI-30).
 * It throws for a part of the narrowing that is not valid, because each call of the face then gets
 * a refusal. The argument `face` names the face in the message of the error, for example `MCP`.
 *
 * @example
 * ```typescript
 * const rules = faceRules({ narrowing: { effects: { writes: [] } }, expose: ["graphapi.*"] }, policy, "read");
 * const handler = { ...inner, handle: (request) => inner.handle(rules.apply(request)) };
 * ```
 */
export function faceRules(
  options: FaceRulesOptions,
  policy: Pick<HostPolicy, "capabilityOf" | "clearanceOrder">,
  face?: string,
): FaceRules {
  let narrowings: readonly CapabilityRequest<unknown>[] = [];
  let capability = policy.capabilityOf?.();
  if (options.narrowing !== undefined) {
    const wire = narrowingOf(options.narrowing);
    // The sources as the decoder read them, frozen: a change of the options or of the metadata of a call does not change them
    narrowings = Object.freeze(wire.narrowings.map((source) => Object.freeze({ ...source })));
    const untimed = narrowings.map((source): CapabilityRequest<unknown> => ({
      ...(source.clearance !== undefined ? { clearance: source.clearance } : {}),
      ...(source.effects !== undefined ? { effects: source.effects } : {}),
    }));
    const listed = narrowWithin(capability, untimed, policy.clearanceOrder);
    const refusal = [...wire.notes, ...listed.notes].find((note) => note.kind === "refused");
    if (refusal) throw new Error(`The narrowing of ${face === undefined ? "the face" : `the ${face} face`} is not valid: ${refusal.message}`);
    capability = listed.capability;
  }
  const expose = options.expose !== undefined ? exposeRule(options.expose) : undefined;
  const sources = narrowings;
  return {
    narrowings,
    expose,
    capability,
    apply: (request) => {
      if (sources.length === 0 && !expose) return request;
      return {
        ...request,
        ...(sources.length > 0 ? { metadata: { ...request.metadata, [NARROWING_METADATA_KEY]: addNarrowing(request.metadata[NARROWING_METADATA_KEY], sources) } } : {}),
        ...(expose ? { expose: meetExpose(request.expose, expose) } : {}),
      };
    },
  };
}
