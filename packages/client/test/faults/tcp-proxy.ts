/**
 * An in-process TCP proxy with faults, for tests (roadmap R30).
 *
 * The proxy listens on a port of the OS and sends the bytes of each connection to a target. It
 * has three faults:
 *
 * - `blackHole()`: the bytes of the two directions vanish. No close and no reset arrive.
 * - `reset()`: each open connection ends with a TCP reset on the two sides.
 * - `pause()`: the proxy keeps the bytes. `resume()` sends them, in order, and nothing is lost.
 *
 * With `refuseNew`, each new connection gets a reset at once.
 */

import { createServer, connect, type Server, type Socket } from "node:net";
import type { AddressInfo } from "node:net";

/** What the proxy does with the bytes now. */
export type ProxyMode = "pass" | "black-hole" | "pause";

/** One connection through the proxy: the socket of the client and the socket to the target. */
interface Pair {
  readonly client: Socket;
  readonly upstream: Socket;
  /** True when the socket to the target is open */
  connected: boolean;
  /** The bytes that wait: to the target ("up") and to the client ("down") */
  readonly held: { up: Buffer[]; down: Buffer[] };
}

/** This function ends a socket with a TCP reset, or destroys it when a reset is not possible. */
function resetSocket(socket: Socket): void {
  try {
    socket.resetAndDestroy();
  } catch {
    socket.destroy();
  }
}

/** An in-process TCP proxy with faults (see the file comment). */
export class TcpProxy {
  private mode: ProxyMode = "pass";
  private readonly pairs = new Set<Pair>();
  /** When true, each new connection gets a reset at once. */
  refuseNew = false;
  /** The times (`Date.now()`) of the connections that the proxy accepted, refused ones included. */
  readonly accepted: number[] = [];
  /** The number of bytes that the black hole took. */
  dropped = 0;

  private constructor(
    private readonly server: Server,
    private readonly target: { host: string; port: number },
  ) {
    server.on("connection", (client) => this.accept(client));
  }

  /** This function starts a proxy to a target on a port that the OS gives. */
  static async start(target: { host: string; port: number }): Promise<TcpProxy> {
    const server = createServer();
    const proxy = new TcpProxy(server, target);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    return proxy;
  }

  /** The port of the proxy. */
  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  /** The number of open connections through the proxy. */
  get connections(): number {
    return this.pairs.size;
  }

  /** The current mode. */
  get current(): ProxyMode {
    return this.mode;
  }

  /** From now on, the bytes of the two directions vanish. */
  blackHole(): void {
    this.mode = "black-hole";
  }

  /** From now on, the proxy keeps the bytes of the two directions. */
  pause(): void {
    this.mode = "pause";
  }

  /** The proxy sends the bytes again, the kept bytes first. */
  resume(): void {
    this.mode = "pass";
    for (const pair of this.pairs) this.flush(pair);
  }

  /** This function ends each open connection with a TCP reset on the two sides. */
  reset(): void {
    for (const pair of [...this.pairs]) {
      this.pairs.delete(pair);
      resetSocket(pair.client);
      resetSocket(pair.upstream);
    }
  }

  /** This function stops the proxy and destroys each connection. */
  async close(): Promise<void> {
    for (const pair of this.pairs) {
      pair.client.destroy();
      pair.upstream.destroy();
    }
    this.pairs.clear();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private accept(client: Socket): void {
    this.accepted.push(Date.now());
    client.on("error", () => undefined);
    if (this.refuseNew) {
      resetSocket(client);
      return;
    }
    const upstream = connect(this.target.port, this.target.host);
    upstream.on("error", () => undefined);
    const pair: Pair = { client, upstream, connected: false, held: { up: [], down: [] } };
    this.pairs.add(pair);
    upstream.on("connect", () => {
      pair.connected = true;
      this.flush(pair);
    });
    client.on("data", (chunk: Buffer) => this.forward(pair, "up", chunk));
    upstream.on("data", (chunk: Buffer) => this.forward(pair, "down", chunk));
    // A close passes to the other side, except in the black hole: there, nothing passes
    const closeOther = (other: Socket) => (): void => {
      if (this.mode === "black-hole" && this.pairs.has(pair)) return;
      this.pairs.delete(pair);
      other.destroy();
    };
    client.on("close", closeOther(upstream));
    upstream.on("close", closeOther(client));
  }

  private forward(pair: Pair, direction: "up" | "down", chunk: Buffer): void {
    if (this.mode === "black-hole") {
      this.dropped += chunk.length;
      return;
    }
    if (this.mode === "pause" || (direction === "up" && !pair.connected)) {
      pair.held[direction].push(chunk);
      return;
    }
    (direction === "up" ? pair.upstream : pair.client).write(chunk);
  }

  private flush(pair: Pair): void {
    if (this.mode !== "pass") return;
    if (pair.connected) for (const chunk of pair.held.up.splice(0)) pair.upstream.write(chunk);
    for (const chunk of pair.held.down.splice(0)) pair.client.write(chunk);
  }
}
