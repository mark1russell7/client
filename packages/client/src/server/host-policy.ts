/**
 * The policy of a host: one place that builds what a server lets its callers do (roadmap 2.3).
 *
 * The three hosts (the MCP dev-tools server, the `server` CLI, the warm server of `mark`) each
 * built their own expose rule, call rule, time limit and token. `hostPolicy()` builds them from
 * one set of options, and `procedureServerOptions()` gives them to a `ProcedureServer`.
 *
 * - `expose`: the procedures that callers reach. Patterns: an exact key (`git.status`), a prefix
 *   (`git.*`) or `*`. A tool surface: namespaces and the keys to leave out. Without it: every
 *   procedure.
 * - `strictCalls`: a procedure of code that declares no `metadata.calls` calls only exposed
 *   procedures (a host for an outside caller sets it).
 * - `timeout`: the time limit of each call from a caller (not of its nested calls).
 * - `token`, `browser`: the checks of the network transports (`client-server` applies them).
 * - `principalOf`: the request hook. It reads the credentials of a network request (a cookie, a
 *   header, the query) and gives a bearer token, a principal and a narrowing.
 * - `capability`, `readOnly`, `clearanceOrder`, `resources`, `admitItem`: the capability of each
 *   call and what the host gives for it (CAPABILITIES-2026-10).
 * - `events`: the remote events of the host (`documentation/EVENTS.md`). The server pins
 *   `events.subscribe` with this topic rule, and its procedures get the bus as `ctx.bus`.
 * - `limits`, `limitStores`: the limits of the calls (CLI-40). Each server of the policy makes one
 *   keyed limiter for each limit, and refuses a call above a limit with `RATE_LIMITED`.
 */

import { pathToKey, type Capability, type ClearanceOrder, type ProcedurePath, type ResourcesOf } from "../procedures/types.js";
import type { AdmitItem, Interceptor, Invocation } from "../procedures/invoke.js";
import { narrowCapability } from "../procedures/capability.js";
import type { PrincipalOf, ServerRequest } from "./types.js";
import { timeoutInterceptor } from "../procedures/interceptors.js";
import type { BrowserGuardOptions } from "./browser-guard.js";
import type { ProcedureRegistry } from "../procedures/registry.js";
import type { ProcedureServerOptions } from "./procedure-server.js";
import type { EventPublisherOptions } from "../events/publisher.js";
import { toMs, type Duration } from "../duration.js";
import type { LimiterStore } from "@mark1russell7/service/limiter";
import type { CallLimit } from "./limits.js";

/** The procedures of a host that are tools: namespaces (first path segments), less some keys. */
export interface ToolSurface {
  namespaces: readonly string[];
  exclude?: readonly string[] | undefined;
}

/** The rule of a list of patterns: an exact key (`git.status`), a prefix (`git.*`) or `*`. */
export function exposePatterns(patterns: readonly string[]): (path: ProcedurePath) => boolean {
  const exact = new Set<string>();
  const prefixes: string[] = [];
  let all = false;
  for (const pattern of patterns) {
    if (pattern === "*") all = true;
    else if (pattern.endsWith(".*")) prefixes.push(pattern.slice(0, -1));
    else exact.add(pattern);
  }
  return (path) => {
    if (all) return true;
    // The key encodes a dot in a segment (roadmap CLI-75), as the method name does
    const key = pathToKey(path);
    return exact.has(key) || prefixes.some((prefix) => key.startsWith(prefix));
  };
}

/** The rule of a tool surface: the namespaces, less the excluded keys. */
export function surfaceRule(surface: ToolSurface): (path: ProcedurePath) => boolean {
  const namespaces = new Set(surface.namespaces);
  const excluded = new Set(surface.exclude ?? []);
  return (path) => namespaces.has(path[0] ?? "") && !excluded.has(pathToKey(path));
}

/** The options of `hostPolicy()`. */
export interface HostPolicyOptions {
  /** The procedures that callers reach. Without it: every procedure of the registry. */
  expose?: readonly string[] | ToolSurface | ((path: ProcedurePath) => boolean) | undefined;
  /** Keys that callers do not reach, also when `expose` matches them. */
  exclude?: readonly string[] | undefined;
  /** A procedure of code with no `metadata.calls` calls only exposed procedures. */
  strictCalls?: boolean | undefined;
  /** The time limit of each call from a caller, for example `minutes(10)`. 0 or no value: no limit. */
  timeout?: Duration | undefined;
  /** More interceptors, after the policy's own (tracing, metrics). */
  interceptors?: readonly Interceptor[] | undefined;
  /** The token that each network request must send (HTTP and WebSocket transports). */
  token?: string | undefined;
  /**
   * The request hook: it reads the credentials of each network request (a cookie, a header, the
   * query) and gives a bearer token, a principal and a narrowing (`ProcedureServerOptions`).
   */
  principalOf?: PrincipalOf | undefined;
  /** The browser checks of the network transports (`allowedOrigins`, `allowedHosts`, `allowGet`). */
  browser?: BrowserGuardOptions | undefined;
  /**
   * The capability of each call from a caller: one value, or a function of the request. The
   * function reads only what the transport authenticated (the token, a session), not a claim of
   * the caller. Without it: no limits.
   */
  capability?: Capability | ((request: ServerRequest<unknown>) => Capability | undefined) | undefined;
  /** True: the callers start only the procedures that change nothing (`effects.writes` is empty). */
  readOnly?: boolean | undefined;
  /** The order of the clearance values. */
  clearanceOrder?: ClearanceOrder | undefined;
  /** The resources of each invocation for its capability (`ctx.resources`). */
  resources?: ((invocation: Invocation) => ResourcesOf) | undefined;
  /** The filter of the output that leaves the host. */
  admitItem?: AdmitItem | undefined;
  /**
   * The remote events of the host (`documentation/EVENTS.md`): the topic rule, with an optional
   * bus, `allow` function and buffer. The default bus is the global bus, which is also the default
   * `ctx.bus`. Without this option, the host does not serve `events.subscribe`.
   */
  events?: EventPublisherOptions | undefined;
  /**
   * The limits of the calls (CLI-40): each limit counts the calls of one key, for example the
   * writes of each tenant. A refusal is `RATE_LIMITED` on each face. Without it: no limits.
   * Each limit that covers a call takes one unit, in the sequence of the limits. A limit before a
   * refusal keeps its unit: the server does not give it back.
   */
  limits?: readonly CallLimit[] | undefined;
  /** The stores that the replicas share, by the name of their dependency, for the limits with a shared store. */
  limitStores?: Readonly<Record<string, LimiterStore>> | undefined;
}

