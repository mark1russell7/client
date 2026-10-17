/**
 * WebSocket Client Transport Implementation
 *
 * Provides persistent bidirectional RPC over WebSocket.
 * Supports automatic reconnection, heartbeats, and streaming.
 */

import type { Transport, Message, ResponseItem } from "../../../client/types.js";
import type { WebSocketTransportOptions, WebSocketMessage, ServerRequestHandler, EventHandler, WebSocketClass } from "./types.js";
import { WebSocketState } from "./types.js";
import { withoutInternalKeys } from "../../metadata.js";
import { IncomingCalls } from "../shared/rpc.js";
import { StreamSequence, gapOf, itemMetadata } from "../../sequence.js";
import type { RequestHandler, ServerResponse } from "../../../server/types.js";
import { methodToPath } from "../../../server/method.js";
import { optionalMs } from "../../../duration.js";
import { PROTOCOL_VERSION, protocolVersionOf } from "../../../protocol.js";
import { TIMER_DEFAULTS } from "../../../timers.js";
import { realClock, type Cancel, type Clock } from "../../../clock.js";
import { heartbeat, type Heartbeat } from "@mark1russell7/service/heartbeat";
import { backoffDelay } from "@mark1russell7/service/backoff";
import type { MachineTransition } from "../../../machines.js";
import { WEBSOCKET_CONNECTION_MACHINE } from "../../../machines.js";
import {
  SubscriptionError,
  remoteEvents,
  subscribeRemote,
  type RemoteEvent,
  type RemoteEventHandler,
  type RemoteEventsOptions,
  type SubscribeOptions,
  type Subscription,
  type SubscriptionHooks,
} from "../../../events/remote.js";

/**
 * Pending request waiting for response.
 */
/**
 * A queue with one writer (the message handler) and one reader (`for await`).
 */
class ItemQueue<T> {
  private items: T[] = [];
  private ended = false;
  private failure: { error: Error } | undefined;
  private wake: (() => void) | undefined;

  push(item: T): void {
    this.items.push(item);
    this.notify();
  }

  end(): void {
    this.ended = true;
    this.notify();
  }

  fail(error: Error): void {
    this.failure = { error };
    this.notify();
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = undefined;
    wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
    for (;;) {
      if (this.items.length > 0) {
        yield this.items.shift()!;
        continue;
      }
      if (this.failure) throw this.failure.error;
      if (this.ended) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }
}

interface PendingRequest {
  /** The id of the caller's message: the response items carry it */
  messageId: string;
  /** The response items of the request, in order */
  queue: ItemQueue<ResponseItem<unknown>>;
  /** The `seq` of the stream frames: a duplicate or a late frame gives no item */
  order: StreamSequence;
  /** The request timeout: it runs until the first frame arrives */
  timeout?: Cancel | undefined;
}

/**
 * WebSocket client transport.
 *
 * Persistent connection for real-time RPC communication.
 *
 * @example
 * ```typescript
 * const transport = new WebSocketTransport({
 *   url: "ws://localhost:3000/ws",
 *   reconnect: {
 *     enabled: true,
 *     maxAttempts: 10
 *   }
 * });
 *
 * const client = new Client({ transport });
 * ```
 */
/** The `readyState` of an open socket. The global `WebSocket` and the `ws` package use the same number. */
const OPEN = 1;

/**
 * The error handler of a socket that the transport left. A `WebSocket` of the `ws` package that
 * closes during its handshake emits an error. Without a handler, that error ends the process.
 */
const ignoreError = (): void => undefined;

/** This function removes the handlers of the transport from a socket, and keeps `ignoreError`. */
function detach(ws: WebSocket): void {
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = ignoreError;
}

function errorItem<TRes>(id: string, code: string, message: string, retryable: boolean): ResponseItem<TRes> {
  return { id, status: { type: "error", code, message, retryable }, payload: null as TRes, metadata: {} };
}

function abortedItem<TRes>(id: string): ResponseItem<TRes> {
  return errorItem<TRes>(id, "ABORTED", "Request was aborted", false);
}

/**
 * The handler of the calls of the server without a `serve` option: the older `onServerRequest`
 * function (it gets the path and the input), or else a `NOT_FOUND` answer.
 */
function legacyHandler(onServerRequest: ServerRequestHandler | undefined): RequestHandler {
  return {
    async handle(request): Promise<ServerResponse> {
      if (!onServerRequest) {
        return {
          id: request.id,
          status: { type: "error", code: "NOT_FOUND", message: "This client serves no procedures", retryable: false },
          metadata: {},
        };
      }
      try {
        const payload = await onServerRequest(methodToPath(request.method), request.payload);
        return { id: request.id, status: { type: "success", code: 200 }, payload, metadata: {} };
      } catch (error) {
        return {
          id: request.id,
          status: { type: "error", code: "HANDLER_ERROR", message: error instanceof Error ? error.message : String(error), retryable: false },
          metadata: {},
        };
      }
    },
  };
}

/**
 * The delay before a reconnect try (from 1): an exponential backoff up to `maxDelay`, with a
 * random part. With `jitter: 1` (full jitter, the default), the delay is a random time from 0 to
 * the backoff, so the clients of a server that restarted do not come back at the same moments
 * (roadmap R3). The backoff is `backoffDelay` of `@mark1russell7/service/backoff` (roadmap R37).
 */
export function reconnectDelay(
  attempt: number,
  options: { initialDelay: number; backoffMultiplier: number; maxDelay: number; jitter: number },
  random: () => number = Math.random,
): number {
  return Math.round(
    backoffDelay(
      {
        base: options.initialDelay,
        factor: options.backoffMultiplier,
        cap: options.maxDelay,
        jitter: { kind: "subtract", fraction: options.jitter },
      },
      attempt,
      random,
    ),
  );
}

export class WebSocketTransport implements Transport {
  readonly name = "websocket";

