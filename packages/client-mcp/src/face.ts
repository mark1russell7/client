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
 * - The types are structural: this package does not depend on `@procedures/peer`.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostPolicy, ProcedureRegistry, RequestHandler } from "@procedures/client";
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

/**
 * This function gives the MCP face of a procedures host. The host calls the factory one time.
 *
 * @example
 * ```typescript
 * const host = createProcedureHost({ registry, policy, faces: { http: true, mcp: mcpFace({ serverInfo }) }, listen });
 * ```
 */
export function mcpFace(options: McpFaceOptions = {}): (context: McpFaceContext) => McpFace {
  return (context) => {
    const { path: givenPath, token: givenToken, allowedOrigins: givenOrigins, ...common } = options;
    const path = givenPath ?? "/mcp";
    const token = givenToken ?? context.policy.token;
    const policyOrigins = context.policy.browser.allowedOrigins;
    const allowedOrigins = givenOrigins ?? (Array.isArray(policyOrigins) ? [...policyOrigins] : undefined);
    const toolFilter: McpToolFilter = { ...common.toolFilter, ...(context.policy.expose ? { include: context.policy.expose } : {}) };
    const transport = new McpServerTransport(context.handler, {
      ...common,
      registry: context.registry,
      toolFilter,
      transport: "http",
      httpOptions: {
        mount: true,
        path,
        ...(token !== undefined ? { token } : {}),
        ...(allowedOrigins ? { allowedOrigins } : {}),
        ...(context.handler.ambientCredentials ? { ambientCredentials: context.handler.ambientCredentials } : {}),
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
