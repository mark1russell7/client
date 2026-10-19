/**
 * The limits of the calls of a server (CLI-40): one admission step for each face.
 *
 * A limit is data: a key over the call, the calls that it covers, a limit policy, a store and a
 * bound on its keys. Each limit is a keyed limiter of `@mark1russell7/service/limiter` (SYS-28) on
 * the clock of the server. The server takes one unit of each limit that covers a call, after the
 * authentication and before the run. Thus the key can read the principal of the call. It takes the
 * units in the sequence of the limits, and the first refusal stops the call. A limit before the
 * refusal keeps its unit: the server does not give it back.
 *
 * A refusal is `RATE_LIMITED` (retryable), with the wait in the metadata key `retry-after` (in
 * milliseconds) and the cause in `reason` (`limit`, `cap` or `store`). The HTTP face answers 429
 * with `Retry-After` in whole seconds. The WebSocket face and the MCP face give the same code and
 * the same wait. The work did not start, so a retry after the wait is safe.
 */

import { valueIn } from "@mark1russell7/quantity";
import {
  keyedLimiter,
  memoryStore,
  retryAfterSeconds,
  type KeyedLimiter,
  type LimitPolicy,
  type LimiterEviction,
  type LimiterStore,
  type LimiterStoreSpec,
  type Refused,
} from "@mark1russell7/service/limiter";
import type { Clock } from "../clock.js";
import { effectsOf, isReadOnly } from "../procedures/capability.js";
import { pathToKey, type Effects, type ProcedurePath } from "../procedures/types.js";
import { exposePatterns } from "./host-policy.js";
import type { Principal, ServerRequest, ServerResponse } from "./types.js";

/** The facts of a call that a limit reads. The server gives them after the authentication of the call. */
export interface LimitedCall {
  /** The path of the procedure of the call. */
  readonly path: ProcedurePath;
  /** The route of the call: the key of its procedure, for example `collections.notes.set`. */
  readonly route: string;
  /** The effects that the procedure declares, or undefined when it declares none. */
  readonly effects: Effects | undefined;
  /** True when the procedure can change data: its effects do not say `writes: []`. A procedure without effects can change data. */
  readonly writes: boolean;
  /** The principal of the call: from the request hook, the token check or the authenticate function. Undefined for a call without one. */
  readonly principal: Principal | undefined;
  /** The request. Its payload and its metadata come from the caller, thus a key from them is a claim of the caller. */
  readonly request: ServerRequest<unknown>;
}

/**
 * A part of the key of a limit, as data:
 * - `principal`: the id of the principal of the call.
 * - `route`: the key of the procedure of the call.
 * - `{ claim }`: a claim of the principal, for example `{ claim: "tenant" }`. A string or a number.
 */
export type CallLimitKeyPart = "principal" | "route" | { readonly claim: string };

/**
 * The key of a limit: one part, a list of parts, or a function of the call. A call whose key has
 * no value (a part without a value, or a function that gives undefined) is outside the limit.
 */
export type CallLimitKey = CallLimitKeyPart | readonly CallLimitKeyPart[] | ((call: LimitedCall) => string | undefined);

/** The calls that a limit covers, as data. Each given field must agree. Without a field, the limit covers each call. */
export interface CallLimitCovers {
  /** True: only the calls of a procedure that can change data. False: only the calls of a procedure that changes nothing. */
  readonly writes?: boolean | undefined;
  /** Only the calls of these procedures: an exact key (`notes.set`), a prefix (`collections.*`) or `*`. */
  readonly routes?: readonly string[] | undefined;
}

/**
 * A limit of the calls of a server (CLI-40): a keyed limiter of `@mark1russell7/service/limiter`
 * with a key over the call. The policy, the store and the bound on the keys have no defaults, as
 * in the spec of a keyed limiter (`LimiterSpec`).
 */
export interface CallLimit {
  /** The name of the limiter. It is unique in the service: `svc.limiter()` declares the limiter with this name. */
  readonly name: string;
  /** The key of each call: who or what the limit counts. */
  readonly key: CallLimitKey;
  /**
   * The text of the key in the declaration of the service (`LimiterSpec.key`), for example
   * `tenant`. The default names the parts of the key, or `call` for a function.
   */
  readonly keyName?: string | undefined;
  /** The calls that the limit covers: the fields of `CallLimitCovers`, or a function of the call. Without it, each call. */
  readonly covers?: CallLimitCovers | ((call: LimitedCall) => boolean) | undefined;
  /** The policy: a token bucket or a sliding window. */
  readonly policy: LimitPolicy;
  /**
   * The store of the counts. `{ kind: "local" }`: the memory of this replica. `{ kind: "shared",
   * dependency, onStoreFailure }`: the store of `limitStores` with the name of the dependency.
   */
  readonly store: LimiterStoreSpec;
  /** The bound on the keys that the store holds. */
  readonly evict: LimiterEviction;
}

/** The refusal of a call by one limit. */
export interface CallLimitRefusal {
  /** The name of the limit that refused the call. */
  readonly limit: string;
  readonly refused: Refused;
}

/** The limits of one server, as runtime: one keyed limiter for each limit. */
export interface CallLimiter {
  /** The keyed limiters, in the sequence of the limits. A host declares each one with `svc.limiter(name, spec)`. */
  readonly limiters: readonly KeyedLimiter[];
  /**
   * This method takes one unit of each limit that covers the call, in the sequence of the limits.
   * It gives the first refusal, or undefined. A limit before the refusal keeps its unit.
   */
  admit(call: LimitedCall): Promise<CallLimitRefusal | undefined>;
}