  private ws: WebSocket | null = null;
  private state: WebSocketState = WebSocketState.DISCONNECTED;
  private options: {
    url: string;
    reconnect: {
      enabled: boolean;
      maxAttempts: number;
      initialDelay: number;
      maxDelay: number;
      backoffMultiplier: number;
      jitter: number;
    };
    connectionTimeout: number;
    requestTimeout: number;
    streamWindow: number;
    heartbeat: {
      enabled: boolean;
      interval: number;
      timeout: number;
      misses: number;
    };
    onConnect: (() => void) | undefined;
    onDisconnect: ((reason?: string) => void) | undefined;
    onReconnecting: ((attempt: number) => void) | undefined;
    onError: ((error: Error) => void) | undefined;
    onServerRequest: ServerRequestHandler | undefined;
    serve: RequestHandler | undefined;
    onEvent: EventHandler | undefined;
  };
  /** The requests in progress, by wire id */
  private pendingRequests: Map<string, PendingRequest> = new Map();
  /**
   * The transport makes the id of each request on the wire. Before, the wire id was the
   * message id: a retry with the same id, or two calls with one id, took each other's frames
   * (deep dive TRN-8/9).
   */
  private wireSeq = 0;
  /** The functions that run at each state change (the callers that wait for a connection) */
  private stateListeners = new Set<() => void>();
  /** Set by close(): the connection is being closed on purpose, so it must not reconnect */
  private closing = false;
  private reconnectAttempts = 0;
  private reconnectTimer: Cancel | undefined = undefined;
  /** The heartbeat of the connection: `heartbeat` of `@mark1russell7/service/heartbeat` (roadmap R37) */
  private heartbeat: Heartbeat | undefined = undefined;
  /** The clock of each timer of the transport (roadmap R35) */
  private readonly clock: Clock;
  /** The class of the sockets, or undefined for the global `WebSocket` (finding of roadmap R36) */
  private readonly webSocketClass: WebSocketClass | undefined;
  /** The observer of the changes of the state (roadmap R35) */
  private readonly transitionHandler: ((transition: MachineTransition) => void) | undefined;
  /** The protocol version of the server, from its hello, or undefined (an older server) (R25) */
  private serverProtocol: number | undefined;
  /** The calls that the server sends on the current socket, served by `serve` (roadmap R24) */
  private incoming: IncomingCalls | undefined;
  /** The time limit of the handshake of the socket that opens now */
  private handshakeTimer: Cancel | undefined = undefined;
  /** The signal of the subscriptions of the transport: `close()` aborts it, so they end (EVENTS.md) */
  private readonly subscriptions = new AbortController();

