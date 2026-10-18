/**
 * The router of the upgrade requests of one `node:http` server (CLI-3).
 *
 * Before, each `WebSocketServerTransport` attached its own `WebSocketServer` of `ws` to the server.
 * Such a server refuses each upgrade of another path with 400, so a second endpoint on the same
 * server did not get its upgrades. With this router, each transport of the server is a target of
 * one router. The router gives an upgrade to the first target that takes it. When no target takes it and no other
 * listener of the server can take it, the router refuses it with 400, as before.
 *
 * This module imports only types of Node.
 */

import type { IncomingMessage, Server as HttpServer } from "http";
import type { Duplex } from "stream";

/** A target of the router: it takes an upgrade (true), or leaves it alone (false). */
export interface UpgradeTarget {
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
}

/** The reason texts of the statuses of a refused upgrade. */
const STATUS_TEXT: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  503: "Service Unavailable",
};

/**
 * This function refuses an upgrade: it writes an HTTP response with the status and the message,
 * then it destroys the socket.
 */
export function refuseUpgrade(socket: Duplex, status: number, message?: string): void {
  if (socket.writable) {
    const text = STATUS_TEXT[status] ?? "Error";
    const body = message ?? text;
    socket.write(
      `HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
    );
  }
  socket.destroy();
}

interface Router {
  readonly targets: Set<UpgradeTarget>;
  readonly listener: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
}

const routers = new WeakMap<HttpServer, Router>();

/**
 * This function attaches a target to the upgrades of a server. It gives the function that
 * detaches it. The router leaves the server when its last target goes.
 */
export function attachUpgradeTarget(server: HttpServer, target: UpgradeTarget): () => void {
  let router = routers.get(server);
  if (!router) {
    const targets = new Set<UpgradeTarget>();
    const listener = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
      for (const each of targets) if (each.upgrade(req, socket, head)) return;
      // Another listener of the server (the upgrade handler of the application) can take it
      if (server.listenerCount("upgrade") <= 1) refuseUpgrade(socket, 400);
    };
    router = { targets, listener };
    routers.set(server, router);
    server.on("upgrade", listener);
  }
  const current = router;
  current.targets.add(target);
  return () => {
    current.targets.delete(target);
    if (current.targets.size === 0 && routers.get(server) === current) {
      server.off("upgrade", current.listener);
      routers.delete(server);
    }
  };
}
