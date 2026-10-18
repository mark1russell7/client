/**
 * The procedure upgrade handler of WebSocket: an upgrade handler of `node:http` for the "no
 * server" mode of `ws` (CLI-3).
 *
 * `upgradeHandler(server, options)` gives a function `(req, socket, head) => boolean`. The function
 * takes each upgrade request of its path and gives `true`. It gives `false` for each other path and
 * does not touch the socket. Thus two endpoints can share one listener, and so can an endpoint and
 * the WebSocket server of the application. The connections are the connections of
 * `WebSocketServerTransport`: calls in the two directions, streams with credit and `seq`, events,
 * the heartbeat and the browser checks. `handler.transport` gives that API.
 *
 * The handler also has the stop parts of a service transport: `start()`, `stopIntake()`,
 * `drain(deadline, signal)`, `inFlight()` and `close()`. It does not make a server and does not
 * listen: the owner of the listener does that.
 */

import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import type { RequestHandler } from "../../../server/types.js";
import type { WebSocketServerTransportOptions } from "./types.js";
import { WebSocketServerTransport } from "./transport.js";

/** The options of `upgradeHandler`: the options of `WebSocketServerTransport` without `server`. */
export type UpgradeHandlerOptions = Omit<WebSocketServerTransportOptions, "server">;

/**
 * The upgrade handler of `upgradeHandler`. A call gives `true` when the handler takes the upgrade
 * (its path is the path of the endpoint), and `false` for another path. The handler then does not
 * touch the socket.
 */
export interface NodeUpgradeHandler {
  (req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
  /** The path of the endpoint. */
  readonly path: string;
  /**
   * The transport of the connections: `broadcast`, `callConnection`, `transportFor`, `subscribe`,
   * `events`, `onConnect` and the other methods of `WebSocketServerTransport`.
   */
  readonly transport: WebSocketServerTransport;
  /** This method gives true when an upgrade request is for the path of the endpoint. */
  matches(req: IncomingMessage): boolean;
  /** This method accepts new upgrades and calls again, after `stopIntake()` or `close()`. */
  start(): void;
  /** This method refuses each new upgrade with 503, and each new call with `UNAVAILABLE`. */
  stopIntake(): void;
  /**
   * This method waits until no call is in flight, until the `deadline` (milliseconds on the
   * monotonic clock of `performance.now()`), or until the signal aborts.
   */
  drain(deadline: number, signal?: AbortSignal): Promise<void>;
  /** The number of the calls in flight on all connections. */
  inFlight(): number;
  /** This method closes each connection and the WebSocket server. */
  close(): Promise<void>;
}

/**
 * This function makes a procedure upgrade handler: an upgrade handler of `node:http` that serves
 * the procedures of `server` over WebSocket at `options.path`.
 *
 * @example
 * ```typescript
 * const events = upgradeHandler(server, { path: "/ws" });
 * const live = upgradeHandler(server, { path: "/live" });
 * http.on("upgrade", (req, socket, head) => {
 *   if (events(req, socket, head) || live(req, socket, head)) return;
 *   socket.destroy();
 * });
 * ```
 */
export function upgradeHandler(server: RequestHandler, options: UpgradeHandlerOptions = {}): NodeUpgradeHandler {
  const { server: _ignored, ...rest } = options as WebSocketServerTransportOptions;
  const transport = new WebSocketServerTransport(server, rest);
  // A new face: a cookie is trusted only from a named origin (CSRF)
  transport.nameOriginsForCookies();
  transport.open();
  const handler = ((req: IncomingMessage, socket: Duplex, head: Buffer): boolean => transport.upgrade(req, socket, head)) as NodeUpgradeHandler;
  return Object.assign(handler, {
    path: transport.path,
    transport,
    matches: (req: IncomingMessage): boolean => transport.matches(req),
    start: (): void => transport.open(),
    stopIntake: (): void => transport.stopIntake(),
    drain: (deadline: number, signal?: AbortSignal): Promise<void> => transport.drain(deadline, signal),
    inFlight: (): number => transport.inFlight(),
    close: (): Promise<void> => transport.close(),
  });
}