/** What a host lets its callers do. */
export interface HostPolicy {
  readonly expose: ((path: ProcedurePath) => boolean) | undefined;
  readonly strictCalls: boolean;
  readonly interceptors: readonly Interceptor[];
  readonly token: string | undefined;
  /** The request hook of the network requests, or undefined for none. */
  readonly principalOf?: PrincipalOf | undefined;
  readonly browser: BrowserGuardOptions;
  /** The capability of a call from a caller, or undefined for no limits. */
  readonly capabilityOf: ((request?: ServerRequest<unknown>) => Capability | undefined) | undefined;
  readonly clearanceOrder: ClearanceOrder | undefined;
  readonly resources: ((invocation: Invocation) => ResourcesOf) | undefined;
  readonly admitItem: AdmitItem | undefined;
  /** The remote events: each server of the policy makes its own publisher from these options. */
  readonly events: EventPublisherOptions | undefined;
  /** The limits of the calls (CLI-40). Each server of the policy makes its own keyed limiters from them. */
  readonly limits?: readonly CallLimit[] | undefined;
  /** The shared stores of the limits, by the name of their dependency. */
  readonly limitStores?: Readonly<Record<string, LimiterStore>> | undefined;
}

/** The capability function of a policy: the capability of the options, narrowed by `readOnly`. */
function capabilityOfOptions(options: HostPolicyOptions): HostPolicy["capabilityOf"] {
  const { capability, readOnly } = options;
  if (capability === undefined && !readOnly) return undefined;
  const readOnlyRequest = readOnly ? { effects: { writes: [] as readonly string[] } } : undefined;
  return (request) => {
    const base = typeof capability === "function" ? (request ? capability(request) : undefined) : capability;
    return readOnlyRequest ? narrowCapability(base, readOnlyRequest, options.clearanceOrder) : base;
  };
}

function exposeOf(options: HostPolicyOptions): ((path: ProcedurePath) => boolean) | undefined {
  const { expose } = options;
  const rule =
    expose === undefined
      ? undefined
      : typeof expose === "function"
        ? expose
        : Array.isArray(expose)
          ? exposePatterns(expose as readonly string[])
          : surfaceRule(expose as ToolSurface);
  const excluded = new Set(options.exclude ?? []);
  if (excluded.size === 0) return rule;
  return (path) => !excluded.has(pathToKey(path)) && (rule ? rule(path) : true);
}

/** This function builds the policy of a host from its options. */
export function hostPolicy(options: HostPolicyOptions = {}): HostPolicy {
  const interceptors: Interceptor[] = [];
  if (options.timeout !== undefined && toMs(options.timeout, "timeout") > 0) {
    interceptors.push(timeoutInterceptor({ limit: options.timeout }));
  }
  interceptors.push(...(options.interceptors ?? []));
  return {
    expose: exposeOf(options),
    strictCalls: options.strictCalls ?? false,
    interceptors,
    token: options.token,
    ...(options.principalOf ? { principalOf: options.principalOf } : {}),
    browser: options.browser ?? {},
    capabilityOf: capabilityOfOptions(options),
    clearanceOrder: options.clearanceOrder,
    resources: options.resources,
    admitItem: options.admitItem,
    events: options.events,
    ...(options.limits && options.limits.length > 0 ? { limits: options.limits } : {}),
    ...(options.limitStores ? { limitStores: options.limitStores } : {}),
  };
}

/** The options of a `ProcedureServer` that serves a registry under a policy. */
export function procedureServerOptions(policy: HostPolicy, registry?: ProcedureRegistry): ProcedureServerOptions {
  return {
    autoRegister: true,
    ...(registry ? { registry } : {}),
    ...(policy.expose ? { expose: policy.expose } : {}),
    strictCalls: policy.strictCalls,
    // The token of the policy: ProcedureServer examines it for each network request (R18)
    ...(policy.token !== undefined ? { token: policy.token } : {}),
    // The request hook of the policy: the credentials of a cookie, a header or the query (CLI-2a)
    ...(policy.principalOf ? { principalOf: policy.principalOf } : {}),
    ...(policy.interceptors.length > 0 ? { interceptors: policy.interceptors } : {}),
    ...(policy.capabilityOf ? { capability: policy.capabilityOf } : {}),
    ...(policy.clearanceOrder ? { clearanceOrder: policy.clearanceOrder } : {}),
    ...(policy.resources ? { resources: policy.resources } : {}),
    ...(policy.admitItem ? { admitItem: policy.admitItem } : {}),
    // The remote events: the server makes its publisher and pins events.subscribe (EVENTS.md)
    ...(policy.events ? { events: policy.events } : {}),
    // The limits of the calls: the server makes one keyed limiter for each one (CLI-40)
    ...(policy.limits ? { limits: policy.limits } : {}),
    ...(policy.limitStores ? { limitStores: policy.limitStores } : {}),
  };
}
