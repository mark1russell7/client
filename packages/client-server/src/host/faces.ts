/**
 * The faces of the procedures host (CLI-7): HTTP, WebSocket, MCP and each face that a package adds.
 *
 * A face is a factory. The host gives it the handler of its calls, the server, the registry and
 * the policy. The face gives what it mounts on a listener and its stop parts:
 *
 * - `handler`: a request handler for the mount list of a listener. The first match wins. Its property
 *   `until` sets the stage at which its mount stops (CLI-74).
 * - `upgrade`: an upgrade handler and the path that it takes.
 * - `parts`: a transport of the service, for a face that holds work outside its requests (the
 *   connections of WebSocket).
 * - `endpoint`: the scheme and the path of the face, for `host.info`.
 *
 * `httpFace()` and `wsFace()` are the faces of this package, on `procedureHandler` and
 * `upgradeHandler` of `@procedures/client/node`. `mcpFace()` of `@procedures/mcp-server` is the
 * MCP face, and `betterAuthFace()` of `@procedures/better-auth` is the face of the auth routes. A
 * face of another package has the same shape, so the host needs no change for it. A face of
 * requests that are not procedure calls tracks them with `track` (CLI-54).
 */

import type { IncomingMessage, ServerResponse as NodeResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { TransportImpl } from "@mark1russell7/service";
import { Client, realClock, requestCredentials, type BrowserGuardOptions, type Clock, type HostPolicy, type Logger, type ProcedureRegistry, type ProcedureServer } from "@procedures/client";
import { procedureHandler, upgradeHandler, type ProcedureHandlerOptions, type UpgradeHandlerOptions } from "@procedures/client/node";
import type { FaceHandler, HttpTracker } from "./tracking.js";

/** What the host gives a face. */
export interface HostFaceContext {
  /** The name of the face in the host: the first part of the route of each call. */
  readonly name: string;
  /** The handler of the calls of the face: each call goes through the request tracking of the service. */
  readonly handler: FaceHandler;
  readonly server: ProcedureServer;
  readonly registry: ProcedureRegistry;
  readonly policy: HostPolicy;
  /** The clock of the host: the clock of the lifecycle. */
  readonly clock: Clock;
  /**
   * The request tracking of the HTTP requests of the face that are not procedure calls, for example
   * the auth routes (CLI-54). Each request goes through `life.request` on the route `<face> <key>`
   * of the controller of the host. The host always gives it.
   */
  readonly track?: HttpTracker | undefined;
  /**
   * The logger of the host (CLI-87), also on `handler.logger`. A face writes its log lines to it,
   * for example with `writeLog()` of `@procedures/client`. Absent: the face writes to the console as before.
   */
  readonly logger?: Logger | undefined;
}

/** The upgrade handler of a face, and the path or the function that tells which upgrades it takes. */
export interface HostFaceUpgrade {
  readonly match: string | ((req: IncomingMessage) => boolean);
  readonly handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => unknown;
}

/** The scheme and the path of a face on a listener, for `host.info`. */
export interface HostFaceEndpoint {
  /** The type of the endpoint in `host.info`: `http`, `websocket`, `mcp` or another name. */
  readonly type: string;
  readonly scheme: "http" | "ws";
  readonly path: string;
}

/** What a face gives the host. */
export interface HostFace {
  /**
   * The request handler of the face. It gives true when it takes a request, and false for another request.
   * The property `until` of the handler, as on a `RequestHandler` of `@mark1russell7/service/http`,
   * sets the stage at which its mount stops (CLI-74). The default is `stop intake`. The MCP face has
   * `close transports`, so its calls in progress get the answers of their elicitations and their cancels.
   */
  readonly handler?: ((req: IncomingMessage, res: NodeResponse) => boolean) | undefined;
  /** The upgrade handler of the face. The property `until` of its handler sets the stage of its mount, as for `handler`. */
  readonly upgrade?: HostFaceUpgrade | undefined;
  /** The stop parts of the face: a transport of the service, with the name `<host>.<face>`. */
  readonly parts?: TransportImpl | undefined;
  readonly endpoint?: HostFaceEndpoint | undefined;
  /** The ids of the connections of the face, for a face of connections (WebSocket). */
  readonly connections?: (() => string[]) | undefined;
  /** A client of one connection: its calls go to the procedures that the connected client serves. */
  readonly clientFor?: ((connectionId: string) => Client | undefined) | undefined;
}

/** A face factory: the host calls it one time, with the context of the face. */
export type HostFaceFactory = (context: HostFaceContext) => HostFace;

/** The longest delay of a Node timer. A wait with this delay ends at its event, or at the close of its face. */
const UNTIL_CLOSE_MS = 2_147_483_647;

/** The browser checks of the policy, as options of a face. The options of the face win over them. */
function browserOptions(browser: BrowserGuardOptions, http: boolean): BrowserGuardOptions {
  return {
    ...(browser.allowedOrigins !== undefined ? { allowedOrigins: browser.allowedOrigins } : {}),
    ...(browser.allowedHosts !== undefined ? { allowedHosts: browser.allowedHosts } : {}),
    ...(http && browser.allowGet !== undefined ? { allowGet: browser.allowGet } : {}),
  };
}

/**
 * This function gives the HTTP face: `procedureHandler` of `@procedures/client/node`, under
 * `options.basePath` (default `/api`). The browser checks of the policy apply, and the options win over them.
 */
export function httpFace(options: ProcedureHandlerOptions = {}): HostFaceFactory {
  return (context) => {
    const handler = procedureHandler(context.handler, { clock: context.clock, ...browserOptions(context.policy.browser, true), ...options });
    return {
      handler: (req, res) => handler(req, res),
      endpoint: { type: "http", scheme: "http", path: handler.basePath },
    };
  };
}

/**
 * This function gives the WebSocket face: `upgradeHandler` of `@procedures/client/node`, at
 * `options.path` (default `/ws`).
 *
 * - The upgrade: a failed browser check gets 403. A connection that the server does not admit
 *   gets 401: the token check and the request hook of each call run on the credentials of the
 *   upgrade (`ProcedureServer.admits`). Thus no idle connection without credentials stays open.
 * - The credentials of the upgrade and of each call over it have the connection of the socket
 *   (`credentials.connection`, CLI-71). A request hook can find the TCP peer with it.
 * - The stop parts refuse new calls at the stop of the intake. In the drain, each connection
 *   closes when its calls end, so the drain of the listener does not wait for an idle connection.
 * - After the cooperative abort, the connections stay open until each cut call ends in-band with
 *   `UNAVAILABLE` (CLI-48). Before, the connections closed at the abort, and a cut stream lost its end.
 */
export function wsFace(options: UpgradeHandlerOptions = {}): HostFaceFactory {
  return (context) => {
    const { server } = context;
    // The credentials of the upgrade have the connection of its socket (CLI-71), as each call over it
    const admits = (req: IncomingMessage): Promise<boolean> =>
      server.admits(requestCredentials({ headers: req.headers as Record<string, unknown>, url: req.url, socket: req.socket }, { tokenQuery: "token" }));
    const upgrade = upgradeHandler(context.handler, { ...browserOptions(context.policy.browser, false), authenticate: admits, ...options });
    const transport = upgrade.transport;
    return {
      upgrade: { match: upgrade.path, handler: upgrade },
      parts: {
        start: () => upgrade.start(),
        stopIntake: () => upgrade.stopIntake(),
        drain: async (deadline, signal) => {
          await upgrade.drain(deadline, signal);
          if (signal?.aborted) {
            // After the cooperative abort, the service cuts each call, at the latest at the deadline,
            // and each cut call ends in-band. The connections stay open until those calls end
            // (CLI-48). This wait has no timer of its own: the cap of the phase limits it.
            await upgrade.drain(realClock.now() + UNTIL_CLOSE_MS);
            // The close starts here. The stage "close transports" waits for the close handshakes,
            // so a cut at the deadline does not make the drain late.
            upgrade.close().catch(() => undefined);
            return;
          }
          // The calls ended: the connections end in their protocol
          await upgrade.close();
        },
        inFlight: () => upgrade.inFlight(),
        close: () => upgrade.close(),
      },
      endpoint: { type: "websocket", scheme: "ws", path: upgrade.path },
      connections: () => transport.getTrackedConnections().map((connection) => connection.id),
      clientFor: (connectionId) =>
        transport.getTrackedConnection(connectionId) === undefined
          ? undefined
          : new Client({ transport: transport.transportFor(connectionId), throwOnError: true }),
    };
  };
}