  constructor(options: WebSocketTransportOptions) {
    this.options = {
      url: options.url,
      reconnect: {
        enabled: options.reconnect?.enabled ?? true,
        maxAttempts: options.reconnect?.maxAttempts ?? Infinity,
        initialDelay: optionalMs(options.reconnect?.initialDelay, "reconnect.initialDelay") ?? TIMER_DEFAULTS.webSocketClient.reconnectInitialDelayMs,
        maxDelay: optionalMs(options.reconnect?.maxDelay, "reconnect.maxDelay") ?? TIMER_DEFAULTS.webSocketClient.reconnectMaxDelayMs,
        backoffMultiplier: options.reconnect?.backoffMultiplier ?? 1.5,
        jitter: Math.min(1, Math.max(0, options.reconnect?.jitter ?? 1)),
      },
      connectionTimeout: optionalMs(options.connectionTimeout, "connectionTimeout") ?? TIMER_DEFAULTS.webSocketClient.connectionTimeoutMs,
      requestTimeout: optionalMs(options.requestTimeout, "requestTimeout") ?? TIMER_DEFAULTS.webSocketClient.requestTimeoutMs,
      streamWindow: Math.max(2, options.streamWindow ?? 64),
      heartbeat: {
        enabled: options.heartbeat?.enabled ?? true,
        interval: optionalMs(options.heartbeat?.interval, "heartbeat.interval") ?? TIMER_DEFAULTS.webSocketClient.heartbeatIntervalMs,
        timeout: optionalMs(options.heartbeat?.timeout, "heartbeat.timeout") ?? TIMER_DEFAULTS.webSocketClient.heartbeatTimeoutMs,
        misses: Math.max(1, options.heartbeat?.misses ?? TIMER_DEFAULTS.webSocketClient.heartbeatMisses),
      },
      onConnect: options.onConnect,
      onDisconnect: options.onDisconnect,
      onReconnecting: options.onReconnecting,
      onError: options.onError,
      onServerRequest: options.onServerRequest,
      serve: options.serve,
      onEvent: options.onEvent,
    };
    this.clock = options.clock ?? realClock;
    this.webSocketClass = options.webSocket;
    this.transitionHandler = options.onTransition;

    // Auto-connect
    this.connect();
  }

  /**
   * Change the state, and tell the callers that wait for a connection. `on` is the event of
   * `WEBSOCKET_CONNECTION_MACHINE`: a change goes to `onTransition` (roadmap R35).
   */
  private setState(state: WebSocketState, on: string): void {
    const from = this.state;
    this.state = state;
    if (from !== state) {
      this.transitionHandler?.({ machine: WEBSOCKET_CONNECTION_MACHINE.id, instance: this.name, from, on, to: state, at: this.clock.now() });
    }
    for (const listener of [...this.stateListeners]) listener();
  }

  /**
   * Connect to WebSocket server.
   */
  /** `on` is the event of the machine: the first connect, or the end of a backoff. */
  private connect(on: "connect" | "reconnect-due" = "connect"): void {
    if (this.closing) {
      return;
    }
    if (this.state === WebSocketState.CONNECTING || this.state === WebSocketState.CONNECTED) {
      return;
    }

    this.setState(WebSocketState.CONNECTING, on);

    try {
      const WebSocketClass = (this.webSocketClass ?? WebSocket) as typeof WebSocket;
      const ws = new WebSocketClass(this.options.url);
      this.ws = ws;
      // The calls of the server on this socket (roadmap R24)
      this.incoming = this.servedCallsOf(ws);

      // The handshake has a time limit: an address that never answers does not keep the socket
      // in CONNECTING (roadmap R3)
      this.clearHandshakeTimer();
      this.handshakeTimer = this.clock.after(this.options.connectionTimeout, () => {
        this.handshakeTimer = undefined;
        if (this.ws === ws && this.state === WebSocketState.CONNECTING) {
          console.error(`[${this.name}] Handshake timeout after ${this.options.connectionTimeout}ms`);
          this.dropConnection("Handshake timeout");
        }
      });

      // Connection opened
      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.clearHandshakeTimer();
        this.reconnectAttempts = 0;
        // The protocol version of this client (roadmap R25). An older server answers with an
        // error frame, which the client ignores.
        this.serverProtocol = undefined;
        ws.send(JSON.stringify({ id: "hello", type: "hello", protocol: PROTOCOL_VERSION }));
        this.setState(WebSocketState.CONNECTED, "open");
        console.error(`[${this.name}] Connected to ${this.options.url}`);

        if (this.options.onConnect) {
          this.options.onConnect();
        }

        // Start heartbeat
        if (this.options.heartbeat.enabled) {
          this.startHeartbeat();
        }
      };

      // Message received
      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error(`[${this.name}] Failed to parse message:`, error);
        }
      };

