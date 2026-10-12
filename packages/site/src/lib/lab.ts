/**
 * The engine of the middleware lab. It runs the real client middlewares of
 * `@mark1russell7/client` (cache, timeout, retry, circuit breaker, rate limit) around a server
 * that it simulates, with faults: latency, errors, a dead peer, a slow stream.
 *
 * A probe around each middleware reports where a request is: it enters a layer, the layer
 * passes it to the next layer, an item or an error comes back out. The page draws these events
 * as an onion and counts them. The probes do not change what the middlewares do.
 */

import {
  CircuitBreakerError,
  Client,
  ClientError,
  RateLimitError,
  createCacheMiddleware,
  createCircuitBreakerMiddleware,
  createOverallTimeoutMiddleware,
  createRateLimitMiddleware,
  createRetryMiddleware,
  createTimeoutMiddleware,
  type ClientContext,
  type ClientMiddleware,
  type ClientRunner,
  type Message,
  type ResponseItem,
  type Transport,
} from "@mark1russell7/client/client";

// ---------------------------------------------------------------------------
// Layers and settings
// ---------------------------------------------------------------------------

export type LayerId = "cache" | "overall" | "retry" | "breaker" | "rateLimit" | "attempt";

export const LAYER_INFO: Record<LayerId, { label: string; short: string; summary: string }> = {
  cache: {
    label: "Cache",
    short: "cache",
    summary: "It keeps a successful answer for each key. A later request with the same key gets the copy and goes no deeper.",
  },
  overall: {
    label: "Timeout (whole call)",
    short: "timeout",
    summary: "It ends the call after its time, retries included, with the error TIMEOUT.",
  },
  retry: {
    label: "Retry",
    short: "retry",
    summary: "It starts the request again after a retryable error, with a backoff that doubles. It stops at the first item.",
  },
  breaker: {
    label: "Circuit breaker",
    short: "breaker",
    summary: "After a number of failures it opens and refuses each call at once. After its reset time it lets a few probes through.",
  },
  rateLimit: {
    label: "Rate limit",
    short: "rate limit",
    summary: "It lets a number of requests through in each time window. It refuses the others, or queues them.",
  },
  attempt: {
    label: "Timeout (each attempt)",
    short: "attempt",
    summary: "It ends one attempt after its time. A retry layer outside it can start the next attempt.",
  },
};

export interface LabSettings {
  /** The layers from the outside in. */
  order: LayerId[];
  enabled: Record<LayerId, boolean>;
  overallMs: number;
  attemptMs: number;
  retries: number;
  retryDelayMs: number;
  breakerThreshold: number;
  breakerResetMs: number;
  rateMax: number;
  rateWindowMs: number;
  rateStrategy: "reject" | "queue";
  cacheTtlMs: number;
}

export const DEFAULT_SETTINGS: LabSettings = {
  order: ["cache", "overall", "retry", "breaker", "rateLimit", "attempt"],
  enabled: { cache: true, overall: true, retry: true, breaker: true, rateLimit: false, attempt: false },
  overallMs: 4000,
  attemptMs: 800,
  retries: 2,
  retryDelayMs: 300,
  breakerThreshold: 4,
  breakerResetMs: 4000,
  rateMax: 3,
  rateWindowMs: 2000,
  rateStrategy: "queue",
  cacheTtlMs: 5000,
};

/** The faults of the simulated server. The page changes them while requests run. */
export interface Faults {
  latencyMs: number;
  jitterMs: number;
  /** From 0 to 1: the part of the attempts that fail with a retryable error. */
  errorRate: number;
  /** The server takes each request and never answers. */
  dead: boolean;
  /** 1 for one value, more for a stream of items. */
  streamItems: number;
  streamGapMs: number;
}

export const DEFAULT_FAULTS: Faults = { latencyMs: 250, jitterMs: 100, errorRate: 0, dead: false, streamItems: 1, streamGapMs: 250 };

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * An event of a request. `layer` is the index of a layer in `Lab.layers` (0 is the outside),
 * and `Lab.layers.length` stands for the server.
 */
