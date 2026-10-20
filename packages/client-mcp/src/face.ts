/**
 * The MCP face of a procedures host (CLI-7): Streamable HTTP at a path of a listener of the host.
 *
 * `mcpFace(options)` gives a face factory for `createProcedureHost({ faces: { mcp: mcpFace() } })`
 * of `@procedures/peer`. The face mounts on the mount list of the listener, so the MCP endpoint
 * shares the port of the other faces. Each tool call goes through the handler of the face, thus
 * through the request tracking of the service of the host.
 *
 * - The tools are the procedures of the registry of the host that its policy exposes.
 * - Without a token of its own, the face takes the token of the policy. Without origins of its
 *   own, it takes the permitted origins of the policy.
 * - With `narrowing`, each call of the face has a narrower capability (CLI-43). Refer to
 *   `McpFaceOptions.narrowing`.
 * - The types are structural: this package does not depend on `@procedures/peer`.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  NARROWING_METADATA_KEY,
  addNarrowing,
  capabilityRefusal,
  narrowWithin,
  narrowingOf,
  type CapabilityRequest,
  type HostPolicy,
  type ProcedurePath,
  type ProcedureRegistry,
  type RequestHandler,
} from "@procedures/client";
import type { McpToolFilter } from "@procedures/mcp";
import { McpServerTransport } from "./transport/mcp-transport.js";
import type { McpServerTransportOptions } from "./types.js";

/** The options of `mcpFace()`: the options of an MCP transport, with the path of its endpoint. */
export interface McpFaceOptions extends Omit<McpServerTransportOptions, "transport" | "httpOptions" | "sdkTransport" | "stdio" | "sseOptions" | "registry"> {
  /** The path of the endpoint. The default is `/mcp`. */
  readonly path?: string | undefined;
  /** The token that each request sends as `Authorization: Bearer <token>`. The default is the token of the policy. */
  readonly token?: string | undefined;
  /** The browser origins that can call the endpoint, besides loopback origins. The default is the list of the policy. */
  readonly allowedOrigins?: string[] | undefined;
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
 * This function reads the narrowing of a face with the decoder and the meet of the wire (CLI-30).
 * It throws for a part that is not valid, because each call of the face then gets a refusal. The
 * capability of the tool list is the meet of the policy capability and the narrowing, without the
 * time: the time limits each call, not the tools.
 */
function faceNarrowing(narrowing: NonNullable<McpFaceOptions["narrowing"]>, context: McpFaceContext): FaceNarrowing {
  const wire = narrowingOf(narrowing);
  // The sources as the decoder read them, frozen: a change of the options or of the metadata of a call does not change them
  const sources = Object.freeze(wire.narrowings.map((source) => Object.freeze({ ...source })));
  const untimed = sources.map((source): CapabilityRequest<unknown> => ({
    ...(source.clearance !== undefined ? { clearance: source.clearance } : {}),
    ...(source.effects !== undefined ? { effects: source.effects } : {}),
  }));
  const listed = narrowWithin(context.policy.capabilityOf?.(), untimed, context.policy.clearanceOrder);
  const refusal = [...wire.notes, ...listed.notes].find((note) => note.kind === "refused");
  if (refusal) throw new Error(`The narrowing of the MCP face is not valid: ${refusal.message}`);
  const { capability } = listed;
  const { handler: inner, registry } = context;
  return {
    handler: {
      handle: (request) =>
        inner.handle({ ...request, metadata: { ...request.metadata, [NARROWING_METADATA_KEY]: addNarrowing(request.metadata[NARROWING_METADATA_KEY], sources) } }),
      ...(inner.ambientCredentials ? { ambientCredentials: inner.ambientCredentials } : {}),
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
    const token = givenToken ?? context.policy.token;
    const policyOrigins = context.policy.browser.allowedOrigins;
    const allowedOrigins = givenOrigins ?? (Array.isArray(policyOrigins) ? [...policyOrigins] : undefined);
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
        ...(token !== undefined ? { token } : {}),
        ...(allowedOrigins ? { allowedOrigins } : {}),
        ...(allowedHosts !== undefined ? { allowedHosts } : {}),
        ...(maxSessions !== undefined ? { maxSessions } : {}),
        ...(maxBodyBytes !== undefined ? { maxBodyBytes } : {}),
        ...(handler.ambientCredentials ? { ambientCredentials: handler.ambientCredentials } : {}),
      },
    });
    return {
      handler: (req, res) => transport.handleHttp(req, res),
      // The tool calls go through the request tracking of the host: the face counts no work of its own.
      // An open stream of a session ends at the close of the face.
      parts: {
        start: () => transport.start(),
        stopIntake: () => undefined,
        drain: async () => undefined,
        inFlight: () => 0,
        close: () => transport.stop(),
      },
      endpoint: { type: "mcp", scheme: "http", path },
      transport,
    };
  };
}