/** The options of `callLimiter()`. */
export interface CallLimiterOptions {
  /** The clock of the local store: give the clock of the server. */
  readonly clock: Clock;
  /** The stores that the replicas share, by the name of their dependency. */
  readonly stores?: Readonly<Record<string, LimiterStore>> | undefined;
}

/** The metadata key of the wait of a refusal, in milliseconds (the same key as `retry-after` of wire v1). */
const RETRY_AFTER = "retry-after";

/** This function tells if a key is a list of parts. */
function isPartList(key: CallLimitKey): key is readonly CallLimitKeyPart[] {
  return Array.isArray(key);
}

/** The value of one part of a key, or undefined. */
function partValue(part: CallLimitKeyPart, call: LimitedCall): string | undefined {
  if (part === "principal") return call.principal?.id;
  if (part === "route") return call.route;
  const value = call.principal?.claims?.[part.claim];
  return typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

/** The text of one part of a key, for the declaration of the service. */
function partName(part: CallLimitKeyPart): string {
  return typeof part === "string" ? part : part.claim;
}

/** This function gives the function of the key of a limit. A list of parts gives the JSON of the values. */
function keyFunction(key: CallLimitKey): (call: LimitedCall) => string | undefined {
  if (typeof key === "function") return key;
  const parts = isPartList(key) ? key : [key];
  if (parts.length === 0) throw new Error("A key of a limit needs one part or more");
  return (call) => {
    const values: string[] = [];
    for (const part of parts) {
      const value = partValue(part, call);
      if (value === undefined) return undefined;
      values.push(value);
    }
    return values.length === 1 ? values[0] : JSON.stringify(values);
  };
}

/** The text of the key of a limit, for the declaration of the service. */
function keyNameOf(limit: CallLimit): string {
  if (limit.keyName !== undefined) return limit.keyName;
  if (typeof limit.key === "function") return "call";
  return (isPartList(limit.key) ? limit.key : [limit.key]).map(partName).join("+");
}

/** This function gives the function that tells if a limit covers a call. */
function coversFunction(covers: CallLimit["covers"]): (call: LimitedCall) => boolean {
  if (covers === undefined) return () => true;
  if (typeof covers === "function") return covers;
  const { writes, routes } = covers;
  const routeRule = routes === undefined ? undefined : exposePatterns(routes);
  return (call) => (writes === undefined || call.writes === writes) && (routeRule === undefined || routeRule(call.path));
}

/** This function gives the store of a limit: the local store, or the shared store of its dependency. */
function storeOf(limit: CallLimit, local: LimiterStore, stores: Readonly<Record<string, LimiterStore>>): LimiterStore {
  const spec = limit.store as LimiterStoreSpec | undefined;
  if (spec === undefined || spec.kind !== "shared") return local;
  const store = Object.prototype.hasOwnProperty.call(stores, spec.dependency) ? stores[spec.dependency] : undefined;
  if (store === undefined) {
    throw new Error(`The limit ${limit.name} keeps its counts in the shared store ${spec.dependency}, and limitStores has no store with that name`);
  }
  return store;
}

/**
 * This function makes the runtime of the limits of a server: one keyed limiter for each limit. The
 * local limits share one memory store on the clock of the options. It refuses two limits with one
 * name, a limit with a problem in its spec, and a shared store that `stores` does not have.
 */
export function callLimiter(limits: readonly CallLimit[], options: CallLimiterOptions): CallLimiter {
  const local = memoryStore(options.clock);
  const stores = options.stores ?? {};
  const names = new Set<string>();
  const entries = limits.map((limit) => {
    if (names.has(limit.name)) throw new Error(`Two limits have the name ${limit.name}: the name of a limit is unique`);
    names.add(limit.name);
    const keyOf = keyFunction(limit.key);
    const covers = coversFunction(limit.covers);
    const limiter = keyedLimiter(limit.name, { key: keyNameOf(limit), policy: limit.policy, store: limit.store, evict: limit.evict }, storeOf(limit, local, stores));
    return { limiter, keyOf, covers };
  });
  return {
    limiters: entries.map((entry) => entry.limiter),
    async admit(call) {
      for (const { limiter, keyOf, covers } of entries) {
        if (!covers(call)) continue;
        const key = keyOf(call);
        if (key === undefined) continue;
        const decision = await limiter.take(key);
        if (!decision.allowed) return { limit: limiter.name, refused: decision };
      }
      return undefined;
    },
  };
}

/** This function gives the facts of a call for the limits: its procedure, its effects, its principal and its request. */
export function limitedCall(procedure: { readonly path: ProcedurePath; readonly metadata?: unknown }, request: ServerRequest<unknown>): LimitedCall {
  const effects = effectsOf(procedure);
  return {
    path: procedure.path,
    route: pathToKey(procedure.path),
    effects,
    writes: !isReadOnly(effects),
    principal: request.principal,
    request,
  };
}

/**
 * This function gives the response of a refused call: `RATE_LIMITED`, retryable, with the wait in
 * `retry-after` (milliseconds) and the cause in `reason`. The failure of a store stays on the server.
 */
export function rateLimitedResponse(id: string, refusal: CallLimitRefusal): ServerResponse<unknown> {
  const { limit, refused } = refusal;
  const waitMs = valueIn(refused.retryAfter, "ms");
  const seconds = retryAfterSeconds(refused.retryAfter);
  return {
    id,
    status: {
      type: "error",
      code: "RATE_LIMITED",
      message: `The limit ${limit} of the host refuses the call (${refused.cause}): retry after ${seconds} s`,
      retryable: true,
    },
    metadata: { [RETRY_AFTER]: waitMs, reason: refused.cause },
  };
}