export type LabEvent =
  | { kind: "send"; request: number; key: string; at: number }
  | { kind: "enter"; request: number; layer: number; at: number }
  | { kind: "forward"; request: number; layer: number; count: number; at: number }
  | { kind: "server"; request: number; attempt: number; at: number }
  | { kind: "item"; request: number; layer: number; ok: boolean; code: string | undefined; at: number }
  | { kind: "thrown"; request: number; layer: number; code: string; at: number }
  | { kind: "done"; request: number; ok: boolean; code: string | undefined; message: string | undefined; items: number; at: number }
  | { kind: "breaker"; state: BreakerState; at: number };

const METHOD = { service: "lab", operation: "get" };
/** The metadata key of the request number. A "__" key is not part of the cache key. */
const REQUEST_KEY = "__labRequest";

function requestOf(message: Message<unknown>): number {
  const value = message.metadata[REQUEST_KEY];
  return typeof value === "number" ? value : -1;
}

/** This function waits, and gives false when the signal aborts first. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, Math.max(0, ms));
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function errorItem<T>(id: string, code: string, message: string, retryable: boolean): ResponseItem<T> {
  return { id, status: { type: "error", code, message, retryable }, payload: null as T, metadata: {} };
}

/** The code of an error that the client threw: the status code, or the class of the middleware error. */
export function codeOf(error: unknown): string {
  if (error instanceof ClientError) return error.code;
  if (error instanceof CircuitBreakerError) return `CIRCUIT_${error.state}`;
  if (error instanceof RateLimitError) return "RATE_LIMITED";
  if (error instanceof Error && error.name === "AbortError") return "ABORTED";
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : "ERROR";
}

// ---------------------------------------------------------------------------
// The simulated server
// ---------------------------------------------------------------------------

class LabServer implements Transport {
  readonly name = "lab";
  private readonly attempts = new Map<number, number>();

  constructor(
    private readonly faults: () => Faults,
    private readonly emit: (event: LabEvent) => void,
    private readonly serverLayer: () => number,
  ) {}

  async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
    const request = requestOf(message as Message<unknown>);
    const attempt = (this.attempts.get(request) ?? 0) + 1;
    this.attempts.set(request, attempt);
    this.emit({ kind: "server", request, attempt, at: performance.now() });
    const faults = this.faults();
    const layer = this.serverLayer();
    const out = (item: ResponseItem<TRes>): ResponseItem<TRes> => {
      const ok = item.status.type === "success";
      this.emit({ kind: "item", request, layer, ok, code: ok ? undefined : (item.status as { code: string }).code, at: performance.now() });
      return item;
    };
    const signal = message.signal;

