/**
 * The MCP face of a procedures host (CLI-7): Streamable HTTP at a path of a listener of the host.
 *
 * `mcpFace(options)` gives a face factory for `createProcedureHost({ faces: { mcp: mcpFace() } })`
 * of `@procedures/peer`. The face mounts on the mount list of the listener, so the MCP endpoint
 * shares the port of the other faces. Each tool call goes through the handler of the face, thus
 * through the request tracking of the service of the host.
 *
 * - The tools are the procedures of the registry of the host that its policy exposes.
 * - Each request has one browser check and one admission (CLI-2b). The browser check uses the
 *   origins and the hosts of the face, else the browser checks of the policy. The admission is
 *   the admission of the server of the host: its request hook, its token check and its
 *   authenticate function. The face has no token check of its own.
 * - With `narrowing`, each call of the face has a narrower capability (CLI-43). Refer to
 *   `McpFaceOptions.narrowing`.
 * - The stop of the intake ends the GET stream of each session without a task in progress
 *   (CLI-72). Then a new session and a new GET stream get 503. A call in progress completes.
 * - The face stays on the listener through the drain (CLI-74): its handler has `until` of a
 *   `RequestHandler` of the service, `close transports`. Thus a call in progress gets the answer of
 *   an elicitation and its cancel. A new tool call gets `UNAVAILABLE` from the server.
 * - The types are structural: this package does not depend on `@procedures/peer`.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  capabilityRefusal,
  faceRules,
  type BrowserGuardOptions,
  type CapabilityRequest,
  type HostPolicy,
  type ProcedurePath,
  type ProcedureRegistry,
  type RequestHandler,
} from "@procedures/client";
import type { McpToolFilter } from "@procedures/mcp";
import { throughTheDrain } from "./transport/http.js";
import { McpServerTransport, httpEndpointOf } from "./transport/mcp-transport.js";
import type { McpServerTransportOptions } from "./types.js";

/** The options of `mcpFace()`: the options of an MCP transport, with the path of its endpoint. */
export interface McpFaceOptions extends Omit<McpServerTransportOptions, "transport" | "httpOptions" | "sdkTransport" | "stdio" | "sseOptions" | "registry"> {
  /** The path of the endpoint. The default is `/mcp`. */
  readonly path?: string | undefined;
  /**
   * The token of the policy. The server of the host checks the token of each request (CLI-2b),
   * so the face has no token of its own. Another token than the token of the policy throws an
   * error.
   * @deprecated Give the token only in the policy: `hostPolicy({ token })`.
   */
  readonly token?: string | undefined;
  /**
   * The browser origins that can call the endpoint, besides its own origin: a list, `"*"` or a
   * function. The default is `browser.allowedOrigins` of the policy.
   */
  readonly allowedOrigins?: BrowserGuardOptions["allowedOrigins"];
  /** The host names that a request on a loopback address can name. The default is `browser.allowedHosts` of the policy. */
  readonly allowedHosts?: readonly string[] | "*" | undefined;
  /** The most sessions at one time (CLI-35). The default is 256 (CLI-51). `Infinity` turns the limit off. */
  readonly maxSessions?: number | undefined;
  /** The largest body of a request, in bytes (CLI-35). The default is 4 MiB. */
  readonly maxBodyBytes?: number | undefined;
  /**
   * A narrower capability for each call of the face (CLI-43), for example the read-only mode
   * `{ effects: { writes: [] } }`. The face adds it as one more source of the narrowing key
   * (`procedure-narrowing`, CLI-30). Thus the server applies the meet of all the sources: the
   * capability of the policy, the request hook and the key of the caller. A narrowing can only
   * narrow. The face lists only the tools that the narrowed capability permits. A narrowing that
   * is not valid stops the factory with an error. Without it, the face does not narrow.
   */
  readonly narrowing?: CapabilityRequest<unknown> | readonly CapabilityRequest<unknown>[] | undefined;
}

/** What the MCP face needs of its host: the handler of its calls, the registry and the policy. */
export interface McpFaceContext {
  readonly handler: RequestHandler;
  readonly registry: ProcedureRegistry;
  readonly policy: HostPolicy;
}

/** The MCP face: its request handler, its stop parts, its endpoint and its transport. */
export interface McpFace {
  /**
   * The request handler of the face. It has `until` of a `RequestHandler` of the service: `close
   * transports` (CLI-74). Thus a listener of the service keeps the face through the drain.
   */
  readonly handler: (req: IncomingMessage, res: ServerResponse) => boolean;
  readonly parts: {
    start(): Promise<void>;
    stopIntake(): void;
    drain(): Promise<void>;
    inFlight(): number;
    close(): Promise<void>;
  };
  readonly endpoint: { readonly type: string; readonly scheme: "http"; readonly path: string };
  readonly transport: McpServerTransport;
}

/** The narrowing of a face: the handler that adds it to each call, and the rule of the tools that it permits. */
interface FaceNarrowing {
  readonly handler: RequestHandler;
  readonly permits: (path: ProcedurePath) => boolean;
}

