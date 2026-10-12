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
 * - `timeoutMs`: the time limit of each call from a caller (not of its nested calls).
 * - `token`, `browser`: the checks of the network transports (`client-server` applies them).
 */

import type { ProcedurePath } from "../procedures/types.js";
import type { Interceptor } from "../procedures/invoke.js";
import { timeoutInterceptor } from "../procedures/interceptors.js";
import type { BrowserGuardOptions } from "./browser-guard.js";
import type { ProcedureRegistry } from "../procedures/registry.js";
import type { ProcedureServerOptions } from "./procedure-server.js";

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
    const key = path.join(".");
    return exact.has(key) || prefixes.some((prefix) => key.startsWith(prefix));
  };
}

/** The rule of a tool surface: the namespaces, less the excluded keys. */
export function surfaceRule(surface: ToolSurface): (path: ProcedurePath) => boolean {
  const namespaces = new Set(surface.namespaces);
  const excluded = new Set(surface.exclude ?? []);
  return (path) => namespaces.has(path[0] ?? "") && !excluded.has(path.join("."));
}

/** The options of `hostPolicy()`. */
export interface HostPolicyOptions {
  /** The procedures that callers reach. Without it: every procedure of the registry. */
  expose?: readonly string[] | ToolSurface | ((path: ProcedurePath) => boolean) | undefined;
  /** Keys that callers do not reach, also when `expose` matches them. */
  exclude?: readonly string[] | undefined;
  /** A procedure of code with no `metadata.calls` calls only exposed procedures. */
  strictCalls?: boolean | undefined;
  /** The time limit of each call from a caller, in milliseconds. 0 or no value: no limit. */
  timeoutMs?: number | undefined;
  /** More interceptors, after the policy's own (tracing, metrics). */
  interceptors?: readonly Interceptor[] | undefined;
  /** The token that each network request must send (HTTP and WebSocket transports). */
  token?: string | undefined;
  /** The browser checks of the network transports (`allowedOrigins`, `allowedHosts`, `allowGet`). */
  browser?: BrowserGuardOptions | undefined;
}

/** What a host lets its callers do. */
export interface HostPolicy {
  readonly expose: ((path: ProcedurePath) => boolean) | undefined;
  readonly strictCalls: boolean;
  readonly interceptors: readonly Interceptor[];
  readonly token: string | undefined;
  readonly browser: BrowserGuardOptions;
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
  return (path) => !excluded.has(path.join(".")) && (rule ? rule(path) : true);
}

/** This function builds the policy of a host from its options. */
export function hostPolicy(options: HostPolicyOptions = {}): HostPolicy {
  const interceptors: Interceptor[] = [];
  if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
    interceptors.push(timeoutInterceptor({ ms: options.timeoutMs }));
  }
  interceptors.push(...(options.interceptors ?? []));
  return {
    expose: exposeOf(options),
    strictCalls: options.strictCalls ?? false,
    interceptors,
    token: options.token,
    browser: options.browser ?? {},
  };
}

/** The options of a `ProcedureServer` that serves a registry under a policy. */
export function procedureServerOptions(policy: HostPolicy, registry?: ProcedureRegistry): ProcedureServerOptions {
  return {
    autoRegister: true,
    ...(registry ? { registry } : {}),
    ...(policy.expose ? { expose: policy.expose } : {}),
    strictCalls: policy.strictCalls,
    ...(policy.interceptors.length > 0 ? { interceptors: policy.interceptors } : {}),
  };
}