    if (faults.dead) {
      // A dead peer: only an abort (a timeout layer, the Stop button) ends the request
      await new Promise<void>((resolve) => {
        if (signal?.aborted) resolve();
        else signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      yield out(errorItem(message.id, "ABORTED", "The request was aborted", false));
      return;
    }

    const delay = faults.latencyMs + faults.jitterMs * (Math.random() * 2 - 1);
    if (!(await wait(delay, signal))) {
      yield out(errorItem(message.id, "ABORTED", "The request was aborted", false));
      return;
    }
    if (Math.random() < faults.errorRate) {
      yield out(errorItem(message.id, "UNAVAILABLE", "The server failed (a simulated fault)", true));
      return;
    }
    const count = Math.max(1, Math.round(faults.streamItems));
    const key = (message.payload as { key?: string } | undefined)?.key ?? "";
    for (let index = 1; index <= count; index++) {
      if (index > 1 && !(await wait(faults.streamGapMs, signal))) {
        yield out(errorItem(message.id, "ABORTED", "The request was aborted", false));
        return;
      }
      yield out({ id: message.id, status: { type: "success", code: 200 }, payload: { key, item: index, of: count, attempt } as TRes, metadata: {} });
    }
  }

  async close(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

/**
 * A middleware that reports the events of one layer and runs the real middleware unchanged:
 * `enter` when the layer gets the request, `forward` each time the layer passes it on, `item`
 * for each item that leaves the layer, `thrown` for an error that leaves it.
 */
function probe(layer: number, middleware: ClientMiddleware, emit: (event: LabEvent) => void): ClientMiddleware {
  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    const forwards = new Map<number, number>();
    const tapped: ClientRunner<TReq, TRes> = (context: ClientContext<TReq>) => {
      const request = requestOf(context.message as Message<unknown>);
      const count = (forwards.get(request) ?? 0) + 1;
      forwards.set(request, count);
      emit({ kind: "forward", request, layer, count, at: performance.now() });
      return next(context);
    };
    const run = (middleware as ClientMiddleware<TReq, TRes>)(tapped);
    return async function* (context: ClientContext<TReq>) {
      const request = requestOf(context.message as Message<unknown>);
      emit({ kind: "enter", request, layer, at: performance.now() });
      try {
        for await (const item of run(context)) {
          const ok = item.status.type === "success";
          emit({ kind: "item", request, layer, ok, code: ok ? undefined : (item.status as { code: string }).code, at: performance.now() });
          yield item;
        }
      } catch (error) {
        emit({ kind: "thrown", request, layer, code: codeOf(error), at: performance.now() });
        throw error;
      } finally {
        forwards.delete(request);
      }
    };
  };
}

function middlewareOf(id: LayerId, settings: LabSettings, onBreaker: (state: BreakerState) => void): ClientMiddleware {
  switch (id) {
    case "cache":
      return createCacheMiddleware({ methods: ["lab.get"], ttl: settings.cacheTtlMs, capacity: 50, statsInterval: 3_600_000 }) as ClientMiddleware;
    case "overall":
      return createOverallTimeoutMiddleware({ overall: settings.overallMs }) as ClientMiddleware;
    case "retry":
      return createRetryMiddleware({ maxRetries: settings.retries, retryDelay: settings.retryDelayMs, jitter: 0.1 }) as ClientMiddleware;
    case "breaker":
      return createCircuitBreakerMiddleware({
        failureThreshold: settings.breakerThreshold,
        failureWindow: 30_000,
        resetTimeout: settings.breakerResetMs,
        successThreshold: 1,
        halfOpenMaxRequests: 1,
        onStateChange: (_from, to) => onBreaker(to as BreakerState),
      }) as ClientMiddleware;
    case "rateLimit":
      return createRateLimitMiddleware({ maxRequests: settings.rateMax, window: settings.rateWindowMs, strategy: settings.rateStrategy, maxQueueSize: 20 }) as ClientMiddleware;
    case "attempt":
      return createTimeoutMiddleware({ perAttempt: settings.attemptMs }) as ClientMiddleware;
  }
}

// ---------------------------------------------------------------------------
// The lab
// ---------------------------------------------------------------------------

export class Lab {
  /** The enabled layers, from the outside in. */
  readonly layers: LayerId[];
  private readonly client: Client;
  private readonly controllers = new Set<AbortController>();
  private nextRequest = 0;
  private disposed = false;

  constructor(
    settings: LabSettings,
    faults: () => Faults,
    private readonly emit: (event: LabEvent) => void,
  ) {
    this.layers = settings.order.filter((id) => settings.enabled[id]);
    const server = new LabServer(faults, (event) => this.report(event), () => this.layers.length);
    let client = new Client({ transport: server, throwOnError: true }) as Client<object>;
    this.layers.forEach((id, index) => {
      const real = middlewareOf(id, settings, (state) => this.report({ kind: "breaker", state, at: performance.now() }));
      client = client.use(probe(index, real, (event) => this.report(event)) as never) as Client<object>;
    });
    this.client = client as Client;
  }

  private report(event: LabEvent): void {
    if (!this.disposed) this.emit(event);
  }

  /** The number of requests that run now. */
  get inFlight(): number {
    return this.controllers.size;
  }

  /** This function sends one request with a key, and gives its number. */
  send(key: string): number {
    const request = ++this.nextRequest;
    const controller = new AbortController();
    this.controllers.add(controller);
    this.report({ kind: "send", request, key, at: performance.now() });
    void (async () => {
      let items = 0;
      try {
        for await (const _item of this.client.stream(METHOD, { key }, { metadata: { [REQUEST_KEY]: request }, signal: controller.signal })) {
          items++;
        }
        this.report({ kind: "done", request, ok: true, code: undefined, message: undefined, items, at: performance.now() });
      } catch (error) {
        this.report({
          kind: "done",
          request,
          ok: false,
          code: codeOf(error),
          message: error instanceof Error ? error.message : String(error),
          items,
          at: performance.now(),
        });
      } finally {
        this.controllers.delete(controller);
      }
    })();
    return request;
  }

  /** This function aborts every request that runs. */
  abortAll(): void {
    for (const controller of this.controllers) controller.abort();
  }

  /** The lab stops: it aborts its requests and reports no more events. */
  dispose(): void {
    this.abortAll();
    this.disposed = true;
  }
}
