/**
 * The data of the middleware lab: the layers, the settings, the faults and the events. This file
 * imports nothing of the client, so the page renders the lab without the client runtime. The page
 * loads the engine (`lab.ts`) at the first request.
 */

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
    summary: "It starts the request again after a retryable error, with a backoff that doubles. It stops at the first item. After a timeout, only an idempotent call goes again.",
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

/** The enabled layers of the settings, from the outside in: the layers of the engine. */
export function layersOf(settings: LabSettings): LayerId[] {
  return settings.order.filter((id) => settings.enabled[id]);
}