/**
 * This function reads the narrowing of a face with `faceRules()` of `@procedures/client`. The HTTP
 * and WebSocket faces use the same helper. It throws for a part that is not valid, because each
 * call of the face then gets a refusal. The capability of the tool list is the meet of the policy
 * capability and the narrowing, without the time. The time limits each call, not the tools.
 */
function faceNarrowing(narrowing: NonNullable<McpFaceOptions["narrowing"]>, context: McpFaceContext): FaceNarrowing {
  const rules = faceRules({ narrowing }, context.policy, "MCP");
  const { capability } = rules;
  const { handler: inner, registry } = context;
  return {
    handler: {
      handle: (request) => inner.handle(rules.apply(request)),
      ...(inner.ambientCredentials ? { ambientCredentials: inner.ambientCredentials } : {}),
      // The principal before a call (CLI-69): the narrowing does not change it
      ...(inner.identify ? { identify: inner.identify.bind(inner) } : {}),
      // The one admission of each request (CLI-2b): the narrowing does not change it
      ...(inner.admission ? { admission: inner.admission.bind(inner) } : {}),
    },
    permits: (path) => {
      const procedure = registry.get(path);
      return procedure !== undefined && capabilityRefusal(procedure, capability) === undefined;
    },
  };
}

/**
 * This function gives the MCP face of a procedures host. The host calls the factory one time.
 *
 * @example
 * ```typescript
 * const host = createProcedureHost({ registry, policy, faces: { http: true, mcp: mcpFace({ serverInfo }) }, listen });
 * // A read-only MCP face next to the HTTP face of the same server
 * const readOnly = mcpFace({ serverInfo, narrowing: { effects: { writes: [] } } });
 * ```
 */
export function mcpFace(options: McpFaceOptions = {}): (context: McpFaceContext) => McpFace {
  return (context) => {
    const { path: givenPath, token: givenToken, allowedOrigins: givenOrigins, allowedHosts: givenHosts, maxSessions, maxBodyBytes, narrowing: givenNarrowing, ...common } = options;
    const path = givenPath ?? "/mcp";
    // The server of the host checks the one token of the policy (CLI-2b): the face has no token of its own
    if (givenToken !== undefined && givenToken !== context.policy.token) {
      throw new Error("The MCP face has the token of the host policy (CLI-2b): give the token only in the policy, hostPolicy({ token })");
    }
    // Each request gets one admission by the server. A policy that checks credentials needs it, so
    // no request reaches the tools without a check (for example the handler of an older host)
    if ((context.policy.token !== undefined || context.policy.principalOf !== undefined) && !context.handler.admission) {
      throw new Error("The MCP face needs admission() of its handler (CLI-2b), because the policy checks the credentials of each request. Give the handler of the host, or a handler with admission().");
    }
    // The browser checks of the policy, as on the other faces. The options of the face win over them.
    const allowedOrigins = givenOrigins ?? context.policy.browser.allowedOrigins;
    const allowedHosts = givenHosts ?? context.policy.browser.allowedHosts;
    const narrowed = givenNarrowing !== undefined ? faceNarrowing(givenNarrowing, context) : undefined;
    const toolFilter: McpToolFilter = { ...common.toolFilter, ...(context.policy.expose ? { include: context.policy.expose } : {}) };
    if (narrowed) {
      const included = toolFilter.include;
      toolFilter.include = included ? (tool) => included(tool) && narrowed.permits(tool) : narrowed.permits;
    }
    const handler = narrowed?.handler ?? context.handler;
    const transport = new McpServerTransport(handler, {
      ...common,
      registry: context.registry,
      toolFilter,
      transport: "http",
      httpOptions: {
        path,
        ...(allowedOrigins !== undefined ? { allowedOrigins } : {}),
        ...(allowedHosts !== undefined ? { allowedHosts } : {}),
        ...(maxSessions !== undefined ? { maxSessions } : {}),
        ...(maxBodyBytes !== undefined ? { maxBodyBytes } : {}),
        ...(handler.ambientCredentials ? { ambientCredentials: handler.ambientCredentials } : {}),
      },
    });
    return {
      // The face stays on the listener through the drain, so a call in progress gets the answer of
      // an elicitation and its cancel (CLI-74). Before, the listener closed at the stop of the intake,
      // and each request got its plain 503. The endpoint refuses new work itself.
      handler: throughTheDrain((req: IncomingMessage, res: ServerResponse) => transport.handleHttp(req, res)),
      // The tool calls go through the request tracking of the host: the face counts no work of its own.
      // The stop of the intake ends the GET stream of each session without a task in progress, so the
      // drain of the listener waits only for the calls and the tasks (CLI-72). Before, each GET stream
      // stayed open until the close of the face, and each stop waited for the full cap of the drain.
      parts: {
        start: async () => {
          await transport.start();
          // A start after the stop of the intake accepts new sessions again
          httpEndpointOf(transport)?.startIntake();
        },
        stopIntake: () => httpEndpointOf(transport)?.stopIntake(),
        drain: async () => undefined,
        inFlight: () => 0,
        close: () => transport.stop(),
      },
      endpoint: { type: "mcp", scheme: "http", path },
      transport,
    };
  };
}