      // Connection closed
      ws.onclose = (event) => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.handleClose(event.reason);
      };

      // Connection error
      ws.onerror = (event) => {
        if (this.ws !== ws) return;
        console.error(`[${this.name}] WebSocket error:`, event);
        const error = new Error("WebSocket connection error");
        if (this.options.onError) {
          this.options.onError(error);
        }
        // A failed handshake: the WebSocket of Node 22 gives no close event after this error, and
        // stays in CONNECTING. The transport closes it now, so the reconnect starts at once
        // (roadmap R30: before, each try waited for the time limit of the handshake).
        if (this.state === WebSocketState.CONNECTING) this.dropConnection("Connection failed");
      };
    } catch (error) {
      console.error(`[${this.name}] Failed to create WebSocket:`, error);
      this.ws = null;
      this.handleClose("Failed to create WebSocket");
    }
  }

  /**
   * Leave the current socket without waiting for its close handshake, and handle the close
   * now. A dead peer never answers the handshake: before, the heartbeat called close() and
   * waited, so the state stayed CONNECTED and the requests hung (deep dive TRN-6).
   */
  private dropConnection(reason: string): void {
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      detach(ws);
      try {
        // A socket of the ws package ends at once. close() waits for the answer of a peer that can
        // be dead (finding of roadmap R36).
        const terminate = (ws as { terminate?: () => void }).terminate;
        if (typeof terminate === "function") terminate.call(ws);
        else ws.close();
      } catch {
        // The socket is unusable: nothing more to do
      }
    }
    this.handleClose(reason);
  }

  /** Fail every request in progress (a stream ends with the error too). */
  private failPending(reason: string): void {
    for (const pending of this.pendingRequests.values()) {
      pending.queue.fail(new Error(reason));
      pending.timeout?.();
    }
    this.pendingRequests.clear();
  }

  /**
   * Handle WebSocket close.
   */
  private handleClose(reason?: string): void {
    this.stopHeartbeat();
    this.incoming?.abortAll();
    this.incoming = undefined;
    this.clearHandshakeTimer();

    // An intentional close() must not reconnect (BUGS-2026-07 H6)
    const reconnect = this.options.reconnect;
    const willReconnect = !this.closing && reconnect.enabled && this.reconnectAttempts < reconnect.maxAttempts;
    this.setState(willReconnect ? WebSocketState.RECONNECTING : WebSocketState.DISCONNECTED, willReconnect ? "drop" : "give-up");

    console.error(`[${this.name}] Disconnected${reason ? `: ${reason}` : ""}`);

    if (this.options.onDisconnect) {
      this.options.onDisconnect(reason);
    }

    this.failPending("WebSocket connection closed");

    if (willReconnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      this.reconnectTimer();
    }

    this.reconnectAttempts++;
    this.setState(WebSocketState.RECONNECTING, "drop");

    const delay = reconnectDelay(this.reconnectAttempts, this.options.reconnect);

    console.error(`[${this.name}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    if (this.options.onReconnecting) {
      this.options.onReconnecting(this.reconnectAttempts);
    }

    this.reconnectTimer = this.clock.after(delay, () => {
      this.reconnectTimer = undefined;
      // connect() returns at once in RECONNECTING only for CONNECTING/CONNECTED
      this.connect("reconnect-due");
    });
  }

  /**
   * Start the heartbeat of the connection: a ping each interval on the clock, one ping at a time.
   * A ping without a pong at its timeout is a miss. The connection drops after `misses` misses in
   * sequence. A ping whose send throws is a miss too.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = heartbeat({
      interval: this.options.heartbeat.interval,
      timeout: this.options.heartbeat.timeout,
      misses: this.options.heartbeat.misses,
      clock: this.clock,
      due: () => this.state === WebSocketState.CONNECTED && this.ws !== null,
      ping: () => {
        const ping: WebSocketMessage = {
          id: `ping-${Date.now()}`,
          type: "ping",
        };
        this.ws?.send(JSON.stringify(ping));
      },
      onDead: () => {
        console.warn(`[${this.name}] Heartbeat timeout - dropping connection`);
        this.dropConnection("Heartbeat timeout");
      },
    });
  }

  /** Stop the time limit of the handshake. */
  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) {
      this.handshakeTimer();
      this.handshakeTimer = undefined;
    }
  }

  /** Stop the heartbeat: its ticks, its timeout and its count of misses. */
  private stopHeartbeat(): void {
    this.heartbeat?.stop();
    this.heartbeat = undefined;
  }

  /**
   * Handle incoming message.
   */
  /**
   * The calls of the server on a socket, served by the `serve` option (or by `onServerRequest`, or
   * with `NOT_FOUND`), with the same frames as the calls of the client (roadmap R24).
   */
  private servedCallsOf(ws: WebSocket): IncomingCalls {
    const handler = this.options.serve ?? legacyHandler(this.options.onServerRequest);
    return new IncomingCalls({
      handler,
      send: (frame) => ws.send(JSON.stringify(frame)),
      isOpen: () => this.ws === ws && ws.readyState === OPEN,
      // A call of the server that this client opened: the client trusts it, so it has no
      // credentials (a ProcedureServer applies no token to it)
      requestOf: (frame, signal) => ({
        id: frame.id,
        method: frame.method!,
        payload: frame.payload === undefined ? {} : frame.payload,
        metadata: withoutInternalKeys(frame.metadata),
        signal,
      }),
    });
  }

  private handleMessage(message: WebSocketMessage): void {
    // The hello of the server, or the error of an older server that does not know it (R25)
    if (message.id === "hello" && (message.type === "hello" || message.type === "error")) {
      if (message.type === "hello") this.serverProtocol = protocolVersionOf(message.protocol);
      else if (message.error?.code === "PROTOCOL_VERSION") this.options.onError?.(new Error(message.error.message));
      return;
    }
    // A call of the server, its cancel or its credit (roadmap R24)
    if ((message.type === "request" || message.type === "cancel" || message.type === "credit") && this.incoming?.receive(message)) {
      return;
    }


    // Handle pong (heartbeat response)
    if (message.type === "pong") {
      this.heartbeat?.answer();
      return;
    }

    // Handle ping (server heartbeat)
    if (message.type === "ping") {
      const pong: WebSocketMessage = {
        id: message.id,
        type: "pong",
      };
      this.ws?.send(JSON.stringify(pong));
      return;
    }

    // Handle server-request (server-initiated procedure call)
    if (message.type === "server-request") {
      this.handleServerRequest(message);
      return;
    }

    // The frame type `event` is reserved: no side of protocol v1 sends it. A server outside this
    // repository can send it, so the frame still goes to onEvent (EVENTS.md).
    if (message.type === "event") {
      if (this.options.onEvent && message.topic && message.subscriptionId) {
        try {
          this.options.onEvent(message.topic, message.data, message.subscriptionId);
        } catch (error) {
          console.error(`[${this.name}] Event handler error:`, error);
        }
      }
      return;
    }

    // Handle response
    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      // A stream frame that left before the cancel of its call is normal: an unsubscribe, a break
      if (message.type !== "stream") console.warn(`[${this.name}] Received response for unknown request: ${message.id}`);
      return;
    }

    // The first frame arrived: the request timeout ends. A stream can stay open longer.
    if (pending.timeout) {
      pending.timeout();
      pending.timeout = undefined;
    }

    // A stream frame: one item, or the end of the stream (BUGS-2026-07 H5: before, the
    // transport resolved on the first frame and dropped the others)
    if (message.type === "stream") {
      // A duplicate or a late frame: its item came before, or the delivery is at most once
      const gap = pending.order.next(message.seq, message.id);
      if (gap < 0) return;
      if (message.stream?.done) {
        this.pendingRequests.delete(message.id);
        pending.queue.end();
        return;
      }
      pending.queue.push({
        id: pending.messageId,
        status: { type: "success", code: 200 },
        payload: message.payload,
        metadata: itemMetadata(message.metadata, gap),
      });
      return;
    }

    // A response or an error: one item, then the end
    this.pendingRequests.delete(message.id);

    // Convert to ResponseItem
    let status: ResponseItem<any>["status"];
    if (message.status && message.status.type === "error") {
      console.error(`[${this.name}] Error response:`, message.status);
      // Ensure message is a string
      const errorMessage = typeof message.status.message === 'string'
        ? message.status.message
        : message.status.message
        ? JSON.stringify(message.status.message)
        : "Unknown error";
      status = {
        type: "error",
        code: String(message.status.code),
        message: errorMessage,
        retryable: message.status.retryable || false,
      };
    } else if (message.status && message.status.type === "success") {
      status = {
        type: "success",
        code: Number(message.status.code),
      };
    } else if (message.type === "error") {
      console.error(`[${this.name}] Error message:`, message.error);
      // Ensure message is a string
      const errorMessage = typeof message.error?.message === 'string'
        ? message.error.message
        : message.error?.message
        ? JSON.stringify(message.error.message)
        : "Unknown error";
      status = {
        type: "error",
        code: String(message.error?.code || "UNKNOWN_ERROR"),
        message: errorMessage,
        retryable: message.error?.retryable || false,
      };
    } else {
      status = {
        type: "success",
        code: 200,
      };
    }

    const responseItem: ResponseItem<any> = {
      id: pending.messageId,
      status,
      payload: message.payload,
      metadata: message.metadata || {},
    };


    pending.queue.push(responseItem);
    pending.queue.end();
  }

  /**
   * Send a request and yield its response items as they arrive: one item for a request/response
   * call, each item of a stream. When the reader stops early or the message's signal aborts, the
   * transport sends a "cancel" message, and the server stops the stream.
   *
   * Flow control (deep dive TRN-3): the request gives the server credit for `streamWindow`
   * items. As the reader takes items, the transport sends more credit, so the server never
   * runs ahead of a slow reader by more than the window.
   *
   * @param message - Message to send
   * @returns Async iterable of response items
   */
  async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
    if (message.signal?.aborted) {
      yield abortedItem<TRes>(message.id);
      return;
    }

    // Wait for connection
    await this.waitForConnection(message.signal);
    if (message.signal?.aborted) {
      yield abortedItem<TRes>(message.id);
      return;
    }

    const wireId = `${message.id}~${++this.wireSeq}`;
    const window = this.options.streamWindow;

    // Create WebSocket message. The internal metadata keys stay in this process (deep dive TRN-11).
    const wsMessage: WebSocketMessage<TReq> = {
      id: wireId,
      type: "request",
      method: message.method,
      payload: message.payload,
      metadata: withoutInternalKeys(message.metadata),
      credit: window,
    };

    const queue = new ItemQueue<ResponseItem<unknown>>();
    const pending: PendingRequest = { messageId: message.id, queue, order: new StreamSequence() };
    pending.timeout = this.clock.after(this.options.requestTimeout, () => {
      if (this.pendingRequests.get(wireId) !== pending) return;
      this.pendingRequests.delete(wireId);
      this.sendCancel(wireId);
      console.error(`[${this.name}] Request timeout for ${message.id}`);
      // An error item, not a thrown error: the server got the request and can still run it,
      // so a retry middleware must not repeat it (deep dive TRN-8)
      queue.push(errorItem(message.id, "TIMEOUT", `Request timeout after ${this.options.requestTimeout}ms`, false));
      queue.end();
    });
    this.pendingRequests.set(wireId, pending);

    const onAbort = (): void => {
      if (this.pendingRequests.get(wireId) !== pending) return;
      this.pendingRequests.delete(wireId);
      pending.timeout?.();
      this.sendCancel(wireId);
      queue.push(abortedItem(message.id));
      queue.end();
    };
    message.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      try {
        this.ws!.send(JSON.stringify(wsMessage));
      } catch (error) {
        console.error(`[${this.name}] Send error:`, error);
        throw error;
      }
      let taken = 0;
      for await (const item of queue) {
        yield item as ResponseItem<TRes>;
        // The reader took the item: give the server credit, in batches of half the window.
        // The frames of a gap took credit too, and no reader takes them.
        taken += 1 + gapOf(item.metadata);
        if (taken >= window / 2 && this.pendingRequests.get(wireId) === pending) {
          this.sendCredit(wireId, taken);
          taken = 0;
        }
      }
    } finally {
      message.signal?.removeEventListener("abort", onAbort);
      pending.timeout?.();
      if (this.pendingRequests.get(wireId) === pending) {
        // The reader stopped before the end: the server stops the stream
        this.pendingRequests.delete(wireId);
        this.sendCancel(wireId);
      }
    }
  }

  /** This function tells the server to stop a request (a stream that nobody reads). */
  private sendCancel(id: string): void {
    if (this.ws && this.state === WebSocketState.CONNECTED) {
      const cancel: WebSocketMessage = { id, type: "cancel" };
      this.ws.send(JSON.stringify(cancel));
    }
  }

  /** This function gives the server credit for more items of a stream. */
  private sendCredit(id: string, credit: number): void {
    if (this.ws && this.state === WebSocketState.CONNECTED) {
      const message: WebSocketMessage = { id, type: "credit", credit };
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Wait for WebSocket connection. The wait follows the state changes. Before, each waiting
   * call polled every 100 ms, and the poller ran on after a timeout until the connection came
   * back (deep dive TRN-14).
   */
  private async waitForConnection(signal?: AbortSignal): Promise<void> {
    if (this.state === WebSocketState.CONNECTED) {
      return;
    }
    if (this.state === WebSocketState.DISCONNECTED) {
      throw new Error("WebSocket disconnected");
    }

    return new Promise((resolve, reject) => {
      const finish = (error?: Error): void => {
        timeout();
        this.stateListeners.delete(check);
        signal?.removeEventListener("abort", onAbort);
        if (error) reject(error);
        else resolve();
      };
      const check = (): void => {
        if (this.state === WebSocketState.CONNECTED) finish();
        else if (this.state === WebSocketState.DISCONNECTED) finish(new Error("WebSocket disconnected"));
      };
      // The caller aborted: send() then gives the ABORTED item
      const onAbort = (): void => finish();
      const timeout = this.clock.after(this.options.connectionTimeout, () => finish(new Error("Connection timeout")));
      this.stateListeners.add(check);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  /**
   * Handle server-initiated procedure call.
   */
  private async handleServerRequest(message: WebSocketMessage): Promise<void> {
    const { id, path, input } = message;

    if (!path || !Array.isArray(path)) {
      console.error(`[${this.name}] Invalid server-request: missing path`);
      return;
    }

    if (!this.options.onServerRequest) {
      // No handler registered - send error response
      const response: WebSocketMessage = {
        id,
        type: "server-response",
        error: {
          code: "NO_HANDLER",
          message: "No server request handler registered",
          retryable: false,
        },
      };
      this.ws?.send(JSON.stringify(response));
      return;
    }

    try {
      const result = await this.options.onServerRequest(path, input);
      const response: WebSocketMessage = {
        id,
        type: "server-response",
        result,
      };
      this.ws?.send(JSON.stringify(response));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const response: WebSocketMessage = {
        id,
        type: "server-response",
        error: {
          code: "HANDLER_ERROR",
          message: errorMessage,
          retryable: false,
        },
      };
      this.ws?.send(JSON.stringify(response));
    }
  }

  /**
   * This function subscribes to topics of the bus of the server (`documentation/EVENTS.md`). The
   * handler gets each event in order. After a drop, the transport sends the subscription again on
   * the new connection. The events between the drop and the new confirmation are lost. The
   * subscribers of the same topics with the same options share one call.
   *
   * @param topics - One topic, or a list of 1 to 64 topics
   * @param handler - The handler of each event. A promise that it gives holds the next event.
   * @param options - `onSubscribed`, `onError`, a signal, the metadata of the call, the resubscribe rules
   * @returns The unsubscribe function, with the `ready` promise of the first confirmation
   *
   * @example
   * ```typescript
   * const unsubscribe = transport.subscribe("orders.created", (order) => console.log(order));
   * await unsubscribe.ready;
   * unsubscribe();
   * ```
   */
  subscribe<T = unknown>(topics: string | readonly string[], handler: RemoteEventHandler<T>, options: SubscribeOptions = {}): Subscription {
    return subscribeRemote<T>(this, topics, handler, options, this.subscriptionHooks());
  }

  /**
   * This function gives the events of topics of the bus of the server as an async iterator. A
   * `break` or the signal ends the subscription. The transport resubscribes after a drop, as for
   * `subscribe()`. An error that ends the subscription ends the iteration.
   *
   * @param topics - One topic, or a list of 1 to 64 topics
   * @param options - A signal, `onSubscribed`, the metadata of the call
   */
  events<T = unknown>(topics: string | readonly string[], options: RemoteEventsOptions = {}): AsyncIterable<RemoteEvent<T>> {
    return remoteEvents<T>(this, topics, options, this.subscriptionHooks());
  }

  /**
   * The parts of the subscriptions of this transport: its connection, its backoff, its
   * `maxAttempts`, its clock, its close and `onEvent`.
   */
  private subscriptionHooks(): SubscriptionHooks {
    return {
      lifetime: this.subscriptions.signal,
      ready: (signal) => this.whenConnected(signal),
      backoff: (attempt) => reconnectDelay(attempt, this.options.reconnect),
      maxAttempts: this.options.reconnect.maxAttempts,
      clock: this.clock,
      onEvent: (event) => {
        if (!this.options.onEvent) return;
        try {
          this.options.onEvent(event.topic, event.data, event.subscription);
        } catch (error) {
          console.error(`[${this.name}] Event handler error:`, error);
        }
      },
    };
  }

  /**
   * This function resolves when the transport is connected, or when the signal aborts. It has no
   * time limit: a subscription waits for each reconnect. It rejects when the transport closed or
   * stopped its reconnects.
   */
  private whenConnected(signal: AbortSignal): Promise<void> {
    const closed = (): SubscriptionError => new SubscriptionError("CONNECTION_CLOSED", "The WebSocket transport is closed", false);
    if (this.state === WebSocketState.CONNECTED || signal.aborted) return Promise.resolve();
    if (this.state === WebSocketState.DISCONNECTED || this.closing) return Promise.reject(closed());
    return new Promise((resolve, reject) => {
      const finish = (error?: SubscriptionError): void => {
        this.stateListeners.delete(check);
        signal.removeEventListener("abort", onAbort);
        if (error) reject(error);
        else resolve();
      };
      const check = (): void => {
        if (this.state === WebSocketState.CONNECTED) finish();
        else if (this.state === WebSocketState.DISCONNECTED) finish(closed());
      };
      const onAbort = (): void => finish();
      this.stateListeners.add(check);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  /**
   * Close WebSocket connection. The requests in progress fail, and the subscriptions end.
   */
  async close(): Promise<void> {
    // The subscriptions end first: each one sends its cancel while the socket is open
    this.subscriptions.abort();
    this.closing = true;
    this.setState(WebSocketState.DISCONNECTING, "close");
    this.stopHeartbeat();
    this.clearHandshakeTimer();
    this.incoming?.abortAll();
    this.incoming = undefined;

    if (this.reconnectTimer) {
      this.reconnectTimer();
      this.reconnectTimer = undefined;
    }

    const hadSocket = this.ws !== null;
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      detach(ws);
      ws.close();
    }

    this.failPending("WebSocket connection closed");
    this.setState(WebSocketState.DISCONNECTED, "closed");
    if (hadSocket && this.options.onDisconnect) {
      this.options.onDisconnect("closed");
    }
  }

  /**
   * The protocol version of the server: from its hello, or undefined before the hello or for a
   * server older than protocol v1 (roadmap R25).
   */
  getServerProtocol(): number | undefined {
    return this.serverProtocol;
  }

  /**
   * Get current connection state.
   */
  getState(): WebSocketState {
    return this.state;
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.state === WebSocketState.CONNECTED;
  }
}
