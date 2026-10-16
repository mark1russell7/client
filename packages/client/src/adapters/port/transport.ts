/**
 * The transport over a message port (roadmap R27): a Web Worker, a `MessagePort` of a
 * `MessageChannel`, an iframe, or a `worker_threads` port of Node.
 *
 * The two sides of a port send calls to each other with the frames of the WebSocket transport
 * (`websocket/shared/rpc.ts`): a request, then a response, an error, or a stream with credit, and
 * a cancel. A port sends objects, not text, so a frame needs no JSON. A side serves the calls of
 * the other side with its `serve` handler, for example a `ProcedureServer`. Before, the site had
 * two worker protocols of its own.
 *
 * @example
 * ```typescript
 * // In the worker: serve the procedures of a registry
 * new PortTransport(self, { serve: new ProcedureServer({ registry, autoRegister: true }) });
 *
 * // On the page: call them
 * const client = new Client(new PortTransport(new Worker(url, { type: "module" })));
 * for await (const item of client.stream({ service: "site", operation: "run" }, input)) { ... }
 * ```
 */

import type { Message, ResponseItem, Transport } from "../../client/types.js";
import type { RequestHandler } from "../../server/types.js";
import type { WebSocketMessage } from "../websocket/server/types.js";
import { IncomingCalls, OutgoingCalls } from "../websocket/shared/rpc.js";
import { withoutInternalKeys } from "../metadata.js";

/**
 * A message port: the object that a worker, a `MessagePort` or a `worker_threads` port gives. It
 * has `postMessage`, and `addEventListener` (the browser form) or `on` (the Node form).
 *
 * The event of a listener has the type `any`: the DOM and Node give it different types, and a
 * port of each must fit without a cast. The transport reads only its `data`.
 */
export interface PortLike {
  postMessage(message: unknown): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEventListener?(type: "message", listener: (event: any) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeEventListener?(type: "message", listener: (event: any) => void): void;
  on?(type: "message", listener: (data: unknown) => void): unknown;
  off?(type: "message", listener: (data: unknown) => void): unknown;
  /** A `MessagePort` delivers its messages to `addEventListener` only after `start()`. */
  start?(): void;
}

/** The options of a `PortTransport`. */
export interface PortTransportOptions {
  /** The handler of the calls of the other side, for example a `ProcedureServer`. */
  serve?: RequestHandler | undefined;
  /** The number of stream items that the reader holds. The default is 64. */
  streamWindow?: number | undefined;
}

/** A frame of the protocol: an object with an id and a type. */
function isFrame(value: unknown): value is WebSocketMessage {
  return value !== null && typeof value === "object" && typeof (value as { type?: unknown }).type === "string";
}

/** The transport over a message port, in the two directions. */
export class PortTransport implements Transport {
  readonly name = "port";
  private readonly outgoing: OutgoingCalls;
  private readonly incoming: IncomingCalls | undefined;
  private open = true;
  private readonly onBrowserMessage = (event: { data: unknown }): void => this.receive(event.data);
  private readonly onNodeMessage = (data: unknown): void => this.receive(data);

  constructor(
    private readonly port: PortLike,
    options: PortTransportOptions = {},
  ) {
    const send = (frame: WebSocketMessage): void => this.port.postMessage(frame);
    const isOpen = (): boolean => this.open;
    this.outgoing = new OutgoingCalls({
      send,
      isOpen,
      // No time limit: a worker can run a long program. The `signal` of a call stops it. This file
      // does not import the Durations (quantity, 6 kB of gzip), so the page of a worker stays small.
      requestTimeoutMs: 0,
      streamWindow: Math.max(2, options.streamWindow ?? 64),
      idPrefix: "",
    });
    if (options.serve) {
      this.incoming = new IncomingCalls({
        handler: options.serve,
        send,
        isOpen,
        // A call over a port comes from a part of this application: it has no credentials
        requestOf: (frame, signal) => ({
          id: frame.id,
          method: frame.method!,
          payload: frame.payload === undefined ? {} : frame.payload,
          metadata: withoutInternalKeys(frame.metadata),
          signal,
        }),
      });
    }
    if (port.addEventListener) port.addEventListener("message", this.onBrowserMessage);
    else port.on?.("message", this.onNodeMessage);
    port.start?.();
  }

  private receive(data: unknown): void {
    if (!this.open || !isFrame(data)) return;
    if (this.outgoing.receive(data)) return;
    this.incoming?.receive(data);
  }

  /** This function sends a call to the other side, and gives its response items. */
  send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
    return this.outgoing.call<TReq, TRes>(message);
  }

  /** This function stops the calls in the two directions, and stops to listen. It does not close the port. */
  async close(): Promise<void> {
    if (!this.open) return;
    this.open = false;
    this.outgoing.failAll("The port transport closed");
    this.incoming?.abortAll();
    if (this.port.removeEventListener) this.port.removeEventListener("message", this.onBrowserMessage);
    else this.port.off?.("message", this.onNodeMessage);
  }
}
